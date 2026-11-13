"use strict";

const test = require("node:test");
const assert = require("node:assert");
const y = require("../src/sources/youtube-parse");
const config = require("../src/config");

test("normalizeYoutubeTarget: @canal, URLs de canal y de directo", () => {
  assert.strictEqual(y.normalizeYoutubeTarget("@MyGameDevVlog"), "@mygamedevvlog");
  assert.strictEqual(y.normalizeYoutubeTarget("mygamedevvlog"), "@mygamedevvlog");
  assert.strictEqual(y.normalizeYoutubeTarget("https://www.youtube.com/@LofiGirl/streams"), "@lofigirl");
  assert.strictEqual(y.normalizeYoutubeTarget("https://www.youtube.com/channel/UCSJ4gkVC6NrvII8umztf0Ow"), "channel/UCSJ4gkVC6NrvII8umztf0Ow");
  assert.strictEqual(y.normalizeYoutubeTarget("https://www.youtube.com/watch?v=4t4AQ15yj1M&t=10"), "v:4t4AQ15yj1M");
  assert.strictEqual(y.normalizeYoutubeTarget("https://youtu.be/4t4AQ15yj1M"), "v:4t4AQ15yj1M");
  assert.strictEqual(y.normalizeYoutubeTarget("https://www.youtube.com/live/4t4AQ15yj1M?si=x"), "v:4t4AQ15yj1M");
  assert.strictEqual(y.normalizeYoutubeTarget("dos palabras"), null);
  assert.strictEqual(y.normalizeYoutubeTarget("@a"), null);
});

test("liveUrl y parseLivePage", () => {
  assert.strictEqual(y.liveUrl("@lofigirl"), "https://www.youtube.com/@lofigirl/live");
  assert.strictEqual(y.liveUrl("v:4t4AQ15yj1M"), "https://www.youtube.com/watch?v=4t4AQ15yj1M");
  const html = '<link rel="canonical" href="https://www.youtube.com/watch?v=4t4AQ15yj1M"><meta name="title" content="lofi hip hop radio">' +
    '"INNERTUBE_CLIENT_VERSION":"2.20261111.01.00" "isLive":true "liveChatRenderer":{"continuations":[{"reloadContinuationData":{"continuation":"0ofMyAN"}}]}';
  assert.deepStrictEqual(y.parseLivePage(html), {
    videoId: "4t4AQ15yj1M", isLive: true, clientVersion: "2.20261111.01.00", continuation: "0ofMyAN", title: "lofi hip hop radio",
  });
  const off = y.parseLivePage('<link rel="canonical" href="https://www.youtube.com/@lofigirl">');
  assert.strictEqual(off.videoId, null);
  assert.strictEqual(off.isLive, false);
});

test("continuaciones: vista 'todos los mensajes' y ritmo de sondeo", () => {
  const header = { liveChatHeaderRenderer: { viewSelector: { sortFilterSubMenuRenderer: { subMenuItems: [
    { title: "Chat destacado", selected: true, continuation: { reloadContinuationData: { continuation: "TOP" } } },
    { title: "Chat en directo", selected: false, continuation: { reloadContinuationData: { continuation: "ALL" } } },
  ] } } } };
  assert.strictEqual(y.allMessagesContinuation(header), "ALL");
  assert.deepStrictEqual(y.nextContinuation({ continuations: [{ invalidationContinuationData: { continuation: "A", timeoutMs: 10000 } }] }), { continuation: "A", waitMs: 3000 });
  assert.deepStrictEqual(y.nextContinuation({ continuations: [{ timedContinuationData: { continuation: "B", timeoutMs: 500 } }] }), { continuation: "B", waitMs: 1000 });
  assert.strictEqual(y.nextContinuation({}), null);
});

test("mensaje real: texto, emoji normal (carácter) y personalizado (imagen)", () => {
  const parts = y.runsToParts({ runs: [
    { text: "hola " },
    { emoji: { emojiId: "🗿", shortcuts: [":moai:"], image: { thumbnails: [{ url: "https://fonts.gstatic.com/1f5ff.png" }] } } },
    { text: " " },
    { emoji: { emojiId: "UCxx/abc", isCustomEmoji: true, shortcuts: [":canal-hype:"], image: { thumbnails: [{ url: "https://yt3.ggpht.com/a=s24" }, { url: "https://yt3.ggpht.com/a=s48" }] } } },
  ] });
  assert.deepStrictEqual(parts, [
    { type: "text", text: "hola 🗿 " },
    { type: "emote", name: ":canal-hype:", url: "https://yt3.ggpht.com/a=s48" },
  ]);
});

test("insignias: propietario, moderador, verificado y miembro", () => {
  assert.deepStrictEqual(y.youtubeBadges([
    { liveChatAuthorBadgeRenderer: { icon: { iconType: "OWNER" }, tooltip: "Propietario" } },
    { liveChatAuthorBadgeRenderer: { icon: { iconType: "MODERATOR" } } },
    { liveChatAuthorBadgeRenderer: { icon: { iconType: "VERIFIED" } } },
    { liveChatAuthorBadgeRenderer: { customThumbnail: { thumbnails: [{ url: "https://yt3.ggpht.com/m=s16" }, { url: "https://yt3.ggpht.com/m=s32" }] }, tooltip: "Miembro (6 meses)" } },
  ]), [
    { url: "badges/youtube/owner.svg", title: "Propietario del canal" },
    { url: "badges/youtube/moderator.svg", title: "Moderador" },
    { url: "badges/youtube/verified.svg", title: "Verificado" },
    { url: "https://yt3.ggpht.com/m=s32", title: "Miembro (6 meses)" },
  ]);
});

test("acciones del chat -> eventos normalizados", () => {
  const base = { platform: "youtube", channel: "@lofigirl" };
  const evs = y.actionsToEvents([
    { clickTrackingParams: "x", addChatItemAction: { item: { liveChatTextMessageRenderer: {
      id: "M1", message: { runs: [{ text: "hola" }] }, authorName: { simpleText: "@BeenjandXPO" },
      authorExternalChannelId: "UC8_C", timestampUsec: "1794503747914950",
    } } } },
    { addChatItemAction: { item: { liveChatPaidMessageRenderer: {
      id: "S1", purchaseAmountText: { simpleText: "5,00 €" }, bodyBackgroundColor: 4294953512,
      authorName: { simpleText: "@ana" }, authorExternalChannelId: "UCana", message: { runs: [{ text: "¡ánimo!" }] },
    } } } },
    { addChatItemAction: { item: { liveChatMembershipItemRenderer: { id: "N1", authorName: { simpleText: "@bob" }, headerSubtext: { runs: [{ text: "¡Te damos la bienvenida a Canal!" }] } } } } },
    { addChatItemAction: { item: { giftMessageViewModel: { id: "G1", text: { content: "ha enviado Moneda dorada" }, authorName: { content: "@sagesse-vivek " } } } } },
    { addChatItemAction: { item: { liveChatViewerEngagementMessageRenderer: { id: "W" } } } },
    { removeChatItemAction: { targetItemId: "M0" } },
    { markChatItemsByAuthorAsDeletedAction: { externalChannelId: "UCtroll" } },
  ], base);
  assert.strictEqual(evs.length, 6, "el aviso de bienvenida de YouTube se ignora");
  assert.deepStrictEqual(evs[0], { ...base, type: "message", id: "M1", user: { id: "UC8_C", login: "beenjandxpo", name: "BeenjandXPO", color: null }, badges: [], parts: [{ type: "text", text: "hola" }], action: false, ts: 1794503747914 });
  assert.strictEqual(evs[1].type, "notice");
  assert.strictEqual(evs[1].system, "ana ha enviado un Super Chat de 5,00 €");
  assert.strictEqual(evs[1].color, "#ffca28");
  assert.deepStrictEqual(evs[1].parts, [{ type: "text", text: "¡ánimo!" }]);
  assert.strictEqual(evs[2].system, "bob: ¡Te damos la bienvenida a Canal!");
  assert.strictEqual(evs[3].system, "sagesse-vivek ha enviado Moneda dorada");
  assert.deepStrictEqual(evs[4], { type: "delete", ids: ["M0"] });
  assert.deepStrictEqual(evs[5], { ...base, type: "clear-user", userId: "UCtroll" });
});

test("config: canales de YouTube normalizados", () => {
  const s = config.normalize({ sources: { youtube: { channels: ["@MyGameDevVlog", "mygamedevvlog", "https://youtu.be/4t4AQ15yj1M", "x y"] } } }).sources;
  assert.deepStrictEqual(s.youtube, { channels: ["@mygamedevvlog", "v:4t4AQ15yj1M"] });
});
