// Shuriken Chat: proceso principal de Electron.
// Ventanas, menú contextual, bandeja, IPC y persistencia.
"use strict";

const path = require("path");
const {
  app, BrowserWindow, Menu, Tray, WebContentsView, ipcMain, nativeImage, screen, session, shell,
} = require("electron");
const config = require("./config");
const { SourceManager } = require("./sources");

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
let chatWin = null; // ventana: carga ui/frame.html (borde, fondo, esquinas)
let chatView = null; // vista interior con SSN, desplazada según el margen
let settingsWin = null;
let tray = null;
let currentUrl = null; // URL cargada en la ventana del chat
let clickThrough = false; // no se guarda: así un reinicio siempre lo desactiva
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

const applyPageCss = () => replaceCss(chatWc(), config.pageCss(cfg.appearance));
const applyFrameCss = () => replaceCss(frameWc(), config.frameCss(cfg.appearance));

/** Coloca la vista del chat dentro del marco. */
function layoutChat() {
  if (!alive(chatWin) || !chatView) return;
  const { inset, innerRadius } = config.frameLayout(cfg.appearance);
  const [w, h] = chatWin.getContentSize();
  chatView.setBounds({ x: inset, y: inset, width: Math.max(0, w - 2 * inset), height: Math.max(0, h - 2 * inset) });
  chatView.setBorderRadius(innerRadius);
  pushPageState();
}

function pushPageState() {
  const locked = cfg.window.locked;
  // Los bordes de la ventana los gestiona el marco; la vista del chat solo si
  // llega casi hasta el borde (margen + borde menores que la zona sensible).
  const chatEdges = config.frameLayout(cfg.appearance).inset < EDGE;
  frameWc()?.send("shuriken:state", { locked, edges: true });
  chatWc()?.send("shuriken:state", { locked, edges: chatEdges });
}

function pageState(wc) {
  if (wc === frameWc()) return { locked: cfg.window.locked, edges: true };
  return { locked: cfg.window.locked, edges: config.frameLayout(cfg.appearance).inset < EDGE };
}

/** Qué se carga en la vista del chat: nuestro chat propio o el dock de SSN. */
const chatTarget = () => (cfg.sources.mode === "native" ? NATIVE : config.chatUrl(cfg.appearance));
const nativeChat = () => currentUrl === NATIVE;

function loadChat() {
  currentUrl = chatTarget();
  const wc = chatWc();
  if (!wc) return;
  if (currentUrl === NATIVE) wc.loadFile(path.join(UI, "chat.html"));
  else if (currentUrl) wc.loadURL(currentUrl);
  else wc.loadFile(path.join(UI, "welcome.html"));
}

/** Ajustes de aspecto que usa el chat propio (ui/chat.js). */
function pushChatStyle() {
  if (!nativeChat()) return;
  const a = cfg.appearance;
  chatWc()?.send("shuriken:chat-style", {
    darkMode: a.darkMode,
    bubble: a.bubble,
    textGlow: a.textGlow,
    randomColor: a.randomColor,
    fadedTop: a.fadedTop,
    scale: a.scale,
    sidePadding: a.sidePadding,
    channels: cfg.sources.twitch.channels.length,
  });
}

function applySettings(settings) {
  const s = config.normalize({ ...settings, window: cfg.window });
  cfg.sources = s.sources;
  cfg.appearance = s.appearance;
  cfg.system = s.system;
  sources.apply(cfg.sources);
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
  persistWindow();
}

function setClickThrough(v) {
  clickThrough = v;
  if (alive(chatWin)) chatWin.setIgnoreMouseEvents(v);
  buildTray();
}

function toggleAlwaysOnTop() {
  cfg.window.alwaysOnTop = !cfg.window.alwaysOnTop;
  if (alive(chatWin)) chatWin.setAlwaysOnTop(cfg.window.alwaysOnTop);
  persistWindow();
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
    { label: "Apariencia…", click: openSettings },
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
    { label: "Bloquear posición y tamaño", type: "checkbox", checked: cfg.window.locked, click: toggleLocked },
    {
      label: "Atravesar clics (se desactiva desde la bandeja)",
      type: "checkbox",
      checked: clickThrough,
      click: () => setClickThrough(!clickThrough),
    },
    { type: "separator" },
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
    { label: "Apariencia…", click: openSettings },
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
    title: "Shuriken Chat · Apariencia",
    icon: path.join(ICONS, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload-settings.js"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  settingsWin.setMenu(null);
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
      wc.send("shuriken:chat-backlog", sources.backlog);
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
  ipcMain.handle("shuriken:page-state", (e) => (fromChat(e) ? pageState(e.sender) : null));

  const settingsCmd = (name, fn) =>
    ipcMain.handle("shuriken:" + name, (e, args) => {
      if (!fromSettings(e)) throw new Error("no permitido");
      return fn(args || {});
    });
  settingsCmd("get_settings", () => settingsView());
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
  lockDownPermissions();
  registerIpc();
  sources.on("event", (ev) => {
    if (nativeChat()) chatWc()?.send("shuriken:chat-event", ev);
  });
  sources.apply(cfg.sources);
  createChatWindow();
  buildTray();
  // Primera vez (o sin nada que mostrar): abrir Apariencia.
  const nothing = cfg.sources.mode === "native" ? !cfg.sources.twitch.channels.length : !cfg.appearance.session.trim();
  if (nothing) openSettings();
}

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  sources.stop();
  persistWindow();
});
