// Shuriken Chat: conector del chat de Twitch.
// Lectura anónima por WebSocket (IRC): sin cuenta, sin claves, sin registrar la app.
// Emite eventos normalizados (ver src/sources/index.js) con el evento "event".
"use strict";

const { EventEmitter } = require("events");
const { parseIrc, loginFromPrefix, tokenize, parseBadgesTag } = require("./twitch-parse");

const IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
const MAX_BACKOFF_MS = 30000;
const JOIN_TIMEOUT_MS = 8000; // Twitch no avisa si el canal no existe: simplemente no confirma
const SILENCE_MS = 6 * 60 * 1000; // Twitch manda PING cada ~5 min: si no llega nada, reconectar

class TwitchSource extends EventEmitter {
  constructor(assets) {
    super();
    this.assets = assets;
    this.channels = new Set(); // los que queremos
    this.joined = new Set(); // en los que estamos
    this.rooms = new Map(); // canal -> room-id
    this.joinTimers = new Map(); // canal -> temporizador de "no confirmó la unión"
    this.ws = null;
    this.ready = false;
    this.stopped = false;
    this.backoff = 1000;
    this.retryTimer = null;
    this.lastData = Date.now();
    // Cola: los eventos salen en orden, esperando a que haya emotes cargados.
    this.queue = Promise.resolve();
    this.watchdog = setInterval(() => {
      if (this.ws && Date.now() - this.lastData > SILENCE_MS) this.ws.close();
    }, 30000);
    this.assets.loadGlobal();
  }

  /** Lista de canales deseada: se une a los nuevos y sale de los quitados. */
  setChannels(list) {
    this.channels = new Set(list);
    if (!this.ws) return this.connect();
    if (!this.ready) return;
    for (const c of this.channels) if (!this.joined.has(c) && !this.joinTimers.has(c)) this.join(c);
    for (const c of [...this.joined, ...this.joinTimers.keys()]) {
      if (!this.channels.has(c)) {
        this.send(`PART #${c}`);
        this.joined.delete(c);
        this.clearJoinTimer(c);
      }
    }
  }

  join(channel) {
    this.clearJoinTimer(channel);
    this.status(channel, "connecting", `Conectando a #${channel}…`);
    this.send(`JOIN #${channel}`);
    this.joinTimers.set(channel, setTimeout(() => {
      this.joinTimers.delete(channel);
      if (!this.joined.has(channel) && this.channels.has(channel)) {
        this.status(channel, "error", `El canal #${channel} no existe en Twitch (o está suspendido). Revisa el nombre en Configuración.`);
      }
    }, JOIN_TIMEOUT_MS));
  }

  clearJoinTimer(channel) {
    clearTimeout(this.joinTimers.get(channel));
    this.joinTimers.delete(channel);
  }

  stop() {
    this.stopped = true;
    for (const c of [...this.joinTimers.keys()]) this.clearJoinTimer(c);
    clearInterval(this.watchdog);
    clearTimeout(this.retryTimer);
    if (this.ws) this.ws.close();
    this.ws = null;
  }

  // ---------- Conexión ----------

  connect() {
    if (this.stopped || this.ws) return;
    this.ready = false;
    this.joined.clear();
    const ws = new WebSocket(IRC_URL);
    this.ws = ws;
    ws.onopen = () => {
      this.lastData = Date.now();
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send("PASS SCHMOOPIIE");
      ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
    };
    ws.onmessage = (e) => {
      this.lastData = Date.now();
      for (const line of String(e.data).split("\r\n")) if (line) this.handle(parseIrc(line));
    };
    ws.onerror = () => {}; // el cierre llega después y se gestiona allí
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.ready = false;
      for (const c of [...this.joinTimers.keys()]) this.clearJoinTimer(c);
      if (this.stopped) return;
      for (const c of this.channels) this.status(c, "disconnected", `Desconectado de #${c}, reintentando…`);
      this.retryTimer = setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff * 2);
    };
  }

  send(line) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(line);
  }

  /** Emite `build()` en orden, cuando los emotes del canal estén listos. */
  enqueue(roomId, build) {
    const ready = this.assets.whenReady(roomId);
    this.queue = this.queue
      .then(() => ready)
      .then(() => {
        if (!this.stopped) this.emit("event", build());
      })
      .catch((e) => console.warn("[shuriken] evento de Twitch descartado:", e.message));
  }

  roomOf(m, channel) {
    return m.tags["room-id"] || this.rooms.get(channel);
  }

  status(channel, state, text) {
    this.emit("event", { type: "status", platform: "twitch", channel, state, text });
  }

  // ---------- Mensajes de Twitch ----------

  handle(m) {
    const channel = (m.params[0] || "").replace(/^#/, "");
    switch (m.command) {
      case "PING":
        return this.send(`PONG :${m.params[0] || "tmi.twitch.tv"}`);
      case "001": // bienvenida: ya podemos unirnos
        this.ready = true;
        this.backoff = 1000;
        for (const c of this.channels) this.join(c);
        return;
      case "RECONNECT":
        return this.ws && this.ws.close();
      case "JOIN":
        if (/^justinfan\d+$/.test(loginFromPrefix(m.prefix)) && this.channels.has(channel)) {
          this.joined.add(channel);
          this.clearJoinTimer(channel);
          this.status(channel, "connected", `Conectado a #${channel}`);
        }
        return;
      case "ROOMSTATE":
        if (m.tags["room-id"] && !this.rooms.has(channel)) {
          this.rooms.set(channel, m.tags["room-id"]);
          this.assets.loadChannel(m.tags["room-id"], channel);
        }
        return;
      case "NOTICE": // p. ej. canal suspendido o inexistente
        if (channel && channel !== "*") this.status(channel, "error", `#${channel}: ${m.params[1] || "aviso de Twitch"}`);
        return;
      case "PRIVMSG":
        return this.enqueue(this.roomOf(m, channel), () => this.message(m, channel));
      case "USERNOTICE":
        return this.enqueue(this.roomOf(m, channel), () => this.notice(m, channel));
      case "CLEARMSG": // por la cola, para no adelantarse al mensaje que borra
        if (m.tags["target-msg-id"]) this.enqueue(null, () => ({ type: "delete", ids: [m.tags["target-msg-id"]] }));
        return;
      case "CLEARCHAT":
        if (m.tags["target-user-id"]) {
          this.enqueue(null, () => ({ type: "clear-user", platform: "twitch", channel, userId: m.tags["target-user-id"] }));
        } else {
          this.enqueue(null, () => ({ type: "clear-channel", platform: "twitch", channel }));
        }
        return;
      default:
    }
  }

  user(m) {
    const login = m.tags.login || loginFromPrefix(m.prefix);
    return {
      id: m.tags["user-id"] || login,
      login,
      name: m.tags["display-name"] || login,
      color: m.tags.color || null,
    };
  }

  badges(m, roomId) {
    return parseBadgesTag(m.tags.badges)
      .map((b) => this.assets.badge(roomId, b.set, b.version))
      .filter(Boolean);
  }

  parts(text, emotesTag, roomId) {
    return tokenize(text, emotesTag, (name) => this.assets.emote(roomId, name));
  }

  message(m, channel) {
    const roomId = this.roomOf(m, channel);
    let text = m.params[1] || "";
    // /me: "\x01ACTION texto\x01"
    const action = text.startsWith("\x01ACTION ") && text.endsWith("\x01");
    if (action) text = text.slice(8, -1);
    const ev = {
      type: "message",
      platform: "twitch",
      id: m.tags.id || `${Date.now()}-${Math.random()}`,
      channel,
      user: this.user(m),
      badges: this.badges(m, roomId),
      parts: this.parts(text, m.tags.emotes, roomId),
      action,
      ts: Number(m.tags["tmi-sent-ts"]) || Date.now(),
    };
    if (m.tags["reply-parent-display-name"]) {
      ev.reply = { name: m.tags["reply-parent-display-name"], text: m.tags["reply-parent-msg-body"] || "" };
    }
    if (m.tags["first-msg"] === "1") ev.first = true;
    if (m.tags["msg-id"] === "highlighted-message") ev.highlight = true;
    return ev;
  }

  /** Subs, regalos, raids, anuncios…: texto del sistema + mensaje opcional del usuario. */
  notice(m, channel) {
    const roomId = this.roomOf(m, channel);
    const text = m.params[1] || "";
    return {
      type: "notice",
      platform: "twitch",
      id: m.tags.id || `${Date.now()}-${Math.random()}`,
      channel,
      kind: m.tags["msg-id"] || "notice",
      system: m.tags["system-msg"] || "",
      user: this.user(m),
      badges: this.badges(m, roomId),
      parts: text ? this.parts(text, m.tags.emotes, roomId) : [],
      ts: Number(m.tags["tmi-sent-ts"]) || Date.now(),
    };
  }
}

module.exports = { TwitchSource };
