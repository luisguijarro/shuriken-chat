// Shuriken Chat: utilidades puras para el chat de Twitch (sin red ni Electron).
// Parser de IRC, troceado de mensajes en texto/emotes/enlaces e insignias.
"use strict";

/** Nombre de canal válido a partir de "Canal", "#canal", "@canal" o una URL de twitch.tv. */
function normalizeChannel(value) {
  let c = String(value || "").trim().toLowerCase();
  c = c.replace(/^https?:\/\/(www\.|m\.)?twitch\.tv\//, "").replace(/^[#@]/, "");
  c = c.split(/[/?#]/)[0];
  return /^[a-z0-9_]{1,25}$/.test(c) ? c : null;
}

const TAG_ESCAPES = { ":": ";", s: " ", "\\": "\\", r: "\r", n: "\n" };

function unescapeTag(v) {
  return v.replace(/\\(.?)/g, (_, c) => (c in TAG_ESCAPES ? TAG_ESCAPES[c] : c));
}

/** Parsea una línea IRC con tags de Twitch: { tags, prefix, command, params }. */
function parseIrc(line) {
  let rest = line;
  const tags = {};
  let prefix = null;
  if (rest.startsWith("@")) {
    const i = rest.indexOf(" ");
    for (const pair of rest.slice(1, i).split(";")) {
      const eq = pair.indexOf("=");
      if (eq < 0) tags[pair] = "";
      else tags[pair.slice(0, eq)] = unescapeTag(pair.slice(eq + 1));
    }
    rest = rest.slice(i + 1);
  }
  if (rest.startsWith(":")) {
    const i = rest.indexOf(" ");
    prefix = rest.slice(1, i);
    rest = rest.slice(i + 1);
  }
  let trailing = null;
  const t = rest.indexOf(" :");
  if (t >= 0) {
    trailing = rest.slice(t + 2);
    rest = rest.slice(0, t);
  } else if (rest.startsWith(":")) {
    trailing = rest.slice(1);
    rest = "";
  }
  const params = rest.split(" ").filter(Boolean);
  const command = params.shift() || "";
  if (trailing !== null) params.push(trailing);
  return { tags, prefix, command, params };
}

/** "nick!nick@nick.tmi.twitch.tv" -> "nick" */
const loginFromPrefix = (prefix) => (prefix ? prefix.split("!")[0] : "");

/** Tag `emotes` ("25:0-4,6-10/1902:12-16") -> [{ id, start, end }] ordenado. */
function parseEmotesTag(tag) {
  const out = [];
  if (!tag) return out;
  for (const group of tag.split("/")) {
    const [id, ranges] = group.split(":");
    if (!id || !ranges) continue;
    for (const r of ranges.split(",")) {
      const [s, e] = r.split("-").map(Number);
      if (Number.isInteger(s) && Number.isInteger(e) && e >= s) out.push({ id, start: s, end: e });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

const twitchEmoteUrl = (id) => `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/2.0`;
const URL_RE = /^https?:\/\/[^\s<>"']+$/i;

/**
 * Trocea un mensaje en partes para el render:
 *   { type: "text", text } | { type: "emote", name, url, zeroWidth? } | { type: "link", text, url }
 * - Emotes de Twitch (incluidos los de suscriptor del canal): por posición, según el tag `emotes`.
 *   Ojo: las posiciones son en caracteres Unicode, no en unidades UTF-16.
 * - Emotes de terceros (7TV/BTTV/FFZ): por palabra, con `lookup(nombre)`.
 */
function tokenize(text, emotesTag, lookup = () => null) {
  const chars = Array.from(text || "");
  const parts = [];
  const pushText = (t) => {
    if (!t) return;
    const last = parts[parts.length - 1];
    if (last && last.type === "text") last.text += t;
    else parts.push({ type: "text", text: t });
  };
  const words = (segment) => {
    for (const w of segment.split(/(\s+)/)) {
      if (!w) continue;
      if (/^\s+$/.test(w)) {
        pushText(w);
        continue;
      }
      const e = lookup(w);
      if (e) parts.push({ type: "emote", name: w, url: e.url, ...(e.zeroWidth ? { zeroWidth: true } : {}) });
      else if (URL_RE.test(w)) parts.push({ type: "link", text: w, url: w });
      else pushText(w);
    }
  };

  let pos = 0;
  for (const em of parseEmotesTag(emotesTag)) {
    if (em.start < pos || em.end >= chars.length) continue; // solapado o fuera de rango
    words(chars.slice(pos, em.start).join(""));
    parts.push({ type: "emote", name: chars.slice(em.start, em.end + 1).join(""), url: twitchEmoteUrl(em.id) });
    pos = em.end + 1;
  }
  words(chars.slice(pos).join(""));
  return parts;
}

/** Tag `badges` ("subscriber/12,premium/1") -> [{ set, version }] */
function parseBadgesTag(tag) {
  if (!tag) return [];
  return tag.split(",").map((b) => {
    const [set, version] = b.split("/");
    return { set, version };
  }).filter((b) => b.set && b.version);
}

module.exports = {
  normalizeChannel,
  parseIrc,
  loginFromPrefix,
  parseEmotesTag,
  twitchEmoteUrl,
  tokenize,
  parseBadgesTag,
};
