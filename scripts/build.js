// Construye los paquetes de Linux con un solo comando: `npm run build`.
//
//   npm run build                 # AppImage, .deb, .rpm y .pacman
//   npm run build -- deb pacman   # solo los formatos indicados
//
// - Funciona también en la terminal de VS Code (quita ELECTRON_RUN_AS_NODE).
// - Limpia dist/ antes de empezar.
// - Si falta rpmbuild, salta el .rpm avisando (se instala con: sudo pacman -S rpm-tools).
// - Genera dist/SHA256SUMS.txt y muestra un resumen al terminar.
"use strict";

const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const BUILDER = path.join(ROOT, "node_modules", ".bin", "electron-builder");
const FORMATS = { appimage: "AppImage", deb: "deb", rpm: "rpm", pacman: "pacman" };
const EXT = /\.(AppImage|deb|rpm|pacman)$/;

const bold = (s) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
const fail = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

// ---------- Formatos pedidos ----------
const asked = process.argv.slice(2).map((a) => a.toLowerCase());
for (const a of asked) {
  if (!FORMATS[a]) fail(`Formato desconocido: "${a}". Usa: ${Object.keys(FORMATS).join(", ")}.`);
}
let targets = (asked.length ? asked : Object.keys(FORMATS)).map((a) => FORMATS[a]);

const hasCommand = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" }).status === 0;
if (targets.includes("rpm") && !hasCommand("rpmbuild")) {
  console.warn("⚠ Falta rpmbuild: se salta el .rpm (instálalo con: sudo pacman -S rpm-tools).");
  targets = targets.filter((t) => t !== "rpm");
}
if (!targets.length) fail("No queda ningún formato que construir.");
if (!fs.existsSync(BUILDER)) fail("No está electron-builder: ejecuta antes `npm install`.");

const { version } = require(path.join(ROOT, "package.json"));
console.log(bold(`\nShuriken Chat ${version} → ${targets.join(", ")}\n`));

// ---------- Construcción ----------
fs.rmSync(DIST, { recursive: true, force: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE; // la terminal de VS Code lo define y rompe Electron
const res = spawnSync(BUILDER, ["--linux", ...targets], { cwd: ROOT, env, stdio: "inherit" });
if (res.status !== 0) fail("electron-builder ha fallado (mira los mensajes de arriba).");

// ---------- Sumas y resumen ----------
const files = fs.readdirSync(DIST).filter((f) => EXT.test(f)).sort();
if (!files.length) fail("No se ha generado ningún paquete en dist/.");
const sums = files.map((f) => {
  const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join(DIST, f))).digest("hex");
  return `${hash}  ${f}`;
});
fs.writeFileSync(path.join(DIST, "SHA256SUMS.txt"), sums.join("\n") + "\n");

const mb = (f) => (fs.statSync(path.join(DIST, f)).size / 1024 / 1024).toFixed(1).padStart(6) + " MB";
console.log(bold("\n✓ Paquetes en dist/:"));
for (const f of files) console.log(`   ${mb(f)}  ${f}`);
console.log("   + SHA256SUMS.txt\n");
