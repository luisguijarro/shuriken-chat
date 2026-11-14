// Shuriken Chat: ventana de webcam. Recibe de la app el dispositivo elegido en
// Configuración → Webcam (window.shurikenWebcam, del preload) y muestra su vídeo.
// Solo vídeo: nunca se pide el micrófono.
"use strict";

const video = document.getElementById("video");
const msg = document.getElementById("msg");
let current = null; // { deviceId, deviceLabel, mirror }
let stream = null;
let retryTimer = null;

function show(text) {
  msg.textContent = text;
  msg.hidden = !text;
}

function stop() {
  if (stream) for (const t of stream.getTracks()) t.stop();
  stream = null;
  video.srcObject = null;
}

/** El id de un dispositivo puede cambiar (otro puerto USB, reinicio…): si no está, se
 *  busca por su nombre. */
async function resolveDevice(cfg) {
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
  if (!cams.length) return { error: "No se encuentra ninguna cámara." };
  if (!cfg.deviceId && !cfg.deviceLabel) return { error: "Elige una cámara en Configuración → Webcam." };
  const found = cams.find((d) => d.deviceId === cfg.deviceId) || cams.find((d) => cfg.deviceLabel && d.label === cfg.deviceLabel);
  return found ? { deviceId: found.deviceId } : { error: `No está conectada la cámara «${cfg.deviceLabel || "elegida"}».` };
}

const ERRORS = {
  NotReadableError: "La cámara la está usando otra aplicación (¿OBS?). Usa la cámara virtual de OBS: mira Configuración → Webcam.",
  NotAllowedError: "No hay permiso para usar la cámara.",
  NotFoundError: "No se encuentra la cámara elegida.",
  OverconstrainedError: "No se encuentra la cámara elegida.",
};

async function start() {
  clearTimeout(retryTimer);
  stop();
  if (!current) return;
  video.classList.toggle("mirror", !!current.mirror);
  if (current.systemDenied) {
    // macOS: el sistema no deja usar la cámara a la app.
    show("macOS no deja usar la cámara a Shuriken Chat. Actívalo en Ajustes del Sistema → Privacidad y seguridad → Cámara y vuelve a abrir esta ventana.");
    return;
  }
  show("Conectando con la cámara…");
  try {
    const dev = await resolveDevice(current);
    if (dev.error) {
      show(dev.error);
      return;
    }
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: { exact: dev.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    video.srcObject = stream;
    show("");
    // Si la cámara se desconecta o la cierra quien la da (p. ej. se para la cámara virtual de OBS).
    for (const t of stream.getVideoTracks()) {
      t.addEventListener("ended", () => {
        show("La cámara se ha desconectado. Reintentando…");
        retryTimer = setTimeout(start, 3000);
      });
    }
  } catch (e) {
    show(ERRORS[e.name] || `No se pudo abrir la cámara (${e.name || e.message}).`);
    // La cámara puede quedar libre más tarde (p. ej. OBS deja de usarla).
    retryTimer = setTimeout(start, 10000);
  }
}

navigator.mediaDevices.addEventListener("devicechange", () => {
  if (!stream) start(); // al conectar una cámara, reintentar
});

const api = window.shurikenWebcam;
if (api) {
  api.onConfig((cfg) => {
    const restart = !current || cfg.deviceId !== current.deviceId || cfg.deviceLabel !== current.deviceLabel ||
      cfg.systemDenied !== current.systemDenied || !stream;
    current = cfg;
    if (restart) start();
    else video.classList.toggle("mirror", !!cfg.mirror);
  });
} else {
  show("Esta ventana solo funciona dentro de Shuriken Chat.");
}
