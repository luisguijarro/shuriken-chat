// Shuriken Chat: mover y redimensionar las ventanas sin bordes.
// La página avisa (preload: shuriken:drag-start / drag-end) y aquí se sigue al cursor.
"use strict";

const { screen } = require("electron");
const { ctx, alive, MIN_W, MIN_H } = require("./context");
const { persistWindowSoon } = require("./persist");

const DIRS = new Set(["North", "South", "East", "West", "NorthEast", "NorthWest", "SouthEast", "SouthWest"]);

let drag = null;

const isLocked = (win) => (win === ctx.webcamWin ? ctx.cfg.webcamWindow.locked : ctx.cfg.window.locked);

/** Empieza a mover (`dir` = null) o a redimensionar (`dir` = "North", "SouthEast"…) `win`. */
function startDrag(win, dir) {
  if (!alive(win) || isLocked(win)) return;
  stopDrag();
  drag = {
    win,
    dir: DIRS.has(dir) ? dir : null,
    cursor: screen.getCursorScreenPoint(),
    bounds: win.getBounds(),
    timer: setInterval(stepDrag, 16),
  };
}

function stepDrag() {
  if (!drag || !alive(drag.win)) return stopDrag();
  const { win, dir, bounds: b } = drag;
  const p = screen.getCursorScreenPoint();
  const dx = p.x - drag.cursor.x;
  const dy = p.y - drag.cursor.y;
  if (!dir) {
    win.setPosition(b.x + dx, b.y + dy);
    return;
  }
  let { x, y, width, height } = b;
  if (dir.includes("East")) width = Math.max(MIN_W, b.width + dx);
  if (dir.includes("West")) {
    width = Math.max(MIN_W, b.width - dx);
    x = b.x + b.width - width;
  }
  if (dir.includes("South")) height = Math.max(MIN_H, b.height + dy);
  if (dir.includes("North")) {
    height = Math.max(MIN_H, b.height - dy);
    y = b.y + b.height - height;
  }
  win.setBounds({ x, y, width, height });
}

function stopDrag() {
  if (!drag) return;
  clearInterval(drag.timer);
  drag = null;
  persistWindowSoon();
}

const isDragging = () => !!drag;

/** Sigue una ventana: guarda su posición y tamaño al moverla o redimensionarla. */
function trackBounds(win, target) {
  const track = () => {
    if (!alive(win) || win.isMinimized()) return;
    const b = win.getBounds();
    Object.assign(target, { x: b.x, y: b.y, width: b.width, height: b.height });
    if (!drag) persistWindowSoon(); // durante el arrastre se guarda al soltar
  };
  win.on("move", track);
  win.on("resize", track);
  win.on("blur", stopDrag);
}

module.exports = { startDrag, stopDrag, isDragging, trackBounds };
