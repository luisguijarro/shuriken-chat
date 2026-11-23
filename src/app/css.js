// Shuriken Chat: CSS inyectado en las páginas (sin recargarlas).
"use strict";

const keys = new Map(); // webContents -> clave del CSS inyectado

/** Sustituye el CSS que inyectamos en `wc`. */
async function replaceCss(wc, css) {
  if (!wc) return;
  const old = keys.get(wc);
  keys.delete(wc);
  try {
    if (old) await wc.removeInsertedCSS(old);
    if (css.trim()) keys.set(wc, await wc.insertCSS(css));
  } catch (e) {
    console.warn("[shuriken] no se pudo aplicar el CSS:", e.message);
  }
}

/** La página se ha recargado: su CSS anterior ya no está. */
const forgetCss = (wc) => keys.delete(wc);

module.exports = { replaceCss, forgetCss };
