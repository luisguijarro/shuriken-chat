// Shuriken Chat: script inyectado en la página del chat (SSN o bienvenida).
// - Clic derecho  -> menú nativo de la app
// - Arrastrar     -> mover la ventana (Alt+arrastrar siempre funciona)
// - Bordes        -> redimensionar
(function () {
  if (window.__shuriken) return;

  const EDGE = 6; // píxeles sensibles al borde para redimensionar
  const CURSORS = {
    North: "ns-resize", South: "ns-resize",
    East: "ew-resize", West: "ew-resize",
    NorthWest: "nwse-resize", SouthEast: "nwse-resize",
    NorthEast: "nesw-resize", SouthWest: "nesw-resize",
  };

  let locked = false;
  let styleEl = null;

  const invoke = (cmd, args) => {
    const t = window.__TAURI_INTERNALS__;
    return t ? t.invoke(cmd, args || {}) : Promise.resolve(null);
  };

  function applyCss(css) {
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "shuriken-chat-style";
    }
    styleEl.textContent = css || "";
    // Siempre al final para ganar a los estilos de la página.
    (document.head || document.documentElement).appendChild(styleEl);
  }

  function update(state) {
    if (!state) return;
    locked = !!state.locked;
    applyCss(state.css);
    if (locked) document.documentElement.style.cursor = "";
  }

  function edgeDir(e) {
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

  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    invoke("show_menu");
  }, true);

  document.addEventListener("mousemove", (e) => {
    if (locked) return;
    const d = edgeDir(e);
    document.documentElement.style.cursor = d ? CURSORS[d] : "";
  }, true);

  document.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || locked) return;
    const d = edgeDir(e);
    if (d) {
      e.preventDefault();
      e.stopPropagation();
      invoke("start_resize", { direction: d });
      return;
    }
    // Deja funcionar enlaces y controles salvo que se mantenga Alt.
    const interactive = e.target && e.target.closest &&
      e.target.closest("a,button,input,textarea,select,[contenteditable]");
    if (interactive && !e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    invoke("start_drag");
  }, true);

  window.__shuriken = { update, applyCss };

  function init() {
    invoke("page_ready").then(update).catch((err) => console.warn("[shuriken]", err));
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
