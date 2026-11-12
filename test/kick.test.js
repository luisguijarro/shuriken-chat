"use strict";

const test = require("node:test");
const assert = require("node:assert");
const k = require("../src/sources/kick-parse");
const { KickSource } = require("../src/sources/kick");
const config = require("../src/config");

test("normalizeKickChannel: nombres, @, URLs y _ -> -", () => {
  assert.strictEqual(k.normalizeKickChannel("XQC"), "xqc");
  assert.strictEqual(k.normalizeKickChannel("@Hadeel_10M"), "hadeel-10m");
  assert.strictEqual(k.normalizeKickChannel("https://kick.com/sxb?x=1"), "sxb");
  assert.strictEqual(k.normalizeKickChannel("https://kick.com/popout/mi_canal/chat"), "mi-canal");
  assert.strictEqual(k.normalizeKickChannel("dos palabras"), null);
  assert.strictEqual(k.normalizeKickChannel("a"), null);
  assert.strictEqual(k.normalizeKickChannel(""), null);
});

test("parseKickContent: emotes [emote:id:nombre], 7TV y enlaces", () => {
  const lookup = (w) => (w === "catJAM" ? { url: "https://cdn/7tv/catJAM" } : null);
  assert.deepStrictEqual(k.parseKickContent("hola [emote:37226:KEKW][emote:37226:KEKW] catJAM https://kick.com/x", lookup), [
    { type: "text", text: "hola " },
    { type: "emote", name: "KEKW", url: "https://files.kick.com/emotes/37226/fullsize" },
    { type: "emote", name: "KEKW", url: "https://files.kick.com/emotes/37226/fullsize" },
    { type: "text", text: " " },
    { type: "emote", name: "catJAM", url: "https://cdn/7tv/catJAM" },
    { type: "text", text: " " },
    { type: "link", text: "https://kick.com/x", url: "https://kick.com/x" },
  ]);
  assert.deepStrictEqual(k.parseKickContent("مانسمعه"), [{ type: "text", text: "مانسمعه" }]);
  // Un "[emote:" mal formado se queda como texto.
  assert.deepStrictEqual(k.parseKickContent("[emote:abc:x]"), [{ type: "text", text: "[emote:abc:x]" }]);
});

test("insignias: suscriptor del canal según meses, clásicas con icono propio y badges_v2 seleccionadas", () => {
  const subBadges = [
    { months: 1, badge_image: { src: "https://files.kick.com/sub1.png" } },
    { months: 6, badge_image: { src: "https://files.kick.com/sub6.png" } },
    { months: 12, badge_image: { src: "https://files.kick.com/sub12.png" } },
  ];
  const badges = k.kickBadges({
    badges: [{ type: "moderator", text: "Moderator" }, { type: "subscriber", count: 7 }, { type: "sub_gifter", count: 5 }, { type: "rara" }],
    badges_v2: [
      { name: "level", image_url: "https://ext.cdn.kick.com/45.png", metadata: { level: 45 }, selected: true, sort_order: 1 },
      { name: "Oculta", image_url: "https://ext.cdn.kick.com/x.png", selected: false, sort_order: 0 },
    ],
  }, subBadges);
  assert.deepStrictEqual(badges, [
    { url: "badges/kick/moderator.svg", title: "Moderador" },
    { url: "https://files.kick.com/sub6.png", title: "Suscriptor (7 meses)" },
    { url: "badges/kick/sub-gifter.svg", title: "Regala subs" },
    { url: "https://ext.cdn.kick.com/45.png", title: "Nivel 45" },
  ]);
  // Sin insignias del canal: icono genérico de suscriptor.
  assert.deepStrictEqual(k.kickBadges({ badges: [{ type: "subscriber", count: 3 }] }, []), [{ url: "badges/kick/subscriber.svg", title: "Suscriptor" }]);
});

test("eventos reales de Kick -> eventos normalizados", () => {
  const ks = new KickSource();
  ks.stop(); // sin red: solo traducimos
  ks.info.set("sxb", { subBadges: [] });
  const msg = ks.translate("App\\Events\\ChatMessageEvent", {
    id: "4fff4e57", content: "hola [emote:5756628:MuteD]", type: "reply", created_at: "2026-11-12T16:13:03+00:00",
    sender: { id: 22770049, username: "fahad_40", slug: "fahad-40", identity: { color: "#6F87FF", badges: [], badges_v2: [] } },
    metadata: { original_sender: { id: 1, username: "Hesa7" }, original_message: { id: "9742", content: "ااي شدعووا" } },
  }, "sxb");
  assert.strictEqual(msg.type, "message");
  assert.strictEqual(msg.platform, "kick");
  assert.strictEqual(msg.channel, "sxb");
  assert.deepStrictEqual(msg.user, { id: "22770049", login: "fahad-40", name: "fahad_40", color: "#6F87FF" });
  assert.deepStrictEqual(msg.reply, { name: "Hesa7", text: "ااي شدعووا" });
  assert.strictEqual(msg.parts[1].url, "https://files.kick.com/emotes/5756628/fullsize");
  assert.strictEqual(msg.ts, Date.parse("2026-11-12T16:13:03+00:00"));

  assert.deepStrictEqual(ks.translate("App\\Events\\MessageDeletedEvent", { id: "evento", message: { id: "abc" } }, "sxb"), { type: "delete", ids: ["abc"] });
  assert.deepStrictEqual(ks.translate("App\\Events\\UserBannedEvent", { user: { id: 5, username: "x" } }, "sxb"),
    { platform: "kick", channel: "sxb", type: "clear-user", userId: "5" });
  assert.strictEqual(ks.translate("App\\Events\\UserUnbannedEvent", { user: { id: 5 } }, "sxb"), null);
  assert.strictEqual(ks.translate("App\\Events\\ChatroomClearEvent", {}, "sxb").type, "clear-channel");
  assert.strictEqual(ks.translate("App\\Events\\SubscriptionEvent", { username: "ana", months: 3 }, "sxb").system, "ana se ha suscrito (3 meses)");
  assert.strictEqual(ks.translate("App\\Events\\GiftedSubscriptionsEvent", { gifter_username: "bob", gifted_usernames: ["a", "b"] }, "sxb").system, "bob ha regalado 2 suscripciones");
  assert.strictEqual(ks.translate("App\\Events\\StreamHostEvent", { host_username: "carl", number_viewers: 40 }, "sxb").system, "carl trae una raid con 40 espectadores");
  assert.strictEqual(ks.translate("App\\Events\\PinnedMessageCreatedEvent", {}, "sxb"), null);
});

test("config: canales de Kick normalizados", () => {
  const s = config.normalize({ sources: { kick: { channels: ["XQC", "@Hadeel_10M", "xqc", "mal nombre"] } } }).sources;
  assert.deepStrictEqual(s.kick, { channels: ["xqc", "hadeel-10m"] });
});
