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
  assert.deepStrictEqual(config.normalize({}).sources, { mode: "native", twitch: { useAccount: true, channels: [], clientId: "" }, kick: { channels: [] } });
  // Quien ya usaba SSN sigue en SSN al actualizar.
  assert.strictEqual(config.normalize({ appearance: { session: "s" } }).sources.mode, "ssn");
  const s = config.normalize({ sources: { mode: "native", twitch: { channels: ["XQC", "#xqc", "mal nombre", "ibai"] } } }).sources;
  // Quien ya tenía canales escritos sigue "sin cuenta".
  assert.deepStrictEqual(s, { mode: "native", twitch: { useAccount: false, channels: ["xqc", "ibai"], clientId: "" }, kick: { channels: [] } });
  assert.strictEqual(config.normalize({ sources: { twitch: { useAccount: true, channels: ["xqc"] } } }).sources.twitch.useAccount, true);
  assert.strictEqual(config.normalize({ sources: { twitch: { clientId: " abc123 <x>" } } }).sources.twitch.clientId, "abc123x");
  assert.strictEqual(config.normalize({ sources: { mode: "raro" } }).sources.mode, "native");
});

const os = require("os");
const fs = require("fs");
const path = require("path");
const { reasonText, fragmentsToParts } = require("../src/sources/twitch-eventsub");
const { TwitchAuth } = require("../src/sources/twitch-auth");

test("AutoMod: motivo legible", () => {
  assert.strictEqual(reasonText({ reason: "automod", automod: { category: "swearing", level: 2 } }), "Palabrotas (nivel 2)");
  assert.strictEqual(reasonText({ reason: "blocked_term" }), "Término bloqueado del canal");
  assert.strictEqual(reasonText({ reason: "blocked_link" }), "Enlace bloqueado");
  assert.strictEqual(reasonText({ reason: "automod", automod: { category: "nueva_categoria" } }), "nueva_categoria");
});

test("AutoMod: fragmentos a partes (emotes de Twitch, de terceros y texto)", () => {
  const lookup = (w) => (w === "catJAM" ? { url: "https://cdn/catJAM" } : null);
  const parts = fragmentsToParts({
    text: "hola Kappa catJAM",
    fragments: [
      { type: "text", text: "hola ", emote: null },
      { type: "emote", text: "Kappa", emote: { id: "25" } },
      { type: "text", text: " catJAM", emote: null },
    ],
  }, lookup);
  assert.deepStrictEqual(parts, [
    { type: "text", text: "hola " },
    { type: "emote", name: "Kappa", url: t.twitchEmoteUrl("25") },
    { type: "text", text: " " },
    { type: "emote", name: "catJAM", url: "https://cdn/catJAM" },
  ]);
  assert.deepStrictEqual(fragmentsToParts({ text: "solo texto", fragments: [] }), [{ type: "text", text: "solo texto" }]);
});

test("sesión de Twitch: se guarda cifrada y se recupera; sin llavero, en claro con permisos 600", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shuriken-auth-"));
  const fake = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from([...Buffer.from(s)].map((b) => b ^ 0x5a)),
    decryptString: (b) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString(),
  };
  const a = new TwitchAuth(dir, fake);
  a.session = { clientId: "c", accessToken: "SECRETO", refreshToken: "r", expiresAt: 1, userId: "1", login: "yo" };
  a.save();
  const raw = fs.readFileSync(path.join(dir, "twitch-auth.json"), "utf8");
  assert.ok(!raw.includes("SECRETO"), "el token no debe quedar en claro");
  assert.strictEqual(new TwitchAuth(dir, fake).status().login, "yo");

  const plain = new TwitchAuth(dir, { isEncryptionAvailable: () => false });
  plain.session = a.session;
  plain.save();
  assert.strictEqual(fs.statSync(path.join(dir, "twitch-auth.json")).mode & 0o777, 0o600);
  plain.session = null;
  plain.save();
  assert.ok(!fs.existsSync(path.join(dir, "twitch-auth.json")), "cerrar sesión borra el fichero");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("canales que se leen: con cuenta, el del usuario; sin cuenta, los escritos", () => {
  const { SourceManager } = require("../src/sources");
  const { EventEmitter } = require("events");
  const auth = Object.assign(new EventEmitter(), { loggedIn: false, session: null });
  const sm = new SourceManager(auth);
  const src = (useAccount, mode = "native") => ({ mode, twitch: { useAccount, channels: ["xqc", "ibai"], clientId: "" }, kick: { channels: [] } });
  assert.deepStrictEqual(sm.twitchChannels(src(false)), ["xqc", "ibai"]);
  assert.deepStrictEqual(sm.twitchChannels(src(true)), [], "con cuenta y sin sesión: ningún canal");
  auth.loggedIn = true;
  auth.session = { login: "MyGameDevVlog" };
  assert.deepStrictEqual(sm.twitchChannels(src(true)), ["mygamedevvlog"]);
  assert.deepStrictEqual(sm.twitchChannels(src(true, "ssn")), [], "en modo SSN no se lee nada");
});
