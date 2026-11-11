"use strict";

const invoke = (cmd, args) => window.shuriken.invoke(cmd, args || {});
const $ = (id) => document.getElementById(id);

const FLAGS = {
  darkMode: "darkmode",
  bubble: "bubble",
  textGlow: "textglow",
  randomColor: "randomcolor",
  fadedTop: "fadedtop",
};
// hidemenu/nomenu se gestionan con la casilla "Ocultar barra de controles".
const KNOWN_PARAMS = new Set(["session", "ln", "scale", "sidepadding", "chroma", "hidemenu", "nomenu", ...Object.values(FLAGS)]);

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

// ---------- formulario <-> ajustes ----------

let lastLoaded = null;

function fill(view) {
  lastLoaded = view;
  const a = view.appearance;
  const s = view.system;
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
      extraParams: $("extraParams").value.trim(),
      transparentBg: $("transparentBg").checked,
      opacity: Number($("opacity").value),
      hideScrollbar: $("hideScrollbar").checked,
      hideMenu: $("hideMenu").checked,
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
  a.baseUrl = u.origin + u.pathname;
  a.session = p.get("session");
  a.language = p.get("ln") || a.language;
  if (p.has("scale")) a.scale = Number(p.get("scale")) || 1;
  a.sidePadding = p.has("sidepadding") ? Number(p.get("sidepadding")) || 0 : 0;
  for (const [key, param] of Object.entries(FLAGS)) a[key] = p.has(param);
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
  if (e.target.id === "importUrl") return;
  schedulePreview();
});

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

load().catch((e) => message("status", String(e), "error"));
