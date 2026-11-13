<p align="center">
  <img src="assets/icon.svg" width="120" alt="Shuriken Chat" />
</p>

<h1 align="center">Shuriken Chat</h1>

<p align="center">
  El chat de tus directos flotando en tu escritorio… y en OBS.<br />
  Una ventana sin bordes y transparente que une el chat de <b>Twitch</b>, <b>Kick</b> y <b>YouTube</b>
  (o, como respaldo, tu dock de <a href="https://socialstream.ninja">Social Stream Ninja</a>).
</p>

<p align="center">
  <b>Linux</b> (cualquier distro · X11 y Wayland) · <b>Windows</b> 10/11 · <b>macOS</b> (Apple Silicon e Intel) · Electron
</p>

---

> **Estado:** en desarrollo (v0.6.1). Plataformas: **Twitch**, **Kick** y **YouTube**. Chat para **OBS** idéntico al del escritorio. Paquetes para las principales distribuciones.
>
> Shuriken Chat es un proyecto independiente y **no está afiliado** a Social Stream Ninja, Twitch, Kick ni YouTube.

## Índice

- [¿Para qué sirve?](#para-qué-sirve)
- [Instalación](#instalación)
- [Primeros pasos](#primeros-pasos)
- [Plataformas](#plataformas)
- [Chat para OBS](#chat-para-obs)
- [Uso de la ventana](#uso-de-la-ventana)
- [Ventana de Configuración](#ventana-de-configuración)
- [Privacidad y seguridad](#privacidad-y-seguridad)
- [Linux con Wayland](#linux-con-wayland)
- [Solución de problemas](#solución-de-problemas)
- [Archivos de configuración](#archivos-de-configuración)
- [Desarrollo](#desarrollo)
- [Cómo funciona](#cómo-funciona)
- [Hoja de ruta](#hoja-de-ruta)

## ¿Para qué sirve?

Shuriken Chat muestra el chat de tus directos **en tu escritorio**, para leerlo mientras juegas o trabajas sin abrir el navegador ni mirar OBS. Y el mismo chat, **exactamente igual**, se puede añadir a OBS para las escenas que no muestran el escritorio.

Tiene dos modos (*Fuente del chat*):

- **Plataformas** (recomendado): la propia app lee el chat de **Twitch, Kick y YouTube**, todos a la vez en la misma ventana. Solo escribes el nombre de tu canal: **sin claves ni servidores intermedios**.
- **Social Stream Ninja**: muestra tu dock de SSN tal cual, con la URL que ya usas en OBS. Útil como respaldo o para plataformas que la app aún no lee directamente.

### Características

- 💬 **Twitch, Kick y YouTube en un solo chat**, cada mensaje con el icono de su plataforma.
- 🎥 **También en OBS**, idéntico a la ventana del escritorio y con las mismas proporciones.
- 📷 **Ventana de webcam** aparte, con el mismo borde y esquinas que el chat (ideal con la cámara virtual de OBS).
- 😀 **Se ve como en cada plataforma**: emotes del canal (también los de suscriptor), **7TV, BTTV y FFZ**, insignias oficiales, colores de usuario, Super Chats con su color…
- 🛡️ **Revisión del AutoMod de Twitch** desde el propio chat (con tu cuenta): el mensaje retenido no se muestra; al pasar el ratón lo ves y lo permites o deniegas.
- 🟢 **Estado de cada plataforma** de un vistazo: iconos con un punto de color arriba a la derecha.
- 🪟 **Sin bordes y transparente**, con **marco a tu gusto**: margen, borde con grosor y color, y esquinas redondeadas.
- 🖱️ **Arrastra para moverla**, estira los bordes para redimensionarla (se muestran sus medidas mientras lo haces).
- 📌 **Siempre visible** sobre las demás ventanas (activado por defecto, con botón propio).
- 🎨 **Todo se configura en la propia app**, con vista previa en directo.
- 👻 **Atravesar clics**: la ventana ignora el ratón para que uses lo que hay debajo.
- 🧹 **Limpiar chat** desde el clic derecho.
- 🔍 **Zoom** independiente de la escala del texto.
- 💾 **Recuerda** su tamaño, posición, zoom y ajustes.
- 🚫 **Nunca usa tu cámara ni tu micrófono**: están bloqueados para cualquier página.

## Instalación

Descarga el paquete de tu distribución desde *Releases* (cada versión incluye `SHA256SUMS.txt` para comprobar las descargas).

| Distribución | Paquete | Instalación |
| --- | --- | --- |
| Arch, CachyOS, Manjaro, EndeavourOS | `.pacman` | `sudo pacman -U ./shuriken-chat-x.y.z-x86_64.pacman` |
| Debian, Ubuntu, Mint, Pop!_OS | `.deb` | `sudo apt install ./shuriken-chat-x.y.z-amd64.deb` |
| Fedora | `.rpm` | `sudo dnf install ./shuriken-chat-x.y.z-x86_64.rpm` |
| openSUSE | `.rpm` | `sudo zypper install ./shuriken-chat-x.y.z-x86_64.rpm` |
| Cualquier otra | AppImage | `chmod +x shuriken-chat-*.AppImage && ./shuriken-chat-*.AppImage` |
| **Windows 10/11** | `-setup.exe` | Ejecuta el instalador (puedes elegir la carpeta; crea accesos directos) |
| **Windows 10/11** | `-portable.exe` | Sin instalar: ejecútalo desde cualquier carpeta o un USB |
| **macOS** (Apple Silicon: M1–M4) | `-mac-arm64.dmg` | Abre el `.dmg` y arrastra **Shuriken Chat** a *Aplicaciones* |
| **macOS** (Intel) | `-mac-x64.dmg` | Igual que el anterior |

Los paquetes de Linux añaden **Shuriken Chat** al menú de aplicaciones (*Internet → Chat*) y el comando `shuriken-chat`. El AppImage no necesita instalarse.

> **Windows avisa la primera vez** («Windows protegió su PC», de SmartScreen) porque la app no está firmada con un certificado de pago. Pulsa **Más información → Ejecutar de todas formas**. Solo pasa la primera vez.
>
> **macOS tampoco la reconoce la primera vez** («no se puede abrir porque Apple no puede comprobar…»), porque no está firmada con una cuenta de desarrollador de Apple. Ábrela una vez, cierra el aviso y ve a **Ajustes del Sistema → Privacidad y seguridad → «Abrir igualmente»**. Si lo prefieres, en la Terminal: `xattr -dr com.apple.quarantine "/Applications/Shuriken Chat.app"`. Solo hace falta la primera vez.

## Primeros pasos

1. Abre Shuriken Chat. La primera vez se abre la ventana **Configuración** (después, con **clic derecho → Configuración…**).
2. En **Fuente del chat**, elige **Plataformas**.
3. Añade tus canales:
   - **Twitch**: elige *Con mi cuenta* y pulsa **Iniciar sesión con Twitch** (se usa tu canal), o *Sin cuenta* y escribe el nombre del canal.
   - **Kick**: escribe el nombre del canal o pega su URL.
   - **YouTube**: escribe tu canal (`@tu_canal`) o pega su URL.

   Al añadir un canal, la app comprueba que existe y te dice si está en directo.
4. Ajusta el aspecto (lo verás en directo) y pulsa **Guardar**.
5. Coloca la ventana donde prefieras. Si quieres que nada la mueva, activa **Bloquear posición y tamaño** con el clic derecho.

### Con Social Stream Ninja

1. En Social Stream Ninja, copia la URL de tu **dock** (`https://socialstream.ninja/dock.html?session=…`).
2. En **Configuración → Fuente del chat**, elige **Social Stream Ninja**.
3. Pega la URL en **Importar desde Social Stream Ninja**: se rellenan todas las opciones.
4. Ajusta lo que quieras y pulsa **Guardar**.

> 🔒 Tu `session` de SSN funciona como una contraseña: quien la tenga puede ver tu chat. No la compartas ni la enseñes en capturas.

## Plataformas

### Twitch

Dos formas de conectar (*Configuración → Twitch*):

- **Con mi cuenta** (recomendado): pulsas *Iniciar sesión con Twitch*, se abre Twitch en el navegador con un código ya rellenado y autorizas la app. Se usa **tu canal** automáticamente y se activa la **revisión del AutoMod**. La app no ve tu contraseña.
- **Sin cuenta**: escribes uno o varios canales. Solo lectura.

Qué muestra: emotes de Twitch y del canal (incluidos los de suscriptor), **7TV, BTTV y FFZ** (canal y globales, también los que se superponen al emote anterior), insignias oficiales, colores de usuario, `/me`, respuestas, primer mensaje, mensajes destacados, subs, regalos, raids y anuncios. Los mensajes borrados, los timeouts y los baneos desaparecen.

**AutoMod** (con cuenta, en tu canal o donde seas moderador): el mensaje retenido **no se muestra**, solo un aviso «🛡 AutoMod ha retenido un mensaje de *usuario*». Al **pasar el ratón** se despliega con el motivo, el texto y los botones **✓ Permitir / ✗ Denegar** (mientras lo revisas, el chat no se desplaza). Al resolverse queda un aviso breve. En *Configuración → Twitch* verás en qué canales está activo.

### Kick

Sin cuenta. Escribes el canal (o pegas su URL; da igual `_` o `-`). Muestra emotes de Kick y de **7TV**, la insignia de suscriptor del canal según los meses, las insignias de nivel y las de streamer, moderador, VIP, OG, fundador…, colores, respuestas, subs, subs regaladas, raids y KICKs. Los mensajes borrados y los baneos desaparecen.

Sin cuenta no están disponibles los canjes de puntos ni la moderación de Kick.

### YouTube

Sin cuenta ni claves. Escribes tu canal (`@tu_canal`) y la app **busca sola tu directo**: si no estás emitiendo, espera y se conecta en cuanto empiezas (y vuelve a esperar al terminar). También vale la URL de un directo concreto.

Muestra el **chat en directo completo** (no el «destacado»), emojis normales y personalizados del canal, **Super Chats** con su color e importe, Super Stickers, miembros nuevos e hitos, suscripciones regaladas e insignias de propietario, moderador, verificado y miembro. Los mensajes borrados y los usuarios baneados desaparecen.

> Kick y YouTube se leen como lo hacen sus propias webs (no tienen una API oficial para esto sin servidores o cuotas). Si cambian su web, puede hacer falta actualizar la app.

## Chat para OBS

La app sirve el **mismo chat del escritorio** para usarlo en OBS como **Fuente de navegador**, también en modo Social Stream Ninja.

1. Abre **Configuración → OBS** y pulsa **Copiar** junto a la URL (`http://127.0.0.1:8187/obs?k=…`).
2. En OBS: **Fuentes → + → Navegador** y pega la URL.
3. Pon de ancho y alto los de la tabla **«Tamaño y posición según el lienzo de OBS»** (ver abajo).

**Se ve exactamente igual que la ventana**: mismo marco, borde, fondo, esquinas, margen, zoom, iconos y mensajes, en directo. Si cambias algo en Configuración, OBS lo refleja al momento, y al recargar la fuente recupera los últimos mensajes. Si la fuente tiene otro tamaño, el chat se escala sin deformarse.

**Tamaño y posición según el lienzo:** la tabla de *Configuración → OBS* te dice qué ancho, alto y posición poner a la fuente en lienzos de **720, 1080, 1440 o 2160** para que el chat ocupe en el directo la **misma parte de la pantalla** que en tu escritorio (se calcula con la pantalla donde está la ventana y se actualiza al moverla). La resolución del lienzo está en *OBS → Ajustes → Vídeo → Resolución base*; el tamaño y la posición se ponen con *clic derecho en la fuente → Transformar → Editar transformación*.

**Seguridad:** el servidor solo escucha en tu equipo (`127.0.0.1`) y la URL lleva una clave aleatoria. Si la compartes sin querer, usa **Cambiar la clave** (en *Avanzado*) y pega la nueva URL en OBS. Desde ahí también puedes cambiar el puerto.

El chat para OBS se activa o se para desde *Configuración → OBS*, el botón 📡 o el clic derecho.

## Ventana de webcam

Una ventana aparte con tu webcam, con el **mismo borde y esquinas** que el chat (sin margen: la imagen llega hasta el borde). Se mueve, se redimensiona, tiene su propio «siempre visible» y «bloquear», y su menú con el **clic derecho** (Configuración, espejo, ocultar…).

1. En **Configuración → Webcam**, elige la cámara y marca **Mostrar la ventana de webcam**.
2. Si quieres verte como en un espejo, marca **Voltear horizontalmente**.

**¿Usas la webcam en OBS?** En Windows y en Linux una cámara normalmente solo la puede usar **una aplicación a la vez**: si OBS la tiene, las demás no pueden abrirla. La solución es pedírsela a OBS con su **cámara virtual**:

1. En OBS: **Cámara virtual → ⚙ (Configurar) → Tipo de salida: Fuente** y elige la fuente de tu webcam (con sus filtros, recorte, croma…).
2. Pulsa **Iniciar cámara virtual**.
3. En Shuriken Chat, elige **OBS Virtual Camera** como cámara.

En Linux, la cámara virtual de OBS necesita el módulo `v4l2loopback` (OBS lo pide la primera vez).

> La ventana de webcam solo usa **vídeo**: nunca el micrófono. El chat (y la página de SSN) siguen sin acceso a ninguna cámara.

## Uso de la ventana

| Acción | Cómo |
| --- | --- |
| Mover la ventana | Arrastra desde cualquier punto del chat |
| Mover sobre un enlace o botón | **Alt** + arrastrar |
| Redimensionar | Arrastra desde los bordes o las esquinas (se muestran las medidas) |
| Abrir el menú | **Clic derecho** sobre el chat |
| Siempre visible / Chat para OBS | Botones 📌 y 📡 de arriba a la izquierda (aparecen al pasar el ratón) |
| Ver el estado de las plataformas | Iconos de arriba a la derecha (pasa el ratón para el detalle) |
| Desactivar *atravesar clics* | Icono de la **bandeja del sistema** (o reinicia la app) |

**Iconos de estado** (arriba a la derecha, solo de las plataformas configuradas, del tamaño de una letra del chat): 🟢 conectado · 🟡 conectando o reconectando · ⚪ sin directo (YouTube esperando) · 🔴 error (por ejemplo, un canal que no existe).

**Botones** (arriba a la izquierda, solo al pasar el ratón, para que no salgan en el directo): 📌 **Siempre visible** y 📡 **Chat para OBS**. Atenuados si están desactivados.

### Menú del clic derecho

- **Configuración…**
- **Zoom**: acercar, alejar o volver al 100 %.
- **Siempre visible** y **Chat para OBS**.
- **Bloquear posición y tamaño**: evita moverla o redimensionarla sin querer.
- **Atravesar clics**: los clics pasan a la ventana de debajo.
- **Limpiar chat**: vacía el chat (en la ventana, en OBS y en el historial; los canales siguen conectados). En modo SSN recarga el dock.
- **Recargar chat** y **Salir**.

### Bandeja del sistema

Mostrar u ocultar el chat, activar o desactivar *atravesar clics*, Configuración… y Salir.

## Ventana de Configuración

Los cambios se ven **en directo**. Pulsa **Guardar** para conservarlos; con **Descartar cambios**, o cerrando la ventana sin guardar, vuelves a lo anterior.

| Sección | Opciones |
| --- | --- |
| Fuente del chat | Plataformas (la app lee el chat) o Social Stream Ninja |
| Twitch | *Con mi cuenta* (tu canal + AutoMod) o *Sin cuenta* (canales a seguir) |
| Kick | Canales a seguir |
| YouTube | Canales (`@canal`) o directos concretos |
| Importar / Conexión *(SSN)* | URL del dock, ID de sesión e idioma |
| Ventana | **Siempre visible** (se aplica al momento) |
| Webcam | Mostrar la ventana de webcam, cámara (la virtual de OBS recomendada) y espejo |
| OBS | Activar, URL para la fuente de navegador, tabla de tamaño y posición por lienzo, puerto y cambio de clave |
| Aspecto del chat | Escala del texto, margen lateral, modo oscuro, burbujas, brillo en el texto, colores por usuario, difuminar mensajes antiguos, **texto debajo del nombre**, **icono de la plataforma** y ocultar la barra de controles de SSN |
| Marco de la ventana | Margen alrededor del chat, esquinas redondeadas, grosor, color y opacidad del borde |
| Fondo y transparencia | Fondo transparente o color de fondo (*chroma*) con su opacidad, y opacidad de toda la ventana |
| Avanzado | Parámetros extra y página base de SSN, **CSS personalizado** y opciones de sistema (Wayland nativo, compatibilidad gráfica) |
| URL generada *(SSN)* | La URL de SSN equivalente |

## Privacidad y seguridad

- **Cámara, micrófono, pantalla y ubicación bloqueados** para cualquier página (incluida la de SSN). La única excepción es la **ventana de webcam**, que puede usar solo vídeo (nunca el micrófono) de la cámara que elijas.
- **Sesión de Twitch**: se guarda **cifrada con el llavero del sistema** (KWallet, GNOME Keyring…), aparte de la configuración. Cerrar sesión la borra y revoca el acceso en Twitch.
- **Chat para OBS**: solo accesible desde tu equipo y con una clave en la URL.
- **Mensajes del chat**: se muestran siempre como texto, nunca como código, y los enlaces se abren en tu navegador.
- La app no envía datos a ningún servidor propio: se conecta directamente a Twitch, Kick, YouTube y a los servicios públicos de emotes e insignias (7TV, BTTV, FFZ, IVR).

## Linux con Wayland

En Wayland, por seguridad, las aplicaciones **no pueden elegir su posición en pantalla ni ponerse siempre por encima** por sí mismas. Por eso Shuriken Chat funciona **a través de XWayland por defecto**: puedes moverla, recuerda su posición y se mantiene siempre visible, sin configurar nada.

Si prefieres Wayland nativo, actívalo en *Configuración → Avanzado → Wayland nativo* y reinicia. Entonces la ventana no se podrá mover ni mantener por encima. En KDE Plasma puedes suplirlo con una *Regla de ventana* (Configuración del sistema → Gestión de ventanas → Reglas de ventana) para la clase `shuriken-chat`.

## Solución de problemas

<details>
<summary><b>No llegan mensajes de una plataforma</b></summary>

Mira su icono arriba a la derecha y pasa el ratón por encima:

- 🔴 **Error**: normalmente el canal no existe o está mal escrito. Revísalo en Configuración (cópialo de la URL del canal).
- ⚪ **Sin directo** (YouTube): no estás emitiendo; se conectará solo cuando empieces.
- 🟡 **Conectando**: espera unos segundos o comprueba tu conexión.
- 🟢 **Conectado** pero no sale nada: puede que nadie esté escribiendo. Escribe algo en tu chat para probar.

Para ver qué pasa por dentro, lanza la app con `SHURIKEN_DEBUG=1 shuriken-chat` (o `SHURIKEN_DEBUG=1 npm start`).
</details>

<details>
<summary><b>No veo los mensajes retenidos por el AutoMod</b></summary>

- Hace falta *Configuración → Twitch → Con mi cuenta* y haber iniciado sesión.
- En *Configuración → Twitch* debe aparecer «AutoMod activo» para tu canal. Si dice «no eres moderador», esa cuenta no puede revisar ese canal.
- El AutoMod **nunca retiene los mensajes del dueño del canal ni de los moderadores**: para probarlo, escribe desde otra cuenta.
</details>

<details>
<summary><b>OBS no muestra el chat</b></summary>

- Comprueba que el chat para OBS está activo (botón 📡 o *Configuración → OBS*).
- Si en Configuración aparece «el puerto está ocupado», elige otro puerto y vuelve a copiar la URL.
- Si cambiaste la clave, pega la URL nueva en OBS.
- La app tiene que estar abierta: OBS recibe el chat de ella.
</details>

<details>
<summary><b>No llegan los mensajes en modo Social Stream Ninja</b></summary>

- Comprueba que la `session` es correcta y que la extensión o app de SSN está en marcha.
- Prueba la misma URL en Chrome o Chromium: si allí tampoco llegan, el problema está en SSN.
- Ten en cuenta que en este modo, cambiar opciones que van en la URL recarga el dock y SSN pierde los mensajes anteriores (no guarda historial).
</details>

<details>
<summary><b>La ventana sale en blanco o negro</b></summary>

Suele pasar con gráficas NVIDIA o algunos drivers. Activa *Configuración → Avanzado → Modo compatibilidad gráfica* y reinicia. Si no puedes abrir el menú, edita el archivo de configuración y pon `"compatRendering": true`.
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

Cierra la app y borra la configuración (y, si quieres, la sesión de Twitch):

```sh
rm ~/.config/shuriken-chat/config.json
rm ~/.config/shuriken-chat/twitch-auth.json
```

</details>

## Archivos de configuración

| Sistema | Carpeta |
| --- | --- |
| Linux | `~/.config/shuriken-chat/` (o `$XDG_CONFIG_HOME/shuriken-chat/`) |
| Windows | `%APPDATA%\shuriken-chat\` (p. ej. `C:\Users\<usuario>\AppData\Roaming\shuriken-chat\`) |
| macOS | `~/Library/Application Support/shuriken-chat/` |

- `config.json`: todos los ajustes, en JSON legible.
- `twitch-auth.json`: la sesión de Twitch, **cifrada** (solo si inicias sesión).

```jsonc
{
  "sources": {                // de dónde sale el chat
    "mode": "native",         // "native" (plataformas) o "ssn"
    "twitch": { "useAccount": true, "channels": [] },
    "kick": { "channels": ["mi-canal"] },
    "youtube": { "channels": ["@mi_canal"] }
  },
  "appearance": {             // aspecto del chat, marco y SSN (se edita en «Configuración…»)
    "darkMode": true, "bubble": true, "twoLines": true, "showPlatform": true,
    "margin": 10, "borderWidth": 1, "cornerRadius": 10,
    "session": ""             // solo modo SSN
    // …
  },
  "obs": { "enabled": true, "port": 8187, "key": "…" },
  "system": {                 // requieren reiniciar
    "nativeWayland": false,
    "compatRendering": false
  },
  "window": {                 // se gestiona sola
    "width": 420, "height": 640, "x": 100, "y": 100,
    "zoom": 1.0, "alwaysOnTop": true, "locked": false
  }
}
```

## Desarrollo

Solo necesitas **Node.js 20 o superior** y npm (en Arch: `sudo pacman -S nodejs npm`).

```sh
git clone <url-del-repo> shuriken-chat
cd shuriken-chat
npm install
npm start                       # ejecutar
SHURIKEN_DEBUG=1 npm start      # con la consola de la página, un diagnóstico y los avisos de Chromium
npm test                        # tests (node --test)
npm run build                   # todos los paquetes (Linux y Windows) en dist/ + SHA256SUMS.txt
npm run build -- deb pacman     # solo los formatos indicados (appimage, deb, rpm, pacman, windows, mac)
```

`npm run build` limpia `dist/`, genera los paquetes con electron-builder, calcula `SHA256SUMS.txt` y muestra un resumen. Funciona también en la terminal de VS Code. Desde Linux, el `.rpm` necesita `rpmbuild` (`sudo pacman -S rpm-tools`) y los de Windows, `wine` (`sudo pacman -S wine`); si falta alguno, se salta avisando. macOS solo se puede construir en un Mac: lo hace **GitHub Actions** (`.github/workflows/macos.yml`) en el espejo de GitHub, que además prueba que la app arranca.

Para probar sin tocar tu configuración: `XDG_CONFIG_HOME=/tmp/prueba npm start`.

## Cómo funciona

```text
 Twitch (IRC anónimo) ─┐
 Kick (Pusher) ────────┼─▶ conectores ─▶ eventos normalizados ─┬─▶ ventana del chat (ui/chat.html)
 YouTube (web) ────────┘   src/sources/                        └─▶ servidor local ─▶ OBS (misma página)
 Twitch EventSub (AutoMod, con cuenta) ─┘                           127.0.0.1 + clave

┌──────────────────────────── Ventana del chat ────────────────────────────┐
│ marco (ui/frame.html): borde, fondo, esquinas                            │
│   └─ vista interior: chat propio (ui/chat.html) o dock de SSN            │
│        + preload aislado: clic derecho, arrastre, bordes, botones,       │
│          medidas, bloqueo de cámara/micrófono                            │
└──────────────────────────────────────────────────────────────────────────┘
        ▲ estilo, CSS, mensajes                ▲ preview / save
        └──────────── main.js ◀────────────────┴── Configuración (ui/settings.html)
                     menú, bandeja, zoom, siempre visible, OBS
```

- **Electron** (Chromium): mismo motor que OBS, por eso el dock de SSN funciona tal cual.
- Los **conectores** corren en el proceso principal y emiten eventos con un formato común. La misma página del chat los pinta en la ventana y en OBS.
- El **marco** es una página propia y el chat va en una vista interior desplazada según el margen: así el chat (o SSN) ve un tamaño real y nada se descoloca.
- La web de SSN corre **aislada**, sin acceso a la app más allá del menú y el arrastre.

### Estructura del proyecto

```text
shuriken-chat/
├── assets/                       Icono fuente (SVG) e iconos PNG/ICO
├── ui/                           Páginas locales (sin frameworks)
│   ├── chat.html/.css/.js        Chat propio (en la ventana y en OBS)
│   ├── frame.html                Marco de la ventana (borde, fondo, esquinas)
│   ├── obs.html/.js, obs-bridge.js  Página para OBS
│   ├── settings.html/.css/.js    Ventana de Configuración
│   ├── webcam.html/.js           Ventana de webcam
│   ├── welcome.html              Pantalla inicial del modo SSN sin sesión
│   ├── platforms/                Iconos de las plataformas
│   └── badges/                   Iconos propios de insignias (Kick, YouTube)
├── src/
│   ├── main.js                   Ventanas, menús, bandeja, IPC, OBS
│   ├── config.js                 Configuración y URL de SSN
│   ├── obs-server.js             Servidor local para OBS
│   ├── preload-chat.js           Script aislado de la ventana del chat
│   ├── preload-settings.js       Puente de la ventana de Configuración
│   └── sources/                  Conectores (Twitch, Kick, YouTube), emotes, insignias y sesión de Twitch
├── scripts/
│   ├── start.js                  Lanzador de desarrollo (npm start)
│   └── build.js                  Construcción de los paquetes (npm run build)
└── test/                         Tests (node --test)
```

## Hoja de ruta

- [x] Modo Social Stream Ninja
- [x] Twitch (con AutoMod), Kick y YouTube
- [x] Chat para OBS idéntico al del escritorio
- [x] Paquetes AppImage, .deb, .rpm y .pacman
- [ ] Flatpak / Flathub
- [ ] Twitch con cuenta: avisos de follows y canjes de puntos del canal
- [ ] Opción de mostrar «‹mensaje eliminado›» en vez de ocultar los mensajes borrados
- [ ] Perfiles de apariencia (p. ej. «Escritorio», «Compacto»)
- [x] Windows (instalador y portable)
- [x] macOS (Apple Silicon e Intel)

## Créditos

- [Social Stream Ninja](https://github.com/steveseguin/social_stream), de Steve Seguin: la inspiración y el modo de respaldo.
- [7TV](https://7tv.app), [BetterTTV](https://betterttv.com), [FrankerFaceZ](https://www.frankerfacez.com) e [IVR](https://api.ivr.fi): emotes e insignias.
- [Electron](https://www.electronjs.org) y [electron-builder](https://www.electron.build): la aplicación y sus paquetes.

## Licencia

[MIT](LICENSE) © 2026 Luis Guijarro Pérez. Puedes usar, copiar, modificar y distribuir Shuriken Chat libremente, también con fines comerciales, siempre que conserves el aviso de copyright y la licencia.

Los paquetes incluyen además las licencias de Electron y Chromium (`LICENSE.electron.txt` y `LICENSES.chromium.html`).
