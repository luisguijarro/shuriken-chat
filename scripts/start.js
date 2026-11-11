// Lanza la app en desarrollo: `npm start`.
// Quita ELECTRON_RUN_AS_NODE (lo define la terminal de VS Code) porque
// convierte Electron en un simple Node y la app no arranca.
"use strict";

const { spawn } = require("child_process");
const path = require("path");
const electron = require("electron"); // en Node devuelve la ruta del binario

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, [path.join(__dirname, ".."), ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
