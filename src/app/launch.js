// Shuriken Chat: lo que hay que decidir ANTES de que arranque Chromium.
"use strict";

const { app } = require("electron");

/**
 * Mensajes internos de Chromium: solo los fatales, salvo con SHURIKEN_DEBUG=1.
 * (P. ej. "GetVSyncParametersIfAvailable() failed": XWayland no da la sincronía de la
 * pantalla, Chromium usa 60 Hz y sigue sin problema, pero lo registra como ERROR.)
 * Como --ozone-platform, solo funciona en la LÍNEA DE COMANDOS: con appendSwitch llega
 * tarde (comprobado). Se añade al relanzar con X11; `npm start` ya lo pasa.
 */
function quietArgs() {
  if (process.env.SHURIKEN_DEBUG || app.commandLine.hasSwitch("log-level")) return [];
  return ["--log-level=3"];
}

/**
 * En Wayland preferimos XWayland: permite mover la ventana, recordar su posición y
 * "siempre visible". Chromium elige la plataforma ANTES de ejecutar main.js (con
 * `appendSwitch` el proceso de GPU se cae y todo va por software), así que hay que pasar
 * `--ozone-platform=x11` en la línea de comandos: si no viene, nos relanzamos con él.
 * Devuelve true si se ha relanzado (y esta instancia debe salir sin abrir nada).
 */
function relaunchWithX11IfNeeded(nativeWayland) {
  if (process.platform !== "linux" || nativeWayland) return false;
  // Ojo: Electron rellena él mismo el valor ("wayland"), así que se mira el valor.
  if (!process.env.WAYLAND_DISPLAY || app.commandLine.getSwitchValue("ozone-platform") === "x11") return false;
  if (process.env.SHURIKEN_RELAUNCHED) return false; // evita bucles
  // En un AppImage hay que relanzar el propio .AppImage (su montaje desaparece al salir).
  const exe = process.env.APPIMAGE || process.execPath;
  const args = [...process.argv.slice(1), "--ozone-platform=x11", ...quietArgs()];
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

module.exports = { relaunchWithX11IfNeeded };
