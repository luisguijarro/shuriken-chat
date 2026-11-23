// Shuriken Chat: la ventana del chat y sus acciones.
//
// Ventana = marco + vista: la BrowserWindow carga ui/frame.html (borde, fondo, esquinas) y
// el chat (propio o SSN) va en un WebContentsView hijo, desplazado según el margen. Así la
// página ve un viewport del tamaño real y su maquetación no se rompe.
"use strict";

const path = require("path");
const { app, BrowserWindow, WebContentsView, screen, shell } = require("electron");
const config = require("../config");
const {
  ctx, UI, ICONS, PRELOAD_CHAT, MIN_W, MIN_H, alive, chatWc, frameWc, setOnTop, restoreBounds,
} = require("./context");
const { replaceCss, forgetCss } = require("./css");
const { persistWindow } = require("./persist");
const { stopDrag, trackBounds } = require("./drag");
const { pushPageState, chatStyle } = require("./view-state");
const obsLink = require("./obs-link");

const NATIVE = "shuriken:native"; // "URL" del chat propio (modo plataformas)
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 3;

/** Qué se carga en la vista del chat: nuestro chat propio o el dock de SSN. */
const chatTarget = () => (ctx.cfg.sources.mode === "native" ? NATIVE : config.chatUrl(ctx.cfg.appearance));
/** ¿Está cargado nuestro chat propio (y no la web de SSN)? */
const nativeChat = () => ctx.currentUrl === NATIVE;

function applyPageCss() {
  const css = config.pageCss(ctx.cfg.appearance);
  obsLink.broadcast("pagecss", css);
  return replaceCss(chatWc(), css);
}

function applyFrameCss() {
  obsLink.pushLayout();
  return replaceCss(frameWc(), config.frameCss(ctx.cfg.appearance));
}

/** Coloca la vista del chat dentro del marco. */
function layout() {
  const { chatWin, chatView } = ctx;
  if (!alive(chatWin) || !chatView) return;
  const { inset, innerRadius } = config.frameLayout(ctx.cfg.appearance);
  const [w, h] = chatWin.getContentSize();
  chatView.setBounds({ x: inset, y: inset, width: Math.max(0, w - 2 * inset), height: Math.max(0, h - 2 * inset) });
  chatView.setBorderRadius(innerRadius);
  pushPageState();
  obsLink.pushLayout();
}

function load() {
  ctx.currentUrl = chatTarget();
  const wc = chatWc();
  if (!wc) return;
  obsLink.pushLayout();
  if (ctx.currentUrl === NATIVE) wc.loadFile(path.join(UI, "chat.html"));
  else if (ctx.currentUrl) wc.loadURL(ctx.currentUrl);
  else wc.loadFile(path.join(UI, "welcome.html"));
}

/** Aspecto del chat propio, en la app y en OBS. */
function pushChatStyle() {
  const style = chatStyle();
  obsLink.broadcast("style", style);
  if (nativeChat()) chatWc()?.send("shuriken:chat-style", style);
}

/** Tras cambiar la configuración: recarga si cambia lo que se muestra; si no, solo el aspecto. */
function applyConfig() {
  if (!alive(ctx.chatWin)) return;
  if (chatTarget() !== ctx.currentUrl) load();
  else {
    applyPageCss();
    pushChatStyle();
  }
  applyFrameCss();
  layout();
}

/** Un evento del chat (de los conectores) para la página del chat propio. */
function sendChatEvent(ev) {
  if (nativeChat()) chatWc()?.send("shuriken:chat-event", ev);
}

// ---------- Acciones (menú, botones, bandeja y Configuración) ----------

function setZoom(z) {
  ctx.cfg.window.zoom = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;
  chatWc()?.setZoomFactor(ctx.cfg.window.zoom);
  obsLink.pushLayout();
  persistWindow();
}

function setClickThrough(v) {
  ctx.clickThrough = !!v;
  if (alive(ctx.chatWin)) ctx.chatWin.setIgnoreMouseEvents(ctx.clickThrough);
  ctx.events.emit("click-through", ctx.clickThrough); // la bandeja actualiza su casilla
  pushPageState(); // con "atravesar clics" no se muestran los botones del chat
}

function setAlwaysOnTop(v) {
  ctx.cfg.window.alwaysOnTop = !!v;
  setOnTop(ctx.chatWin, ctx.cfg.window.alwaysOnTop);
  persistWindow();
  pushPageState();
}

const toggleAlwaysOnTop = () => setAlwaysOnTop(!ctx.cfg.window.alwaysOnTop);

function toggleLocked() {
  ctx.cfg.window.locked = !ctx.cfg.window.locked;
  pushPageState();
  persistWindow();
}

/** "Limpiar chat": en modo plataformas se vacía (app, OBS e historial); SSN no se puede
 *  vaciar desde fuera, así que se recarga (empieza vacío), también en OBS. */
function clearChat() {
  if (nativeChat()) {
    ctx.sources.clearAll(); // llega a la app y a OBS como evento "clear-all"
  } else {
    chatWc()?.reload();
    obsLink.broadcast("reload", true);
  }
}

const reloadChat = () => chatWc()?.reload();

function show() {
  if (!alive(ctx.chatWin)) return;
  ctx.chatWin.show();
  ctx.chatWin.focus();
}

function toggleVisible() {
  if (!alive(ctx.chatWin)) return;
  if (ctx.chatWin.isVisible()) ctx.chatWin.hide();
  else show();
}

// ---------- Creación ----------

/** Los enlaces de los mensajes se abren en el navegador, no dentro del chat. */
function openLinksOutside(wc) {
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
}

/** SHURIKEN_DEBUG=1: consola de la página en la terminal + comprobaciones. */
function debugPage(wc) {
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

function create() {
  const w = ctx.cfg.window;

  // Mismas preferencias para el marco y para el chat.
  const webPreferences = {
    preload: PRELOAD_CHAT,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    // El preload (bloqueo de multimedia y menú) también corre en los iframes.
    nodeIntegrationInSubFrames: true,
    // El chat debe seguir actualizándose aunque la ventana no tenga el foco.
    backgroundThrottling: false,
  };

  const win = new BrowserWindow({
    ...restoreBounds(w, screen),
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
  ctx.chatWin = win;

  // Título fijo (no el de la página de SSN): así se puede usar en reglas de ventana.
  win.on("page-title-updated", (e) => e.preventDefault());

  // Marco: página local que dibuja borde, fondo y esquinas.
  const fwc = win.webContents;
  fwc.on("dom-ready", () => {
    forgetCss(fwc);
    applyFrameCss();
    pushPageState();
  });
  fwc.loadFile(path.join(UI, "frame.html"));

  // Chat: vista interior.
  const view = new WebContentsView({ webPreferences: { ...webPreferences, zoomFactor: w.zoom } });
  view.setBackgroundColor("#00000000");
  win.contentView.addChildView(view);
  ctx.chatView = view;
  layout();

  const wc = view.webContents;
  wc.on("dom-ready", () => {
    wc.setZoomFactor(ctx.cfg.window.zoom);
    forgetCss(wc);
    applyPageCss();
    pushPageState();
    if (nativeChat()) {
      pushChatStyle();
      wc.send("shuriken:chat-backlog", ctx.sources.snapshot());
    }
  });
  if (process.env.SHURIKEN_DEBUG) debugPage(wc);
  openLinksOutside(wc);

  trackBounds(win, ctx.cfg.window);
  win.on("resize", () => {
    layout();
    // Medidas de la ventana mientras se redimensiona (las mismas que usa la tabla de OBS).
    const [cw, ch] = win.getContentSize();
    chatWc()?.send("shuriken:size", { width: cw, height: ch });
  });
  win.on("close", persistWindow);
  win.on("closed", () => {
    // La vista no se destruye sola con la ventana.
    if (!view.webContents.isDestroyed()) view.webContents.close();
    ctx.chatView = null;
    ctx.chatWin = null;
    stopDrag();
    app.quit();
  });

  setOnTop(win, w.alwaysOnTop); // en macOS, también sobre pantalla completa y en todos los escritorios
  load();
}

module.exports = {
  create, applyConfig, pushChatStyle, sendChatEvent, nativeChat,
  setZoom, setClickThrough, setAlwaysOnTop, toggleAlwaysOnTop, toggleLocked, clearChat, reloadChat, show, toggleVisible,
};
