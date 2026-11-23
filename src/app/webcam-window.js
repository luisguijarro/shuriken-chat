// Shuriken Chat: ventana de webcam (aparte del chat, con el mismo borde y esquinas).
"use strict";

const path = require("path");
const { BrowserWindow, screen, systemPreferences } = require("electron");
const config = require("../config");
const {
  ctx, UI, ICONS, PRELOAD_CHAT, MIN_W, MIN_H, alive, webcamWc, notifySettings, setOnTop, restoreBounds,
} = require("./context");
const { replaceCss, forgetCss } = require("./css");
const { persistPart, persistWindow } = require("./persist");
const { trackBounds } = require("./drag");
const { pageState, pushPageState } = require("./view-state");

/** Abre o cierra la ventana según Configuración → Webcam, y le aplica los cambios. */
function sync() {
  if (ctx.cfg.webcam.enabled && !alive(ctx.webcamWin)) create();
  else if (!ctx.cfg.webcam.enabled && alive(ctx.webcamWin)) ctx.webcamWin.close();
  else if (alive(ctx.webcamWin)) apply();
}

/** macOS exige permiso del sistema para la cámara (Privacidad y seguridad → Cámara).
 *  La primera vez se pregunta al usuario; sin permiso, el sistema bloquea la cámara.
 *  En Linux y Windows no hay nada que pedir. Devuelve true si se puede usar. */
let cameraAccess = null;
function ensureCameraAccess() {
  if (process.platform !== "darwin") return Promise.resolve(true);
  const status = systemPreferences.getMediaAccessStatus("camera");
  if (status === "granted") return Promise.resolve(true);
  if (status !== "not-determined") {
    console.log(`[shuriken] permiso de cámara de macOS: ${status}`);
    return Promise.resolve(false);
  }
  if (!cameraAccess) {
    console.log("[shuriken] permiso de cámara de macOS: se pregunta al usuario");
    cameraAccess = systemPreferences.askForMediaAccess("camera")
      .catch(() => false)
      .finally(() => { cameraAccess = null; });
  }
  return cameraAccess;
}

/** Marco (mismo aspecto que el chat) y dispositivo/espejo elegidos. */
function apply() {
  const wc = webcamWc();
  if (!wc) return;
  replaceCss(wc, config.webcamCss(ctx.cfg.appearance));
  wc.send("shuriken:state", pageState(wc));
  ensureCameraAccess().then((ok) => {
    if (wc.isDestroyed() || wc !== webcamWc()) return;
    const { deviceId, deviceLabel, mirror } = ctx.cfg.webcam;
    wc.send("shuriken:webcam-config", { deviceId, deviceLabel, mirror, systemDenied: !ok });
  });
}

/** Guarda solo la parte de la webcam que se cambia desde su menú o el botón del chat. */
function persistWebcam(fields) {
  persistPart("la webcam", (disk) => Object.assign(disk.webcam, fields));
  notifySettings(); // refrescar sus casillas
}

function setEnabled(on) {
  ctx.cfg.webcam.enabled = !!on;
  persistWebcam({ enabled: ctx.cfg.webcam.enabled });
  sync();
  pushPageState(); // botón de la webcam en el chat
}

const toggleEnabled = () => setEnabled(!ctx.cfg.webcam.enabled);

function toggleOnTop() {
  const w = ctx.cfg.webcamWindow;
  w.alwaysOnTop = !w.alwaysOnTop;
  setOnTop(ctx.webcamWin, w.alwaysOnTop);
  persistWindow();
  pushPageState();
}

function toggleLocked() {
  ctx.cfg.webcamWindow.locked = !ctx.cfg.webcamWindow.locked;
  pushPageState();
  persistWindow();
}

function toggleMirror() {
  ctx.cfg.webcam.mirror = !ctx.cfg.webcam.mirror;
  persistWebcam({ mirror: ctx.cfg.webcam.mirror });
  apply();
}

function create() {
  const w = ctx.cfg.webcamWindow;
  const win = new BrowserWindow({
    ...restoreBounds(w, screen),
    minWidth: MIN_W,
    minHeight: MIN_H,
    title: "Shuriken Chat · Webcam",
    icon: path.join(ICONS, "icon.png"),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: true,
    alwaysOnTop: w.alwaysOnTop,
    webPreferences: {
      preload: PRELOAD_CHAT,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  ctx.webcamWin = win;
  win.on("page-title-updated", (e) => e.preventDefault());
  const wc = win.webContents;
  wc.on("dom-ready", () => {
    forgetCss(wc);
    apply();
  });
  trackBounds(win, w);
  win.on("resize", () => {
    const [cw, ch] = win.getContentSize();
    wc.send("shuriken:size", { width: cw, height: ch });
  });
  win.on("close", persistWindow);
  win.on("closed", () => {
    if (ctx.webcamWin === win) ctx.webcamWin = null;
  });
  setOnTop(win, w.alwaysOnTop);
  win.loadFile(path.join(UI, "webcam.html"));
}

module.exports = { sync, setEnabled, toggleEnabled, toggleOnTop, toggleLocked, toggleMirror };
