"use strict";

const test = require("node:test");
const assert = require("node:assert");
const config = require("../src/config");

const appearance = (over) => ({ ...config.normalize({}).appearance, ...over });

test("genera la URL como SSN", () => {
  const a = appearance({ session: "ABC", scale: 0.5, sidePadding: 8, useChroma: true, chroma: "0006", textGlow: true });
  assert.strictEqual(
    config.chatUrl(a),
    "https://socialstream.ninja/dock.html?session=ABC&ln=es&scale=0.5&randomcolor&fadedtop&sidepadding=8&textglow&bubble&darkmode&hidemenu&chroma=0006",
  );
});

test("sin sesión no hay URL", () => {
  assert.strictEqual(config.chatUrl(appearance({})), null);
  assert.strictEqual(config.chatUrl(appearance({ session: "   " })), null);
});

test("parámetros extra y URL base no válida", () => {
  const a = appearance({ session: "X", baseUrl: "file:///etc/passwd", extraParams: "?compact&hidesource\nfoo=1" });
  const url = config.chatUrl(a);
  assert.ok(url.startsWith("https://socialstream.ninja/dock.html?session=X&"));
  assert.ok(url.endsWith("&compact&hidesource&foo=1"));
});

test("la sesión se codifica", () => {
  assert.ok(config.chatUrl(appearance({ session: "a b&c" })).includes("session=a+b%26c&"));
});

test("normalize rellena valores ausentes o con tipo incorrecto", () => {
  const c = config.normalize({ appearance: { scale: "grande", session: "S" }, window: { x: 10, width: "?" } });
  assert.strictEqual(c.appearance.scale, 1);
  assert.strictEqual(c.appearance.session, "S");
  assert.strictEqual(c.appearance.hideMenu, true);
  assert.strictEqual(c.window.x, 10);
  assert.strictEqual(c.window.y, null);
  assert.strictEqual(c.window.width, 420);
  assert.strictEqual(c.system.nativeWayland, false);
});

test("CSS inyectado", () => {
  assert.match(config.pageCss(appearance({})), /background:transparent/);
  // Con chroma el fondo lo pinta el marco, así que la página sigue transparente.
  assert.match(config.pageCss(appearance({ useChroma: true })), /background:transparent/);
  assert.doesNotMatch(config.pageCss(appearance({ transparentBg: false, useChroma: false })), /background:transparent/);
  assert.match(config.pageCss(appearance({ opacity: 0.5 })), /opacity:0\.50/);
});

test("marco: geometría y CSS", () => {
  const def = config.frameLayout(appearance({}));
  assert.deepStrictEqual(def, { border: 1, margin: 10, radius: 10, inset: 11, innerRadius: 0 });
  const l = config.frameLayout(appearance({ borderWidth: 2, margin: 4, cornerRadius: 16 }));
  assert.deepStrictEqual(l, { border: 2, margin: 4, radius: 16, inset: 6, innerRadius: 10 });
  assert.strictEqual(config.frameLayout(appearance({ margin: -5 })).margin, 0);

  const css = config.frameCss(appearance({ borderWidth: 3, borderColor: "ff0000", cornerRadius: 12 }));
  assert.match(css, /border:3px solid #ff0000;border-radius:12px;background:#00000066;/);
  assert.match(config.frameCss(appearance({ useChroma: false })), /background:transparent;/);
  assert.match(config.frameCss(appearance({})), /border:1px solid #ffffff66;border-radius:10px;background:#00000066;/);
  assert.match(config.frameCss(appearance({ borderWidth: 0 })), /border:none;/);
  assert.match(config.frameCss(appearance({ useChroma: true, chroma: "11223344" })), /background:#11223344;/);
  assert.match(config.frameCss(appearance({ borderWidth: 1, borderColor: "nope" })), /solid #ffffff66/);
});
