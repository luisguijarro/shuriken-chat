// Shuriken Chat: conector del chat de Kick.
// Lectura pública y sin cuenta: datos del canal por la API de kick.com y mensajes en
// tiempo real por Pusher (los canales públicos que usa la propia web de Kick).
// Emite eventos normalizados (ver src/sources/index.js) con el evento "event".
"use strict";

const { EventEmitter } = require("events");
const { fetchJson, loadEmotes, from7tv } = require("./twitch-assets");
const { parseKickContent, kickBadges, pick } = require("./kick-parse");

const PUSHER_KEY = "34bf7a0ff419a2a775b9";
const PUSHER_CLUSTER = "us2";
const PUSHER_URL = `wss://ws-${PUSHER_CLUSTER}.pusher.com/app/${PUSHER_KEY}?protocol=7&client=js&version=8.4.0&flash=false`;
const MAX_BACKOFF_MS = 60000;
const INFO_RETRY_MS = 30000;

const SEVEN_TV_GLOBAL = [["7TV", async () => from7tv((await fetchJson("https://7tv.io/v3/emote-sets/global"))?.emotes)]];
const sevenTvChannel = [["7TV", async (userId) => from7tv((await fetchJson(`https://7tv.io/v3/users/kick/${userId}`))?.emote_set?.emotes)]];

/** Datos públicos del canal: ids, insignias de suscriptor y si existe. */
async function fetchChannel(slug) {
  const d = await fetchJson(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`);
  if (!d) return null; // 404: no existe
  return {
    slug,
    name: (d.user && d.user.username) || slug,
    channelId: d.id,
    userId: d.user_id,
    chatroomId: d.chatroom && d.chatroom.id,
    subBadges: d.subscriber_badges || [],
    live: !!d.livestream,
  };
}

class KickSource extends EventEmitter {
  constructor() {
    super();
    this.channels = new Set(); // slugs deseados
    this.info = new Map(); // slug -> datos del canal
    this.byChatroom = new Map(); // chatroomId -> slug
    this.byChannelId = new Map(); // channelId -> slug
    this.emotes = new Map(); // slug -> Map de emotes 7TV del canal
    this.globalEmotes = new Map();
    this.ws = null;
    this.stopped = false;
    this.backoff = 2000;
    this.retryTimer = null;
    this.infoTimers = new Map();
    this.activityMs = 120000;
    this.lastData = Date.now();
    this.pingSent = 0;
    loadEmotes(SEVEN_TV_GLOBAL).then((m) => (this.globalEmotes = m));
    this.watchdog = setInterval(() => this.checkAlive(), 10000);
  }

  setChannels(list) {
    const wanted = new Set(list);
    for (const slug of [...this.channels]) {
      if (!wanted.has(slug)) this.removeChannel(slug);
    }
    for (const slug of wanted) {
      if (!this.channels.has(slug)) {
        this.channels.add(slug);
        this.resolve(slug);
      }
    }
    if (!this.ws && this.channels.size) this.connect();
  }

  stop() {
    this.stopped = true;
    clearInterval(this.watchdog);
    clearTimeout(this.retryTimer);
    for (const t of this.infoTimers.values()) clearTimeout(t);
    if (this.ws) this.ws.close();
    this.ws = null;
  }

  status(channel, state, text) {
    this.emit("event", { type: "status", platform: "kick", channel, state, text });
  }

  // ---------- Canales ----------

  async resolve(slug) {
    this.status(slug, "connecting", `Conectando a ${slug} en Kick…`);
    let info;
    try {
      info = await fetchChannel(slug);
    } catch (e) {
      // Sin red o Kick caído: reintentar más tarde.
      if (!this.channels.has(slug) || this.stopped) return;
      this.status(slug, "disconnected", `Kick no responde (${e.message}), reintentando…`);
      this.infoTimers.set(slug, setTimeout(() => this.channels.has(slug) && this.resolve(slug), INFO_RETRY_MS));
      return;
    }
    if (!this.channels.has(slug) || this.stopped) return;
    if (!info || !info.chatroomId) {
      this.status(slug, "error", `El canal ${slug} no existe en Kick. Revisa el nombre en Configuración.`);
      return;
    }
    this.info.set(slug, info);
    this.byChatroom.set(String(info.chatroomId), slug);
    this.byChannelId.set(String(info.channelId), slug);
    this.subscribe(info);
    if (info.userId) loadEmotes(sevenTvChannel, info.userId).then((m) => this.emotes.set(slug, m));
  }

  removeChannel(slug) {
    this.channels.delete(slug);
    clearTimeout(this.infoTimers.get(slug));
    const info = this.info.get(slug);
    if (info) {
      for (const c of this.pusherChannels(info)) this.send("pusher:unsubscribe", { channel: c });
      this.byChatroom.delete(String(info.chatroomId));
      this.byChannelId.delete(String(info.channelId));
    }
    this.info.delete(slug);
    this.emotes.delete(slug);
  }

  pusherChannels(info) {
    return [`chatrooms.${info.chatroomId}.v2`, `channel.${info.channelId}`, `channel_${info.channelId}`];
  }

  subscribe(info) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.connected) return;
    for (const c of this.pusherChannels(info)) this.send("pusher:subscribe", { auth: "", channel: c });
  }

  // ---------- Conexión (Pusher) ----------

  connect() {
    if (this.stopped || this.ws) return;
    this.connected = false;
    const ws = new WebSocket(PUSHER_URL);
    this.ws = ws;
    ws.onmessage = (e) => {
      this.lastData = Date.now();
      this.pingSent = 0;
      let m;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      this.handle(m);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.connected = false;
      if (this.stopped || !this.channels.size) return;
      for (const slug of this.channels) this.status(slug, "disconnected", `Desconectado de ${slug} en Kick, reintentando…`);
      this.retryTimer = setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff * 2);
    };
  }

  send(event, data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ event, data }));
  }

  /** Pusher: si no llega nada en `activity_timeout`, ping; si tampoco responde, reconectar. */
  checkAlive() {
    if (!this.ws || !this.connected) return;
    const idle = Date.now() - this.lastData;
    if (this.pingSent && Date.now() - this.pingSent > 30000) return this.ws.close();
    if (!this.pingSent && idle > this.activityMs) {
      this.pingSent = Date.now();
      this.send("pusher:ping", {});
    }
  }

  handle(m) {
    const event = m.event || "";
    if (event === "pusher:connection_established") {
      this.connected = true;
      this.backoff = 2000;
      try {
        const d = JSON.parse(m.data);
        if (d.activity_timeout) this.activityMs = d.activity_timeout * 1000;
      } catch {}
      for (const info of this.info.values()) this.subscribe(info);
      return;
    }
    if (event === "pusher:ping") return this.send("pusher:pong", {});
    if (event === "pusher_internal:subscription_succeeded") {
      const slug = this.slugOf(m.channel);
      if (slug && /^chatrooms\./.test(m.channel)) this.status(slug, "connected", `Conectado a ${slug} en Kick`);
      return;
    }
    if (event === "pusher:error") {
      console.warn("[shuriken] Kick/Pusher:", m.data && JSON.stringify(m.data));
      return;
    }
    if (event.startsWith("pusher")) return;

    const slug = this.slugOf(m.channel);
    if (!slug) return;
    let data;
    try {
      data = typeof m.data === "string" ? JSON.parse(m.data) : m.data;
    } catch {
      return;
    }
    const ev = this.translate(event, data || {}, slug);
    if (ev) this.emit("event", ev);
  }

  slugOf(pusherChannel) {
    const c = String(pusherChannel || "");
    let m = /^chatrooms\.(\d+)\./.exec(c);
    if (m) return this.byChatroom.get(m[1]) || null;
    m = /^channel[._](\d+)$/.exec(c);
    return m ? this.byChannelId.get(m[1]) || null : null;
  }

  // ---------- Eventos de Kick -> eventos normalizados ----------

  user(sender) {
    const s = sender || {};
    return {
      id: String(s.id || s.slug || s.username || ""),
      login: s.slug || String(s.username || "").toLowerCase(),
      name: s.username || s.slug || "?",
      color: (s.identity && s.identity.color) || null,
    };
  }

  parts(text, slug) {
    const ch = this.emotes.get(slug);
    return parseKickContent(text, (name) => (ch && ch.get(name)) || this.globalEmotes.get(name) || null);
  }

  translate(event, d, slug) {
    const info = this.info.get(slug) || {};
    const base = { platform: "kick", channel: slug };
    const name = event.replace(/^App\\Events\\/, "");

    if (name === "ChatMessageEvent") {
      const ev = {
        ...base,
        type: "message",
        id: String(d.id),
        user: this.user(d.sender),
        badges: kickBadges(d.sender && d.sender.identity, info.subBadges),
        parts: this.parts(d.content, slug),
        action: false,
        ts: Date.parse(d.created_at) || Date.now(),
      };
      const md = d.metadata || {};
      if (d.type === "reply" && md.original_sender) {
        ev.reply = { name: md.original_sender.username || "", text: (md.original_message && md.original_message.content) || "" };
      }
      return ev;
    }
    if (name === "MessageDeletedEvent" || name === "ChatMessageDeletedEvent") {
      const id = pick(d, ["message.id", "message_id", "messageId", "id"]);
      return id ? { type: "delete", ids: [String(id)] } : null;
    }
    if (/ban/i.test(name) && !/unban/i.test(name)) {
      const userId = pick(d, ["user.id", "banned_user.id", "target_user.id"]);
      return userId ? { ...base, type: "clear-user", userId: String(userId) } : null;
    }
    if (name === "ChatroomClearEvent") return { ...base, type: "clear-channel" };

    // Avisos (suscripciones, regalos, raids, KICKs…)
    const notice = (kind, system, who) => ({
      ...base,
      type: "notice",
      id: String(d.id || `${kind}-${Date.now()}-${Math.random()}`),
      kind,
      system,
      user: { id: "", login: String(who || "").toLowerCase(), name: who || "", color: null },
      badges: [],
      parts: [],
      ts: Date.now(),
    });
    if (name === "SubscriptionEvent" || name === "ChannelSubscriptionEvent") {
      const who = pick(d, ["username", "user.username", "subscriber.username"]) || "Alguien";
      const months = Number(pick(d, ["months", "duration"])) || 1;
      return notice("sub", months > 1 ? `${who} se ha suscrito (${months} meses)` : `${who} se ha suscrito`, who);
    }
    if (name === "GiftedSubscriptionsEvent" || name === "GiftPurchaseEvent") {
      const who = pick(d, ["gifter_username", "gifter.username", "user.username"]) || "Alguien";
      const list = d.gifted_usernames || [];
      const n = list.length || Number(pick(d, ["quantity", "count", "amount"])) || 1;
      return notice("subgift", `${who} ha regalado ${n} ${n === 1 ? "suscripción" : "suscripciones"}`, who);
    }
    if (name === "StreamHostEvent" || /raid|host/i.test(name)) {
      const who = pick(d, ["host_username", "host.username", "raider.username", "user.username"]) || "Alguien";
      const viewers = Number(pick(d, ["number_viewers", "viewers", "viewer_count"])) || 0;
      return notice("raid", viewers ? `${who} trae una raid con ${viewers} espectadores` : `${who} trae una raid`, who);
    }
    if (/kicks/i.test(name) && /gift/i.test(name)) {
      const who = pick(d, ["sender.username", "gifter.username", "user.username", "username"]) || "Alguien";
      const amount = Number(pick(d, ["gift.amount", "amount", "kicks"])) || 0;
      const msg = pick(d, ["message", "gift.message"]);
      const ev = notice("kicks", amount ? `${who} ha enviado ${amount} KICKs` : `${who} ha enviado KICKs`, who);
      if (msg && typeof msg === "string") ev.parts = this.parts(msg, slug);
      return ev;
    }
    return null;
  }
}

module.exports = { KickSource, fetchChannel };
