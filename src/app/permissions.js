// Shuriken Chat: permisos. El chat nunca usa cámara, micrófono ni pantalla (requisito).
// Única excepción: la ventana de webcam, solo vídeo; y Configuración puede listar las
// cámaras con su nombre.
"use strict";

const { session } = require("electron");
const { webcamWc, settingsWc } = require("./context");

function lockDownPermissions() {
  const ALLOWED = new Set(["clipboard-sanitized-write"]);
  const DENIED_CHECKS = new Set(["media", "display-capture", "geolocation", "notifications"]);
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    // La ventana de webcam puede abrir VÍDEO (nunca el micrófono).
    if (permission === "media" && wc && wc === webcamWc()) {
      const types = (details && details.mediaTypes) || [];
      return callback(types.length > 0 && types.every((t) => t === "video"));
    }
    callback(ALLOWED.has(permission));
  });
  ses.setPermissionCheckHandler((wc, permission) => {
    // La ventana de webcam y Configuración (para listar las cámaras con su nombre).
    if (permission === "media" && wc && (wc === webcamWc() || wc === settingsWc())) return true;
    return !DENIED_CHECKS.has(permission);
  });
  ses.setDevicePermissionHandler(() => false);
}

module.exports = { lockDownPermissions };
