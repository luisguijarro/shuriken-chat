<p align="center">
  <img src="assets/icon.svg" width="120" alt="Shuriken Chat" />
</p>

<h1 align="center">Shuriken Chat</h1>

<p align="center">
  El chat de tus directos flotando en tu escritorio.<br />
  Una ventana sin bordes y transparente que lee el chat de tus plataformas
  (por ahora <b>Twitch</b>) o, como respaldo, el de
  <a href="https://socialstream.ninja">Social Stream Ninja</a>.
</p>

<p align="center">
  <b>Linux</b> (cualquier distro · X11 y Wayland) · Windows opcional · Electron
</p>

---

> **Estado:** en desarrollo (v0.3.0). Plataformas soportadas: **Twitch**. Próximas: Kick y YouTube.
>
> Shuriken Chat es un proyecto independiente y **no está afiliado** a Social Stream Ninja.

## ¿Para qué sirve?

Shuriken Chat muestra el chat de tus directos **en tu escritorio**, para leerlo mientras juegas o trabajas sin abrir el navegador ni mirar OBS. Tiene dos modos:

- **Plataformas** (recomendado): la app lee el chat directamente. Solo escribes el nombre de tu canal: **sin cuenta, sin claves y sin configurar nada más**.
  - **Twitch**: emotes del canal (incluidos los de suscriptor), **7TV, BTTV y FFZ** (también los que se superponen), insignias oficiales, colores de usuario, /me, respuestas, subs, raids y anuncios. Los mensajes borrados y los baneos desaparecen como en Twitch.
- **Social Stream Ninja**: muestra tu dock de SSN tal cual. Útil como respaldo o para plataformas que aún no soporta la app.

### Características

- 🪟 **Sin bordes y transparente**: solo se ven los mensajes, que flotan sobre lo que tengas detrás.
- 🖼️ **Marco a tu gusto**: margen alrededor del chat, borde con grosor y color, y esquinas redondeadas.
- 🖱️ **Arrastra para moverla** y estira los bordes para cambiar su tamaño.
- 📌 **Siempre visible** sobre las demás ventanas.
- 🎨 **Configuras el aspecto en la propia app**, sin editar URLs a mano. Los cambios se ven en directo.
- 📋 **Modo SSN: importas tu URL** pegándola y rellena todas las opciones automáticamente.
- 👻 **Atravesar clics**: la ventana ignora el ratón para que puedas usar lo que hay debajo.
- 🔍 **Zoom** independiente de la escala del chat.
- 💾 **Recuerda** su tamaño, posición, zoom y ajustes.
- 🔌 **Modo SSN sin tocar SSN**: usa el mismo motor que OBS (Chromium), así que funciona con tu URL de siempre.
- 🚫 **Nunca usa tu cámara ni tu micrófono**: están bloqueados para cualquier página.

## Instalación

### AppImage (recomendado, sirve para cualquier distro)

1. Descarga `shuriken-chat-x.y.z-x86_64.AppImage` desde *Releases*.
2. Dale permisos de ejecución y ábrelo:
   ```sh
   chmod +x shuriken-chat-*.AppImage
   ./shuriken-chat-*.AppImage
   ```

### Paquetes nativos

- **Debian / Ubuntu / Mint:** `sudo apt install ./shuriken-chat_x.y.z_amd64.deb`
- **Fedora / openSUSE:** `sudo dnf install ./shuriken-chat-x.y.z-1.x86_64.rpm`
- **Arch / CachyOS / Manjaro:** usa el AppImage o [ejecútalo desde el código](#ejecutar-desde-el-código).

## Primeros pasos

### Con Twitch

1. Abre Shuriken Chat. La primera vez se abre la ventana **Apariencia**.
2. En **Fuente del chat**, elige **Plataformas**.
3. En **Twitch**, escribe el nombre de tu canal (o pega su URL) y pulsa **Añadir**. El chat aparece al momento.
4. Ajusta el aspecto y pulsa **Guardar**.

### Con Social Stream Ninja

1. En Social Stream Ninja, copia la URL de tu **dock**. Es algo como:
   ```
   https://socialstream.ninja/dock.html?session=XXXXXXXX&ln=es&scale=0.5&bubble&darkmode…
   ```
2. En **Apariencia → Fuente del chat**, elige **Social Stream Ninja**.
3. Pega la URL en **Importar desde Social Stream Ninja**.
4. Ajusta lo que quieras (verás los cambios en directo) y pulsa **Guardar**.
5. Coloca la ventana donde prefieras y, si quieres que nada la mueva, activa **Bloquear posición y tamaño**.

> 🔒 Tu `session` funciona como una contraseña: quien la tenga puede ver tu chat. No la compartas ni la publiques en capturas.

## Uso

| Acción | Cómo |
|---|---|
| Mover la ventana | Arrastra desde cualquier punto del chat |
| Mover sobre un enlace o botón | **Alt** + arrastrar |
| Redimensionar | Arrastra desde los bordes o las esquinas |
| Abrir el menú | **Clic derecho** sobre el chat |
| Desactivar *atravesar clics* | Icono de la **bandeja del sistema** (o reinicia la app) |

### Menú del clic derecho

- **Apariencia…**: abre la ventana de ajustes.
- **Zoom**: acercar, alejar o volver al 100 %.
- **Siempre visible**: mantiene el chat por encima del resto de ventanas.
- **Bloquear posición y tamaño**: evita moverla o redimensionarla sin querer.
- **Atravesar clics**: los clics pasan a la ventana de debajo.
- **Recargar chat** y **Salir**.

### Ventana de Apariencia

| Sección | Opciones |
|---|---|
| Fuente del chat | Plataformas (la app lee el chat) o Social Stream Ninja |
| Twitch | Canales a seguir (puedes añadir varios) |
| Importar *(SSN)* | Pega una URL de SSN y rellena el formulario |
| Conexión *(SSN)* | ID de sesión e idioma |
| Aspecto del chat | Escala del texto, margen lateral, modo oscuro, burbujas, brillo en el texto, colores aleatorios, difuminar mensajes antiguos, ocultar la barra de controles de SSN |
| Marco de la ventana | Margen alrededor del chat (10 px por defecto), esquinas redondeadas, grosor, color y opacidad del borde |
| Fondo y transparencia | Fondo totalmente transparente, o color de fondo (*chroma*) con su opacidad, y opacidad de toda la ventana |
| Avanzado | Parámetros extra de SSN, **CSS personalizado**, página base y opciones de sistema |
| URL generada | La URL equivalente, por si quieres usarla también en OBS |

Con **Descartar cambios**, o cerrando la ventana sin guardar, vuelves a la configuración anterior.

## Linux con Wayland

En Wayland, por seguridad, las aplicaciones **no pueden elegir su posición en pantalla ni ponerse siempre por encima** por sí mismas. Por eso Shuriken Chat funciona **a través de XWayland por defecto**: puedes moverla, recuerda su posición y se mantiene siempre visible, sin configurar nada.

Si prefieres Wayland nativo, actívalo en *Apariencia → Avanzado → Wayland nativo* y reinicia. Ten en cuenta que entonces la ventana no se podrá mover ni mantener por encima. En KDE Plasma puedes suplirlo con una *Regla de ventana* (Configuración del sistema → Gestión de ventanas → Reglas de ventana) para la clase `shuriken-chat`.

## Solución de problemas

<details>
<summary><b>La ventana sale en blanco o negro</b></summary>

Suele pasar con gráficas NVIDIA o algunos drivers. Activa *Apariencia → Avanzado → Modo compatibilidad gráfica* y reinicia. Si no puedes abrir el menú, edita el archivo de configuración (ver más abajo) y pon `"compatRendering": true`.
</details>

<details>
<summary><b>No llegan los mensajes del chat</b></summary>

- Comprueba que la `session` es correcta y que la extensión o app de SSN está en marcha.
- Prueba la misma URL en Chrome o Chromium: si allí tampoco llegan, el problema está en SSN.
- Para ver qué pasa por dentro, lanza la app con `SHURIKEN_DEBUG=1`: mostrará en la terminal la consola de la página y un diagnóstico.
</details>

<details>
<summary><b>He activado «Atravesar clics» y no puedo interactuar con la ventana</b></summary>

Esa es la idea de la opción 🙂. Desactívala desde el icono de la **bandeja del sistema**. Si tu escritorio no muestra iconos de bandeja (por ejemplo, GNOME sin la extensión *AppIndicator*), cierra y vuelve a abrir la app: esta opción nunca se guarda.
</details>

<details>
<summary><b>No recuerda la posición de la ventana</b></summary>

Solo pasa con *Wayland nativo* activado. Consulta [Linux con Wayland](#linux-con-wayland).
</details>

<details>
<summary><b>Quiero empezar de cero</b></summary>

Borra el archivo de configuración:
```sh
rm ~/.config/shuriken-chat/config.json
```
</details>

## Configuración

Todo se guarda en un archivo JSON legible:

| Sistema | Ruta |
|---|---|
| Linux | `~/.config/shuriken-chat/config.json` (o `$XDG_CONFIG_HOME/shuriken-chat/`) |
| Windows | `%APPDATA%\shuriken-chat\config.json` |

```jsonc
{
  "appearance": {            // aspecto del chat (se edita en «Apariencia…»)
    "session": "…",
    "language": "es",
    "scale": 0.5,
    "bubble": true,
    "darkMode": true,
    "transparentBg": true,
    "customCss": ""
    // …
  },
  "system": {                // requieren reiniciar
    "nativeWayland": false,
    "compatRendering": false
  },
  "window": {                // se gestiona sola
    "width": 420, "height": 640, "x": 100, "y": 100,
    "zoom": 1.0, "alwaysOnTop": true, "locked": false
  }
}
```

## Ejecutar desde el código

Solo necesitas **Node.js 20 o superior** y npm (en Arch: `sudo pacman -S nodejs npm`).

```sh
git clone <url-del-repo> shuriken-chat
cd shuriken-chat
npm install
npm start                 # ejecutar
SHURIKEN_DEBUG=1 npm start  # con la consola de la página en la terminal
npm test                  # tests de la generación de URL
npm run build             # AppImage, .deb y .rpm en dist/
npm run build:appimage    # solo AppImage
```

> El `.rpm` necesita `rpmbuild` instalado (`rpm-tools` en Arch).

## Cómo funciona

```
┌──────────────────────────────── Shuriken Chat (Electron) ─────────────────────────────────┐
│                                                                                           │
│  Ventana «chat» (sin bordes, transparente)          Ventana «Apariencia…»                 │
│  ┌──────────────────────────────────┐               ┌──────────────────────────┐          │
│  │ socialstream.ninja/dock.html     │◀── loadURL ───│ settings.html            │          │
│  │   + preload-chat.js (aislado)    │◀── insertCSS ─│  formulario → URL de SSN │          │
│  │     · bloquea cámara/micro       │               └────────────┬─────────────┘          │
│  │     · clic derecho → menú        │                            │ preview / save         │
│  │     · arrastrar / bordes         │                            ▼                        │
│  └──────────────┬───────────────────┘              config.js → ~/.config/…/config.json    │
│                 │ menu · drag-start · drag-end                                            │
│                 ▼                                                                         │
│            main.js: menú nativo, bandeja, zoom, siempre visible, atravesar clics          │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

- La app muestra el **dock oficial de SSN** con el mismo motor que OBS (Chromium). No reimplementa el chat: hereda todas sus funciones y estilos.
- Un *preload* aislado añade el clic derecho, el arrastre y los bordes. El CSS de transparencia y el personalizado se aplican desde la app.
- **Seguridad:** la web de SSN corre aislada y sin acceso a Node. Solo puede pedir abrir el menú y mover o redimensionar la ventana. Cámara, micrófono, pantalla y ubicación están denegados.

### Estructura del proyecto

```
shuriken-chat/
├── assets/                      Icono fuente (SVG) e iconos PNG/ICO
├── ui/                          Páginas locales (sin frameworks)
│   ├── chat.html/.css/.js       Chat propio (modo Plataformas)
│   ├── settings.html/.css/.js   Ventana de Apariencia
│   └── welcome.html             Pantalla inicial sin sesión
├── src/
│   ├── main.js                  Ventanas, menús, bandeja, IPC
│   ├── config.js                Configuración y generación de la URL de SSN
│   ├── sources/                 Conectores de plataformas (Twitch) y emotes/insignias
│   ├── preload-chat.js          Script aislado de la ventana del chat
│   └── preload-settings.js      Puente de la ventana de Apariencia
├── scripts/start.js             Lanzador de desarrollo (npm start)
└── test/                        Tests (node --test)
```

## Hoja de ruta

- [ ] Publicar AppImage en *Releases*
- [ ] Perfiles de apariencia (p. ej. «Escritorio», «Compacto»)
- [ ] Atajo de teclado global para *atravesar clics* (X11)
- [ ] Flatpak
- [ ] Soporte probado en Windows

## Créditos

- [Social Stream Ninja](https://github.com/steveseguin/social_stream), de Steve Seguin: la inspiración y el modo de respaldo.
- [7TV](https://7tv.app), [BetterTTV](https://betterttv.com), [FrankerFaceZ](https://www.frankerfacez.com) e [IVR](https://api.ivr.fi): emotes e insignias.
- [Electron](https://www.electronjs.org): el framework de la aplicación.

## Licencia

MIT.
