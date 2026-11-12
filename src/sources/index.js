// Shuriken Chat: gestor de fuentes de chat (modo "plataformas").
//
// Cada conector emite eventos normalizados que se envían tal cual a ui/chat.html:
//   { type: "message", platform, id, channel, user: { id, login, name, color },
//     badges: [{ url, title }], parts: [...], action, reply?, first?, highlight?, ts }
//   { type: "notice", platform, id, channel, kind, system, user, badges, parts, ts }
//   { type: "delete", ids: [...] }
//   { type: "clear-user", platform, channel, userId }
//   { type: "clear-channel", platform, channel }
//   { type: "status", platform, channel, state, text }
//   { type: "automod-hold", platform, id, channel, user, reason, parts, ts }   (requiere sesión)
//   { type: "automod-update", platform, id, channel, status: approved|denied|expired, moderator }
// `parts`: { type: "text", text } | { type: "emote", name, url, zeroWidth? } | { type: "link", text, url }
"use strict";

const { EventEmitter } = require("events");
const { TwitchSource } = require("./twitch");
const { TwitchAssets } = require("./twitch-assets");
const { TwitchEventSub } = require("./twitch-eventsub");
const { KickSource } = require("./kick");

const BACKLOG = 150; // mensajes que se reenvían si se recarga la página del chat

class SourceManager extends EventEmitter {
  /** @param {import("./twitch-auth").TwitchAuth} [twitchAuth] sesión de Twitch (opcional) */
  constructor(twitchAuth = null) {
    super();
    this.twitchAuth = twitchAuth;
    this.eventsub = null;
    this.lastSources = null;
    this.moderation = {}; // canal -> "ok" | "not-mod" | "error: …"
    if (twitchAuth) this.setAuth(twitchAuth);
    this.backlog = [];
    this.statuses = new Map(); // "plataforma:canal" -> último evento de estado
    this.twitch = null;
    this.kick = null;
    this.twitchAssets = new TwitchAssets();
  }

  /** Sesión de Twitch: al iniciar o cerrar sesión se reaplica la configuración. */
  setAuth(auth) {
    this.twitchAuth = auth;
    auth.on("change", () => this.lastSources && this.apply(this.lastSources));
  }

  /**
   * Canales de Twitch que se leen de verdad:
   *  - con cuenta: el canal del usuario que ha iniciado sesión (ninguno si no ha iniciado sesión);
   *  - sin cuenta: los escritos a mano.
   */
  twitchChannels(sources) {
    if (sources.mode !== "native") return [];
    if (!sources.twitch.useAccount) return sources.twitch.channels;
    const auth = this.twitchAuth;
    return auth && auth.loggedIn && auth.session.login ? [auth.session.login.toLowerCase()] : [];
  }

  /** Canales de Kick que se leen (siempre sin cuenta). */
  kickChannels(sources) {
    return sources.mode === "native" ? sources.kick.channels : [];
  }

  /** Todos los canales activos, como { platform, channel } (para el panel de estado del chat). */
  allChannels(sources) {
    return [
      ...this.twitchChannels(sources).map((channel) => ({ platform: "twitch", channel })),
      ...this.kickChannels(sources).map((channel) => ({ platform: "kick", channel })),
    ];
  }

  /** Aplica la configuración `sources`: arranca, actualiza o para conectores. */
  apply(sources) {
    this.lastSources = sources;
    const channels = this.twitchChannels(sources);
    if (channels.length) {
      if (!this.twitch) {
        this.twitch = new TwitchSource(this.twitchAssets);
        this.twitch.on("event", (ev) => this.push(ev));
      }
      this.twitch.setChannels(channels);
    } else if (this.twitch) {
      this.twitch.stop();
      this.twitch = null;
    }
    // Moderación (AutoMod): solo en el modo "con mi cuenta" y con sesión iniciada.
    if (channels.length && sources.twitch.useAccount && this.twitchAuth && this.twitchAuth.loggedIn) {
      if (!this.eventsub) {
        this.eventsub = new TwitchEventSub(this.twitchAuth, this.twitchAssets);
        this.eventsub.on("event", (ev) => this.push(ev));
        this.eventsub.on("report", (r) => {
          this.moderation = r;
          this.emit("moderation", r);
        });
      }
      this.eventsub.setChannels(channels);
    } else if (this.eventsub) {
      this.eventsub.stop();
      this.eventsub = null;
      this.moderation = {};
    }
    // Kick
    const kickChannels = this.kickChannels(sources);
    if (kickChannels.length) {
      if (!this.kick) {
        this.kick = new KickSource();
        this.kick.on("event", (ev) => this.push(ev));
      }
      this.kick.setChannels(kickChannels);
    } else if (this.kick) {
      this.kick.stop();
      this.kick = null;
    }
    // Fuera los mensajes de canales que ya no seguimos.
    const keep = new Set(this.allChannels(sources).map((c) => `${c.platform}:${c.channel}`));
    this.backlog = this.backlog.filter((ev) => keep.has(`${ev.platform}:${ev.channel}`));
    for (const k of [...this.statuses.keys()]) if (!keep.has(k)) this.statuses.delete(k);
  }

  /** Lo que necesita la página del chat al (re)cargarse. */
  snapshot() {
    return { events: this.backlog, statuses: [...this.statuses.values()] };
  }

  push(ev) {
    switch (ev.type) {
      case "message":
      case "notice":
      case "automod-hold":
        this.backlog.push(ev);
        if (this.backlog.length > BACKLOG) this.backlog.shift();
        break;
      case "automod-update": // ya revisado: deja de estar pendiente
        this.backlog = this.backlog.filter((m) => !(m.type === "automod-hold" && m.id === ev.id));
        break;
      case "delete":
        this.backlog = this.backlog.filter((m) => !ev.ids.includes(m.id));
        break;
      case "clear-user":
        this.backlog = this.backlog.filter((m) =>
          !(m.platform === ev.platform && m.channel === ev.channel && m.user && m.user.id === ev.userId));
        break;
      case "clear-channel":
        this.backlog = this.backlog.filter((m) => !(m.platform === ev.platform && m.channel === ev.channel));
        break;
      case "status":
        this.statuses.set(`${ev.platform}:${ev.channel}`, ev);
        break;
      default:
    }
    this.emit("event", ev);
  }

  /** Aprueba o deniega un mensaje retenido por el AutoMod. */
  async automodAction(messageId, allow) {
    if (!this.eventsub) throw new Error("Inicia sesión en Twitch para moderar.");
    return this.eventsub.act(messageId, allow ? "ALLOW" : "DENY");
  }

  stop() {
    if (this.twitch) this.twitch.stop();
    this.twitch = null;
    if (this.eventsub) this.eventsub.stop();
    this.eventsub = null;
    if (this.kick) this.kick.stop();
    this.kick = null;
  }
}

module.exports = { SourceManager };
