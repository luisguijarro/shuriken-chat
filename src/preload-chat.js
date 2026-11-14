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

// La única excepción: nuestra ventana de webcam (página local ui/webcam.html, frame
// principal). Ahí la app permite SOLO vídeo (el main deniega el micrófono igualmente).
const isWebcamPage = window.top === window && location.protocol === "file:" && /\/ui\/webcam\.html$/.test(location.pathname);

if (!isWebcamPage) {
  try {
    contextBridge.executeInMainWorld({ func: blockMedia });
  } catch (e) {
    console.warn("[shuriken] no se pudo bloquear multimedia:", e);
  }
} else {
  // Dispositivo y espejo elegidos en Configuración → Webcam.
  contextBridge.exposeInMainWorld("shurikenWebcam", {
    onConfig: (cb) => {
      if (typeof cb === "function") ipcRenderer.on("shuriken:webcam-config", (_e, cfg) => cb(cfg));
    },
  });
}

// ---------- 1b. Puente del chat propio (solo en nuestra página ui/chat.html) ----------
if (window.top === window && location.protocol === "file:" && /\/ui\/chat\.html$/.test(location.pathname)) {
  const CHANNELS = new Set(["event", "style", "backlog"]);
  contextBridge.exposeInMainWorld("shurikenChat", {
    on: (name, cb) => {
      if (CHANNELS.has(name) && typeof cb === "function") {
        ipcRenderer.on("shuriken:chat-" + name, (_e, data) => cb(data));
      }
    },
    // Aprobar (allow=true) o denegar un mensaje retenido por el AutoMod.
    automod: (id, allow) => ipcRenderer.invoke("shuriken:automod", { id: String(id), allow: !!allow }),
  });
}

// ---------- 2. Menú contextual (en cualquier frame) ----------
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  e.stopPropagation();
  ipcRenderer.send("shuriken:menu");
}, true);

// ---------- 3. Mover y redimensionar (solo el frame principal) ----------
// ---------- 5. Botones de la ventana (arriba a la izquierda, solo el frame principal) ----------
// Siempre visible, chat para OBS y ventana de webcam (en la webcam, solo Siempre visible). Solo aparecen con el ratón encima de la ventana: son
// controles de la app, no parte del chat (así no salen en el directo ni difieren de OBS).
if (window.top === window) {
  const SVG = "http://www.w3.org/2000/svg";
  const ICONS = {
    // Chincheta
    alwaysOnTop: ["M15.5 3.5 20.5 8.5 18.6 9.6 15.8 12.4 15.4 17 13.6 18.8 10 15.2 5.2 20 4 18.8 8.8 14 5.2 10.4 7 8.6 11.6 8.2 14.4 5.4z"],
    // Emisión (punto y ondas)
    obs: ["M12 10.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z",
      "M8.1 8.1a5.5 5.5 0 0 0 0 7.8M15.9 8.1a5.5 5.5 0 0 1 0 7.8M5.3 5.3a9.5 9.5 0 0 0 0 13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4"],
    // Videocámara
    webcam: ["M3.5 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z", "M16.5 10.6 22 7.5v9l-5.5-3.1z"],
  };
  const FILLED = new Set(["alwaysOnTop", "webcam"]);
  const TITLES = {
    alwaysOnTop: (on) => `Siempre visible: ${on ? "activado" : "desactivado"} (clic para cambiar)`,
    obs: (on) => `Chat para OBS: ${on ? "activo" : "parado"} (clic para cambiar)`,
    webcam: (on) => `Ventana de webcam: ${on ? "visible" : "oculta"} (clic para cambiar)`,
  };
  let bar = null;
  const buttons = {};
  let hover = false;
  let state = null;

  function icon(paths, filled) {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    Object.assign(svg.style, { width: "14px", height: "14px", display: "block" });
    paths.forEach((d, i) => {
      const p = document.createElementNS(SVG, "path");
      p.setAttribute("d", d);
      if (filled || i === 0) p.setAttribute("fill", "currentColor");
      else Object.assign(p.style, { fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" });
      svg.append(p);
    });
    return svg;
  }

  function build() {
    bar = document.createElement("div");
    bar.id = "shuriken-toolbar";
    Object.assign(bar.style, {
      position: "fixed", left: "6px", top: "6px", zIndex: "2147483646", display: "flex", gap: "4px",
      transition: "opacity .2s", opacity: "0", pointerEvents: "none",
    });
    for (const what of Object.keys(ICONS)) {
      const b = document.createElement("button");
      b.type = "button";
      Object.assign(b.style, {
        all: "unset", cursor: "pointer", width: "22px", height: "22px", borderRadius: "6px",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(10, 10, 14, 0.75)", boxShadow: "0 1px 4px rgba(0,0,0,.45)",
      });
      b.append(icon(ICONS[what], FILLED.has(what)));
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        ipcRenderer.send("shuriken:toggle", what);
      });
      buttons[what] = b;
      bar.append(b);
    }
    document.documentElement.append(bar);
  }

  function render() {
    const tb = state && state.toolbar;
    if (!tb) {
      if (bar) bar.style.display = "none";
      return;
    }
    if (!document.documentElement) return;
    if (!bar || !bar.isConnected) build();
    bar.style.display = "flex";
    const visible = hover;
    bar.style.opacity = visible ? "1" : "0";
    bar.style.pointerEvents = visible ? "auto" : "none";
    for (const [what, b] of Object.entries(buttons)) {
      // Cada ventana muestra solo sus botones (la webcam, solo "Siempre visible").
      b.style.display = what in tb ? "flex" : "none";
      const on = !!tb[what];
      b.title = TITLES[what](on);
      b.style.color = on ? "#ffffff" : "rgba(255,255,255,.35)";
      b.style.outline = on ? "1px solid rgba(46, 204, 113, .85)" : "none";
    }
  }

  ipcRenderer.on("shuriken:state", (_e, s) => {
    state = s;
    render();
  });
  ipcRenderer.invoke("shuriken:page-state").then((s) => {
    state = s;
    render();
  }).catch(() => {});
  // Con el ratón dentro de la ventana se muestran; al salir, se ocultan.
  document.addEventListener("mouseover", () => {
    if (!hover) {
      hover = true;
      render();
    }
  }, true);
  document.addEventListener("mouseout", (e) => {
    if (!e.relatedTarget) {
      hover = false;
      render();
    }
  }, true);
  window.addEventListener("DOMContentLoaded", render);
}

// ---------- 4. Medidas al redimensionar (solo el frame principal) ----------
// Etiqueta centrada con el tamaño de la ventana que desaparece al dejar de redimensionar.
// Estilos en línea (CSSOM): funcionan también en páginas con CSP estricta, como SSN.
if (window.top === window) {
  let label = null;
  let hideTimer = null;
  ipcRenderer.on("shuriken:size", (_e, { width, height }) => {
    if (!document.documentElement) return;
    if (!label) {
      label = document.createElement("div");
      label.id = "shuriken-size";
      Object.assign(label.style, {
        position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
        zIndex: "2147483647", pointerEvents: "none", padding: "6px 12px", borderRadius: "8px",
        background: "rgba(10, 10, 14, 0.85)", color: "#fff", font: "700 15px/1.2 system-ui, sans-serif",
        fontVariantNumeric: "tabular-nums", boxShadow: "0 2px 10px rgba(0,0,0,.5)",
        transition: "opacity .25s", whiteSpace: "nowrap",
      });
    }
    label.textContent = `${width} × ${height}`;
    label.style.opacity = "1";
    if (!label.isConnected) document.documentElement.append(label);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      label.style.opacity = "0";
      hideTimer = setTimeout(() => label.remove(), 300);
    }, 1000);
  });
}

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

  // ---- Shift + arrastrar: lo mueve el GESTOR DE VENTANAS ----
  // El arrastre normal lo hace la app (mueve la ventana siguiendo al ratón) y por eso el
  // escritorio no lo ve como un arrastre: en KDE no salen las "tiles" con Shift, ni el
  // ajuste a los bordes. Con Shift pulsado se pone encima una capa invisible marcada como
  // región de arrastre (-webkit-app-region: drag): al pulsar ahí, Chromium le pide al
  // gestor de ventanas (KWin, Windows, macOS) que mueva la ventana él, con sus tiles/Snap.
  // Esa capa no deja pasar clics, así que solo existe mientras Shift está pulsado y se
  // retira sola si dejan de llegar eventos (para que los clics nunca queden bloqueados).
  const NATIVE_TTL_MS = 1000;
  let nativeLayer = null;
  let nativeTimer = null;

  function nativeDrag(on) {
    if (on && (locked || dragging)) on = false;
    clearTimeout(nativeTimer);
    if (!on) {
      if (nativeLayer && nativeLayer.isConnected) nativeLayer.remove();
      return;
    }
    if (!document.documentElement) return;
    if (!nativeLayer) {
      nativeLayer = document.createElement("div");
      nativeLayer.id = "shuriken-native-drag";
      Object.assign(nativeLayer.style, {
        position: "fixed", inset: "0", zIndex: "2147483645", background: "transparent", cursor: "move",
      });
      nativeLayer.style.setProperty("-webkit-app-region", "drag");
    }
    if (!nativeLayer.isConnected) document.documentElement.append(nativeLayer);
    nativeTimer = setTimeout(() => nativeDrag(false), NATIVE_TTL_MS);
  }

  document.addEventListener("mousemove", (e) => nativeDrag(e.shiftKey), true);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Shift") nativeDrag(true);
  }, true);
  window.addEventListener("keyup", (e) => {
    if (e.key === "Shift") nativeDrag(false);
  }, true);
  window.addEventListener("blur", () => nativeDrag(false));
}
