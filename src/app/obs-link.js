// Shuriken Chat: la ventana del chat servida a OBS en http://127.0.0.1:<puerto>/obs?k=<clave>.
// El servidor (src/obs-server.js) no sabe nada de la app: recibe de aquí lo que tiene que
// mostrar (medidas, marco, aspecto y mensajes).
"use strict";

const { screen } = require("electron");
const config = require("../config");
const { ObsServer, newKey } = require("../obs-server");
const { ctx, UI, alive } = require("./context");
const { persistPart } = require("./persist");
const { chatStyle, pushPageState } = require("./view-state");

const obs = new ObsServer({ uiDir: UI, snapshot: () => snapshot() });

/** Qué carga OBS dentro del marco: el mismo chat que la app (o SSN con el mismo CSS). */
function source() {
  const { cfg } = ctx;
  const key = encodeURIComponent(cfg.obs.key);
  if (cfg.sources.mode === "native") return `chat.html?k=${key}`;
  const url = config.chatUrl(cfg.appearance);
  if (!url) return `welcome.html?k=${key}`;
  // En un iframe de otro dominio no se puede inyectar CSS: SSN lo admite en la URL (&b64css).
  const css = Buffer.from(encodeURIComponent(config.pageCss(cfg.appearance))).toString("base64");
  return `${url}&b64css=${encodeURIComponent(css)}`;
}

/** Medidas y aspecto de la ventana para la página de OBS. */
function layout() {
  const { cfg, chatWin } = ctx;
  const [width, height] = alive(chatWin) ? chatWin.getContentSize() : [cfg.window.width, cfg.window.height];
  const { inset, innerRadius } = config.frameLayout(cfg.appearance);
  return {
    width, height, inset, innerRadius,
    zoom: cfg.window.zoom,
    frameCss: config.frameCss(cfg.appearance, ".frame"),
    src: source(),
  };
}

/** Lo que recibe OBS al conectarse. */
function snapshot() {
  return { layout: layout(), style: chatStyle(), pagecss: config.pageCss(ctx.cfg.appearance), backlog: ctx.sources.snapshot() };
}

let layoutTimer = null;
/** Medidas nuevas para OBS (como mucho ~10 veces por segundo: al redimensionar). */
function pushLayout() {
  if (layoutTimer) return;
  layoutTimer = setTimeout(() => {
    layoutTimer = null;
    obs.broadcast("layout", layout());
  }, 100);
}

const broadcast = (type, data) => obs.broadcast(type, data);

/** Arranca, reinicia o para el servidor según la configuración. */
async function sync() {
  if (ctx.cfg.obs.enabled) await obs.start(ctx.cfg.obs.port, ctx.cfg.obs.key);
  else obs.stop();
}

const persistKey = () => persistPart("la clave de OBS", (disk) => { disk.obs.key = ctx.cfg.obs.key; });

/** Clave propia de esta instalación (se crea la primera vez). */
function ensureKey() {
  if (ctx.cfg.obs.key) return;
  ctx.cfg.obs.key = newKey();
  persistKey();
}

/** Nueva clave: la URL anterior deja de funcionar (por si se ha filtrado). */
async function renewKey() {
  ctx.cfg.obs.key = newKey();
  persistKey();
  await sync();
}

/** Activa o para el chat para OBS (desde el botón, el menú o Configuración). */
async function setEnabled(v) {
  ctx.cfg.obs.enabled = !!v;
  persistPart("OBS", (disk) => { disk.obs.enabled = ctx.cfg.obs.enabled; });
  await sync();
  pushPageState(); // botón 📡 del chat
}

const toggleEnabled = () => setEnabled(!ctx.cfg.obs.enabled);

/** Estado del servidor y medidas de la ventana en píxeles de la pantalla (tabla de lienzos). */
function info() {
  const { cfg, chatWin } = ctx;
  const b = alive(chatWin)
    ? chatWin.getContentBounds()
    : { x: cfg.window.x || 0, y: cfg.window.y || 0, width: cfg.window.width, height: cfg.window.height };
  // Pantalla donde está la ventana: sirve para traducir su tamaño y posición a un lienzo de OBS.
  const d = screen.getDisplayMatching(b);
  const k = d.scaleFactor || 1;
  return {
    enabled: cfg.obs.enabled,
    running: cfg.obs.enabled && obs.running,
    error: cfg.obs.enabled ? obs.error : null,
    url: cfg.obs.enabled ? obs.url() : null,
    width: b.width,
    height: b.height,
    // En píxeles reales de la pantalla (como el lienzo de OBS).
    screen: {
      width: Math.round(d.bounds.width * k),
      height: Math.round(d.bounds.height * k),
      winWidth: Math.round(b.width * k),
      winHeight: Math.round(b.height * k),
      x: Math.round((b.x - d.bounds.x) * k),
      y: Math.round((b.y - d.bounds.y) * k),
    },
  };
}

const stop = () => obs.stop();

module.exports = { pushLayout, broadcast, sync, ensureKey, renewKey, setEnabled, toggleEnabled, info, stop };
