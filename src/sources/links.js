// Shuriken Chat: enlaces dentro de los mensajes (puro y testeado, sin red ni Electron).
//
// Se reconocen como enlace, igual que en la web de cada plataforma:
//   https://darkdolmen.com/x   http://darkdolmen.com   www.darkdolmen.com   darkdolmen.com/x
// Sin "http(s)://" se abre con https://. Se evitan falsos positivos ("v1.2", "e.g.",
// "fichero.txt", "main.js"): un dominio sin www ni protocolo solo es enlace si su terminación
// es un dominio de país o uno de los genéricos habituales. Solo dominios ASCII (evita
// dominios que imitan a otros con letras de otros alfabetos).
"use strict";

// Dominios de país (todos los delegados; "js" o "txt" no lo son).
const COUNTRY_TLDS = new Set((
  "ac ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bm bn bo br bs bt bw by bz " +
  "ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg er es et eu fi fj fk " +
  "fm fo fr ga gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir " +
  "is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mg mh mk " +
  "ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl " +
  "pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sk sl sm sn so sr ss st su sv sx sy sz tc " +
  "td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug uk us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw"
).split(" "));

// Dominios genéricos habituales.
const GENERIC_TLDS = new Set([
  "com", "net", "org", "info", "biz", "edu", "gov", "mil", "int", "name", "pro", "mobi",
  "app", "dev", "page", "xyz", "online", "site", "website", "store", "shop", "live", "stream",
  "games", "game", "art", "blog", "tech", "club", "news", "media", "music", "video", "studio",
  "design", "cloud", "digital", "agency", "email", "world", "space", "fun", "top", "icu", "vip",
  "one", "bio", "wiki", "social", "chat", "team", "group", "zone", "life", "today", "network",
  "solutions", "systems", "software", "link", "click", "lol", "moe", "gay", "photo", "photos",
  "gallery", "events", "community", "academy", "school", "center", "company", "market",
  "land", "city", "gold", "rocks", "ninja", "codes", "tools", "works", "help", "support",
]);

const DOMAIN = "(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+([a-z]{2,24})";
const REST = "(?::\\d{1,5})?(?:[/?#][^\\s<>\"']*)?";
const WITH_SCHEME = /^https?:\/\/[^\s<>"']+$/i;
const WITH_WWW = new RegExp(`^www\\.${DOMAIN}${REST}$`, "i");
const BARE = new RegExp(`^${DOMAIN}${REST}$`, "i");

// Signos que suelen ir pegados al enlace sin formar parte de él: "(mira darkdolmen.com)."
const LEADING = /^[(["'¿¡«<]+/;
const TRAILING = /[.,;:!?)\]"'»>…]+$/;

/** Quita de la cola los signos de puntuación, pero respeta un ")" que cierra uno de la URL
 *  (p. ej. https://es.wikipedia.org/wiki/Shuriken_(arma)). */
function splitTrailing(s) {
  const m = TRAILING.exec(s);
  if (!m) return [s, ""];
  let body = s.slice(0, m.index);
  let tail = m[0];
  while (tail.startsWith(")") && (body.split("(").length - 1) > (body.split(")").length - 1)) {
    body += ")";
    tail = tail.slice(1);
  }
  return [body, tail];
}

/** URL para abrir el enlace escrito (o null si `s` no es un enlace). */
function linkUrl(s) {
  if (WITH_SCHEME.test(s)) return s;
  if (s.includes("@")) return null; // correos (y usuario@dominio) no
  if (WITH_WWW.test(s)) return `https://${s}`;
  const m = BARE.exec(s);
  if (!m) return null;
  const tld = m[1].toLowerCase();
  return COUNTRY_TLDS.has(tld) || GENERIC_TLDS.has(tld) ? `https://${s}` : null;
}

/**
 * Busca un enlace en una "palabra" del mensaje (sin espacios).
 * Devuelve { before, text, url, after } o null: `before`/`after` son los signos pegados
 * (paréntesis, comillas, punto final…) que se pintan como texto normal.
 */
function findLink(word) {
  const lead = (LEADING.exec(word) || [""])[0];
  const [body, after] = splitTrailing(word.slice(lead.length));
  if (!body) return null;
  const url = linkUrl(body);
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  } catch {
    return null;
  }
  return { before: lead, text: body, url, after };
}

module.exports = { findLink, linkUrl };
