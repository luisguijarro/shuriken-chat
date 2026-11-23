// Shuriken Chat: guardar en disco SOLO lo que ha cambiado fuera de Configuración.
//
// Configuración previsualiza ajustes sin guardarlos; si al mover la ventana se guardara
// toda la config, se guardarían también esos ajustes sin confirmar. Por eso cada cambio
// "al momento" (ventana, clave de OBS, webcam…) lee el disco, toca su parte y guarda.
"use strict";

const config = require("../config");
const { ctx } = require("./context");

/** Lee la config del disco, aplica `update(disk)` y la guarda. */
function persistPart(what, update) {
  try {
    const disk = config.load();
    update(disk);
    config.save(disk);
  } catch (e) {
    console.error(`[shuriken] no se pudo guardar ${what}:`, e);
  }
}

/** Posición, tamaño y opciones de las ventanas (chat y webcam). */
function persistWindow() {
  persistPart("la configuración", (disk) => {
    disk.window = { ...ctx.cfg.window };
    disk.webcamWindow = { ...ctx.cfg.webcamWindow };
  });
}

let timer = null;
/** Igual, pero agrupando los cambios seguidos (al mover o redimensionar). */
function persistWindowSoon() {
  clearTimeout(timer);
  timer = setTimeout(persistWindow, 1000);
}

module.exports = { persistPart, persistWindow, persistWindowSoon };
