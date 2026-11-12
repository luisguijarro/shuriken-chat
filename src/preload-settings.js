// Shuriken Chat: preload de la ventana "Apariencia…" (página local).
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const COMMANDS = new Set([
  "get_settings", "preview_settings", "save_settings", "revert_settings", "check_twitch_channel",
  "twitch_auth_status", "twitch_login_start", "twitch_login_wait", "twitch_login_cancel", "twitch_logout",
]);

contextBridge.exposeInMainWorld("shuriken", {
  invoke: (cmd, args) =>
    COMMANDS.has(cmd)
      ? ipcRenderer.invoke("shuriken:" + cmd, args || {})
      : Promise.reject(new Error("comando desconocido: " + cmd)),
  // Avisa cuando cambia la sesión de Twitch o el estado del AutoMod.
  onAuthChanged: (cb) => {
    if (typeof cb === "function") ipcRenderer.on("shuriken:auth-changed", () => cb());
  },
});
