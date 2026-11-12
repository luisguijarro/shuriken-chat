// Shuriken Chat: utilidades puras para el chat de YouTube (sin red ni Electron).
// El chat de un directo se lee como lo hace la web de YouTube: la página del
// directo trae la "continuación" inicial y luego se piden los mensajes nuevos.
"use strict";

const { tokenize } = require("./twitch-parse");

/**
 * Normaliza lo que escribe el usuario a un objetivo:
 *  - "@canal" (handle)             -> "@canal"
 *  - URL de canal (@ o /channel/)  -> "@canal" | "channel/UC…"
 *  - URL de un directo concreto    -> "v:ID" (watch?v=, youtu.be/, /live/ID)
 */
function normalizeYoutubeTarget(value) {
  let s = String(value || "").trim();
  if (!s) return null;
  let m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|shorts\/)|youtu\.be\/)([\w-]{11})(?![\w-])/i.exec(s);
  if (m) return "v:" + m[1];
  m = /youtube\.com\/channel\/(UC[\w-]{22})(?![\w-])/i.exec(s);
  if (m) return "channel/" + m[1];
  s = s.replace(/^https?:\/\/((www|m)\.)?youtube\.com\//i, "").split(/[/?#]/)[0];
  if (!s.startsWith("@")) s = "@" + s;
  return /^@[\w.-]{3,30}$/.test(s) ? s.toLowerCase() : null;
}

/** Página donde YouTube indica el directo activo de un canal. */
function liveUrl(target) {
  if (target.startsWith("v:")) return `https://www.youtube.com/watch?v=${target.slice(2)}`;
  return `https://www.youtube.com/${target}/live`;
}

/** Datos de la página del directo: vídeo, si está en directo, versión del cliente y continuación del chat. */
function parseLivePage(html) {
  const text = String(html || "");
  const canon = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/.exec(text);
  const cont = /"liveChatRenderer":\{"continuations":\[\{"\w+":\{"continuation":"([^"]+)"/.exec(text);
  const title = /<meta name="title" content="([^"]*)"/.exec(text);
  return {
    videoId: canon ? canon[1] : null,
    isLive: /"isLive":true/.test(text),
    clientVersion: (/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/.exec(text) || [])[1] || null,
    continuation: cont ? cont[1] : null,
    title: title ? title[1] : null,
  };
}

/** Continuación de la vista "Chat en directo" (todos los mensajes) a partir de la cabecera. */
function allMessagesContinuation(header) {
  const items = header?.liveChatHeaderRenderer?.viewSelector?.sortFilterSubMenuRenderer?.subMenuItems || [];
  const all = items.find((i) => !i.selected) || null;
  return all?.continuation?.reloadContinuationData?.continuation || null;
}

/** Siguiente continuación y cuánto esperar. */
function nextContinuation(lcc) {
  const c = lcc?.continuations?.[0];
  if (!c) return null;
  const kind = Object.keys(c)[0];
  const d = c[kind] || {};
  if (!d.continuation) return null;
  // timedContinuationData marca el ritmo; con invalidationContinuationData la web recibe
  // avisos por otro canal, así que sondeamos cada pocos segundos.
  const wait = kind === "timedContinuationData" ? d.timeoutMs || 3000 : 3000;
  return { continuation: d.continuation, waitMs: Math.min(10000, Math.max(1000, wait)) };
}

const textOf = (t) => (t ? t.simpleText || (t.runs || []).map((r) => r.text || (r.emoji && r.emoji.emojiId) || "").join("") || t.content || "" : "");
const thumb = (thumbs) => {
  const list = (thumbs && (thumbs.thumbnails || thumbs.sources)) || [];
  const url = list.length ? list[list.length - 1].url : null;
  return url && url.startsWith("//") ? "https:" + url : url;
};

/** Texto con emojis de YouTube -> partes del render. */
function runsToParts(message, lookup = () => null) {
  const parts = [];
  const push = (list) => {
    for (const p of list) {
      const last = parts[parts.length - 1];
      if (p.type === "text" && last && last.type === "text") last.text += p.text;
      else parts.push(p);
    }
  };
  for (const r of (message && message.runs) || []) {
    if (r.emoji) {
      const e = r.emoji;
      // Emojis normales: el carácter (fuente del sistema). Personalizados del canal: imagen.
      if (!e.isCustomEmoji && e.emojiId && !/^UC/.test(e.emojiId)) push([{ type: "text", text: e.emojiId }]);
      else {
        const url = thumb(e.image);
        const name = (e.shortcuts && e.shortcuts[0]) || e.emojiId || "emoji";
        push(url ? [{ type: "emote", name, url }] : [{ type: "text", text: name }]);
      }
    } else if (r.text) {
      push(tokenize(r.text, "", lookup));
    }
  }
  if (!parts.length && message && message.simpleText) push(tokenize(message.simpleText, "", lookup));
  return parts;
}

/** Insignias del autor: propietario, moderador, verificado (iconos propios) y miembro (imagen del canal). */
function youtubeBadges(authorBadges) {
  const out = [];
  for (const b of authorBadges || []) {
    const r = b.liveChatAuthorBadgeRenderer || {};
    const custom = thumb(r.customThumbnail);
    if (custom) {
      out.push({ url: custom, title: r.tooltip || "Miembro" });
      continue;
    }
    const icon = r.icon && r.icon.iconType;
    if (icon === "OWNER") out.push({ url: "badges/youtube/owner.svg", title: "Propietario del canal" });
    else if (icon === "MODERATOR") out.push({ url: "badges/youtube/moderator.svg", title: "Moderador" });
    else if (icon === "VERIFIED" || icon === "CHECK_CIRCLE_THICK") out.push({ url: "badges/youtube/verified.svg", title: "Verificado" });
  }
  return out;
}

/** Color ARGB entero de YouTube -> "#rrggbb". */
function argbToHex(n) {
  if (typeof n !== "number") return null;
  return "#" + (n & 0xffffff).toString(16).padStart(6, "0");
}

function author(r) {
  const name = textOf(r.authorName).trim().replace(/^@/, "") || "?";
  return { id: r.authorExternalChannelId || name, login: name.toLowerCase(), name, color: null };
}

const tsOf = (r) => (r.timestampUsec ? Math.floor(Number(r.timestampUsec) / 1000) : Date.now());

/**
 * Acciones del chat de YouTube -> eventos normalizados (ver src/sources/index.js).
 * `base` lleva { platform, channel }.
 */
function actionsToEvents(actions, base, lookup = () => null) {
  const out = [];
  for (const a of actions || []) {
    const add = a.addChatItemAction && a.addChatItemAction.item;
    if (add) {
      const ev = itemToEvent(add, base, lookup);
      if (ev) out.push(ev);
      continue;
    }
    const del = a.removeChatItemAction || a.markChatItemAsDeletedAction;
    if (del && del.targetItemId) {
      out.push({ type: "delete", ids: [del.targetItemId] });
      continue;
    }
    const byAuthor = a.removeChatItemByAuthorAction || a.markChatItemsByAuthorAsDeletedAction;
    if (byAuthor && byAuthor.externalChannelId) {
      out.push({ ...base, type: "clear-user", userId: byAuthor.externalChannelId });
      continue;
    }
    const rep = a.replaceChatItemAction;
    if (rep && rep.targetItemId && rep.replacementItem) {
      const ev = itemToEvent(rep.replacementItem, base, lookup);
      if (ev) out.push({ type: "delete", ids: [rep.targetItemId] }, ev);
    }
  }
  return out;
}

function itemToEvent(item, base, lookup) {
  const [kind] = Object.keys(item);
  const r = item[kind] || {};
  const notice = (system, extra = {}) => ({
    ...base,
    type: "notice",
    id: r.id || `${kind}-${Date.now()}-${Math.random()}`,
    kind,
    system,
    user: author(r),
    badges: youtubeBadges(r.authorBadges),
    parts: r.message ? runsToParts(r.message, lookup) : [],
    ts: tsOf(r),
    ...extra,
  });

  switch (kind) {
    case "liveChatTextMessageRenderer":
      return {
        ...base,
        type: "message",
        id: r.id,
        user: author(r),
        badges: youtubeBadges(r.authorBadges),
        parts: runsToParts(r.message, lookup),
        action: false,
        ts: tsOf(r),
      };
    case "liveChatPaidMessageRenderer": // Super Chat
      return notice(`${author(r).name} ha enviado un Super Chat de ${textOf(r.purchaseAmountText)}`, {
        kind: "superchat",
        amount: textOf(r.purchaseAmountText),
        color: argbToHex(r.bodyBackgroundColor),
      });
    case "liveChatPaidStickerRenderer": {
      const ev = notice(`${author(r).name} ha enviado un Super Sticker de ${textOf(r.purchaseAmountText)}`, {
        kind: "superchat",
        color: argbToHex(r.backgroundColor || r.moneyChipBackgroundColor),
      });
      const url = thumb(r.sticker);
      if (url) ev.parts = [{ type: "emote", name: "Super Sticker", url }];
      return ev;
    }
    case "liveChatMembershipItemRenderer": {
      const milestone = textOf(r.headerPrimaryText);
      const sub = textOf(r.headerSubtext);
      return notice(milestone ? `${author(r).name}: ${milestone}` : `${author(r).name}: ${sub || "nuevo miembro"}`, { kind: "member" });
    }
    case "liveChatSponsorshipsGiftPurchaseAnnouncementRenderer": {
      const h = (r.header && r.header.liveChatSponsorshipsHeaderRenderer) || {};
      const who = textOf(h.authorName).replace(/^@/, "") || "Alguien";
      return {
        ...notice(`${who} ${textOf(h.primaryText) || "ha regalado suscripciones"}`, { kind: "subgift" }),
        user: { id: r.authorExternalChannelId || who, login: who.toLowerCase(), name: who, color: null },
        badges: youtubeBadges(h.authorBadges),
      };
    }
    case "liveChatSponsorshipsGiftRedemptionAnnouncementRenderer":
      return notice(`${author(r).name} ${textOf(r.message)}`.trim(), { kind: "subgift", parts: [] });
    case "giftMessageViewModel": {
      // Regalos ("Jewels"): "@usuario" + "ha enviado …"
      const who = textOf(r.authorName).trim().replace(/^@/, "") || "Alguien";
      return {
        ...base,
        type: "notice",
        id: r.id || `gift-${Date.now()}`,
        kind: "gift",
        system: `${who} ${textOf(r.text)}`.trim(),
        user: { id: who, login: who.toLowerCase(), name: who, color: null },
        badges: [],
        parts: [],
        ts: Date.now(),
      };
    }
    default:
      return null; // avisos de YouTube, encuestas, banners…
  }
}

module.exports = {
  normalizeYoutubeTarget,
  liveUrl,
  parseLivePage,
  allMessagesContinuation,
  nextContinuation,
  runsToParts,
  youtubeBadges,
  argbToHex,
  actionsToEvents,
};
