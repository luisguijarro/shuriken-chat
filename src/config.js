// Configuración persistente de Shuriken Chat.
//
// Se guarda en ~/.config/shuriken-chat/config.json (Linux)
// %APPDATA%\shuriken-chat\config.json (Windows)
// o ~/Library/Application Support/shuriken-chat/config.json (macOS).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { normalizeChannel } = require("./sources/twitch-parse");
const { normalizeKickChannel } = require("./sources/kick-parse");
const { normalizeYoutubeTarget } = require("./sources/youtube-parse");

const DEFAULT_BASE_URL = "https://socialstream.ninja/dock.html";

/** Aspecto del chat: casi todo se traduce a parámetros de la URL de SSN. */
const DEFAULT_APPEARANCE = {
  baseUrl: DEFAULT_BASE_URL,
  session: "",
  language: "es",
  scale: 1,
  sidePadding: 0,
  useChroma: true,
  chroma: "00000066", // RGBA hex sin '#'
  darkMode: true,
  bubble: true,
  textGlow: false,
  randomColor: true,
  fadedTop: true,
  twoLines: true, // texto debajo del nombre (en SSN: &twolines)
  showPlatform: true, // icono de la plataforma en cada mensaje (en SSN: &hidesource si es false)
  hideMenu: true, // SSN solo oculta su barra de controles sola dentro de OBS
  extraParams: "", // parámetros extra de SSN tal cual: a=1&b&c=texto
  // --- Lo siguiente no va en la URL: lo dibuja la app ---
  margin: 10, // px entre el borde de la ventana y el chat
  borderWidth: 1, // px; 0 = sin borde
  borderColor: "ffffff66", // RGBA hex sin '#'
  cornerRadius: 10, // px
  transparentBg: true,
  opacity: 1,
  hideScrollbar: true,
  customCss: "",
};

/**
 * De dónde sale el chat:
 *  - "native": la propia app lee las plataformas (Twitch…).
 *  - "ssn": muestra el dock de Social Stream Ninja (respaldo de emergencia).
 * Por defecto "native", salvo que ya hubiera una sesión de SSN configurada.
 */
function normalizeSources(raw, appearance) {
  const s = obj(raw);
  const mode = s.mode === "ssn" || s.mode === "native" ? s.mode : appearance.session.trim() ? "ssn" : "native";
  const list = Array.isArray(obj(s.twitch).channels) ? obj(s.twitch).channels : [];
  const channels = [...new Set(list.map(normalizeChannel).filter(Boolean))];
  // Client ID de la app de Twitch (solo para iniciar sesión; vacío = el incluido en la app).
  const clientId = String(obj(s.twitch).clientId || "").trim().replace(/[^a-z0-9]/gi, "").slice(0, 64);
  // Cómo se conecta Twitch: con la cuenta del usuario (su canal, + AutoMod) o sin cuenta
  // (canales escritos a mano). Por defecto, con cuenta, salvo que ya hubiera canales escritos.
  const useAccount = typeof obj(s.twitch).useAccount === "boolean" ? obj(s.twitch).useAccount : !channels.length;
  const kickList = Array.isArray(obj(s.kick).channels) ? obj(s.kick).channels : [];
  const kick = { channels: [...new Set(kickList.map(normalizeKickChannel).filter(Boolean))] };
  const ytList = Array.isArray(obj(s.youtube).channels) ? obj(s.youtube).channels : [];
  const youtube = { channels: [...new Set(ytList.map(normalizeYoutubeTarget).filter(Boolean))] };
  return { mode, twitch: { useAccount, channels, clientId }, kick, youtube };
}

/** Opciones que requieren reiniciar la app. */
const DEFAULT_SYSTEM = {
  // En Wayland, por defecto usamos XWayland: así se puede mover la ventana,
  // recordar su posición y mantenerla siempre visible.
  nativeWayland: false,
  // Desactiva la aceleración por GPU (ventana negra o en blanco con algunos drivers).
  compatRendering: false,
};

/** Chat para OBS (fuente de navegador servida por la propia app). */
const DEFAULT_OBS = {
  enabled: true,
  port: 8187,
  key: "", // clave de la URL; se genera al arrancar si falta
};

function normalizeObs(raw) {
  const o = withDefaults(DEFAULT_OBS, raw);
  const port = Math.round(Number(o.port));
  o.port = port >= 1024 && port <= 65535 ? port : DEFAULT_OBS.port;
  o.key = String(o.key).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return o;
}

/** Ventana de webcam (aparte del chat, con el mismo marco). */
const DEFAULT_WEBCAM = {
  enabled: false,
  deviceId: "",
  deviceLabel: "", // para reconocer el dispositivo si cambia su id
  mirror: true, // voltear horizontalmente, como en las videollamadas
};

const DEFAULT_WEBCAM_WINDOW = {
  x: null,
  y: null,
  width: 360,
  height: 270,
  alwaysOnTop: true,
  locked: false,
};

/** Estado de la ventana, gestionado desde el menú contextual. */
const DEFAULT_WINDOW = {
  x: null,
  y: null,
  width: 420,
  height: 640,
  zoom: 1,
  alwaysOnTop: true,
  locked: false,
};

function configDir() {
  const home = process.env.HOME || os.homedir();
  const base = process.platform === "win32"
    ? process.env.APPDATA
    : process.platform === "darwin"
      ? path.join(home, "Library", "Application Support") // lo estándar en macOS
      : process.env.XDG_CONFIG_HOME || (home && path.join(home, ".config"));
  return path.join(base || os.homedir() || ".", "shuriken-chat");
}

const configPath = () => path.join(configDir(), "config.json");

function obj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

/** Completa con valores por defecto lo que falte (o tenga un tipo incorrecto). */
function withDefaults(defaults, value) {
  const out = { ...obj(value) };
  for (const [k, def] of Object.entries(defaults)) {
    const v = out[k];
    const ok = def === null ? v === null || typeof v === "number" : typeof v === typeof def;
    if (!ok) out[k] = def;
  }
  return out;
}

function normalize(raw) {
  const c = obj(raw);
  const appearance = withDefaults(DEFAULT_APPEARANCE, c.appearance);
  return {
    sources: normalizeSources(c.sources, appearance),
    appearance,
    system: withDefaults(DEFAULT_SYSTEM, c.system),
    obs: normalizeObs(c.obs),
    webcam: withDefaults(DEFAULT_WEBCAM, c.webcam),
    window: withDefaults(DEFAULT_WINDOW, c.window),
    webcamWindow: withDefaults(DEFAULT_WEBCAM_WINDOW, c.webcamWindow),
  };
}

function load() {
  try {
    return normalize(JSON.parse(fs.readFileSync(configPath(), "utf8")));
  } catch {
    return normalize({});
  }
}

function save(config) {
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
}

/** Lo que edita la ventana de ajustes. */
function userSettings(config) {
  return {
    sources: {
      mode: config.sources.mode,
      twitch: { ...config.sources.twitch, channels: [...config.sources.twitch.channels] },
      kick: { channels: [...config.sources.kick.channels] },
      youtube: { channels: [...config.sources.youtube.channels] },
    },
    appearance: { ...config.appearance },
    system: { ...config.system },
    obs: { enabled: config.obs.enabled, port: config.obs.port }, // la clave no se edita en el formulario
    webcam: { ...config.webcam },
  };
}

const enc = (s) => new URLSearchParams({ x: s }).toString().slice(2);
const fmtNum = (n) => String(Number(Number(n).toFixed(3))); // 0.5 -> "0.5", 1 -> "1"

/** URL completa del dock de SSN, o null si no hay sesión. */
function chatUrl(appearance) {
  const a = withDefaults(DEFAULT_APPEARANCE, appearance);
  const session = a.session.trim();
  if (!session) return null;

  let base = a.baseUrl.trim();
  try {
    if (!["https:", "http:"].includes(new URL(base).protocol)) base = DEFAULT_BASE_URL;
  } catch {
    base = DEFAULT_BASE_URL;
  }

  const q = [`session=${enc(session)}`];
  if (a.language.trim()) q.push(`ln=${enc(a.language.trim())}`);
  if (Math.abs(a.scale - 1) > Number.EPSILON) q.push(`scale=${fmtNum(a.scale)}`);
  if (a.randomColor) q.push("randomcolor");
  if (a.fadedTop) q.push("fadedtop");
  if (a.sidePadding > 0) q.push(`sidepadding=${Math.round(a.sidePadding)}`);
  if (a.textGlow) q.push("textglow");
  if (a.bubble) q.push("bubble");
  if (a.darkMode) q.push("darkmode");
  if (a.twoLines) q.push("twolines");
  if (!a.showPlatform) q.push("hidesource");
  if (a.hideMenu) q.push("hidemenu");
  if (a.useChroma && a.chroma.trim()) q.push(`chroma=${enc(a.chroma.trim().replace(/^#/, ""))}`);
  for (let part of a.extraParams.split(/[&\n]/)) {
    part = part.trim().replace(/^\?+/, "");
    if (part) q.push(part);
  }

  return base + (base.includes("?") ? "&" : "?") + q.join("&");
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));
const opacityCss = (a) =>
  a.opacity < 0.999 ? `html{opacity:${clamp(a.opacity, 0.1, 1).toFixed(2)};}\n` : "";

/** "00000066" -> "#00000066" (o el valor por defecto si no es válido). */
function cssColor(hex, fallback) {
  const h = String(hex || "").trim().replace(/^#/, "");
  return "#" + (/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(h) ? h : fallback);
}

/**
 * Geometría del marco: la ventana dibuja borde/fondo/esquinas y la vista con
 * SSN queda dentro, desplazada `inset` px y con las esquinas concéntricas.
 */
function frameLayout(appearance) {
  const a = withDefaults(DEFAULT_APPEARANCE, appearance);
  const border = Math.round(clamp(a.borderWidth, 0, 20));
  const margin = Math.round(clamp(a.margin, 0, 100));
  const radius = Math.round(clamp(a.cornerRadius, 0, 100));
  const inset = border + margin;
  return { border, margin, radius, inset, innerRadius: Math.max(0, radius - inset) };
}

/**
 * CSS de la página local del marco (ui/frame.html).
 * `opacityTarget`: en la app el marco y el chat son superficies separadas y cada una
 * lleva su opacidad ("html"); en OBS el chat va dentro de la página del marco, así que
 * la opacidad del marco se aplica solo a .frame para no multiplicarla.
 */
function frameCss(appearance, opacityTarget = "html") {
  const a = withDefaults(DEFAULT_APPEARANCE, appearance);
  const { border, radius } = frameLayout(a);
  // El color de fondo (chroma) lo pinta el marco, para que también cubra el margen.
  const bg = a.useChroma ? cssColor(a.chroma, "00000066") : "transparent";
  const bd = border > 0 ? `${border}px solid ${cssColor(a.borderColor, "ffffff66")}` : "none";
  return `.frame{border:${bd};border-radius:${radius}px;background:${bg};}\n` + opacityCss(a).replace(/^html\{/, opacityTarget + "{");
}

/** CSS de la ventana de webcam: el mismo borde y esquinas que el chat, pero SIN margen
 *  (decisión del usuario): el vídeo llega hasta el borde, con esquinas concéntricas. */
function webcamCss(appearance) {
  const { inset, innerRadius } = frameLayout({ ...withDefaults(DEFAULT_APPEARANCE, appearance), margin: 0 });
  return frameCss(appearance) +
    // !important: la página tiene "inset: 0" de base y, a igual especificidad, ganaba.
    `#view,#msg{left:${inset}px!important;top:${inset}px!important;right:${inset}px!important;bottom:${inset}px!important;border-radius:${innerRadius}px;}\n`;
}

/** CSS que inyectamos en la página del chat. */
function pageCss(appearance) {
  const a = withDefaults(DEFAULT_APPEARANCE, appearance);
  let css = "";
  // Con chroma, el fondo lo pinta el marco: si SSN también lo pintara se sumarían.
  if (a.transparentBg || a.useChroma) {
    css += "html,body{background:transparent!important;background-color:transparent!important;}\n";
  }
  css += opacityCss(a);
  if (a.hideScrollbar) {
    css += "::-webkit-scrollbar{display:none!important;}html,body{scrollbar-width:none!important;}\n";
  }
  return css + a.customCss;
}

module.exports = {
  DEFAULT_BASE_URL,
  configDir,
  configPath,
  normalize,
  load,
  save,
  userSettings,
  chatUrl,
  pageCss,
  frameCss,
  frameLayout,
  webcamCss,
};
