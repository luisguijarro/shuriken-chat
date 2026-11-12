// Shuriken Chat: eventos de moderación de Twitch (EventSub por WebSocket).
// Requiere sesión iniciada. De momento: mensajes retenidos por el AutoMod
// (automod.message.hold / automod.message.update, versión 2).
"use strict";

const { EventEmitter } = require("events");
const { tokenize, twitchEmoteUrl } = require("./twitch-parse");

const WS_URL = "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";
const MAX_BACKOFF_MS = 60000;

const CATEGORIES = {
  aggressive: "Agresividad",
  bullying: "Acoso",
  disability: "Discapacidad",
  misogyny: "Misoginia",
  race_ethnicity_or_religion: "Raza, etnia o religión",
  sex_based_terms: "Contenido sexual",
  sexuality_sex_or_gender: "Sexualidad o género",
  swearing: "Palabrotas",
  homophobia: "Homofobia",
};

/** Motivo legible de la retención. */
function reasonText(ev) {
  if (ev.reason === "blocked_term") return "Término bloqueado del canal";
  if (ev.reason === "blocked_link") return "Enlace bloqueado";
  const a = ev.automod || {};
  const cat = CATEGORIES[a.category] || a.category || "AutoMod";
  return a.level ? `${cat} (nivel ${a.level})` : cat;
}

/** Fragmentos de Twitch -> partes del render (emotes de Twitch y de terceros, enlaces). */
function fragmentsToParts(message, lookup) {
  const parts = [];
  for (const f of (message && message.fragments) || []) {
    if (f.emote && f.emote.id) parts.push({ type: "emote", name: f.text, url: twitchEmoteUrl(f.emote.id) });
    else parts.push(...tokenize(f.text || "", "", lookup));
  }
  if (!parts.length && message && message.text) parts.push(...tokenize(message.text, "", lookup));
  return parts;
}

const STATUS = { approved: "approved", allowed: "approved", denied: "denied", expired: "expired" };

class TwitchEventSub extends EventEmitter {
  constructor(auth, assets) {
    super();
    this.auth = auth;
    this.assets = assets;
    this.channels = [];
    this.ws = null;
    this.stopped = false;
    this.backoff = 2000;
    this.keepaliveMs = 40000;
    this.lastSeen = Date.now();
    this.retryTimer = null;
    this.subscribed = new Map(); // canal -> "ok" | "not-mod" | "error: …"
    this.watchdog = setInterval(() => {
      if (this.ws && Date.now() - this.lastSeen > this.keepaliveMs) this.ws.close();
    }, 5000);
  }

  setChannels(list) {
    const changed = list.join() !== this.channels.join();
    this.channels = [...list];
    if (!this.ws) this.connect(WS_URL);
    else if (changed) this.ws.close(); // nueva sesión = suscripciones limpias
  }

  stop() {
    this.stopped = true;
    clearInterval(this.watchdog);
    clearTimeout(this.retryTimer);
    if (this.ws) this.ws.close();
    this.ws = null;
  }

  /** Estado de la moderación por canal (para la ventana de Configuración). */
  report() {
    return Object.fromEntries(this.subscribed);
  }

  connect(url, onWelcome) {
    if (this.stopped) return;
    const ws = new WebSocket(url);
    const isReconnect = !!onWelcome;
    if (!isReconnect) this.ws = ws;
    ws.onmessage = (e) => {
      this.lastSeen = Date.now();
      let msg;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      const type = msg.metadata && msg.metadata.message_type;
      const payload = msg.payload || {};
      if (type === "session_welcome") {
        const s = payload.session || {};
        this.keepaliveMs = ((s.keepalive_timeout_seconds || 30) + 10) * 1000;
        this.backoff = 2000;
        if (onWelcome) onWelcome(ws); // reconexión pedida por Twitch: las suscripciones se mantienen
        else this.subscribeAll(s.id);
      } else if (type === "session_reconnect") {
        const next = payload.session && payload.session.reconnect_url;
        if (next) {
          this.connect(next, (fresh) => {
            const old = this.ws;
            this.ws = fresh;
            if (old) {
              old.onclose = null;
              old.close();
            }
          });
        }
      } else if (type === "notification") {
        this.notify(msg.metadata.subscription_type, payload.event || {});
      } else if (type === "revocation") {
        console.warn("[shuriken] Twitch revocó una suscripción:", payload.subscription && payload.subscription.status);
      }
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped || !this.auth.loggedIn) return;
      this.retryTimer = setTimeout(() => this.connect(WS_URL), this.backoff);
      this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff * 2);
    };
  }

  async subscribeAll(sessionId) {
    this.subscribed.clear();
    try {
      if (!this.channels.length) return;
      const q = this.channels.map((c) => "login=" + encodeURIComponent(c)).join("&");
      const users = await this.auth.helix("GET", "users?" + q);
      const ids = new Map(((users.data && users.data.data) || []).map((u) => [u.login, u.id]));
      const me = this.auth.session.userId;
      for (const channel of this.channels) {
        const broadcaster = ids.get(channel);
        if (!broadcaster) continue;
        let result = "ok";
        for (const type of ["automod.message.hold", "automod.message.update"]) {
          const r = await this.auth.helix("POST", "eventsub/subscriptions", {
            type,
            version: "2",
            condition: { broadcaster_user_id: broadcaster, moderator_user_id: me },
            transport: { method: "websocket", session_id: sessionId },
          });
          if (!r.ok && r.status !== 409) {
            result = r.status === 403 ? "not-mod" : `error: ${(r.data && r.data.message) || r.status}`;
            break;
          }
        }
        this.subscribed.set(channel, result);
      }
    } catch (e) {
      console.warn("[shuriken] AutoMod: no se pudo suscribir:", e.message);
    }
    this.emit("report", this.report());
  }

  notify(type, ev) {
    const channel = ev.broadcaster_user_login;
    const roomId = ev.broadcaster_user_id;
    const user = { id: ev.user_id, login: ev.user_login, name: ev.user_name || ev.user_login };
    if (type === "automod.message.hold") {
      this.emit("event", {
        type: "automod-hold",
        platform: "twitch",
        id: ev.message_id,
        channel,
        user,
        reason: reasonText(ev),
        parts: fragmentsToParts(ev.message, (name) => this.assets.emote(roomId, name)),
        ts: Date.parse(ev.held_at) || Date.now(),
      });
    } else if (type === "automod.message.update") {
      this.emit("event", {
        type: "automod-update",
        platform: "twitch",
        id: ev.message_id,
        channel,
        status: STATUS[String(ev.status || "").toLowerCase()] || "expired",
        moderator: ev.moderator_user_name || ev.moderator_user_login || "",
      });
    }
  }

  /** Aprueba ("ALLOW") o deniega ("DENY") un mensaje retenido. */
  async act(messageId, action) {
    const r = await this.auth.helix("POST", "moderation/automod/message", {
      user_id: this.auth.session.userId,
      msg_id: messageId,
      action,
    });
    if (r.ok) return true;
    const reasons = {
      400: "el mensaje ya se revisó o ha caducado",
      403: "no eres moderador de ese canal",
      404: "Twitch ya no tiene ese mensaje",
    };
    throw new Error(reasons[r.status] || (r.data && r.data.message) || `error ${r.status}`);
  }
}

module.exports = { TwitchEventSub, reasonText, fragmentsToParts };
