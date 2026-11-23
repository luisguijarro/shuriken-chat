// Shuriken Chat: registro de plataformas en el proceso principal.
//
// Amplía ui/platforms.js (nombre, normalizar canal…, compartido con las páginas) con lo que
// solo existe en Node:
//   create(deps)            -> conector: EventEmitter con setChannels(lista), stop() y el
//                              evento "event" (formato normalizado: ver ./index.js)
//   channels(sources, deps) -> canales que se leen de verdad con esta configuración
//   check(canal)            -> { exists: true|false|null, name?, live?, error? } para Configuración
//
// El SourceManager, la configuración y el IPC recorren esta lista: una plataforma nueva no
// obliga a tocarlos.
"use strict";

const shared = require("../../ui/platforms.js");
const { TwitchSource } = require("./twitch");
const { lookupChannel } = require("./twitch-assets");
const { KickSource, fetchChannel: fetchKickChannel } = require("./kick");
const { YoutubeSource, lookupYoutube } = require("./youtube");

const NODE_SIDE = {
  twitch: {
    create: (deps) => new TwitchSource(deps.twitchAssets),
    // Con cuenta: el canal del usuario que ha iniciado sesión (ninguno sin sesión).
    // Sin cuenta: los escritos a mano.
    channels(sources, { twitchAuth }) {
      if (!sources.twitch.useAccount) return sources.twitch.channels;
      return twitchAuth && twitchAuth.loggedIn && twitchAuth.session.login ? [twitchAuth.session.login.toLowerCase()] : [];
    },
    check: (channel) => lookupChannel(channel),
  },
  kick: {
    create: () => new KickSource(),
    channels: (sources) => sources.kick.channels,
    async check(channel) {
      const info = await fetchKickChannel(channel);
      return info ? { exists: true, name: info.name, live: info.live } : { exists: false };
    },
  },
  youtube: {
    create: () => new YoutubeSource(),
    channels: (sources) => sources.youtube.channels,
    check: (target) => lookupYoutube(target),
  },
};

const PLATFORMS = shared.list.map((p) => {
  if (!NODE_SIDE[p.id]) throw new Error(`Falta el conector de la plataforma "${p.id}" en src/sources/platforms.js`);
  return Object.freeze({ ...p, ...NODE_SIDE[p.id] });
});
// Sin prototipo: byId["toString"] no debe devolver nada (el id llega por IPC).
const byId = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(PLATFORMS.map((p) => [p.id, p]))));

/** ¿Existe este canal y está en directo? Nunca lanza: los fallos de red son exists: null. */
async function checkChannel(platformId, value) {
  const p = byId[platformId];
  if (!p) return { exists: false };
  const channel = p.normalize(value);
  if (!channel) return { exists: false };
  try {
    return await p.check(channel);
  } catch (e) {
    return { exists: null, error: e.message };
  }
}

module.exports = { PLATFORMS, byId, checkChannel };
