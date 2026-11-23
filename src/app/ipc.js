// Shuriken Chat: IPC. Cada canal comprueba QUIÉN lo pide:
//  - páginas con el preload del chat (marco, vista del chat —también la web de SSN— y
//    webcam): solo menú, arrastre, estado y sus botones;
//  - el AutoMod: solo nuestra página ui/chat.html (nunca SSN);
//  - los comandos de Configuración: solo su ventana (y su preload tiene lista blanca).
"use strict";

const { ipcMain, shell } = require("electron");
const { DEFAULT_CLIENT_ID } = require("../sources/twitch-auth");
const { checkChannel } = require("../sources/platforms");
const { ctx, chatWc, frameWc, webcamWc, settingsWc } = require("./context");
const { startDrag, stopDrag } = require("./drag");
const { pageState } = require("./view-state");
const obsLink = require("./obs-link");
const chatWindow = require("./chat-window");
const webcamWindow = require("./webcam-window");
const settingsWindow = require("./settings-window");
const menus = require("./menus");

/** Botones de cada ventana (arriba a la izquierda): las claves de pageState().toolbar. */
const TOGGLES = {
  chat: {
    alwaysOnTop: chatWindow.toggleAlwaysOnTop,
    obs: obsLink.toggleEnabled,
    webcam: webcamWindow.toggleEnabled,
  },
  webcam: {
    alwaysOnTop: webcamWindow.toggleOnTop,
  },
};

function registerIpc() {
  const fromChat = (e) => !!e.sender && [frameWc(), chatWc(), webcamWc()].includes(e.sender);
  const fromMainFrame = (e) => e.senderFrame === e.sender.mainFrame;
  const isWebcam = (e) => e.sender === webcamWc();
  const winOf = (e) => (isWebcam(e) ? ctx.webcamWin : ctx.chatWin);

  // ---- Páginas con el preload del chat ----
  ipcMain.on("shuriken:menu", (e) => {
    if (fromChat(e)) menus.popupFor(winOf(e));
  });
  ipcMain.on("shuriken:drag-start", (e, dir) => {
    if (fromChat(e) && fromMainFrame(e)) startDrag(winOf(e), dir);
  });
  ipcMain.on("shuriken:drag-end", (e) => {
    if (fromChat(e)) stopDrag();
  });
  ipcMain.on("shuriken:toggle", (e, what) => {
    if (!fromChat(e) || !fromMainFrame(e)) return;
    const buttons = TOGGLES[isWebcam(e) ? "webcam" : "chat"];
    if (typeof what === "string" && Object.hasOwn(buttons, what)) buttons[what]();
  });
  ipcMain.handle("shuriken:page-state", (e) => (fromChat(e) ? pageState(e.sender) : null));

  // Aprobar/denegar un mensaje del AutoMod: solo desde NUESTRA página del chat (nunca desde SSN).
  ipcMain.handle("shuriken:automod", (e, { id, allow } = {}) => {
    const ours = chatWindow.nativeChat() && e.sender === chatWc() && fromMainFrame(e) &&
      /\/ui\/chat\.html$/.test(new URL(e.senderFrame.url).pathname);
    if (!ours || typeof id !== "string") throw new Error("no permitido");
    return ctx.sources.automodAction(id, !!allow);
  });

  // ---- Configuración ----
  const settingsCmd = (name, fn) =>
    ipcMain.handle("shuriken:" + name, (e, args) => {
      if (!settingsWc() || e.sender !== settingsWc()) throw new Error("no permitido");
      return fn(args || {});
    });

  settingsCmd("get_settings", () => settingsWindow.settingsView());
  // Aplica los ajustes en vivo, sin guardarlos. Devuelve la URL de SSN resultante.
  settingsCmd("preview_settings", ({ settings }) => settingsWindow.applySettings(settings));
  settingsCmd("save_settings", ({ settings }) => settingsWindow.saveSettings(settings));
  // Descarta los cambios no guardados y vuelve a lo que hay en disco.
  settingsCmd("revert_settings", () => {
    settingsWindow.revertSettings();
    return settingsWindow.settingsView();
  });

  // ¿Existe este canal y está en directo? (cualquier plataforma del registro)
  settingsCmd("check_channel", ({ platform, channel }) => checkChannel(String(platform), channel));

  // Sesión de Twitch (opcional: para revisar el AutoMod).
  const auth = () => ctx.twitchAuth;
  const clientIdFor = (id) => String(id || "").trim() || ctx.cfg.sources.twitch.clientId || DEFAULT_CLIENT_ID;
  settingsCmd("twitch_auth_status", () => ({
    ...auth().status(),
    hasDefaultClientId: !!DEFAULT_CLIENT_ID,
    moderation: ctx.sources.moderation,
  }));
  settingsCmd("twitch_login_start", async ({ clientId }) => {
    const r = await auth().startLogin(clientIdFor(clientId));
    shell.openExternal(r.verificationUri); // la página ya lleva el código rellenado
    return r;
  });
  settingsCmd("twitch_login_wait", () => {
    if (!auth().pending) throw new Error("No hay ningún inicio de sesión en curso.");
    return auth().pending.done;
  });
  settingsCmd("twitch_login_cancel", () => auth().cancelLogin());
  settingsCmd("twitch_logout", () => auth().logout());

  // OBS y opciones de la ventana que se aplican al momento (como el menú y los botones).
  settingsCmd("obs_info", () => obsLink.info());
  settingsCmd("obs_new_key", async () => {
    await obsLink.renewKey();
    return obsLink.info();
  });
  settingsCmd("window_state", () => ({ alwaysOnTop: ctx.cfg.window.alwaysOnTop, webcamEnabled: ctx.cfg.webcam.enabled }));
  settingsCmd("set_always_on_top", ({ value }) => {
    chatWindow.setAlwaysOnTop(value);
    return { alwaysOnTop: ctx.cfg.window.alwaysOnTop };
  });
}

module.exports = { registerIpc };
