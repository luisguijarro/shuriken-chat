// Shuriken Chat: lo que cada página necesita saber de la app.
//   pageState(wc): para el preload (bloqueo, bordes, botones, indicador de desplazamiento).
//   chatStyle():   aspecto del chat propio (ui/chat.js), en la app y en OBS.
"use strict";

const config = require("../config");
const { ctx, chatWc, frameWc, webcamWc } = require("./context");

const EDGE = 6; // px sensibles al borde para redimensionar (igual que en el preload)

function pageState(wc) {
  const { cfg } = ctx;
  if (wc && wc === webcamWc()) {
    // La webcam solo tiene el botón de "Siempre visible" (el de OBS es del chat).
    return { locked: cfg.webcamWindow.locked, edges: true, toolbar: { alwaysOnTop: cfg.webcamWindow.alwaysOnTop } };
  }
  const locked = cfg.window.locked;
  if (wc === frameWc()) return { locked, edges: true };
  return {
    locked,
    // Los bordes de la ventana los gestiona el marco; la vista del chat solo si
    // llega casi hasta el borde (margen + borde menores que la zona sensible).
    edges: config.frameLayout(cfg.appearance).inset < EDGE,
    // Botones de arriba a la izquierda (solo en la vista del chat; con "atravesar clics" no se ven).
    toolbar: ctx.clickThrough ? null : { alwaysOnTop: cfg.window.alwaysOnTop, obs: cfg.obs.enabled, webcam: cfg.webcam.enabled },
    // Indicador de posición al usar la rueda (no sale en OBS: allí no hay rueda).
    scrollIndicator: cfg.appearance.scrollIndicator,
  };
}

/** Reenvía el estado a todas las páginas con preload (marco, chat y webcam). */
function pushPageState() {
  for (const wc of [frameWc(), chatWc(), webcamWc()]) wc?.send("shuriken:state", pageState(wc));
}

/** Ajustes de aspecto que usa el chat propio (ui/chat.js). */
function chatStyle() {
  const { cfg, sources } = ctx;
  const a = cfg.appearance;
  return {
    darkMode: a.darkMode,
    bubble: a.bubble,
    textGlow: a.textGlow,
    randomColor: a.randomColor,
    fadedTop: a.fadedTop,
    scale: a.scale,
    sidePadding: a.sidePadding,
    // Canales configurados: iconos de estado de arriba a la derecha.
    channels: sources.allChannels(cfg.sources),
    // Para el aviso de "sin canal": qué le falta al usuario.
    needs: cfg.sources.twitch.useAccount ? "login" : "channel",
    twoLines: a.twoLines,
    showPlatform: a.showPlatform,
    showTime: a.showTime,
  };
}

module.exports = { pageState, pushPageState, chatStyle };
