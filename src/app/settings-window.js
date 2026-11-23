// Shuriken Chat: ventana "Configuración…" y aplicación de los ajustes.
// Los ajustes se previsualizan en vivo sin guardarlos; al cerrar sin guardar se vuelve a
// lo que hay en disco.
"use strict";

const path = require("path");
const { BrowserWindow, shell } = require("electron");
const config = require("../config");
const { ctx, UI, ICONS, PRELOAD_SETTINGS, alive } = require("./context");
const { pushPageState } = require("./view-state");
const obsLink = require("./obs-link");
const chatWindow = require("./chat-window");
const webcamWindow = require("./webcam-window");

/** Lo que muestra el formulario. */
function settingsView() {
  return { ...config.userSettings(ctx.cfg), url: config.chatUrl(ctx.cfg.appearance), platform: process.platform };
}

/** Aplica unos ajustes (sin guardarlos). Devuelve la URL de SSN equivalente (para OBS). */
function applySettings(settings) {
  const { cfg } = ctx;
  const s = config.normalize({ ...settings, window: cfg.window });
  cfg.sources = s.sources;
  cfg.appearance = s.appearance;
  cfg.system = s.system;
  cfg.obs = { ...s.obs, key: cfg.obs.key }; // la clave no viene del formulario
  cfg.webcam = s.webcam;
  ctx.sources.apply(cfg.sources);
  obsLink.sync();
  webcamWindow.sync();
  pushPageState(); // botones de la ventana (OBS, webcam)
  chatWindow.applyConfig();
  return config.chatUrl(cfg.appearance);
}

/** Descarta lo previsualizado: vuelve a lo guardado en disco. */
const revertSettings = () => applySettings(config.userSettings(config.load()));

/** Guarda lo aplicado. */
function saveSettings(settings) {
  const url = applySettings(settings);
  config.save(ctx.cfg);
  return url;
}

function open() {
  const existing = ctx.settingsWin;
  if (alive(existing)) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 560,
    height: 780,
    minWidth: 420,
    minHeight: 400,
    title: "Shuriken Chat · Configuración",
    icon: path.join(ICONS, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { preload: PRELOAD_SETTINGS, contextIsolation: true, sandbox: true },
  });
  ctx.settingsWin = win;
  win.setMenu(null);
  // Solo se abren fuera las páginas de Twitch (inicio de sesión).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(www\.|dev\.)?twitch\.tv\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadFile(path.join(UI, "settings.html"));
  // Si se cierra sin guardar, se descartan los cambios previsualizados.
  win.on("closed", () => {
    if (ctx.settingsWin === win) ctx.settingsWin = null;
    revertSettings();
  });
}

module.exports = { open, settingsView, applySettings, revertSettings, saveSettings };
