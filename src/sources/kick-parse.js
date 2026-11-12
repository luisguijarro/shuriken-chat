// Shuriken Chat: utilidades puras para el chat de Kick (sin red ni Electron).
"use strict";

const { tokenize } = require("./twitch-parse");

/**
 * Nombre de canal de Kick ("slug") a partir de "Canal", "@canal" o una URL de kick.com.
 * En la URL de Kick los "_" del nombre de usuario se escriben como "-".
 */
function normalizeKickChannel(value) {
  let c = String(value || "").trim().toLowerCase();
  c = c.replace(/^https?:\/\/(www\.)?kick\.com\//, "").replace(/^popout\//, "").replace(/^@/, "");
  c = c.split(/[/?#]/)[0].replace(/_/g, "-");
  return /^[a-z0-9][a-z0-9-]{1,39}$/.test(c) ? c : null;
}

const kickEmoteUrl = (id) => `https://files.kick.com/emotes/${encodeURIComponent(id)}/fullsize`;
const EMOTE_RE = /\[emote:(\d+):([^\]]*)\]/g;

/**
 * Trocea el contenido de un mensaje de Kick: los emotes vienen dentro del texto
 * como "[emote:ID:nombre]"; el resto se trocea como en Twitch (7TV y enlaces).
 */
function parseKickContent(content, lookup = () => null) {
  const text = String(content || "");
  const parts = [];
  const pushAll = (list) => {
    for (const p of list) {
      const last = parts[parts.length - 1];
      if (p.type === "text" && last && last.type === "text") last.text += p.text;
      else parts.push(p);
    }
  };
  let pos = 0;
  for (const m of text.matchAll(EMOTE_RE)) {
    pushAll(tokenize(text.slice(pos, m.index), "", lookup));
    parts.push({ type: "emote", name: m[2] || "emote", url: kickEmoteUrl(m[1]) });
    pos = m.index + m[0].length;
  }
  pushAll(tokenize(text.slice(pos), "", lookup));
  return parts;
}

// Insignias clásicas de Kick (vienen sin imagen): iconos propios en ui/badges/kick/.
const CLASSIC_BADGES = {
  broadcaster: "Streamer",
  moderator: "Moderador",
  vip: "VIP",
  og: "OG",
  founder: "Fundador",
  verified: "Verificado",
  staff: "Equipo de Kick",
  sub_gifter: "Regala subs",
};

/** Imagen de suscriptor del canal según los meses (la mayor que no los supere). */
function subscriberBadge(months, channelBadges) {
  let best = null;
  for (const b of channelBadges || []) {
    if (b && b.months <= months && (!best || b.months > best.months)) best = b;
  }
  const src = best && best.badge_image && best.badge_image.src;
  return src ? { url: src, title: `Suscriptor (${months} ${months === 1 ? "mes" : "meses"})` } : null;
}

/**
 * Insignias de un usuario: { url, title }. Las clásicas (streamer, mod, VIP, sub…)
 * y las nuevas con imagen (`badges_v2`) que el usuario tiene seleccionadas.
 */
function kickBadges(identity, channelBadges) {
  const out = [];
  const id = identity || {};
  for (const b of id.badges || []) {
    if (b.type === "subscriber") {
      const sub = subscriberBadge(Number(b.count) || 1, channelBadges);
      out.push(sub || { url: "badges/kick/subscriber.svg", title: "Suscriptor" });
    } else if (CLASSIC_BADGES[b.type]) {
      out.push({ url: `badges/kick/${b.type.replace("_", "-")}.svg`, title: CLASSIC_BADGES[b.type] });
    }
  }
  const v2 = (id.badges_v2 || []).filter((b) => b && b.selected && b.image_url);
  v2.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  for (const b of v2) {
    const level = b.metadata && b.metadata.level;
    out.push({ url: b.image_url, title: level ? `Nivel ${level}` : b.name || "Insignia" });
  }
  return out;
}

/** Primer valor de texto no vacío entre varias rutas posibles (Kick no documenta sus eventos). */
function pick(obj, paths) {
  for (const p of paths) {
    let v = obj;
    for (const k of p.split(".")) v = v == null ? undefined : v[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

module.exports = { normalizeKickChannel, kickEmoteUrl, parseKickContent, kickBadges, subscriberBadge, pick, CLASSIC_BADGES };
