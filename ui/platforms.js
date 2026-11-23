// Shuriken Chat: lo que se sabe de cada plataforma y se usa en TODAS partes.
//
// Un solo fichero para el proceso principal (Node: conectores, config, IPC) y para las
// páginas (chat, Configuración y OBS): así el nombre de la plataforma, cómo se escribe un
// canal y qué se acepta como canal no pueden divergir entre la app y Configuración.
// Lo propio de Node (conectores, comprobar si un canal existe) está en src/sources/platforms.js.
//
// Para añadir una plataforma: su entrada aquí, su icono en ui/platforms/<id>.svg y su
// conector en src/sources/platforms.js (y su sección en Configuración).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ShurikenPlatforms = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** Canal de Twitch: "Canal", "#canal" o la URL del canal → "canal" (o null). */
  function normalizeTwitch(value) {
    let c = String(value || "").trim().toLowerCase();
    c = c.replace(/^https?:\/\/(www\.|m\.)?twitch\.tv\//, "").replace(/^[#@]/, "");
    c = c.split(/[/?#]/)[0];
    return /^[a-z0-9_]{1,25}$/.test(c) ? c : null;
  }

  /** Canal de Kick: nombre o URL → slug (en la URL los "_" del usuario son "-"). */
  function normalizeKick(value) {
    let c = String(value || "").trim().toLowerCase();
    c = c.replace(/^https?:\/\/(www\.)?kick\.com\//, "").replace(/^popout\//, "").replace(/^@/, "");
    c = c.split(/[/?#]/)[0].replace(/_/g, "-");
    return /^[a-z0-9][a-z0-9-]{1,39}$/.test(c) ? c : null;
  }

  /** YouTube: "@canal", URL del canal o de un directo → "@canal", "channel/UC…" o "v:VIDEOID". */
  function normalizeYoutube(value) {
    let s = String(value || "").trim();
    if (!s) return null;
    let m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|shorts\/)|youtu\.be\/)([\w-]{11})(?![\w-])/i.exec(s);
    if (m) return "v:" + m[1];
    m = /youtube\.com\/channel\/(UC[\w-]{22})(?![\w-])/i.exec(s);
    if (m) return "channel/" + m[1];
    s = s.replace(/^https?:\/\/((www|m)\.)?youtube\.com\//i, "").split(/[/?#]/)[0];
    if (!s.startsWith("@")) s = "@" + s;
    return /^@[\w.-]{3,30}$/.test(s) ? s.toLowerCase() : null;
  }

  /**
   * id:         clave en la config (sources.<id>), en los eventos (ev.platform) y del icono.
   * name:       nombre visible.
   * prefix:     delante del canal en las listas de Configuración.
   * normalize:  texto del usuario → canal guardado (o null si no es válido).
   * label:      cómo se nombra el canal en los avisos del chat.
   * invalidMsg: aviso de Configuración si el canal no es válido.
   */
  const LIST = [
    {
      id: "twitch",
      name: "Twitch",
      prefix: "#",
      normalize: normalizeTwitch,
      label: (channel) => `#${channel}`,
      invalidMsg: "Nombre no válido: solo letras, números y _ (máx. 25).",
    },
    {
      id: "kick",
      name: "Kick",
      prefix: "",
      normalize: normalizeKick,
      label: (channel) => String(channel),
      invalidMsg: "Nombre no válido: solo letras, números, _ y - (o pega la URL del canal).",
    },
    {
      id: "youtube",
      name: "YouTube",
      prefix: "",
      normalize: normalizeYoutube,
      label: (channel) => (String(channel).startsWith("v:") ? "el directo" : String(channel)),
      invalidMsg: "No válido: escribe @canal o pega la URL del canal o del directo.",
    },
  ];

  // Sin prototipo: byId["toString"] no debe devolver nada.
  const byId = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(LIST.map((p) => [p.id, Object.freeze(p)]))));
  return Object.freeze({ list: Object.freeze(LIST.map((p) => byId[p.id])), byId, normalizeTwitch, normalizeKick, normalizeYoutube });
});
