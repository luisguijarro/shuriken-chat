// Shuriken Chat: estado compartido del proceso principal y utilidades sin dependencias.
//
// Los módulos de src/app/ se apoyan en este objeto en lugar de en variables globales
// sueltas. Dependencias (sin ciclos):
//   context ← persist, css, drag ← view-state ← obs-link ← chat-window, webcam-window
//   ← settings-window ← menus ← ipc ← main
// Los avisos que irían "hacia atrás" (p. ej. refrescar la bandeja) van por `ctx.events`.
"use strict";

const path = require("path");
const { EventEmitter } = require("events");
const config = require("../config");
const { SourceManager } = require("../sources");

const ROOT = path.join(__dirname, "..", "..");
const UI = path.join(ROOT, "ui");
const ICONS = path.join(ROOT, "assets", "icons");
const PRELOAD_CHAT = path.join(__dirname, "..", "preload-chat.js");
const PRELOAD_SETTINGS = path.join(__dirname, "..", "preload-settings.js");

const MIN_W = 120;
const MIN_H = 80;

const ctx = {
  cfg: config.load(),
  sources: new SourceManager(),
  twitchAuth: null, // sesión de Twitch (se crea al arrancar: safeStorage necesita la app lista)
  chatWin: null, // ventana del chat: carga ui/frame.html (borde, fondo, esquinas)
  chatView: null, // vista interior con el chat (propio o SSN), desplazada según el margen
  settingsWin: null,
  webcamWin: null, // ventana de webcam (Configuración → Webcam)
  currentUrl: null, // lo cargado en la vista del chat
  clickThrough: false, // no se guarda: así un reinicio siempre lo desactiva
  /** Avisos entre módulos: "click-through" (cambia "atravesar clics"). */
  events: new EventEmitter(),
};

const alive = (w) => !!w && !w.isDestroyed();
const chatWc = () => (ctx.chatView && !ctx.chatView.webContents.isDestroyed() ? ctx.chatView.webContents : null);
const frameWc = () => (alive(ctx.chatWin) ? ctx.chatWin.webContents : null);
const webcamWc = () => (alive(ctx.webcamWin) ? ctx.webcamWin.webContents : null);
const settingsWc = () => (alive(ctx.settingsWin) ? ctx.settingsWin.webContents : null);

/** Avisa a Configuración de que algo ha cambiado fuera de ella (sesión, AutoMod, webcam…). */
const notifySettings = () => settingsWc()?.send("shuriken:auth-changed");

/** "Siempre visible". En macOS, además, por encima de apps a pantalla completa y en
 *  todos los escritorios (si no, al poner un juego a pantalla completa desaparece). */
function setOnTop(win, on) {
  if (!alive(win)) return;
  if (process.platform === "darwin") {
    win.setAlwaysOnTop(on, "floating");
    win.setVisibleOnAllWorkspaces(on, { visibleOnFullScreen: true });
  } else {
    win.setAlwaysOnTop(on);
  }
}

/** Tamaño y posición guardados de una ventana; la posición, solo si sigue cayendo
 *  dentro de alguna pantalla (p. ej. si se ha desconectado un monitor). */
function restoreBounds(w, screen) {
  const bounds = { width: Math.max(MIN_W, w.width), height: Math.max(MIN_H, w.height) };
  if (w.x !== null && w.y !== null) {
    const visible = screen.getAllDisplays().some(({ workArea: a }) =>
      w.x < a.x + a.width && w.x + bounds.width > a.x && w.y < a.y + a.height && w.y + bounds.height > a.y);
    if (visible) Object.assign(bounds, { x: w.x, y: w.y });
  }
  return bounds;
}

module.exports = {
  ctx, UI, ICONS, PRELOAD_CHAT, PRELOAD_SETTINGS, MIN_W, MIN_H,
  alive, chatWc, frameWc, webcamWc, settingsWc, notifySettings, setOnTop, restoreBounds,
};
