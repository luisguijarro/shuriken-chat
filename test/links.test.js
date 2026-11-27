"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { findLink } = require("../src/sources/links");
const { tokenize } = require("../src/sources/twitch-parse");
const { parseKickContent } = require("../src/sources/kick-parse");

const url = (w) => (findLink(w) || {}).url || null;

test("enlaces con y sin http(s)://", () => {
  assert.strictEqual(url("http://darkdolmen.com"), "http://darkdolmen.com");
  assert.strictEqual(url("https://darkdolmen.com/juegos?x=1#a"), "https://darkdolmen.com/juegos?x=1#a");
  assert.strictEqual(url("darkdolmen.com"), "https://darkdolmen.com");
  assert.strictEqual(url("www.darkdolmen.com"), "https://www.darkdolmen.com");
  assert.strictEqual(url("WWW.DarkDolmen.COM/Blog"), "https://WWW.DarkDolmen.COM/Blog");
  assert.strictEqual(url("tienda.darkdolmen.es/carrito"), "https://tienda.darkdolmen.es/carrito");
  assert.strictEqual(url("twitch.tv/mygamedevvlog"), "https://twitch.tv/mygamedevvlog");
  assert.strictEqual(url("discord.gg/abc123"), "https://discord.gg/abc123");
  assert.strictEqual(url("localhost.dev:8080/x"), "https://localhost.dev:8080/x");
  assert.strictEqual(url("www.sitio.raro"), "https://www.sitio.raro", "con www vale cualquier terminación");
});

test("no son enlaces", () => {
  for (const w of ["hola", "v1.2", "3.14", "e.g.", "i.e.", "fichero.txt", "main.js", "index.html", "Hola.Mundo",
    "usuario@darkdolmen.com", "...", "jaja.xd", "-darkdolmen.com", "javascript:alert(1)", "ftp://darkdolmen.com",
    "darkdolmen", ".com", "darkdolmen.c", "dárkdolmen.com"]) {
    assert.strictEqual(findLink(w), null, w);
  }
});

test("la puntuación pegada no forma parte del enlace", () => {
  assert.deepStrictEqual(findLink("(darkdolmen.com)."), { before: "(", text: "darkdolmen.com", url: "https://darkdolmen.com", after: ")." });
  assert.deepStrictEqual(findLink("darkdolmen.com,"), { before: "", text: "darkdolmen.com", url: "https://darkdolmen.com", after: "," });
  assert.deepStrictEqual(findLink("¿www.darkdolmen.com?"), { before: "¿", text: "www.darkdolmen.com", url: "https://www.darkdolmen.com", after: "?" });
  assert.deepStrictEqual(findLink("https://darkdolmen.com/!"), { before: "", text: "https://darkdolmen.com/", url: "https://darkdolmen.com/", after: "!" });
  // Un ")" que cierra uno de la propia URL se queda.
  assert.strictEqual(findLink("https://es.wikipedia.org/wiki/Shuriken_(arma)").text, "https://es.wikipedia.org/wiki/Shuriken_(arma)");
  assert.strictEqual(findLink("(https://es.wikipedia.org/wiki/Shuriken_(arma))").text, "https://es.wikipedia.org/wiki/Shuriken_(arma)");
});

test("en un mensaje: Twitch, Kick y YouTube usan el mismo troceado", () => {
  assert.deepStrictEqual(tokenize("mira darkdolmen.com, y www.darkdolmen.com"), [
    { type: "text", text: "mira " },
    { type: "link", text: "darkdolmen.com", url: "https://darkdolmen.com" },
    { type: "text", text: ", y " },
    { type: "link", text: "www.darkdolmen.com", url: "https://www.darkdolmen.com" },
  ]);
  // Un emote con nombre de dominio sigue siendo emote.
  const emote = tokenize("x.com", "", (n) => (n === "x.com" ? { url: "https://cdn/e.webp" } : null));
  assert.strictEqual(emote[0].type, "emote");
  const kick = parseKickContent("[emote:1:Hola] darkdolmen.com");
  assert.deepStrictEqual(kick.find((p) => p.type === "link"), { type: "link", text: "darkdolmen.com", url: "https://darkdolmen.com" });
});
