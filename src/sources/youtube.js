// Shuriken Chat: conector del chat de YouTube.
// Sin cuenta ni claves: se lee como la propia web de YouTube. Se busca el directo
// activo del canal (/@canal/live), se toma la continuación del chat de esa página y
// se piden los mensajes nuevos a la API interna (youtubei/v1/live_chat/get_live_chat).
// Emite eventos normalizados (ver src/sources/index.js) con el evento "event".
"use strict";

const { EventEmitter } = require("events");
const {
  liveUrl, parseLivePage, allMessagesContinuation, nextContinuation, actionsToEvents,
} = require("./youtube-parse");

const TIMEOUT_MS = 15000;
const OFFLINE_RECHECK_MS = 60000; // sin directo: volver a mirar cada minuto
const ERROR_RETRY_MS = 30000;
const CHAT_URL = "https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?prettyPrint=false";

async function getText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { status: res.status, text: await res.text() };
}

/** Datos públicos de un canal (para Apariencia): ¿existe?, nombre y si está en directo. */
async function lookupYoutube(target) {
  if (target.startsWith("v:")) {
    const page = parseLivePage((await getText(liveUrl(target))).text);
    return page.videoId ? { exists: true, name: page.title || target, live: page.isLive } : { exists: false };
  }
  const chan = await getText(`https://www.youtube.com/${target}`);
  if (chan.status === 404) return { exists: false };
  const name = (/<meta property="og:title" content="([^"]*)"/.exec(chan.text) || [])[1] || target;
  const page = parseLivePage((await getText(liveUrl(target))).text);
  return { exists: true, name, live: page.isLive && !!page.continuation };
}

/** Un canal (o directo) de YouTube: busca el directo, lee el chat y repite. */
class YoutubeTarget {
  constructor(target, emit) {
    this.target = target;
    this.emit = emit;
    this.stopped = false;
    this.timer = null;
    this.videoId = null;
    this.seen = new Set(); // ids ya emitidos (la primera respuesta repite mensajes recientes)
    this.discover();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  later(fn, ms) {
    clearTimeout(this.timer);
    if (!this.stopped) this.timer = setTimeout(fn, ms);
  }

  status(state, text) {
    this.emit({ type: "status", platform: "youtube", channel: this.target, state, text });
  }

  label() {
    return this.target.startsWith("v:") ? "el directo" : this.target;
  }

  async discover() {
    if (this.stopped) return;
    this.status("connecting", `Buscando el directo de ${this.label()}…`);
    let res;
    try {
      res = await getText(liveUrl(this.target));
    } catch (e) {
      this.status("disconnected", `YouTube no responde (${e.message}), reintentando…`);
      return this.later(() => this.discover(), ERROR_RETRY_MS);
    }
    if (this.stopped) return;
    if (res.status === 404) {
      return this.status("error", `El canal ${this.target} no existe en YouTube. Revisa el nombre en Apariencia.`);
    }
    const page = parseLivePage(res.text);
    if (!page.isLive || !page.continuation || !page.clientVersion) {
      this.status("offline", `${this.label()} no está en directo. Se conectará solo cuando empiece.`);
      return this.later(() => this.discover(), OFFLINE_RECHECK_MS);
    }
    this.videoId = page.videoId;
    this.clientVersion = page.clientVersion;
    this.first = true;
    this.poll(page.continuation);
  }

  async request(continuation) {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: this.clientVersion, hl: "es" } }, continuation }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    return d.continuationContents && d.continuationContents.liveChatContinuation;
  }

  async poll(continuation) {
    if (this.stopped) return;
    let lcc;
    try {
      lcc = await this.request(continuation);
    } catch (e) {
      this.status("disconnected", `Chat de ${this.label()}: ${e.message}, reintentando…`);
      return this.later(() => this.discover(), ERROR_RETRY_MS);
    }
    if (this.stopped) return;
    if (!lcc) {
      // Sin continuación: el directo ha terminado (o el chat se ha cerrado).
      this.status("offline", `El directo de ${this.label()} ha terminado. Se conectará solo cuando empiece otro.`);
      return this.later(() => this.discover(), OFFLINE_RECHECK_MS);
    }
    if (this.first) {
      this.first = false;
      // La página trae el chat "destacado" (filtrado): pasamos a "todos los mensajes".
      const all = allMessagesContinuation(lcc.header);
      this.status("connected", `Conectado al directo de ${this.label()}`);
      if (all) return this.poll(all);
    }
    const base = { platform: "youtube", channel: this.target };
    for (const ev of actionsToEvents(lcc.actions, base)) {
      if (ev.id && (ev.type === "message" || ev.type === "notice")) {
        if (this.seen.has(ev.id)) continue;
        this.seen.add(ev.id);
        if (this.seen.size > 2000) this.seen = new Set([...this.seen].slice(-1000));
      }
      this.emit(ev);
    }
    const next = nextContinuation(lcc);
    if (!next) {
      this.status("offline", `El directo de ${this.label()} ha terminado. Se conectará solo cuando empiece otro.`);
      return this.later(() => this.discover(), OFFLINE_RECHECK_MS);
    }
    this.later(() => this.poll(next.continuation), next.waitMs);
  }
}

class YoutubeSource extends EventEmitter {
  constructor() {
    super();
    this.targets = new Map(); // objetivo -> YoutubeTarget
  }

  setChannels(list) {
    const wanted = new Set(list);
    for (const [t, yt] of this.targets) {
      if (!wanted.has(t)) {
        yt.stop();
        this.targets.delete(t);
      }
    }
    for (const t of wanted) {
      if (!this.targets.has(t)) this.targets.set(t, new YoutubeTarget(t, (ev) => this.emit("event", ev)));
    }
  }

  stop() {
    for (const yt of this.targets.values()) yt.stop();
    this.targets.clear();
  }
}

module.exports = { YoutubeSource, lookupYoutube };
