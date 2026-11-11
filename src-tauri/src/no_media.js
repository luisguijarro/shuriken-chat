// Shuriken Chat: bloquea cámara, micrófono y captura de pantalla.
// Se inyecta en TODOS los frames (incluido el iframe de VDO.Ninja que usa SSN)
// antes de que la página ejecute su código. El chat solo necesita el canal de
// datos de WebRTC, así que ninguna página debe tocar dispositivos multimedia.
(function () {
  const denied = () =>
    Promise.reject(new DOMException("Desactivado en Shuriken Chat", "NotAllowedError"));

  const md = window.MediaDevices && window.MediaDevices.prototype;
  if (md) {
    const def = (name, fn) => {
      try {
        Object.defineProperty(md, name, { value: fn, writable: false, configurable: false });
      } catch (_) {}
    };
    // Sin dispositivos: así no se sondean cámaras vía GStreamer/PipeWire.
    def("enumerateDevices", () => Promise.resolve([]));
    def("getUserMedia", denied);
    def("getDisplayMedia", denied);
  }

  // APIs antiguas con callback.
  const legacy = function (_c, _ok, err) {
    if (typeof err === "function") {
      err(new DOMException("Desactivado en Shuriken Chat", "NotAllowedError"));
    }
  };
  for (const name of ["getUserMedia", "webkitGetUserMedia"]) {
    try {
      Object.defineProperty(Navigator.prototype, name, { value: legacy, configurable: false });
    } catch (_) {}
  }
})();
