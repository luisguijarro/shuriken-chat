// Shuriken Chat: menús (clic derecho del chat y de la webcam, bandeja y menú de macOS).
"use strict";

const path = require("path");
const { app, Menu, Tray, nativeImage } = require("electron");
const { ctx, ICONS } = require("./context");
const { persistWindow } = require("./persist");
const obsLink = require("./obs-link");
const chatWindow = require("./chat-window");
const webcamWindow = require("./webcam-window");
const settingsWindow = require("./settings-window");

const ZOOM_STEP = 0.1;

function quit() {
  persistWindow();
  app.quit();
}

function chatMenu() {
  const { cfg } = ctx;
  const pct = Math.round(cfg.window.zoom * 100);
  return Menu.buildFromTemplate([
    { label: "Configuración…", click: settingsWindow.open },
    {
      label: `Zoom (${pct}%)`,
      submenu: [
        { label: "Acercar  (+10%)", click: () => chatWindow.setZoom(cfg.window.zoom + ZOOM_STEP) },
        { label: "Alejar  (−10%)", click: () => chatWindow.setZoom(cfg.window.zoom - ZOOM_STEP) },
        { label: "Restablecer (100%)", click: () => chatWindow.setZoom(1) },
      ],
    },
    { type: "separator" },
    { label: "Siempre visible", type: "checkbox", checked: cfg.window.alwaysOnTop, click: chatWindow.toggleAlwaysOnTop },
    { label: "Chat para OBS", type: "checkbox", checked: cfg.obs.enabled, click: obsLink.toggleEnabled },
    { label: "Bloquear posición y tamaño", type: "checkbox", checked: cfg.window.locked, click: chatWindow.toggleLocked },
    {
      label: "Atravesar clics (se desactiva desde la bandeja)",
      type: "checkbox",
      checked: ctx.clickThrough,
      click: () => chatWindow.setClickThrough(!ctx.clickThrough),
    },
    { type: "separator" },
    { label: "Limpiar chat", click: chatWindow.clearChat },
    { label: "Recargar chat", click: chatWindow.reloadChat },
    { label: "Salir", click: quit },
  ]);
}

function webcamMenu() {
  const { cfg } = ctx;
  const w = cfg.webcamWindow;
  return Menu.buildFromTemplate([
    { label: "Configuración…", click: settingsWindow.open },
    { type: "separator" },
    { label: "Siempre visible", type: "checkbox", checked: w.alwaysOnTop, click: webcamWindow.toggleOnTop },
    { label: "Bloquear posición y tamaño", type: "checkbox", checked: w.locked, click: webcamWindow.toggleLocked },
    { label: "Voltear horizontalmente (espejo)", type: "checkbox", checked: cfg.webcam.mirror, click: webcamWindow.toggleMirror },
    { type: "separator" },
    { label: "Ocultar la webcam", click: () => webcamWindow.setEnabled(false) },
    { label: "Salir", click: quit },
  ]);
}

/** Menú contextual de la ventana a la que pertenece la página. */
function popupFor(win) {
  if (win === ctx.webcamWin) webcamMenu().popup({ window: win });
  else chatMenu().popup({ window: ctx.chatWin });
}

let tray = null;

function buildTray() {
  if (!tray) {
    try {
      // Windows: el .ico (varios tamaños) se ve nítido en la bandeja.
      // macOS: plantilla monocroma ("Template": el sistema la colorea según el tema; usa @2x solo).
      const trayIcon = { win32: "icon.ico", darwin: "trayTemplate.png" }[process.platform] || "64x64.png";
      tray = new Tray(nativeImage.createFromPath(path.join(ICONS, trayIcon)));
      tray.setToolTip("Shuriken Chat");
      tray.on("click", chatWindow.toggleVisible);
    } catch (e) {
      console.warn("[shuriken] sin icono en la bandeja:", e.message);
      return;
    }
  }
  // En Linux el menú de la bandeja hay que volver a asignarlo tras cada cambio.
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Mostrar / ocultar chat", click: chatWindow.toggleVisible },
    {
      label: "Atravesar clics",
      type: "checkbox",
      checked: ctx.clickThrough,
      click: () => chatWindow.setClickThrough(!ctx.clickThrough),
    },
    { label: "Configuración…", click: settingsWindow.open },
    { type: "separator" },
    { label: "Salir", click: quit },
  ]));
}

// La casilla "Atravesar clics" de la bandeja sigue al estado real.
ctx.events.on("click-through", () => buildTray());

/** macOS: menú de la aplicación en español. Sin el menú Editar no funcionan
 *  Cmd+C / Cmd+V en los campos de Configuración. */
function buildMacMenu() {
  if (process.platform !== "darwin") return;
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "Shuriken Chat",
      submenu: [
        { label: "Acerca de Shuriken Chat", role: "about" },
        { type: "separator" },
        { label: "Configuración…", accelerator: "Cmd+,", click: settingsWindow.open },
        { type: "separator" },
        { label: "Ocultar Shuriken Chat", role: "hide" },
        { label: "Ocultar otros", role: "hideOthers" },
        { label: "Mostrar todo", role: "unhide" },
        { type: "separator" },
        { label: "Salir de Shuriken Chat", accelerator: "Cmd+Q", click: quit },
      ],
    },
    {
      label: "Editar",
      submenu: [
        { label: "Deshacer", role: "undo" },
        { label: "Rehacer", role: "redo" },
        { type: "separator" },
        { label: "Cortar", role: "cut" },
        { label: "Copiar", role: "copy" },
        { label: "Pegar", role: "paste" },
        { label: "Seleccionar todo", role: "selectAll" },
      ],
    },
    {
      label: "Ventana",
      submenu: [
        { label: "Minimizar", role: "minimize" },
        { label: "Cerrar", role: "close" },
      ],
    },
  ]));
}

module.exports = { popupFor, buildTray, buildMacMenu, quit };
