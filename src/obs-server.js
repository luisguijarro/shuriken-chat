// Shuriken Chat: servidor local para OBS.
// Sirve una página (/obs) que reproduce exactamente la ventana del chat (marco, tamaño,
// zoom y los MISMOS ficheros del chat de la app) y le envía en directo, por SSE, los
// mensajes y cualquier cambio. Solo escucha en 127.0.0.1 y exige una clave en la URL.
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Ficheros de ui/ que puede pedir OBS (nada más).
const STATIC = /^\/(chat\.html|chat\.css|chat\.js|obs-bridge\.js|obs\.js|welcome\.html|icon\.svg|platforms\/[a-z]+\.svg|badges\/[a-z]+\/[a-z-]+\.svg)$/;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
const KEEPALIVE_MS = 20000;

const newKey = () => crypto.randomBytes(18).toString("base64url");

function sameKey(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

class ObsServer {
  /**
   * @param {object} opts
   * @param {string} opts.uiDir carpeta ui/
   * @param {() => object} opts.snapshot estado completo para un cliente nuevo:
   *        { layout, style, pagecss, backlog }
   */
  constructor({ uiDir, snapshot }) {
    this.uiDir = uiDir;
    this.snapshot = snapshot;
    this.clients = new Set();
    this.server = null;
    this.port = null;
    this.key = null;
    this.error = null;
    this.keepalive = null;
  }

  get running() {
    return !!this.server && !this.error;
  }

  url() {
    return this.port ? `http://127.0.0.1:${this.port}/obs?k=${encodeURIComponent(this.key)}` : null;
  }

  /** Arranca (o reinicia si cambian puerto o clave). */
  start(port, key) {
    if (this.server && this.port === port && this.key === key && !this.error) return Promise.resolve();
    this.stop();
    this.port = port;
    this.key = key;
    this.error = null;
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => this.handle(req, res));
      server.on("error", (e) => {
        this.error = e.code === "EADDRINUSE" ? `El puerto ${port} está ocupado: elige otro.` : e.message;
        console.warn("[shuriken] OBS:", this.error);
        resolve();
      });
      server.listen(port, "127.0.0.1", () => resolve());
      this.server = server;
    }).then(() => {
      if (!this.keepalive) {
        this.keepalive = setInterval(() => {
          for (const res of this.clients) res.write(": ping\n\n");
        }, KEEPALIVE_MS);
      }
    });
  }

  stop() {
    for (const res of this.clients) res.end();
    this.clients.clear();
    clearInterval(this.keepalive);
    this.keepalive = null;
    if (this.server) this.server.close();
    this.server = null;
  }

  /** Envía un evento a todas las páginas de OBS conectadas. */
  broadcast(name, data) {
    if (!this.clients.size) return;
    const msg = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.clients) res.write(msg);
  }

  handle(req, res) {
    const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
    let url;
    try {
      url = new URL(req.url, "http://127.0.0.1");
    } catch {
      res.writeHead(400, headers).end();
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405, headers).end();
      return;
    }
    // La página de OBS y los datos en directo exigen la clave.
    if (url.pathname === "/obs" || url.pathname === "/events") {
      if (!sameKey(url.searchParams.get("k"), this.key)) {
        res.writeHead(403, { ...headers, "Content-Type": "text/plain; charset=utf-8" })
          .end("Clave incorrecta: copia otra vez la URL desde Configuración → OBS.");
        return;
      }
      if (url.pathname === "/obs") return this.file(res, "obs.html", headers);
      return this.events(res, headers);
    }
    if (STATIC.test(url.pathname)) return this.file(res, url.pathname.slice(1), headers);
    res.writeHead(404, headers).end();
  }

  file(res, rel, headers) {
    const full = path.join(this.uiDir, rel);
    if (!full.startsWith(this.uiDir + path.sep)) {
      res.writeHead(403, headers).end();
      return;
    }
    fs.readFile(full, (err, data) => {
      if (err) {
        res.writeHead(404, headers).end();
        return;
      }
      res.writeHead(200, { ...headers, "Content-Type": TYPES[path.extname(rel)] || "application/octet-stream" }).end(data);
    });
  }

  events(res, headers) {
    res.writeHead(200, { ...headers, "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive" });
    res.write("retry: 2000\n\n");
    const snap = this.snapshot();
    const send = (name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    send("layout", snap.layout);
    send("style", snap.style);
    send("pagecss", snap.pagecss);
    send("backlog", snap.backlog);
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
  }
}

module.exports = { ObsServer, newKey, sameKey };
