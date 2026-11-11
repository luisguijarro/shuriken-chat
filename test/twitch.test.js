"use strict";

const test = require("node:test");
const assert = require("node:assert");
const t = require("../src/sources/twitch-parse");
const { from7tv, fromBttv, fromFfzSets } = require("../src/sources/twitch-assets");
const config = require("../src/config");

test("normalizeChannel acepta nombres, # @ y URLs; rechaza lo demás", () => {
  assert.strictEqual(t.normalizeChannel("XQC"), "xqc");
  assert.strictEqual(t.normalizeChannel(" #Ibai "), "ibai");
  assert.strictEqual(t.normalizeChannel("@rubius"), "rubius");
  assert.strictEqual(t.normalizeChannel("https://www.twitch.tv/auronplay?ref=x"), "auronplay");
  assert.strictEqual(t.normalizeChannel("https://m.twitch.tv/some_one/videos"), "some_one");
  assert.strictEqual(t.normalizeChannel("dos palabras"), null);
  assert.strictEqual(t.normalizeChannel("ñandú"), null);
  assert.strictEqual(t.normalizeChannel(""), null);
  assert.strictEqual(t.normalizeChannel("a".repeat(26)), null);
});

test("parseIrc: tags escapados, prefijo, parámetros y texto", () => {
  const m = t.parseIrc(
    "@badge-info=;badges=moderator/1;color=#FF0000;display-name=Ana;emotes=;id=abc;system-msg=Ana\\ssuscrita\\:\\s5\\smeses " +
      ":ana!ana@ana.tmi.twitch.tv PRIVMSG #canal :hola: qué tal",
  );
  assert.strictEqual(m.command, "PRIVMSG");
  assert.deepStrictEqual(m.params, ["#canal", "hola: qué tal"]);
  assert.strictEqual(m.tags["display-name"], "Ana");
  assert.strictEqual(m.tags["system-msg"], "Ana suscrita; 5 meses");
  assert.strictEqual(m.tags["badge-info"], "");
  assert.strictEqual(t.loginFromPrefix(m.prefix), "ana");

  assert.deepStrictEqual(t.parseIrc("PING :tmi.twitch.tv"), { tags: {}, prefix: null, command: "PING", params: ["tmi.twitch.tv"] });
  const j = t.parseIrc(":justinfan123!justinfan123@justinfan123.tmi.twitch.tv JOIN #canal");
  assert.strictEqual(j.command, "JOIN");
  assert.deepStrictEqual(j.params, ["#canal"]);
});

test("parseEmotesTag ordena y descarta rangos inválidos", () => {
  assert.deepStrictEqual(t.parseEmotesTag("25:6-10/1902:0-4,12-16/x:9-2"), [
    { id: "1902", start: 0, end: 4 },
    { id: "25", start: 6, end: 10 },
    { id: "1902", start: 12, end: 16 },
  ]);
  assert.deepStrictEqual(t.parseEmotesTag(""), []);
});

test("tokenize: emotes de Twitch por posición, de terceros por palabra, y enlaces", () => {
  const lookup = (w) => ({ catJAM: { url: "https://cdn/7tv/catJAM" }, RainTime: { url: "https://cdn/zw", zeroWidth: true } })[w] || null;
  const parts = t.tokenize("Kappa hola catJAM RainTime mira https://example.com/a?b=1 Kappa", "25:0-4,58-62", lookup);
  assert.deepStrictEqual(parts, [
    { type: "emote", name: "Kappa", url: t.twitchEmoteUrl("25") },
    { type: "text", text: " hola " },
    { type: "emote", name: "catJAM", url: "https://cdn/7tv/catJAM" },
    { type: "text", text: " " },
    { type: "emote", name: "RainTime", url: "https://cdn/zw", zeroWidth: true },
    { type: "text", text: " mira " },
    { type: "link", text: "https://example.com/a?b=1", url: "https://example.com/a?b=1" },
    { type: "text", text: " " },
    { type: "emote", name: "Kappa", url: t.twitchEmoteUrl("25") },
  ]);
});

test("tokenize cuenta posiciones en caracteres Unicode (emojis), no en UTF-16", () => {
  // "😀 " ocupa 2 caracteres para Twitch (3 unidades UTF-16): Kappa empieza en la posición 2.
  const parts = t.tokenize("😀 Kappa", "25:2-6");
  assert.deepStrictEqual(parts, [
    { type: "text", text: "😀 " },
    { type: "emote", name: "Kappa", url: t.twitchEmoteUrl("25") },
  ]);
});

test("tokenize ignora rangos fuera del texto y no inventa enlaces javascript:", () => {
  assert.deepStrictEqual(t.tokenize("hola", "25:10-14"), [{ type: "text", text: "hola" }]);
  assert.deepStrictEqual(t.tokenize("javascript:alert(1)", ""), [{ type: "text", text: "javascript:alert(1)" }]);
});

test("parseBadgesTag", () => {
  assert.deepStrictEqual(t.parseBadgesTag("subscriber/12,premium/1"), [
    { set: "subscriber", version: "12" },
    { set: "premium", version: "1" },
  ]);
  assert.deepStrictEqual(t.parseBadgesTag(""), []);
});

test("mapeo de emotes de 7TV, BTTV y FFZ", () => {
  const seven = from7tv([
    { name: "GAMBA", flags: 0, data: { flags: 0, host: { url: "//cdn.7tv.app/emote/1" } } },
    { name: "notL", flags: 1, data: { flags: 256, host: { url: "//cdn.7tv.app/emote/2" } } },
  ]);
  assert.deepStrictEqual(seven, [
    ["GAMBA", { url: "https://cdn.7tv.app/emote/1/2x.webp", zeroWidth: false }],
    ["notL", { url: "https://cdn.7tv.app/emote/2/2x.webp", zeroWidth: true }],
  ]);
  assert.deepStrictEqual(fromBttv([{ id: "x1", code: "IceCold" }])[0], ["IceCold", { url: "https://cdn.betterttv.net/emote/x1/2x", zeroWidth: true }]);
  const ffz = fromFfzSets({ 3: { emoticons: [{ name: "LilZ", urls: { 1: "//cdn.ffz/1", 2: "//cdn.ffz/2" } }] }, 9: { emoticons: [{ name: "No", urls: { 1: "x" } }] } }, [3]);
  assert.deepStrictEqual(ffz, [["LilZ", { url: "https://cdn.ffz/2", zeroWidth: false }]]);
});

test("config: fuentes por defecto y canales normalizados", () => {
  assert.deepStrictEqual(config.normalize({}).sources, { mode: "native", twitch: { channels: [] } });
  // Quien ya usaba SSN sigue en SSN al actualizar.
  assert.strictEqual(config.normalize({ appearance: { session: "s" } }).sources.mode, "ssn");
  const s = config.normalize({ sources: { mode: "native", twitch: { channels: ["XQC", "#xqc", "mal nombre", "ibai"] } } }).sources;
  assert.deepStrictEqual(s, { mode: "native", twitch: { channels: ["xqc", "ibai"] } });
  assert.strictEqual(config.normalize({ sources: { mode: "raro" } }).sources.mode, "native");
});
