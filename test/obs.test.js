"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const http = require("http");
const { ObsServer, sameKey } = require("../src/obs-server");
const config = require("../src/config");

const UI = path.join(__dirname, "..", "ui");
const PORT = 18000 + Math.floor(Math.random() * 2000);

function get(p, onData) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path: p }, (res) => {
      let body = "";
      res.on("data", (c) => {
        body += c;
        if (onData && onData(body)) {
          req.destroy();
          resolve({ status: res.statusCode, type: res.headers["content-type"], body });
        }
      });
      res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"], body }));
    });
    req.on("error", reject);
  });
}

test("servidor de OBS: clave, ficheros permitidos y datos en directo", async () => {
  const snap = { layout: { width: 420, height: 640 }, style: { bubble: true }, pagecss: "html{}", backlog: { events: [], statuses: [] } };
  const obs = new ObsServer({ uiDir: UI, snapshot: () => snap });
  await obs.start(PORT, "clave123");
  try {
    assert.strictEqual(obs.url(), `http://127.0.0.1:${PORT}/obs?k=clave123`);
    assert.strictEqual((await get("/obs?k=mala")).status, 403);
    assert.strictEqual((await get("/obs")).status, 403);
    assert.strictEqual((await get("/events?k=mala")).status, 403);
    const page = await get("/obs?k=clave123");
    assert.strictEqual(page.status, 200);
    assert.match(page.type, /text\/html/);
    assert.match(page.body, /obs\.js/);
    // Los mismos ficheros del chat de la app, y nada más.
    assert.strictEqual((await get("/chat.js")).status, 200);
    assert.strictEqual((await get("/platforms/twitch.svg")).status, 200);
    assert.strictEqual((await get("/badges/kick/moderator.svg")).status, 200);
    assert.strictEqual((await get("/settings.html")).status, 404);
    assert.strictEqual((await get("/../src/main.js")).status, 404);
    assert.strictEqual((await get("/%2e%2e/package.json")).status, 404);
    // Al conectar llega el estado completo (SSE).
    const ev = await get("/events?k=clave123", (b) => b.includes("event: backlog"));
    assert.match(ev.type, /text\/event-stream/);
    assert.match(ev.body, /event: layout\ndata: \{"width":420,"height":640\}/);
    assert.match(ev.body, /event: style\n/);
    assert.match(ev.body, /event: pagecss\n/);
  } finally {
    obs.stop();
  }
});

test("servidor de OBS: puerto ocupado da un error comprensible", async () => {
  const a = new ObsServer({ uiDir: UI, snapshot: () => ({}) });
  const b = new ObsServer({ uiDir: UI, snapshot: () => ({}) });
  await a.start(PORT + 1, "k1");
  await b.start(PORT + 1, "k2");
  try {
    assert.strictEqual(b.running, false);
    assert.match(b.error, /ocupado/);
  } finally {
    a.stop();
    b.stop();
  }
});

test("sameKey compara claves sin aceptar vacías", () => {
  assert.ok(sameKey("abc", "abc"));
  assert.ok(!sameKey("abc", "abd"));
  assert.ok(!sameKey("", ""));
  assert.ok(!sameKey(null, "abc"));
});

test("config de OBS: valores por defecto, puerto válido y clave limpia", () => {
  assert.deepStrictEqual(config.normalize({}).obs, { enabled: true, port: 8187, key: "" });
  assert.strictEqual(config.normalize({ obs: { port: 80 } }).obs.port, 8187);
  assert.strictEqual(config.normalize({ obs: { port: 9000 } }).obs.port, 9000);
  assert.strictEqual(config.normalize({ obs: { key: "ab c<>d" } }).obs.key, "abcd");
  // En OBS la opacidad del marco va solo al marco (el chat va dentro de la misma página).
  const a = { ...config.normalize({}).appearance, opacity: 0.5 };
  assert.match(config.frameCss(a), /^html\{opacity:0\.50;\}$/m);
  assert.match(config.frameCss(a, ".frame"), /^\.frame\{opacity:0\.50;\}$/m);
});
