// Shuriken Chat: página de OBS. Coloca el marco y el chat con las mismas medidas
// que la ventana de la app y escala el conjunto para que llene la fuente de OBS.
"use strict";

const key = new URLSearchParams(location.search).get("k") || "";
const stage = document.getElementById("stage");
const view = document.getElementById("view");
const frame = document.getElementById("chat");
const frameCss = document.getElementById("frameCss");
let layout = null;

/** layout: { width, height, inset, innerRadius, zoom, frameCss, src } */
function apply() {
  if (!layout) return;
  const { width: w, height: h, inset, innerRadius, zoom } = layout;
  frameCss.textContent = layout.frameCss || "";
  stage.style.width = w + "px";
  stage.style.height = h + "px";
  // Mismas proporciones que la ventana: escala uniforme para llenar la fuente.
  const scale = Math.min(innerWidth / w, innerHeight / h) || 1;
  stage.style.transform = `scale(${scale})`;
  const vw = Math.max(0, w - 2 * inset);
  const vh = Math.max(0, h - 2 * inset);
  Object.assign(view.style, { left: inset + "px", top: inset + "px", width: vw + "px", height: vh + "px", borderRadius: innerRadius + "px" });
  // El zoom de la app = página dibujada más pequeña y ampliada.
  const z = zoom || 1;
  Object.assign(frame.style, { width: vw / z + "px", height: vh / z + "px", transform: `scale(${z})` });
  if (layout.src && frame.getAttribute("src") !== layout.src) frame.setAttribute("src", layout.src);
}

const es = new EventSource("/events?k=" + encodeURIComponent(key));
es.addEventListener("layout", (e) => {
  layout = JSON.parse(e.data);
  apply();
});
addEventListener("resize", apply);
// "Limpiar chat" en modo SSN: se recarga el dock (empieza vacío), igual que en la app.
es.addEventListener("reload", () => {
  if (frame.getAttribute("src")) frame.setAttribute("src", frame.getAttribute("src"));
});
