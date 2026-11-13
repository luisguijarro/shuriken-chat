// Shuriken Chat: proceso principal de Electron.
// Ventanas, menú contextual, bandeja, IPC y persistencia.
"use strict";

const path = require("path");
const {
  app, BrowserWindow, Menu, Tray, WebContentsView, ipcMain, nativeImage, safeStorage, screen, session, shell,
} = require("electron");
const config = require("./config");
const { SourceManager } = require("./sources");
const { ObsServer, newKey } = require("./obs-server");
const { lookupChannel } = require("./sources/twitch-assets");
const { TwitchAuth, DEFAULT_CLIENT_ID } = require("./sources/twitch-auth");
const { normalizeChannel } = require("./sources/twitch-parse");
const { normalizeKickChannel } = require("./sources/kick-parse");
const { fetchChannel: fetchKickChannel } = require("./sources/kick");
const { normalizeYoutubeTarget } = require("./sources/youtube-parse");
const { lookupYoutube } = require("./sources/youtube");

const UI = path.join(__dirname, "..", "ui");
const ICONS = path.join(__dirname, "..", "assets", "icons");

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 3;
const MIN_W = 120;
const MIN_H = 80;
const NATIVE = "shuriken:native"; // "URL" del chat propio (modo plataformas)
const EDGE = 6; // px sensibles al borde para redimensionar (igual que en el preload)

let cfg = config.load();
const sources = new SourceManager();
let twitchAuth = null; // sesión de Twitch (se crea al arrancar: safeStorage necesita la app lista)
let chatWin = null; // ventana: carga ui/frame.html (borde, fondo, esquinas)
let chatView = null; // vista interior con SSN, desplazada según el margen
let settingsWin = null;
let tray = null;
let currentUrl = null; // URL cargada en la ventana del chat
let clickThrough = false; // no se guarda: así un reinicio siempre lo desactiva
// Chat para OBS: servidor local que reproduce esta ventana (ver src/obs-server.js).
const obs = new ObsServer({ uiDir: UI, snapshot: () => obsSnapshot() });
const cssKeys = new Map(); // webContents -> clave del CSS inyectado

// ---------------------------------------------------------------------------
// Antes de que arranque Chromium
// ---------------------------------------------------------------------------

// Datos de Chromium junto a config.json (y no en "~/.config/Shuriken Chat").
app.setPath("userData", config.configDir());

/**
 * En Wayland preferimos XWayland: permite mover la ventana, recordar su
 * posición y "siempre visible". Chromium elige la plataforma ANTES de ejecutar
 * este archivo (con `appendSwitch` el proceso de GPU se cae y todo va por
 * software), así que hay que pasar `--ozone-platform=x11` en la línea de
 * comandos: si no viene, nos relanzamos con él y salimos sin abrir nada.
 */
function relaunchWithX11IfNeeded() {
  if (process.platform !== "linux" || cfg.system.nativeWayland) return false;
  // Ojo: Electron rellena él mismo el valor ("wayland"), así que se mira el valor.
  if (!process.env.WAYLAND_DISPLAY || app.commandLine.getSwitchValue("ozone-platform") === "x11") return false;
  if (process.env.SHURIKEN_RELAUNCHED) return false; // evita bucles
  // En un AppImage hay que relanzar el propio .AppImage (su montaje desaparece al salir).
  const exe = process.env.APPIMAGE || process.execPath;
  const args = [...process.argv.slice(1), "--ozone-platform=x11"];
  try {
    require("child_process")
      .spawn(exe, args, { detached: true, stdio: "inherit", env: { ...process.env, SHURIKEN_RELAUNCHED: "1" } })
      .unref();
    return true;
  } catch (e) {
    console.warn("[shuriken] no se pudo relanzar con X11, sigo en Wayland:", e.message);
    return false;
  }
}

const relaunching = relaunchWithX11IfNeeded();
if (cfg.system.compatRendering) app.disableHardwareAcceleration();

if (relaunching) {
  app.exit(0);
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showChat());
  app.whenReady().then(start);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const alive = (w) => w && !w.isDestroyed();

/** Guarda solo el estado de la ventana, sin tocar ajustes de aspecto que se
 *  estén previsualizando sin guardar. */
function persistWindow() {
  try {
    const disk = config.load();
    disk.window = { ...cfg.window };
    config.save(disk);
  } catch (e) {
    console.error("[shuriken] no se pudo guardar la configuración:", e);
  }
}

let persistTimer = null;
function persistWindowSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistWindow, 1000);
}

function settingsView() {
  return { ...config.userSettings(cfg), url: config.chatUrl(cfg.appearance) };
}

// ---------------------------------------------------------------------------
// Estado de la página del chat
// ---------------------------------------------------------------------------

const chatWc = () => (chatView && !chatView.webContents.isDestroyed() ? chatView.webContents : null);
const frameWc = () => (alive(chatWin) ? chatWin.webContents : null);

/** Sustituye el CSS que inyectamos en `wc` (sin recargar la página). */
async function replaceCss(wc, css) {
  if (!wc) return;
  const old = cssKeys.get(wc);
  cssKeys.delete(wc);
  try {
    if (old) await wc.removeInsertedCSS(old);
    if (css.trim()) cssKeys.set(wc, await wc.insertCSS(css));
  } catch (e) {
    console.warn("[shuriken] no se pudo aplicar el CSS:", e.message);
  }
}

const applyPageCss = () => {
  obs.broadcast("pagecss", config.pageCss(cfg.appearance));
  return replaceCss(chatWc(), config.pageCss(cfg.appearance));
};
const applyFrameCss = () => {
  pushObsLayout();
  return replaceCss(frameWc(), config.frameCss(cfg.appearance));
};

/** Coloca la vista del chat dentro del marco. */
function layoutChat() {
  if (!alive(chatWin) || !chatView) return;
  const { inset, innerRadius } = config.frameLayout(cfg.appearance);
  const [w, h] = chatWin.getContentSize();
  chatView.setBounds({ x: inset, y: inset, width: Math.max(0, w - 2 * inset), height: Math.max(0, h - 2 * inset) });
  chatView.setBorderRadius(innerRadius);
  pushPageState();
  pushObsLayout();
}

function pushPageState() {
  frameWc()?.send("shuriken:state", pageState(frameWc()));
  chatWc()?.send("shuriken:state", pageState(chatWc()));
}

function pageState(wc) {
  const locked = cfg.window.locked;
  if (wc === frameWc()) return { locked, edges: true };
  return {
    locked,
    // Los bordes de la ventana los gestiona el marco; la vista del chat solo si
    // llega casi hasta el borde (margen + borde menores que la zona sensible).
    edges: config.frameLayout(cfg.appearance).inset < EDGE,
    // Botones de arriba a la izquierda (solo en la vista del chat; con "atravesar clics" no se ven).
    toolbar: clickThrough ? null : { alwaysOnTop: cfg.window.alwaysOnTop, obs: cfg.obs.enabled },
  };
}

/** Qué se carga en la vista del chat: nuestro chat propio o el dock de SSN. */
const chatTarget = () => (cfg.sources.mode === "native" ? NATIVE : config.chatUrl(cfg.appearance));
const nativeChat = () => currentUrl === NATIVE;

function loadChat() {
  currentUrl = chatTarget();
  const wc = chatWc();
  if (!wc) return;
  pushObsLayout();
  if (currentUrl === NATIVE) wc.loadFile(path.join(UI, "chat.html"));
  else if (currentUrl) wc.loadURL(currentUrl);
  else wc.loadFile(path.join(UI, "welcome.html"));
}

/** Ajustes de aspecto que usa el chat propio (ui/chat.js), en la app y en OBS. */
function pushChatStyle() {
  const style = chatStyle();
  obs.broadcast("style", style);
  if (nativeChat()) chatWc()?.send("shuriken:chat-style", style);
}

function chatStyle() {
  const a = cfg.appearance;
  return {
    darkMode: a.darkMode,
    bubble: a.bubble,
    textGlow: a.textGlow,
    randomColor: a.randomColor,
    fadedTop: a.fadedTop,
    scale: a.scale,
    sidePadding: a.sidePadding,
    // Canales configurados: el chat muestra su estado mientras no hay mensajes.
    channels: sources.allChannels(cfg.sources),
    // Para el aviso de "sin canal": qué le falta al usuario.
    needs: cfg.sources.twitch.useAccount ? "login" : "channel",
    twoLines: a.twoLines,
    showPlatform: a.showPlatform,
  };
}

// ---------------------------------------------------------------------------
// OBS: la misma ventana, servida en http://127.0.0.1:<puerto>/obs?k=<clave>
// ---------------------------------------------------------------------------

/** Qué carga OBS dentro del marco: el mismo chat que la app (o SSN con el mismo CSS). */
function obsSource() {
  const key = encodeURIComponent(cfg.obs.key);
  if (cfg.sources.mode === "native") return `chat.html?k=${key}`;
  const url = config.chatUrl(cfg.appearance);
  if (!url) return `welcome.html?k=${key}`;
  // En un iframe de otro dominio no se puede inyectar CSS: SSN lo admite en la URL (&b64css).
  const css = Buffer.from(encodeURIComponent(config.pageCss(cfg.appearance))).toString("base64");
  return `${url}&b64css=${encodeURIComponent(css)}`;
}

/** Medidas y aspecto de la ventana para la página de OBS. */
function obsLayout() {
  const [width, height] = alive(chatWin) ? chatWin.getContentSize() : [cfg.window.width, cfg.window.height];
  const { inset, innerRadius } = config.frameLayout(cfg.appearance);
  return {
    width, height, inset, innerRadius,
    zoom: cfg.window.zoom,
    frameCss: config.frameCss(cfg.appearance, ".frame"),
    src: obsSource(),
  };
}

function obsSnapshot() {
  return { layout: obsLayout(), style: chatStyle(), pagecss: config.pageCss(cfg.appearance), backlog: sources.snapshot() };
}

let obsLayoutTimer = null;
function pushObsLayout() {
  if (obsLayoutTimer) return; // como mucho ~10 veces por segundo (al redimensionar)
  obsLayoutTimer = setTimeout(() => {
    obsLayoutTimer = null;
    obs.broadcast("layout", obsLayout());
  }, 100);
}

/** Arranca, reinicia o para el servidor según la configuración. */
async function syncObsServer() {
  if (cfg.obs.enabled) await obs.start(cfg.obs.port, cfg.obs.key);
  else obs.stop();
}

/** Guarda solo la clave de OBS (no los ajustes que se estén previsualizando). */
function persistObsKey() {
  try {
    const disk = config.load();
    disk.obs.key = cfg.obs.key;
    config.save(disk);
  } catch (e) {
    console.error("[shuriken] no se pudo guardar la clave de OBS:", e);
  }
}

function obsInfo() {
  const b = alive(chatWin)
    ? chatWin.getContentBounds()
    : { x: cfg.window.x || 0, y: cfg.window.y || 0, width: cfg.window.width, height: cfg.window.height };
  // Pantalla donde está la ventana: sirve para traducir su tamaño y posición a un lienzo de OBS.
  const d = screen.getDisplayMatching(b);
  const k = d.scaleFactor || 1;
  return {
    enabled: cfg.obs.enabled,
    running: cfg.obs.enabled && obs.running,
    error: cfg.obs.enabled ? obs.error : null,
    url: cfg.obs.enabled ? obs.url() : null,
    width: b.width,
    height: b.height,
    // En píxeles reales de la pantalla (como el lienzo de OBS).
    screen: {
      width: Math.round(d.bounds.width * k),
      height: Math.round(d.bounds.height * k),
      winWidth: Math.round(b.width * k),
      winHeight: Math.round(b.height * k),
      x: Math.round((b.x - d.bounds.x) * k),
      y: Math.round((b.y - d.bounds.y) * k),
    },
  };
}

function applySettings(settings) {
  const s = config.normalize({ ...settings, window: cfg.window });
  cfg.sources = s.sources;
  cfg.appearance = s.appearance;
  cfg.system = s.system;
  cfg.obs = { ...s.obs, key: cfg.obs.key }; // la clave no viene del formulario
  sources.apply(cfg.sources);
  syncObsServer();
  if (alive(chatWin)) {
    if (chatTarget() !== currentUrl) loadChat();
    else {
      applyPageCss();
      pushChatStyle();
    }
    applyFrameCss();
    layoutChat();
  }
  return config.chatUrl(cfg.appearance); // la URL de SSN equivalente (para OBS)
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

function setZoom(z) {
  cfg.window.zoom = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;
  chatWc()?.setZoomFactor(cfg.window.zoom);
  pushObsLayout();
  persistWindow();
}

function setClickThrough(v) {
  clickThrough = v;
  if (alive(chatWin)) chatWin.setIgnoreMouseEvents(v);
  buildTray();
  pushPageState(); // con "atravesar clics" no se muestran los botones del chat
}

function setAlwaysOnTop(v) {
  cfg.window.alwaysOnTop = !!v;
  if (alive(chatWin)) chatWin.setAlwaysOnTop(cfg.window.alwaysOnTop);
  persistWindow();
  pushPageState();
}

const toggleAlwaysOnTop = () => setAlwaysOnTop(!cfg.window.alwaysOnTop);

/** "Limpiar chat": en modo plataformas se vacía (app, OBS e historial); SSN no se puede
 *  vaciar desde fuera, así que se recarga (empieza vacío), también en OBS. */
function clearChat() {
  if (nativeChat()) {
    sources.clearAll(); // llega a la app y a OBS como evento "clear-all"
  } else {
    chatWc()?.reload();
    obs.broadcast("reload", true);
  }
}

/** Activa o para el chat para OBS (desde el botón, el menú o Configuración). */
async function setObsEnabled(v) {
  cfg.obs.enabled = !!v;
  try {
    const disk = config.load();
    disk.obs.enabled = cfg.obs.enabled;
    config.save(disk);
  } catch (e) {
    console.error("[shuriken] no se pudo guardar OBS:", e);
  }
  await syncObsServer();
  pushPageState();
}

function toggleLocked() {
  cfg.window.locked = !cfg.window.locked;
  pushPageState();
  persistWindow();
}

function showChat() {
  if (!alive(chatWin)) return;
  chatWin.show();
  chatWin.focus();
}

function toggleVisible() {
  if (!alive(chatWin)) return;
  if (chatWin.isVisible()) chatWin.hide();
  else showChat();
}

function quit() {
  persistWindow();
  app.quit();
}

// ---------------------------------------------------------------------------
// Menús
// ---------------------------------------------------------------------------

function contextMenu() {
  const pct = Math.round(cfg.window.zoom * 100);
  return Menu.buildFromTemplate([
    { label: "Configuración…", click: openSettings },
    {
      label: `Zoom (${pct}%)`,
      submenu: [
        { label: "Acercar  (+10%)", click: () => setZoom(cfg.window.zoom + ZOOM_STEP) },
        { label: "Alejar  (−10%)", click: () => setZoom(cfg.window.zoom - ZOOM_STEP) },
        { label: "Restablecer (100%)", click: () => setZoom(1) },
      ],
    },
    { type: "separator" },
    { label: "Siempre visible", type: "checkbox", checked: cfg.window.alwaysOnTop, click: toggleAlwaysOnTop },
    { label: "Chat para OBS", type: "checkbox", checked: cfg.obs.enabled, click: () => setObsEnabled(!cfg.obs.enabled) },
    { label: "Bloquear posición y tamaño", type: "checkbox", checked: cfg.window.locked, click: toggleLocked },
    {
      label: "Atravesar clics (se desactiva desde la bandeja)",
      type: "checkbox",
      checked: clickThrough,
      click: () => setClickThrough(!clickThrough),
    },
    { type: "separator" },
    { label: "Limpiar chat", click: clearChat },
    { label: "Recargar chat", click: () => chatWc()?.reload() },
    { label: "Salir", click: quit },
  ]);
}

function buildTray() {
  if (!tray) {
    try {
      tray = new Tray(nativeImage.createFromPath(path.join(ICONS, "64x64.png")));
      tray.setToolTip("Shuriken Chat");
      tray.on("click", toggleVisible);
    } catch (e) {
      console.warn("[shuriken] sin icono en la bandeja:", e.message);
      return;
    }
  }
  // En Linux el menú de la bandeja hay que volver a asignarlo tras cada cambio.
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Mostrar / ocultar chat", click: toggleVisible },
    {
      label: "Atravesar clics",
      type: "checkbox",
      checked: clickThrough,
      click: () => setClickThrough(!clickThrough),
    },
    { label: "Configuración…", click: openSettings },
    { type: "separator" },
    { label: "Salir", click: quit },
  ]));
}

// ---------------------------------------------------------------------------
// Mover y redimensionar (la página avisa; aquí se sigue al cursor)
// ---------------------------------------------------------------------------

let drag = null;

function startDrag(dir) {
  if (!alive(chatWin) || cfg.window.locked) return;
  stopDrag();
  drag = {
    dir,
    cursor: screen.getCursorScreenPoint(),
    bounds: chatWin.getBounds(),
    timer: setInterval(stepDrag, 16),
  };
}

function stepDrag() {
  if (!drag || !alive(chatWin)) return stopDrag();
  const p = screen.getCursorScreenPoint();
  const dx = p.x - drag.cursor.x;
  const dy = p.y - drag.cursor.y;
  const b = drag.bounds;
  if (!drag.dir) {
    chatWin.setPosition(b.x + dx, b.y + dy);
    return;
  }
  let { x, y, width, height } = b;
  const d = drag.dir;
  if (d.includes("East")) width = Math.max(MIN_W, b.width + dx);
  if (d.includes("West")) {
    width = Math.max(MIN_W, b.width - dx);
    x = b.x + b.width - width;
  }
  if (d.includes("South")) height = Math.max(MIN_H, b.height + dy);
  if (d.includes("North")) {
    height = Math.max(MIN_H, b.height - dy);
    y = b.y + b.height - height;
  }
  chatWin.setBounds({ x, y, width, height });
}

function stopDrag() {
  if (!drag) return;
  clearInterval(drag.timer);
  drag = null;
  persistWindowSoon();
}

const DIRS = new Set(["North", "South", "East", "West", "NorthEast", "NorthWest", "SouthEast", "SouthWest"]);

// ---------------------------------------------------------------------------
// Ventanas
// ---------------------------------------------------------------------------

function openSettings() {
  if (alive(settingsWin)) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 560,
    height: 780,
    minWidth: 420,
    minHeight: 400,
    title: "Shuriken Chat · Configuración",
    icon: path.join(ICONS, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload-settings.js"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  settingsWin.setMenu(null);
  settingsWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(www\.|dev\.)?twitch\.tv\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  settingsWin.loadFile(path.join(UI, "settings.html"));
  // Si se cierra sin guardar, se descartan los cambios previsualizados.
  settingsWin.on("closed", () => {
    settingsWin = null;
    applySettings(config.userSettings(config.load()));
  });
}

function createChatWindow() {
  const w = cfg.window;
  const bounds = { width: Math.max(MIN_W, w.width), height: Math.max(MIN_H, w.height) };
  if (w.x !== null && w.y !== null) {
    // Solo si sigue cayendo dentro de alguna pantalla.
    const visible = screen.getAllDisplays().some(({ workArea: a }) =>
      w.x < a.x + a.width && w.x + bounds.width > a.x && w.y < a.y + a.height && w.y + bounds.height > a.y);
    if (visible) Object.assign(bounds, { x: w.x, y: w.y });
  }

  // Mismas preferencias para el marco y para el chat.
  const webPreferences = {
    preload: path.join(__dirname, "preload-chat.js"),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    // El preload (bloqueo de multimedia y menú) también corre en los iframes.
    nodeIntegrationInSubFrames: true,
    // El chat debe seguir actualizándose aunque la ventana no tenga el foco.
    backgroundThrottling: false,
  };

  chatWin = new BrowserWindow({
    ...bounds,
    minWidth: MIN_W,
    minHeight: MIN_H,
    title: "Shuriken Chat",
    icon: path.join(ICONS, "icon.png"),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: true,
    alwaysOnTop: w.alwaysOnTop,
    webPreferences,
  });

  // Título fijo (no el de la página de SSN): así se puede usar en reglas de ventana.
  chatWin.on("page-title-updated", (e) => e.preventDefault());

  // Marco: página local que dibuja borde, fondo y esquinas.
  const fwc = chatWin.webContents;
  fwc.on("dom-ready", () => {
    cssKeys.delete(fwc); // la página es nueva: el CSS anterior ya no está
    applyFrameCss();
    pushPageState();
  });
  fwc.loadFile(path.join(UI, "frame.html"));

  // Chat: vista interior con SSN.
  chatView = new WebContentsView({ webPreferences: { ...webPreferences, zoomFactor: w.zoom } });
  chatView.setBackgroundColor("#00000000");
  chatWin.contentView.addChildView(chatView);
  layoutChat();

  const wc = chatView.webContents;
  wc.on("dom-ready", () => {
    wc.setZoomFactor(cfg.window.zoom);
    cssKeys.delete(wc);
    applyPageCss();
    pushPageState();
    if (nativeChat()) {
      pushChatStyle();
      wc.send("shuriken:chat-backlog", sources.snapshot());
    }
  });

  // SHURIKEN_DEBUG=1: consola de la página en la terminal + comprobaciones.
  if (process.env.SHURIKEN_DEBUG) {
    wc.on("console-message", (e) => console.log(`[página:${e.level}] ${e.message}`));
    wc.on("dom-ready", () => {
      // mainFrame: wc.executeJavaScript esperaría a que SSN termine de cargar, y nunca termina.
      wc.mainFrame.executeJavaScript(`(async () => ({
        url: location.origin + location.pathname,
        webrtc: typeof RTCPeerConnection,
        dispositivos: (await navigator.mediaDevices.enumerateDevices()).length,
        camara: await navigator.mediaDevices.getUserMedia({ video: true }).then(() => "PERMITIDA", (e) => e.name),
      }))()`).then((r) => console.log("[shuriken] diagnóstico:", JSON.stringify(r)), (e) => console.log("[shuriken]", e.message));
    });
  }

  // Los enlaces de los mensajes se abren en el navegador, no dentro del chat.
  const openExternal = (url) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
  };
  wc.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => {
    let same = false;
    try {
      same = new URL(url).origin === new URL(wc.getURL()).origin;
    } catch {}
    if (!same) {
      e.preventDefault();
      openExternal(url);
    }
  });

  const track = () => {
    if (!alive(chatWin) || chatWin.isMinimized()) return;
    const b = chatWin.getBounds();
    Object.assign(cfg.window, { x: b.x, y: b.y, width: b.width, height: b.height });
    if (!drag) persistWindowSoon();
  };
  chatWin.on("move", track);
  chatWin.on("resize", () => {
    layoutChat();
    track();
    // Medidas de la ventana mientras se redimensiona (las mismas que usa la tabla de OBS).
    const [w, h] = chatWin.getContentSize();
    chatWc()?.send("shuriken:size", { width: w, height: h });
  });
  chatWin.on("blur", stopDrag);
  chatWin.on("close", persistWindow);
  chatWin.on("closed", () => {
    // La vista no se destruye sola con la ventana.
    if (chatView && !chatView.webContents.isDestroyed()) chatView.webContents.close();
    chatView = null;
    chatWin = null;
    app.quit();
  });

  loadChat();
}

// ---------------------------------------------------------------------------
// Seguridad: el chat nunca usa cámara, micrófono ni pantalla
// ---------------------------------------------------------------------------

function lockDownPermissions() {
  const ALLOWED = new Set(["clipboard-sanitized-write"]);
  const DENIED_CHECKS = new Set(["media", "display-capture", "geolocation", "notifications"]);
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => !DENIED_CHECKS.has(permission));
  ses.setDevicePermissionHandler(() => false);
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function registerIpc() {
  // El marco o la vista del chat (la web de SSN solo llega hasta aquí).
  const fromChat = (e) => !!e.sender && (e.sender === frameWc() || e.sender === chatWc());
  const fromSettings = (e) => alive(settingsWin) && e.sender === settingsWin.webContents;

  ipcMain.on("shuriken:menu", (e) => {
    if (fromChat(e)) contextMenu().popup({ window: chatWin });
  });
  ipcMain.on("shuriken:drag-start", (e, dir) => {
    if (fromChat(e) && e.senderFrame === e.sender.mainFrame) startDrag(DIRS.has(dir) ? dir : null);
  });
  ipcMain.on("shuriken:drag-end", (e) => {
    if (fromChat(e)) stopDrag();
  });
  // Botones de la ventana del chat (arriba a la izquierda).
  ipcMain.on("shuriken:toggle", (e, what) => {
    if (!fromChat(e) || e.senderFrame !== e.sender.mainFrame) return;
    if (what === "alwaysOnTop") toggleAlwaysOnTop();
    else if (what === "obs") setObsEnabled(!cfg.obs.enabled);
  });
  ipcMain.handle("shuriken:page-state", (e) => (fromChat(e) ? pageState(e.sender) : null));
  // Aprobar/denegar un mensaje del AutoMod: solo desde NUESTRA página del chat (nunca desde SSN).
  ipcMain.handle("shuriken:automod", (e, { id, allow } = {}) => {
    const ours = nativeChat() && e.sender === chatWc() && e.senderFrame === e.sender.mainFrame &&
      /\/ui\/chat\.html$/.test(new URL(e.senderFrame.url).pathname);
    if (!ours || typeof id !== "string") throw new Error("no permitido");
    return sources.automodAction(id, !!allow);
  });

  const settingsCmd = (name, fn) =>
    ipcMain.handle("shuriken:" + name, (e, args) => {
      if (!fromSettings(e)) throw new Error("no permitido");
      return fn(args || {});
    });
  settingsCmd("get_settings", () => settingsView());
  // ---- Sesión de Twitch (opcional: para revisar el AutoMod) ----
  const clientIdFor = (id) => String(id || "").trim() || cfg.sources.twitch.clientId || DEFAULT_CLIENT_ID;
  settingsCmd("twitch_auth_status", () => ({
    ...twitchAuth.status(),
    hasDefaultClientId: !!DEFAULT_CLIENT_ID,
    moderation: sources.moderation,
  }));
  settingsCmd("twitch_login_start", async ({ clientId }) => {
    const r = await twitchAuth.startLogin(clientIdFor(clientId));
    shell.openExternal(r.verificationUri); // la página ya lleva el código rellenado
    return r;
  });
  settingsCmd("twitch_login_wait", () => {
    if (!twitchAuth.pending) throw new Error("No hay ningún inicio de sesión en curso.");
    return twitchAuth.pending.done;
  });
  settingsCmd("twitch_login_cancel", () => twitchAuth.cancelLogin());
  settingsCmd("twitch_logout", () => twitchAuth.logout());

  // ¿Existe este canal de Kick y está en directo?
  settingsCmd("check_kick_channel", async ({ channel }) => {
    const c = normalizeKickChannel(channel);
    if (!c) return { exists: false };
    try {
      const info = await fetchKickChannel(c);
      return info ? { exists: true, name: info.name, live: info.live } : { exists: false };
    } catch (e) {
      return { exists: null, error: e.message };
    }
  });

  // ¿Existe este canal de YouTube y está en directo?
  settingsCmd("check_youtube_channel", async ({ channel }) => {
    const t = normalizeYoutubeTarget(channel);
    if (!t) return { exists: false };
    try {
      return await lookupYoutube(t);
    } catch (e) {
      return { exists: null, error: e.message };
    }
  });

  // ¿Existe este canal de Twitch y está en directo?
  settingsCmd("check_twitch_channel", ({ channel }) => {
    const c = normalizeChannel(channel);
    return c ? lookupChannel(c) : { exists: false };
  });
  // ---- OBS ----
  settingsCmd("obs_info", () => obsInfo());
  // Opciones de la ventana que se aplican al momento (como el menú y los botones del chat).
  settingsCmd("window_state", () => ({ alwaysOnTop: cfg.window.alwaysOnTop }));
  settingsCmd("set_always_on_top", ({ value }) => {
    setAlwaysOnTop(value);
    return { alwaysOnTop: cfg.window.alwaysOnTop };
  });
  // Nueva clave: la URL anterior deja de funcionar (por si se ha filtrado).
  settingsCmd("obs_new_key", async () => {
    cfg.obs.key = newKey();
    persistObsKey();
    await syncObsServer();
    return obsInfo();
  });

  // Aplica los ajustes en vivo, sin guardarlos. Devuelve la URL resultante.
  settingsCmd("preview_settings", ({ settings }) => applySettings(settings));
  settingsCmd("save_settings", ({ settings }) => {
    const url = applySettings(settings);
    config.save(cfg);
    return url;
  });
  // Descarta los cambios no guardados y vuelve a lo que hay en disco.
  settingsCmd("revert_settings", () => {
    applySettings(config.userSettings(config.load()));
    return settingsView();
  });
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

function start() {
  twitchAuth = new TwitchAuth(config.configDir(), safeStorage);
  sources.setAuth(twitchAuth);
  lockDownPermissions();
  registerIpc();
  sources.on("event", (ev) => {
    if (nativeChat()) chatWc()?.send("shuriken:chat-event", ev);
    obs.broadcast("event", ev);
  });
  // OBS: clave propia de esta instalación (se crea la primera vez).
  if (!cfg.obs.key) {
    cfg.obs.key = newKey();
    persistObsKey();
  }
  syncObsServer();
  // Estado del AutoMod por canal: se avisa a Configuración en cuanto se conoce.
  sources.on("moderation", () => {
    if (alive(settingsWin)) settingsWin.webContents.send("shuriken:auth-changed");
  });
  twitchAuth.on("change", () => {
    if (alive(settingsWin)) settingsWin.webContents.send("shuriken:auth-changed");
    pushChatStyle(); // con cuenta, el canal cambia al iniciar o cerrar sesión
  });
  sources.apply(cfg.sources);
  createChatWindow();
  buildTray();
  // Primera vez (o sin nada que mostrar): abrir Configuración.
  const nothing = cfg.sources.mode === "native" ? !sources.allChannels(cfg.sources).length : !cfg.appearance.session.trim();
  if (nothing) openSettings();
}

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  sources.stop();
  obs.stop();
  persistWindow();
});
