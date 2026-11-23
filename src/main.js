// Shuriken Chat: proceso principal de Electron (arranque).
// Cada parte de la app está en src/app/ (ver el orden de dependencias en context.js).
"use strict";

const { app, safeStorage } = require("electron");
const config = require("./config");
const { TwitchAuth } = require("./sources/twitch-auth");
const { relaunchWithX11IfNeeded } = require("./app/launch");
const { ctx, notifySettings } = require("./app/context");
const { persistWindow } = require("./app/persist");
const { lockDownPermissions } = require("./app/permissions");
const obsLink = require("./app/obs-link");
const chatWindow = require("./app/chat-window");
const webcamWindow = require("./app/webcam-window");
const settingsWindow = require("./app/settings-window");
const menus = require("./app/menus");
const { registerIpc } = require("./app/ipc");

// ---------- Antes de que arranque Chromium ----------

// Datos de Chromium junto a config.json (y no en "~/.config/Shuriken Chat").
app.setPath("userData", config.configDir());

const relaunching = relaunchWithX11IfNeeded(ctx.cfg.system.nativeWayland);
if (ctx.cfg.system.compatRendering) app.disableHardwareAcceleration();

// Windows: identificador de la app (agrupa bien en la barra de tareas; el mismo que el instalador).
if (process.platform === "win32") app.setAppUserModelId("dev.shurikenchat.desktop");

if (relaunching) {
  app.exit(0);
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => chatWindow.show());
  app.whenReady().then(start);
}

// ---------- Arranque ----------

function start() {
  const { cfg, sources } = ctx;
  menus.buildMacMenu();
  ctx.twitchAuth = new TwitchAuth(config.configDir(), safeStorage);
  sources.setAuth(ctx.twitchAuth);
  lockDownPermissions();
  registerIpc();

  // Mensajes del chat: a la página del chat propio y a OBS.
  sources.on("event", (ev) => {
    chatWindow.sendChatEvent(ev);
    obsLink.broadcast("event", ev);
  });
  // Estado del AutoMod por canal: se avisa a Configuración en cuanto se conoce.
  sources.on("moderation", notifySettings);
  ctx.twitchAuth.on("change", () => {
    notifySettings();
    chatWindow.pushChatStyle(); // con cuenta, el canal cambia al iniciar o cerrar sesión
  });

  obsLink.ensureKey();
  obsLink.sync();
  sources.apply(cfg.sources);
  chatWindow.create();
  webcamWindow.sync();
  menus.buildTray();

  // Primera vez (o sin nada que mostrar): abrir Configuración.
  const nothing = cfg.sources.mode === "native" ? !sources.allChannels(cfg.sources).length : !cfg.appearance.session.trim();
  if (nothing) settingsWindow.open();
}

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  ctx.sources.stop();
  obsLink.stop();
  persistWindow();
});
