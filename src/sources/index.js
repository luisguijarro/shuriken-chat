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
// `parts`: { type: "text", text } | { type: "emote", name, url, zeroWidth? } | { type: "link", text, url }
"use strict";

const { EventEmitter } = require("events");
const { TwitchSource } = require("./twitch");
const { TwitchAssets } = require("./twitch-assets");

const BACKLOG = 150; // mensajes que se reenvían si se recarga la página del chat

class SourceManager extends EventEmitter {
  constructor() {
    super();
    this.backlog = [];
    this.twitch = null;
    this.twitchAssets = new TwitchAssets();
  }

  /** Aplica la configuración `sources`: arranca, actualiza o para conectores. */
  apply(sources) {
    const channels = sources.mode === "native" ? sources.twitch.channels : [];
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
    // Fuera los mensajes de canales que ya no seguimos.
    const keep = new Set(channels.map((c) => "twitch:" + c));
    this.backlog = this.backlog.filter((ev) => keep.has(`${ev.platform}:${ev.channel}`));
  }

  push(ev) {
    switch (ev.type) {
      case "message":
      case "notice":
        this.backlog.push(ev);
        if (this.backlog.length > BACKLOG) this.backlog.shift();
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
      default:
    }
    this.emit("event", ev);
  }

  stop() {
    if (this.twitch) this.twitch.stop();
    this.twitch = null;
  }
}

module.exports = { SourceManager };
