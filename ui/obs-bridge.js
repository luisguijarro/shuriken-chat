// Shuriken Chat: puente del chat cuando se abre desde OBS (por http://127.0.0.1).
// En la app, window.shurikenChat lo da el preload; aquí se crea con los datos que
// envía el servidor local (SSE), para que chat.js funcione exactamente igual.
"use strict";

(function () {
  if (window.shurikenChat || !/^https?:$/.test(location.protocol)) return;
  const key = new URLSearchParams(location.search).get("k") || "";
  const handlers = { event: [], style: [], backlog: [] };
  let pageCss = null;

  // El servidor envía el estado inicial nada más conectar, a menudo ANTES de que chat.js
  // termine de descargarse: lo recibido se guarda y se entrega al registrarse cada receptor.
  const pending = { event: [], style: null, backlog: null };

  const es = new EventSource("/events?k=" + encodeURIComponent(key));
  for (const name of Object.keys(handlers)) {
    es.addEventListener(name, (e) => {
      const data = JSON.parse(e.data);
      if (!handlers[name].length) {
        if (name === "event") {
          pending.event.push(data);
          if (pending.event.length > 300) pending.event.shift();
        } else {
          pending[name] = data; // de estilo e historial basta el último
          if (name === "backlog") pending.event = []; // el historial ya los incluye
        }
        return;
      }
      for (const cb of handlers[name]) cb(data);
    });
  }
  // El mismo CSS que la app inyecta en la vista del chat (transparencia, CSS personalizado…).
  es.addEventListener("pagecss", (e) => {
    if (!pageCss) pageCss = document.head.appendChild(document.createElement("style"));
    pageCss.textContent = JSON.parse(e.data);
  });

  // En OBS solo se muestra: sin acciones (aprobar/denegar del AutoMod).
  window.shurikenChat = {
    on: (name, cb) => {
      if (!handlers[name] || typeof cb !== "function") return;
      handlers[name].push(cb);
      // Entrega lo que llegó antes de registrarse. Los mensajes van siempre DESPUÉS del
      // historial (al pintarse, el historial vacía la lista).
      const flushEvents = () => {
        if (pending.backlog !== null || !handlers.event.length) return;
        for (const ev of pending.event.splice(0)) for (const h of handlers.event) h(ev);
      };
      if (name !== "event" && pending[name] !== null) {
        const data = pending[name];
        pending[name] = null;
        cb(data);
      }
      flushEvents();
    },
  };
})();
