// Shuriken Chat: emotes de terceros (7TV, BTTV, FFZ) e insignias de Twitch.
// Todo con APIs públicas, sin cuenta ni claves. Si una API falla, se sigue
// sin sus emotes: el chat nunca debe quedarse esperando por esto.
"use strict";

const TIMEOUT_MS = 10000;

// Emotes de BTTV que se superponen al anterior (no lo indica su API).
const BTTV_ZERO_WIDTH = new Set(["SoSnowy", "IceCold", "SantaHat", "TopHat", "ReinDeer", "CandyCane", "cvMask", "cvHazmat"]);

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) return null; // el canal no usa ese servicio
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

const httpsUrl = (u) => (u && u.startsWith("//") ? "https:" + u : u);

// ---------- Emotes (cada uno devuelve [[nombre, { url, zeroWidth? }], …]) ----------

function from7tv(emotes) {
  return (emotes || []).map((e) => {
    const host = e.data && e.data.host;
    if (!host) return null;
    const zeroWidth = ((e.flags || 0) & 1) !== 0 || ((e.data.flags || 0) & 256) !== 0;
    return [e.name, { url: httpsUrl(host.url) + "/2x.webp", zeroWidth }];
  }).filter(Boolean);
}

function fromBttv(emotes) {
  return (emotes || []).map((e) => [e.code, {
    url: `https://cdn.betterttv.net/emote/${e.id}/2x`,
    zeroWidth: BTTV_ZERO_WIDTH.has(e.code),
  }]);
}

function fromFfzSets(sets, only) {
  const out = [];
  for (const [id, set] of Object.entries(sets || {})) {
    if (only && !only.includes(Number(id))) continue;
    for (const e of set.emoticons || []) {
      const url = httpsUrl((e.urls && (e.urls["2"] || e.urls["1"])) || "");
      if (url) out.push([e.name, { url, zeroWidth: !!e.modifier }]);
    }
  }
  return out;
}

// Cada fuente por separado: si una falla, las demás siguen.
const EMOTE_SOURCES = {
  global: [
    ["7TV", async () => from7tv((await fetchJson("https://7tv.io/v3/emote-sets/global"))?.emotes)],
    ["BTTV", async () => fromBttv(await fetchJson("https://api.betterttv.net/3/cached/emotes/global"))],
    ["FFZ", async () => {
      const d = await fetchJson("https://api.frankerfacez.com/v1/set/global");
      return d ? fromFfzSets(d.sets, d.default_sets) : [];
    }],
  ],
  channel: [
    ["7TV", async (id) => from7tv((await fetchJson(`https://7tv.io/v3/users/twitch/${id}`))?.emote_set?.emotes)],
    ["BTTV", async (id) => {
      const d = await fetchJson(`https://api.betterttv.net/3/cached/users/twitch/${id}`);
      return d ? fromBttv([...(d.channelEmotes || []), ...(d.sharedEmotes || [])]) : [];
    }],
    ["FFZ", async (id) => fromFfzSets((await fetchJson(`https://api.frankerfacez.com/v1/room/id/${id}`))?.sets)],
  ],
};

/** Carga varias fuentes y las combina; las primeras de la lista tienen prioridad. */
async function loadEmotes(sources, arg) {
  const results = await Promise.all(sources.map(async ([name, load]) => {
    try {
      return await load(arg);
    } catch (e) {
      console.warn(`[shuriken] emotes de ${name} no disponibles:`, e.message);
      return [];
    }
  }));
  const map = new Map();
  for (const list of results.reverse()) for (const [k, v] of list) map.set(k, v);
  return map;
}

// ---------- Insignias (IVR: imágenes oficiales de Twitch sin autenticación) ----------

async function loadBadges(url) {
  const map = new Map();
  try {
    for (const set of (await fetchJson(url)) || []) {
      for (const v of set.versions || []) {
        map.set(`${set.set_id}/${v.id}`, { url: v.image_url_2x || v.image_url_1x, title: v.title || set.set_id });
      }
    }
  } catch (e) {
    console.warn("[shuriken] insignias no disponibles:", e.message);
  }
  return map;
}

class TwitchAssets {
  constructor() {
    this.globalEmotes = new Map();
    this.globalBadges = new Map();
    this.channels = new Map(); // roomId -> { emotes, badges }
    this.loading = new Map(); // roomId -> Promise
    this.globalReady = null;
  }

  loadGlobal() {
    if (!this.globalReady) {
      this.globalReady = Promise.all([
        loadEmotes(EMOTE_SOURCES.global).then((m) => (this.globalEmotes = m)),
        loadBadges("https://api.ivr.fi/v2/twitch/badges/global").then((m) => (this.globalBadges = m)),
      ]);
    }
    return this.globalReady;
  }

  /** Carga (una vez) los emotes e insignias propios de un canal. */
  loadChannel(roomId, login) {
    if (!roomId) return Promise.resolve();
    if (!this.loading.has(roomId)) {
      this.loading.set(roomId, Promise.all([
        loadEmotes(EMOTE_SOURCES.channel, roomId),
        loadBadges(`https://api.ivr.fi/v2/twitch/badges/channel?login=${encodeURIComponent(login)}`),
      ]).then(([emotes, badges]) => {
        this.channels.set(roomId, { emotes, badges });
      }));
    }
    return this.loading.get(roomId);
  }

  /** Promesa que se resuelve cuando los emotes globales y los del canal están
   *  cargados, o como mucho a los `maxMs` (no se retiene el chat por una API lenta). */
  whenReady(roomId, maxMs = 4000) {
    const wait = Promise.all([this.globalReady, roomId && this.loading.get(roomId)].filter(Boolean));
    return Promise.race([wait, new Promise((r) => setTimeout(r, maxMs))]).catch(() => {});
  }

  /** Busca un emote de terceros: primero los del canal, luego los globales. */
  emote(roomId, name) {
    const ch = this.channels.get(roomId);
    return (ch && ch.emotes.get(name)) || this.globalEmotes.get(name) || null;
  }

  /** Insignia: la del canal (sub, bits) tiene prioridad sobre la global. */
  badge(roomId, set, version) {
    const key = `${set}/${version}`;
    const ch = this.channels.get(roomId);
    return (ch && ch.badges.get(key)) || this.globalBadges.get(key) || null;
  }
}

/**
 * ¿Existe el canal? (IVR). Devuelve { exists, name, live, banned } o
 * { exists: null } si no se pudo comprobar (sin red, API caída…).
 */
async function lookupChannel(login) {
  try {
    const d = await fetchJson(`https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(login)}`);
    const u = Array.isArray(d) ? d[0] : null;
    if (!u) return { exists: false };
    return { exists: true, name: u.displayName || u.login, live: !!u.stream, banned: !!u.banned };
  } catch (e) {
    return { exists: null, error: e.message };
  }
}

module.exports = { TwitchAssets, lookupChannel, fetchJson, loadEmotes, from7tv, fromBttv, fromFfzSets };
