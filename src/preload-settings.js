// Shuriken Chat: preload de la ventana "Apariencia…" (página local).
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const COMMANDS = new Set([
  "get_settings", "preview_settings", "save_settings", "revert_settings", "check_twitch_channel",
]);

contextBridge.exposeInMainWorld("shuriken", {
  invoke: (cmd, args) =>
    COMMANDS.has(cmd)
      ? ipcRenderer.invoke("shuriken:" + cmd, args || {})
      : Promise.reject(new Error("comando desconocido: " + cmd)),
});
