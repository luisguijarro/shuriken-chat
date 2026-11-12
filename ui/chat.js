// Shuriken Chat: render del chat propio (modo "plataformas").
// Recibe eventos normalizados (ver src/sources/index.js) y los pinta.
// Seguridad: todo lo que escriben los usuarios se inserta como TEXTO, nunca como HTML.
"use strict";

const MAX_MESSAGES = 200;
const STICK_PX = 40; // si estás a menos de esto del final, el chat sigue bajando solo
const STATUS_MS = 6000; // los avisos de conexión desaparecen solos

const list = document.getElementById("messages");
const empty = document.getElementById("empty");
const waiting = document.getElementById("waiting");
let style = {
  darkMode: true, bubble: true, textGlow: false, randomColor: true, fadedTop: true, twoLines: true, showPlatform: true,
  scale: 1, sidePadding: 0, channels: [],
};
const statuses = new Map(); // "plataforma:canal" -> último estado de conexión

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

const PLATFORMS = { twitch: "Twitch" }; // iconos en ui/platforms/<plataforma>.svg

/** Icono de la plataforma de origen (se oculta con la opción, sin volver a pintar). */
function platformIcon(platform) {
  if (!PLATFORMS[platform]) return null;
  const img = el("img", "platform");
  img.src = `platforms/${platform}.svg`;
  img.alt = PLATFORMS[platform];
  img.title = PLATFORMS[platform];
  return img;
}

function renderMeta(ev, color) {
  const meta = el("span", "meta");
  const icon = platformIcon(ev.platform);
  if (icon) meta.append(icon);
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
  const system = el("span", "system");
  const icon = platformIcon(ev.platform);
  if (icon) system.append(icon);
  system.append(document.createTextNode(ev.system || ev.kind));
  div.append(system);
  if (ev.parts && ev.parts.length) {
    const color = userColor(ev.user);
    div.append(renderMeta(ev, color), renderParts(ev.parts));
  }
  return div;
}

// ---------- AutoMod (requiere sesión de Twitch) ----------
// El mensaje retenido NO se muestra: solo un aviso. Al pasar el ratón se despliega
// con el motivo, el texto y los botones para permitirlo o denegarlo.

const RESOLVED_MS = 20000; // lo que dura el aviso de "permitido/denegado"
let hoverPause = 0; // con el ratón sobre un aviso, el chat no se desplaza solo

function cleanError(e) {
  return String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

function renderAutomod(ev) {
  const div = el("div", "msg automod pending");
  div.dataset.name = ev.user.name;
  const head = el("div", "am-head");
  const icon = platformIcon(ev.platform);
  if (icon) head.append(icon);
  const name = el("b", "name", ev.user.name);
  name.style.color = userColor(ev.user);
  head.append(el("span", "am-shield", "🛡"), document.createTextNode(" AutoMod ha retenido un mensaje de "), name);
  head.append(el("span", "am-hint", "Pasa el ratón para revisarlo"));

  const body = el("div", "am-body");
  body.append(el("div", "am-reason", `Motivo: ${ev.reason}`));
  const text = renderParts(ev.parts);
  text.classList.add("am-text");
  body.append(text);
  const actions = el("div", "am-actions");
  const allow = el("button", "am-allow", "✓ Permitir");
  const deny = el("button", "am-deny", "✗ Denegar");
  allow.type = deny.type = "button";
  const error = el("div", "am-error");
  actions.append(allow, deny);
  body.append(actions, error);
  div.append(head, body);

  const act = async (ok) => {
    if (!api || !api.automod) return;
    div.classList.add("busy");
    allow.disabled = deny.disabled = true;
    error.textContent = "";
    try {
      await api.automod(ev.id, ok);
      // La confirmación llega como evento "automod-update".
    } catch (e) {
      error.textContent = `No se pudo: ${cleanError(e)}`;
      allow.disabled = deny.disabled = false;
      div.classList.remove("busy");
    }
  };
  allow.addEventListener("click", () => act(true));
  deny.addEventListener("click", () => act(false));

  div.addEventListener("mouseenter", () => {
    hoverPause++;
    // Si estaba abajo del todo, que el desplegable se vea entero.
    requestAnimationFrame(() => {
      if (stick) list.scrollTop = list.scrollHeight;
    });
  });
  div.addEventListener("mouseleave", () => {
    hoverPause = Math.max(0, hoverPause - 1);
    keepAtBottom();
  });
  return div;
}

function resolveAutomod(ev) {
  for (const div of matches(`.msg.automod[data-id="${cssEsc(ev.id)}"]`)) {
    const who = div.dataset.name || "";
    const text = {
      approved: `✓ Mensaje de ${who} permitido${ev.moderator ? ` por ${ev.moderator}` : ""}`,
      denied: `✗ Mensaje de ${who} denegado${ev.moderator ? ` por ${ev.moderator}` : ""}`,
      expired: `⌛ El mensaje de ${who} caducó sin revisar`,
    }[ev.status];
    if (div.matches(":hover")) hoverPause = Math.max(0, hoverPause - 1);
    div.className = `msg automod resolved ${ev.status}`;
    div.textContent = "";
    div.append(el("span", "am-head", text));
    setTimeout(() => {
      div.classList.add("gone");
      setTimeout(() => {
        div.remove();
        renderWaiting();
      }, 1000);
    }, RESOLVED_MS);
  }
  keepAtBottom();
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
  if (stick && !hoverPause) list.scrollTop = list.scrollHeight;
}

// ---------- Estado de conexión ----------

const hasMessages = () => !!list.querySelector(".msg:not(.status)");

/** Mientras no hay mensajes, un panel fijo dice qué pasa con cada canal
 *  (si no, una ventana vacía parece que no funciona). */
function renderWaiting() {
  const channels = style.channels || [];
  waiting.hidden = !channels.length || hasMessages();
  if (waiting.hidden) return;
  waiting.textContent = "";
  for (const { platform, channel } of channels) {
    const st = statuses.get(`${platform}:${channel}`);
    const state = st ? st.state : "connecting";
    const line = el("div", "line " + state);
    const text = {
      connected: `#${channel}: conectado. Esperando mensajes…`,
      connecting: `Conectando a #${channel}…`,
      disconnected: `#${channel}: desconectado, reintentando…`,
    }[state] || (st && st.text) || `#${channel}`;
    line.append(el("span", "dot"), el("span", null, text));
    waiting.append(line);
  }
}

function onStatus(ev) {
  statuses.set(`${ev.platform}:${ev.channel}`, ev);
  // Con mensajes en pantalla, los cambios importantes se avisan dentro del chat.
  if (hasMessages() && ev.state !== "connecting") append(renderStatus(ev));
  renderWaiting();
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
  if (!waiting.hidden) renderWaiting();
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
      return onStatus(ev);
    case "automod-hold":
      return append(renderAutomod(ev), ev);
    case "automod-update":
      return resolveAutomod(ev);
    case "delete":
      for (const id of ev.ids || []) matches(`.msg[data-id="${cssEsc(id)}"]`).forEach((n) => n.remove());
      return;
    case "clear-user":
      matches(`.msg[data-platform="${cssEsc(ev.platform)}"][data-channel="${cssEsc(ev.channel)}"][data-user="${cssEsc(ev.userId)}"]`)
        .forEach((n) => n.remove());
      return;
    case "clear-channel":
      matches(`.msg[data-platform="${cssEsc(ev.platform)}"][data-channel="${cssEsc(ev.channel)}"]`).forEach((n) => n.remove());
      break;
    default:
      return;
  }
  renderWaiting(); // si se borró todo, vuelve el panel de estado
}

// ---------- Ajustes de aspecto ----------

function applyStyle(s) {
  style = { ...style, ...s };
  const root = document.documentElement.classList;
  root.toggle("dark", !!style.darkMode);
  root.toggle("bubble", !!style.bubble);
  root.toggle("glow", !!style.textGlow);
  root.toggle("faded", !!style.fadedTop);
  root.toggle("twolines", !!style.twoLines);
  root.toggle("noplatform", !style.showPlatform);
  document.documentElement.style.setProperty("--scale", String(style.scale || 1));
  document.documentElement.style.setProperty("--side", `${style.sidePadding || 0}px`);
  empty.hidden = (style.channels || []).length > 0;
  renderWaiting();
  keepAtBottom();
}

const api = window.shurikenChat;
if (api) {
  api.on("style", applyStyle);
  api.on("event", handle);
  api.on("backlog", (snap) => {
    list.textContent = "";
    statuses.clear();
    for (const st of (snap && snap.statuses) || []) statuses.set(`${st.platform}:${st.channel}`, st);
    for (const ev of (snap && snap.events) || []) handle(ev);
    stick = true;
    renderWaiting();
    keepAtBottom();
  });
}
