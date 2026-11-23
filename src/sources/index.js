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
//   { type: "clear-all" }   (el usuario ha limpiado el chat)
//   { type: "automod-hold", platform, id, channel, user, reason, parts, ts }   (requiere sesión)
//   { type: "automod-update", platform, id, channel, status: approved|denied|expired, moderator }
// `parts`: { type: "text", text } | { type: "emote", name, url, zeroWidth? } | { type: "link", text, url }
"use strict";

const { EventEmitter } = require("events");
const { TwitchAssets } = require("./twitch-assets");
const { TwitchEventSub } = require("./twitch-eventsub");
const { PLATFORMS } = require("./platforms");

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
    this.connectors = new Map(); // id de plataforma -> conector activo
    this.twitchAssets = new TwitchAssets();
  }

  /** Lo que reciben los conectores y el cálculo de canales de cada plataforma. */
  get deps() {
    return { twitchAssets: this.twitchAssets, twitchAuth: this.twitchAuth };
  }

  /** Sesión de Twitch: al iniciar o cerrar sesión se reaplica la configuración. */
  setAuth(auth) {
    this.twitchAuth = auth;
    auth.on("change", () => this.lastSources && this.apply(this.lastSources));
  }

  /** Canales que se leen de verdad en una plataforma (ninguno en modo SSN). */
  channels(platform, sources) {
    if (sources.mode !== "native") return [];
    return platform.channels(sources, this.deps);
  }

  /** Canales de Twitch que se leen (con cuenta: el del usuario; sin cuenta: los escritos). */
  twitchChannels(sources) {
    return this.channels(PLATFORMS.find((p) => p.id === "twitch"), sources);
  }

  /** Todos los canales activos, como { platform, channel } (iconos de estado del chat). */
  allChannels(sources) {
    return PLATFORMS.flatMap((p) => this.channels(p, sources).map((channel) => ({ platform: p.id, channel })));
  }

  /** Aplica la configuración `sources`: arranca, actualiza o para conectores. */
  apply(sources) {
    this.lastSources = sources;
    for (const p of PLATFORMS) {
      const list = this.channels(p, sources);
      let connector = this.connectors.get(p.id);
      if (list.length) {
        if (!connector) {
          connector = p.create(this.deps);
          connector.on("event", (ev) => this.push(ev));
          this.connectors.set(p.id, connector);
        }
        connector.setChannels(list);
      } else if (connector) {
        connector.stop();
        this.connectors.delete(p.id);
      }
    }
    this.applyModeration(sources);
    // Fuera los mensajes de canales que ya no seguimos.
    const keep = new Set(this.allChannels(sources).map((c) => `${c.platform}:${c.channel}`));
    this.backlog = this.backlog.filter((ev) => keep.has(`${ev.platform}:${ev.channel}`));
    for (const k of [...this.statuses.keys()]) if (!keep.has(k)) this.statuses.delete(k);
  }

  /** AutoMod de Twitch: solo en el modo "con mi cuenta" y con sesión iniciada. */
  applyModeration(sources) {
    const channels = this.twitchChannels(sources);
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
      case "clear-all":
        this.backlog = [];
        break;
      case "status":
        this.statuses.set(`${ev.platform}:${ev.channel}`, ev);
        break;
      default:
    }
    this.emit("event", ev);
  }

  /** Limpia el chat: historial y pantallas (app y OBS). Los canales siguen conectados. */
  clearAll() {
    this.push({ type: "clear-all" });
  }

  /** Aprueba o deniega un mensaje retenido por el AutoMod. */
  async automodAction(messageId, allow) {
    if (!this.eventsub) throw new Error("Inicia sesión en Twitch para moderar.");
    return this.eventsub.act(messageId, allow ? "ALLOW" : "DENY");
  }

  stop() {
    for (const connector of this.connectors.values()) connector.stop();
    this.connectors.clear();
    if (this.eventsub) this.eventsub.stop();
    this.eventsub = null;
  }
}

module.exports = { SourceManager };
