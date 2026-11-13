// Construye los paquetes de Linux con un solo comando: `npm run build`.
//
//   npm run build                 # Linux (AppImage, .deb, .rpm, .pacman) y Windows (instalador y portable)
//   npm run build -- deb pacman   # solo los formatos indicados
//   npm run build -- windows      # solo Windows
//   npm run build -- mac          # solo macOS (.dmg y .zip; SOLO en un Mac: en Linux se hace en GitHub Actions)
//
// - Funciona también en la terminal de VS Code (quita ELECTRON_RUN_AS_NODE).
// - Limpia dist/ antes de empezar.
// - Si falta rpmbuild, salta el .rpm avisando (se instala con: sudo pacman -S rpm-tools).
// - Si falta wine, salta Windows avisando (desde Linux hace falta para preparar el .exe).
// - Genera dist/SHA256SUMS.txt y muestra un resumen al terminar.
"use strict";

const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const BUILDER = path.join(ROOT, "node_modules", ".bin", "electron-builder");
// formato -> sistema y objetivos de electron-builder
const FORMATS = {
  appimage: { os: "linux", targets: ["AppImage"] },
  deb: { os: "linux", targets: ["deb"] },
  rpm: { os: "linux", targets: ["rpm"] },
  pacman: { os: "linux", targets: ["pacman"] },
  windows: { os: "win", targets: ["nsis", "portable"] },
  // Al pasar los formatos por la línea de comandos, electron-builder ignora las arquitecturas
  // configuradas y usa solo la del equipo: hay que pedirlas (Apple Silicon e Intel).
  mac: { os: "mac", targets: ["dmg", "zip"], arch: ["--arm64", "--x64"] },
};
const EXT = /\.(AppImage|deb|rpm|pacman|exe|dmg|zip)$/;

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
let names = asked.length ? asked : Object.keys(FORMATS);

const hasCommand = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" }).status === 0;
if (names.includes("rpm") && !hasCommand("rpmbuild")) {
  console.warn("⚠ Falta rpmbuild: se salta el .rpm (instálalo con: sudo pacman -S rpm-tools).");
  names = names.filter((n) => n !== "rpm");
}
if (names.includes("windows") && process.platform !== "win32" && !hasCommand("wine")) {
  console.warn("⚠ Falta wine: se salta Windows (instálalo con: sudo pacman -S wine).");
  names = names.filter((n) => n !== "windows");
}
if (names.includes("mac") && process.platform !== "darwin") {
  // La firma de Apple (aunque sea "ad hoc") solo se puede hacer en un Mac.
  if (asked.includes("mac")) console.warn("⚠ macOS solo se puede construir en un Mac: se hace en GitHub Actions (.github/workflows/macos.yml).");
  names = names.filter((n) => n !== "mac");
}
if (!names.length) fail("No queda ningún formato que construir.");
// Objetivos agrupados por sistema: una llamada a electron-builder por sistema.
const bySystem = {};
for (const n of names) {
  const s = (bySystem[FORMATS[n].os] ||= { targets: [], arch: new Set() });
  s.targets.push(...FORMATS[n].targets);
  for (const a of FORMATS[n].arch || []) s.arch.add(a);
}
if (!fs.existsSync(BUILDER)) fail("No está electron-builder: ejecuta antes `npm install`.");

const { version } = require(path.join(ROOT, "package.json"));
console.log(bold(`\nShuriken Chat ${version} → ${names.join(", ")}\n`));

// ---------- Construcción ----------
fs.rmSync(DIST, { recursive: true, force: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE; // la terminal de VS Code lo define y rompe Electron
for (const [os, { targets, arch }] of Object.entries(bySystem)) {
  // --publish never: en CI (GitHub Actions) electron-builder intentaría publicar él solo.
  const args = [`--${os}`, ...targets, ...arch, "--publish", "never"];
  const res = spawnSync(BUILDER, args, { cwd: ROOT, env, stdio: "inherit" });
  if (res.status !== 0) fail(`electron-builder ha fallado con ${os} (mira los mensajes de arriba).`);
}

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
