// Shuriken Chat: preload de la ventana del chat (SSN o bienvenida).
// Corre en un mundo aislado: la página remota NO tiene acceso a ipcRenderer.
// - Bloquea cámara/micrófono/pantalla en la página (todos los frames)
// - Clic derecho  -> menú nativo de la app
// - Arrastrar     -> mover la ventana (Alt+arrastrar siempre funciona)
// - Bordes        -> redimensionar
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// ---------- 1. Sin multimedia ----------
// El chat solo necesita el canal de datos de WebRTC. Se ejecuta en el mundo
// de la página antes que sus scripts, así que ni siquiera se enumeran dispositivos.
function blockMedia() {
  const denied = () =>
    Promise.reject(new DOMException("Desactivado en Shuriken Chat", "NotAllowedError"));
  // Propiedad con getter fijo y setter que ignora: si la página intenta
  // reasignarla (SSN lo hace) no se lanza error, simplemente no tiene efecto.
  const lock = (target, name, fn) => {
    try {
      Object.defineProperty(target, name, { get: () => fn, set: () => {}, configurable: false });
    } catch (_) {}
  };
  const md = window.MediaDevices && window.MediaDevices.prototype;
  if (md) {
    lock(md, "enumerateDevices", () => Promise.resolve([]));
    lock(md, "getUserMedia", denied);
    lock(md, "getDisplayMedia", denied);
  }
  const legacy = function (_c, _ok, err) {
    if (typeof err === "function") err(new DOMException("Desactivado en Shuriken Chat", "NotAllowedError"));
  };
  lock(Navigator.prototype, "getUserMedia", legacy);
  lock(Navigator.prototype, "webkitGetUserMedia", legacy);
}

try {
  contextBridge.executeInMainWorld({ func: blockMedia });
} catch (e) {
  console.warn("[shuriken] no se pudo bloquear multimedia:", e);
}

// ---------- 2. Menú contextual (en cualquier frame) ----------
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  e.stopPropagation();
  ipcRenderer.send("shuriken:menu");
}, true);

// ---------- 3. Mover y redimensionar (solo el frame principal) ----------
if (window.top === window) {
  const EDGE = 6; // píxeles sensibles al borde para redimensionar
  const CURSORS = {
    North: "ns-resize", South: "ns-resize",
    East: "ew-resize", West: "ew-resize",
    NorthWest: "nwse-resize", SouthEast: "nwse-resize",
    NorthEast: "nesw-resize", SouthWest: "nesw-resize",
  };
  let locked = false;
  let edges = true; // si este documento debe detectar los bordes de la ventana
  let dragging = false;

  function setState(s) {
    if (!s) return;
    locked = !!s.locked;
    edges = s.edges !== false;
    if ((locked || !edges) && document.documentElement) document.documentElement.style.cursor = "";
  }
  ipcRenderer.on("shuriken:state", (_e, s) => setState(s));
  ipcRenderer.invoke("shuriken:page-state").then(setState).catch(() => {});

  function edgeDir(e) {
    if (!edges) return null;
    const w = window.innerWidth, h = window.innerHeight;
    const n = e.clientY < EDGE, s = e.clientY > h - EDGE;
    const west = e.clientX < EDGE, east = e.clientX > w - EDGE;
    if (n && west) return "NorthWest";
    if (n && east) return "NorthEast";
    if (s && west) return "SouthWest";
    if (s && east) return "SouthEast";
    if (n) return "North";
    if (s) return "South";
    if (west) return "West";
    if (east) return "East";
    return null;
  }

  document.addEventListener("mousemove", (e) => {
    if (locked || dragging || !document.documentElement) return;
    const d = edgeDir(e);
    document.documentElement.style.cursor = d ? CURSORS[d] : "";
  }, true);

  document.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || locked) return;
    const d = edgeDir(e);
    if (!d) {
      // Deja funcionar enlaces y controles salvo que se mantenga Alt.
      const interactive = e.target && e.target.closest &&
        e.target.closest("a,button,input,textarea,select,[contenteditable]");
      if (interactive && !e.altKey) return;
    }
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    ipcRenderer.send("shuriken:drag-start", d); // null = mover
  }, true);

  const stop = () => {
    if (!dragging) return;
    dragging = false;
    ipcRenderer.send("shuriken:drag-end");
  };
  window.addEventListener("mouseup", stop, true);
  window.addEventListener("blur", stop);
}
