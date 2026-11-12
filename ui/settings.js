"use strict";

const invoke = (cmd, args) => window.shuriken.invoke(cmd, args || {});
const $ = (id) => document.getElementById(id);

const FLAGS = {
  darkMode: "darkmode",
  bubble: "bubble",
  textGlow: "textglow",
  randomColor: "randomcolor",
  fadedTop: "fadedtop",
  twoLines: "twolines",
};
// hidemenu/nomenu se gestionan con la casilla "Ocultar barra de controles".
const KNOWN_PARAMS = new Set([
  "session", "ln", "scale", "sidepadding", "chroma", "hidemenu", "nomenu", "hidesource", ...Object.values(FLAGS),
]);

// ---------- chroma (RGBA hex) ----------

/** "0006" | "#000000" | "00000066" -> "00000066" (o null si no es válido) */
function normalizeHex(h) {
  h = String(h || "").trim().replace(/^#/, "");
  if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
  if (h.length === 6) h += "ff";
  return /^[0-9a-f]{8}$/i.test(h) ? h.toLowerCase() : null;
}

// Un color RGBA se edita con un selector de color (<prefix>Color) y un
// deslizador de opacidad (<prefix>Alpha).
function setRgba(prefix, hex, fallback) {
  const h = normalizeHex(hex) || fallback;
  $(prefix + "Color").value = "#" + h.slice(0, 6);
  $(prefix + "Alpha").value = parseInt(h.slice(6, 8), 16);
}

function getRgba(prefix) {
  const alpha = Number($(prefix + "Alpha").value).toString(16).padStart(2, "0");
  return $(prefix + "Color").value.replace("#", "") + alpha;
}

const rgbaCss = (h) =>
  `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${parseInt(h.slice(6, 8), 16) / 255})`;

const setChroma = (hex) => setRgba("chroma", hex, "00000066");
const getChroma = () => getRgba("chroma");

// ---------- fuente del chat ----------

/**
 * Lista de canales de una plataforma: casilla para escribir, etiquetas y
 * comprobación de que el canal existe (y si está en directo).
 */
class ChannelList {
  constructor({ id, platform, prefix, normalize, invalidMsg, checkCmd }) {
    Object.assign(this, { platform, prefix, normalize, invalidMsg, checkCmd });
    this.input = $(id + "Input");
    this.list = $(id + "List");
    this.msgId = id + "Msg";
    this.channels = [];
    this.info = new Map(); // canal -> { exists, name, live }
    $(id + "Add").addEventListener("click", () => this.add());
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.add();
    });
  }

  label(c, info) {
    return this.prefix + ((info && info.name) || c);
  }

  set(list) {
    this.channels = [...list];
    this.render();
    // Comprueba los canales guardados (marca en rojo los que no existen).
    Promise.all(this.channels.map((c) => this.check(c))).then(() => this.render());
  }

  async check(c) {
    if (this.info.has(c)) return this.info.get(c);
    let info;
    try {
      info = await invoke(this.checkCmd, { channel: c });
    } catch {
      info = { exists: null };
    }
    if (info.exists !== null) this.info.set(c, info); // si falló la red, se reintentará
    return info;
  }

  render() {
    this.list.textContent = "";
    for (const c of this.channels) {
      const li = document.createElement("li");
      const info = this.info.get(c);
      if (info && info.exists === false) {
        li.classList.add("bad");
        li.title = `Este canal no existe en ${this.platform}`;
      } else if (info && info.live) {
        li.classList.add("live");
        li.title = "En directo ahora";
      }
      li.append(document.createTextNode(c));
      const del = document.createElement("button");
      del.type = "button";
      del.title = "Quitar";
      del.textContent = "×";
      del.addEventListener("click", () => {
        this.channels = this.channels.filter((x) => x !== c);
        this.render();
        schedulePreview();
      });
      li.append(del);
      this.list.append(li);
    }
  }

  async add() {
    const raw = this.input.value;
    if (!raw.trim()) return;
    const c = this.normalize(raw);
    if (!c) return message(this.msgId, this.invalidMsg, "error");
    if (this.channels.includes(c)) return message(this.msgId, `${this.prefix}${c} ya está en la lista.`, "");
    this.channels.push(c);
    this.input.value = "";
    message(this.msgId, `Comprobando ${this.prefix}${c}…`, "");
    this.render();
    schedulePreview();
    const info = await this.check(c);
    if (!this.channels.includes(c)) return;
    if (info.exists === false) {
      message(this.msgId, `${this.prefix}${c} no existe en ${this.platform}. Revisa el nombre (puedes copiarlo de la URL del canal).`, "error");
    } else if (info.exists === null) {
      message(this.msgId, `${this.prefix}${c} añadido (no se pudo comprobar si existe).`, "");
    } else {
      message(this.msgId, `${this.label(c, info)} añadido ✓${info.live ? " · en directo ahora" : " · ahora mismo no está en directo"}`, "ok");
    }
    this.render();
  }
}

/** Igual que normalizeChannel en src/sources/twitch-parse.js. */
function normalizeTwitch(value) {
  let c = String(value || "").trim().toLowerCase();
  c = c.replace(/^https?:\/\/(www\.|m\.)?twitch\.tv\//, "").replace(/^[#@]/, "");
  c = c.split(/[/?#]/)[0];
  return /^[a-z0-9_]{1,25}$/.test(c) ? c : null;
}

/** Igual que normalizeKickChannel en src/sources/kick-parse.js. */
function normalizeKick(value) {
  let c = String(value || "").trim().toLowerCase();
  c = c.replace(/^https?:\/\/(www\.)?kick\.com\//, "").replace(/^popout\//, "").replace(/^@/, "");
  c = c.split(/[/?#]/)[0].replace(/_/g, "-");
  return /^[a-z0-9][a-z0-9-]{1,39}$/.test(c) ? c : null;
}

/** Igual que normalizeYoutubeTarget en src/sources/youtube-parse.js. */
function normalizeYoutube(value) {
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

const twitchList = new ChannelList({
  id: "twitch", platform: "Twitch", prefix: "#", normalize: normalizeTwitch, checkCmd: "check_twitch_channel",
  invalidMsg: "Nombre no válido: solo letras, números y _ (máx. 25).",
});
const youtubeList = new ChannelList({
  id: "youtube", platform: "YouTube", prefix: "", normalize: normalizeYoutube, checkCmd: "check_youtube_channel",
  invalidMsg: "No válido: escribe @canal o pega la URL del canal o del directo.",
});
const kickList = new ChannelList({
  id: "kick", platform: "Kick", prefix: "", normalize: normalizeKick, checkCmd: "check_kick_channel",
  invalidMsg: "Nombre no válido: solo letras, números, _ y - (o pega la URL del canal).",
});

const getMode = () => (document.querySelector('input[name="mode"]:checked') || {}).value || "native";
const getTwitchMode = () => (document.querySelector('input[name="twitchMode"]:checked') || {}).value || "account";

function setTwitchMode(mode) {
  for (const r of document.querySelectorAll('input[name="twitchMode"]')) r.checked = r.value === mode;
  document.body.classList.toggle("tw-account", mode === "account");
  document.body.classList.toggle("tw-anon", mode === "anonymous");
}

function setMode(mode) {
  for (const r of document.querySelectorAll('input[name="mode"]')) r.checked = r.value === mode;
  document.body.classList.toggle("mode-native", mode === "native");
  document.body.classList.toggle("mode-ssn", mode === "ssn");
}

// ---------- cuenta de Twitch (AutoMod) ----------

let authState = { loggedIn: false, hasDefaultClientId: false, moderation: {} };

function button(text, cls, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  if (cls) b.className = cls;
  b.addEventListener("click", onClick);
  return b;
}

function renderAuth() {
  const box = $("twitchAccount");
  box.textContent = "";
  const line = document.createElement("div");
  line.className = "row";
  const label = document.createElement("span");
  label.className = "grow";
  if (authState.loggedIn) {
    label.append("Conectado a tu canal ");
    const b = document.createElement("b");
    b.textContent = "#" + authState.login;
    label.append(b);
    line.append(label, button("Cerrar sesión", "ghost", logout));
  } else {
    label.textContent = "Inicia sesión y se usará tu canal automáticamente.";
    line.append(label, button("Iniciar sesión con Twitch", "", login));
  }
  box.append(line);
  // En qué canales funciona la revisión del AutoMod.
  const mod = authState.moderation || {};
  if (authState.loggedIn && Object.keys(mod).length) {
    const ul = document.createElement("ul");
    ul.className = "mod-list";
    for (const [c, st] of Object.entries(mod)) {
      const li = document.createElement("li");
      li.className = st === "ok" ? "ok" : "bad";
      li.textContent = st === "ok" ? `#${c}: AutoMod activo` : st === "not-mod" ? `#${c}: no eres moderador` : `#${c}: ${st}`;
      ul.append(li);
    }
    box.append(ul);
  }
  if (!authState.hasDefaultClientId && !$("twitchClientId").value.trim()) $("clientIdBox").open = true;
  // Al cambiar de modo, Apariencia ya ha aplicado la vista previa; el chat se actualiza solo.
}

async function refreshAuth() {
  try {
    authState = await invoke("twitch_auth_status");
  } catch {}
  renderAuth();
}

const cleanError = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

async function login() {
  const clientId = $("twitchClientId").value.trim();
  if (!clientId && !authState.hasDefaultClientId) {
    $("clientIdBox").open = true;
    return message("authMsg", "Primero pon el Client ID de tu app de Twitch (abajo).", "error");
  }
  message("authMsg", "Pidiendo código a Twitch…", "");
  try {
    const r = await invoke("twitch_login_start", { clientId });
    $("twitchCode").textContent = r.userCode;
    $("twitchVerify").href = r.verificationUri;
    $("twitchLogin").hidden = false;
    message("authMsg", "Esperando a que autorices la app en Twitch…", "");
    const st = await invoke("twitch_login_wait");
    message("authMsg", `¡Sesión iniciada como ${st.login}!`, "ok");
  } catch (e) {
    message("authMsg", cleanError(e), "error");
  }
  $("twitchLogin").hidden = true;
  await refreshAuth(); // el estado del AutoMod por canal llega después, por onAuthChanged
}

async function logout() {
  await invoke("twitch_logout").catch(() => {});
  message("authMsg", "Sesión cerrada.", "");
  refreshAuth();
}

// ---------- formulario <-> ajustes ----------

let lastLoaded = null;

function fill(view) {
  lastLoaded = view;
  const a = view.appearance;
  const s = view.system;
  setMode(view.sources.mode);
  setTwitchMode(view.sources.twitch.useAccount ? "account" : "anonymous");
  twitchList.set(view.sources.twitch.channels);
  kickList.set(view.sources.kick.channels);
  youtubeList.set(view.sources.youtube.channels);
  $("twitchClientId").value = view.sources.twitch.clientId || "";
  $("session").value = a.session;
  ensureOption($("language"), a.language);
  $("language").value = a.language;
  $("scale").value = a.scale;
  $("sidePadding").value = a.sidePadding;
  $("margin").value = a.margin;
  $("cornerRadius").value = a.cornerRadius;
  $("borderWidth").value = a.borderWidth;
  setRgba("border", a.borderColor, "ffffff66");
  for (const k of Object.keys(FLAGS)) $(k).checked = !!a[k];
  $("transparentBg").checked = a.transparentBg;
  $("useChroma").checked = a.useChroma;
  setChroma(a.chroma);
  $("opacity").value = a.opacity;
  $("hideScrollbar").checked = a.hideScrollbar;
  $("hideMenu").checked = a.hideMenu;
  $("showPlatform").checked = a.showPlatform;
  $("extraParams").value = a.extraParams;
  $("customCss").value = a.customCss;
  $("baseUrl").value = a.baseUrl;
  $("nativeWayland").checked = s.nativeWayland;
  $("compatRendering").checked = s.compatRendering;
  $("url").value = view.url || "";
  refreshLabels();
}

function collect() {
  return {
    sources: {
      mode: getMode(),
      twitch: {
        useAccount: getTwitchMode() === "account",
        channels: [...twitchList.channels],
        clientId: $("twitchClientId").value.trim(),
      },
      kick: { channels: [...kickList.channels] },
      youtube: { channels: [...youtubeList.channels] },
    },
    appearance: {
      baseUrl: $("baseUrl").value.trim(),
      session: $("session").value.trim(),
      language: $("language").value,
      scale: Number($("scale").value),
      sidePadding: Number($("sidePadding").value),
      margin: Number($("margin").value),
      cornerRadius: Number($("cornerRadius").value),
      borderWidth: Number($("borderWidth").value),
      borderColor: getRgba("border"),
      useChroma: $("useChroma").checked,
      chroma: getChroma(),
      darkMode: $("darkMode").checked,
      bubble: $("bubble").checked,
      textGlow: $("textGlow").checked,
      randomColor: $("randomColor").checked,
      fadedTop: $("fadedTop").checked,
      twoLines: $("twoLines").checked,
      extraParams: $("extraParams").value.trim(),
      transparentBg: $("transparentBg").checked,
      opacity: Number($("opacity").value),
      hideScrollbar: $("hideScrollbar").checked,
      hideMenu: $("hideMenu").checked,
      showPlatform: $("showPlatform").checked,
      customCss: $("customCss").value,
    },
    system: {
      nativeWayland: $("nativeWayland").checked,
      compatRendering: $("compatRendering").checked,
    },
  };
}

function ensureOption(select, value) {
  if (!value || [...select.options].some((o) => o.value === value)) return;
  select.add(new Option(value, value));
}

function refreshLabels() {
  $("scaleOut").textContent = Math.round($("scale").value * 100) + "%";
  $("sidePaddingOut").textContent = $("sidePadding").value + " px";
  $("opacityOut").textContent = Math.round($("opacity").value * 100) + "%";
  $("chromaAlphaOut").textContent = Math.round(($("chromaAlpha").value / 255) * 100) + "%";
  $("marginOut").textContent = $("margin").value + " px";
  $("cornerRadiusOut").textContent = $("cornerRadius").value + " px";
  $("borderWidthOut").textContent = $("borderWidth").value === "0" ? "sin borde" : $("borderWidth").value + " px";
  $("borderAlphaOut").textContent = Math.round(($("borderAlpha").value / 255) * 100) + "%";
  $("borderSwatch").style.setProperty("--chroma", rgbaCss(getRgba("border")));
  $("borderBox").classList.toggle("disabled", $("borderWidth").value === "0");
  $("chromaSwatch").style.setProperty("--chroma", rgbaCss(getChroma()));
  $("chromaBox").classList.toggle("disabled", !$("useChroma").checked);
  $("transparentBg").disabled = $("useChroma").checked;
}

// ---------- importar URL de SSN ----------

function importUrl(text) {
  let u;
  try {
    u = new URL(text.trim());
  } catch {
    return message("importMsg", "Esa URL no es válida.", "error");
  }
  const p = u.searchParams;
  if (!p.get("session")) return message("importMsg", "La URL no tiene «session=…».", "error");

  const current = collect();
  const a = current.appearance;
  current.sources.mode = "ssn"; // quien importa una URL de SSN quiere usar SSN
  a.baseUrl = u.origin + u.pathname;
  a.session = p.get("session");
  a.language = p.get("ln") || a.language;
  if (p.has("scale")) a.scale = Number(p.get("scale")) || 1;
  a.sidePadding = p.has("sidepadding") ? Number(p.get("sidepadding")) || 0 : 0;
  for (const [key, param] of Object.entries(FLAGS)) {
    if (key === "twoLines") continue; // preferencia de Shuriken: solo se activa si viene en la URL
    a[key] = p.has(param);
  }
  if (p.has("twolines")) a.twoLines = true;
  a.showPlatform = !p.has("hidesource");
  // La URL de OBS no suele llevarlo (allí se oculta sola): solo lo activamos si viene.
  if (p.has("hidemenu") || p.has("nomenu")) a.hideMenu = true;
  a.useChroma = p.has("chroma");
  if (a.useChroma) a.chroma = normalizeHex(p.get("chroma")) || a.chroma;

  const extra = [];
  for (const [k, v] of p) {
    if (KNOWN_PARAMS.has(k)) continue;
    extra.push(v === "" ? k : `${k}=${encodeURIComponent(v)}`);
  }
  a.extraParams = extra.join("&");

  fill({ ...current, url: lastLoaded && lastLoaded.url });
  $("importUrl").value = "";
  message("importMsg", "Importado ✓ — revisa y pulsa Guardar.", "ok");
  preview();
}

// ---------- comunicación con la app ----------

let previewTimer = null;
function schedulePreview() {
  refreshLabels();
  clearTimeout(previewTimer);
  previewTimer = setTimeout(preview, 350);
}

async function preview() {
  try {
    const url = await invoke("preview_settings", { settings: collect() });
    $("url").value = url || "";
    message("status", "Cambios sin guardar", "");
  } catch (e) {
    message("status", String(e), "error");
  }
}

function message(id, text, kind) {
  const el = $(id);
  el.textContent = text;
  el.className = "msg " + (kind || "");
}

async function load() {
  fill(await invoke("get_settings"));
}

document.addEventListener("input", (e) => {
  if (["importUrl", "twitchInput", "kickInput", "youtubeInput"].includes(e.target.id)) return;
  if (e.target.name === "mode") setMode(getMode());
  if (e.target.name === "twitchMode") setTwitchMode(getTwitchMode());
  schedulePreview();
});

$("twitchCancel").addEventListener("click", () => invoke("twitch_login_cancel").catch(() => {}));

$("importBtn").addEventListener("click", () => importUrl($("importUrl").value));
$("importUrl").addEventListener("keydown", (e) => {
  if (e.key === "Enter") importUrl($("importUrl").value);
});
$("importUrl").addEventListener("paste", () => setTimeout(() => importUrl($("importUrl").value), 0));

$("toggleSession").addEventListener("click", () => {
  const el = $("session");
  el.type = el.type === "password" ? "text" : "password";
});

$("copyUrl").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("url").value);
    message("status", "URL copiada", "ok");
  } catch {
    $("url").select();
  }
});

$("save").addEventListener("click", async () => {
  clearTimeout(previewTimer);
  try {
    const before = lastLoaded && lastLoaded.system;
    const settings = collect();
    const url = await invoke("save_settings", { settings });
    lastLoaded = { ...settings, url };
    $("url").value = url || "";
    const restart = before &&
      (before.nativeWayland !== settings.system.nativeWayland || before.compatRendering !== settings.system.compatRendering);
    message("status", restart ? "Guardado ✓ — reinicia la app para aplicar las opciones de sistema" : "Guardado ✓", "ok");
  } catch (e) {
    message("status", String(e), "error");
  }
});

$("revert").addEventListener("click", async () => {
  clearTimeout(previewTimer);
  fill(await invoke("revert_settings"));
  message("status", "Cambios descartados", "");
});

if (window.shuriken.onAuthChanged) window.shuriken.onAuthChanged(refreshAuth);
load().then(refreshAuth).catch((e) => message("status", String(e), "error"));
