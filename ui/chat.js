// Shuriken Chat: render del chat propio (modo "plataformas").
// Recibe eventos normalizados (ver src/sources/index.js) y los pinta.
// Seguridad: todo lo que escriben los usuarios se inserta como TEXTO, nunca como HTML.
"use strict";

const MAX_MESSAGES = 200;
const STICK_PX = 40; // si estás a menos de esto del final, el chat sigue bajando solo
const STATUS_MS = 6000; // los avisos de conexión desaparecen solos

const list = document.getElementById("messages");
const empty = document.getElementById("empty");
let style = { darkMode: true, bubble: true, textGlow: false, randomColor: true, fadedTop: true, scale: 1, sidePadding: 0 };

// ---------- Colores de usuario ----------

function hashHue(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h % 360;
}

function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

/** Color del nombre, ajustado para que se lea sobre fondo oscuro o claro (como hace Twitch). */
function userColor(user) {
  let hsl = style.randomColor || user.color ? hexToHsl(user.color) : null;
  if (!hsl) {
    if (!style.randomColor) return style.darkMode ? "#bf94ff" : "#7a3ce0";
    hsl = { h: hashHue(user.login || user.name || ""), s: 75, l: 60 };
  }
  const l = style.darkMode ? Math.max(hsl.l, 58) : Math.min(hsl.l, 42);
  return `hsl(${Math.round(hsl.h)} ${Math.round(hsl.s)}% ${Math.round(l)}%)`;
}

// ---------- Construcción del DOM ----------

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function emoteImg(p) {
  const img = el("img", "emote");
  img.alt = p.name;
  img.title = p.name;
  img.decoding = "async";
  const src = safeUrl(p.url);
  if (src) img.src = src;
  img.addEventListener("load", keepAtBottom);
  img.addEventListener("error", () => img.replaceWith(document.createTextNode(p.name)));
  return img;
}

function renderParts(parts) {
  const span = el("span", "text");
  let lastEmote = null;
  for (const p of parts || []) {
    if (p.type === "emote") {
      const img = emoteImg(p);
      if (p.zeroWidth && lastEmote) {
        img.classList.add("zw");
        let stack = lastEmote.parentElement;
        if (!stack.classList.contains("emote-stack")) {
          stack = el("span", "emote-stack");
          lastEmote.replaceWith(stack);
          stack.append(lastEmote);
        }
        stack.append(img);
      } else {
        span.append(img);
        lastEmote = img;
      }
      continue;
    }
    if (p.type === "link" && safeUrl(p.url)) {
      const a = el("a", null, p.text);
      a.href = safeUrl(p.url);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      span.append(a);
    } else {
      span.append(document.createTextNode(p.text || ""));
    }
    if (!/^\s*$/.test(p.text || "")) lastEmote = null;
  }
  return span;
}

function renderMeta(ev, color) {
  const meta = el("span", "meta");
  for (const b of ev.badges || []) {
    const src = safeUrl(b.url);
    if (!src) continue;
    const img = el("img", "badge");
    img.src = src;
    img.alt = b.title || "";
    img.title = b.title || "";
    meta.append(img);
  }
  const name = el("span", "name", ev.user.name);
  name.style.color = color;
  meta.append(name, el("span", "sep", ev.action ? "" : ":"));
  return meta;
}

function renderMessage(ev) {
  const div = el("div", "msg");
  const color = userColor(ev.user);
  div.style.setProperty("--user-color", color);
  if (ev.action) div.classList.add("action");
  if (ev.first) div.classList.add("first");
  if (ev.highlight) div.classList.add("highlight");
  if (ev.reply) div.append(el("span", "reply", `↪ @${ev.reply.name}: ${ev.reply.text}`));
  div.append(renderMeta(ev, color), renderParts(ev.parts));
  return div;
}

function renderNotice(ev) {
  const div = el("div", "msg notice");
  div.append(el("span", "system", ev.system || ev.kind));
  if (ev.parts && ev.parts.length) {
    const color = userColor(ev.user);
    div.append(renderMeta(ev, color), renderParts(ev.parts));
  }
  return div;
}

function renderStatus(ev) {
  const div = el("div", "msg status" + (ev.state === "error" ? " error" : ""), ev.text);
  setTimeout(() => {
    div.classList.add("gone");
    setTimeout(() => div.remove(), 1000);
  }, STATUS_MS);
  return div;
}

// ---------- Lista y autoscroll ----------

const atBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < STICK_PX;
let stick = true;
list.addEventListener("scroll", () => {
  stick = atBottom();
});

function keepAtBottom() {
  if (stick) list.scrollTop = list.scrollHeight;
}

function append(node, ev) {
  if (ev) {
    node.dataset.id = ev.id || "";
    node.dataset.platform = ev.platform || "";
    node.dataset.channel = ev.channel || "";
    if (ev.user) node.dataset.user = ev.user.id || "";
  }
  list.append(node);
  const msgs = list.querySelectorAll(".msg:not(.status)");
  for (let i = 0; i < msgs.length - MAX_MESSAGES; i++) msgs[i].remove();
  keepAtBottom();
}

const matches = (sel) => list.querySelectorAll(sel);
const cssEsc = (s) => CSS.escape(String(s));

function handle(ev) {
  switch (ev.type) {
    case "message":
      return append(renderMessage(ev), ev);
    case "notice":
      return append(renderNotice(ev), ev);
    case "status":
      return append(renderStatus(ev));
    case "delete":
      for (const id of ev.ids || []) matches(`.msg[data-id="${cssEsc(id)}"]`).forEach((n) => n.remove());
      return;
    case "clear-user":
      matches(`.msg[data-platform="${cssEsc(ev.platform)}"][data-channel="${cssEsc(ev.channel)}"][data-user="${cssEsc(ev.userId)}"]`)
        .forEach((n) => n.remove());
      return;
    case "clear-channel":
      matches(`.msg[data-platform="${cssEsc(ev.platform)}"][data-channel="${cssEsc(ev.channel)}"]`).forEach((n) => n.remove());
      return;
    default:
  }
}

// ---------- Ajustes de aspecto ----------

function applyStyle(s) {
  style = { ...style, ...s };
  const root = document.documentElement.classList;
  root.toggle("dark", !!style.darkMode);
  root.toggle("bubble", !!style.bubble);
  root.toggle("glow", !!style.textGlow);
  root.toggle("faded", !!style.fadedTop);
  document.documentElement.style.setProperty("--scale", String(style.scale || 1));
  document.documentElement.style.setProperty("--side", `${style.sidePadding || 0}px`);
  empty.hidden = (style.channels || 0) > 0;
  keepAtBottom();
}

const api = window.shurikenChat;
if (api) {
  api.on("style", applyStyle);
  api.on("event", handle);
  api.on("backlog", (events) => {
    list.textContent = "";
    for (const ev of events || []) handle(ev);
    stick = true;
    keepAtBottom();
  });
}
