// Reglas de arquitectura: que no se rompan sin darse cuenta.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const shared = require("../ui/platforms.js");
const { PLATFORMS, checkChannel } = require("../src/sources/platforms");
const config = require("../src/config");

const ROOT = path.join(__dirname, "..");

test("cada plataforma tiene icono, conector y sección en la config", () => {
  assert.deepStrictEqual(PLATFORMS.map((p) => p.id), shared.list.map((p) => p.id));
  const sources = config.normalize({}).sources;
  for (const p of PLATFORMS) {
    assert.ok(fs.existsSync(path.join(ROOT, "ui", "platforms", `${p.id}.svg`)), `falta ui/platforms/${p.id}.svg`);
    for (const k of ["create", "channels", "check", "normalize", "label"]) {
      assert.strictEqual(typeof p[k], "function", `${p.id}.${k}`);
    }
    assert.ok(p.name && p.invalidMsg, `${p.id}: nombre y aviso`);
    assert.deepStrictEqual(sources[p.id].channels, [], `config.sources.${p.id}`);
  }
});

test("los normalizadores son los mismos en la app y en Configuración", () => {
  const { normalizeChannel } = require("../src/sources/twitch-parse");
  const { normalizeKickChannel } = require("../src/sources/kick-parse");
  const { normalizeYoutubeTarget } = require("../src/sources/youtube-parse");
  assert.strictEqual(normalizeChannel, shared.byId.twitch.normalize);
  assert.strictEqual(normalizeKickChannel, shared.byId.kick.normalize);
  assert.strictEqual(normalizeYoutubeTarget, shared.byId.youtube.normalize);
  // Configuración y el chat cargan el registro antes que su propio código.
  for (const page of ["settings.html", "chat.html"]) {
    const html = fs.readFileSync(path.join(ROOT, "ui", page), "utf8");
    assert.ok(html.indexOf("platforms.js") > 0 && html.indexOf("platforms.js") < html.lastIndexOf("<script"), page);
  }
});

test("check_channel: plataforma desconocida o canal no válido, sin red", async () => {
  assert.deepStrictEqual(await checkChannel("desconocida", "x"), { exists: false });
  assert.deepStrictEqual(await checkChannel("twitch", "nombre no válido!"), { exists: false });
  assert.deepStrictEqual(await checkChannel("toString", "x"), { exists: false });
});

test("src/app no tiene dependencias circulares", () => {
  const dir = path.join(ROOT, "src", "app");
  const deps = {};
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    deps[f.slice(0, -3)] = [...src.matchAll(/require\("\.\/([a-z-]+)"\)/g)].map((m) => m[1]);
  }
  const state = {};
  const visit = (m, trail) => {
    if (state[m] === "done") return;
    assert.notStrictEqual(state[m], "visiting", `ciclo: ${[...trail, m].join(" → ")}`);
    state[m] = "visiting";
    for (const d of deps[m] || []) visit(d, [...trail, m]);
    state[m] = "done";
  };
  for (const m of Object.keys(deps)) visit(m, []);
});
