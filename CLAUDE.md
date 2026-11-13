# CLAUDE.md — Shuriken Chat

Chat unificado de escritorio. Dos modos ("Fuente del chat"):
- **Plataformas** (`sources.mode = "native"`): la propia app lee el chat de cada plataforma y lo pinta con su propio render. Objetivo principal.
- **SSN** (`"ssn"`): muestra el dock de **Social Stream Ninja** (`https://socialstream.ninja/dock.html?session=…&params`). Se mantiene como **respaldo de emergencia**.

Todo se muestra en una ventana **sin bordes, transparente, redimensionable, arrastrable y siempre visible** en su escritorio. Toda la configuración se hace con **clic derecho** sobre el chat.

- Objetivo: funcionar en **cualquier distro Linux** (prioridad). Windows es opcional.
- **Prioridad del usuario: facilidad de uso. El usuario final NO debe tener que cambiar nada en la configuración de SSN**: pega su URL del dock de OBS y funciona.
- Entorno del usuario: CachyOS (Arch), **KDE Plasma sobre Wayland**, GPU AMD (amdgpu).
- Idioma: el usuario habla español. **Interfaz, comentarios y mensajes en español.**
- Proyecto independiente: no usar "Social Stream Ninja" ni "Ninja" como nombre de la app.

## Ramas y releases

- **Una rama por plataforma o feature**, con su nombre (`twitch`, `kick`, `youtube`, `obs`…), y **una release por cada una**. Versiones: 0.2.0 = solo SSN, 0.3.0 = Twitch, 0.4.0 = Kick, 0.5.0 = YouTube, 0.6.0 = OBS (publicadas), 0.6.1 = paquetes .deb/.rpm/.pacman.
- Tras terminar una plataforma: tests, prueba en vivo, commit en su rama, push y AppImage (`npm run build:appimage`). Fusionar en master y publicar la release solo cuando el usuario lo confirme.
- El remoto `origin` es un Gitea/Forgejo propio (git.dark-pi.net).
- **Releases**: adjuntar AppImage, `.deb`, `.rpm` y `.pacman` + `SHA256SUMS.txt` (`fj release create --tag vX --attach …`).

## Empaquetado

- **Un solo comando: `npm run build`** (`scripts/build.js`): quita `ELECTRON_RUN_AS_NODE`, limpia `dist/`, lanza electron-builder (`linux.target` = AppImage, deb, rpm, pacman), genera `dist/SHA256SUMS.txt` y muestra un resumen. Formatos sueltos: `npm run build -- deb pacman` (o `build:<formato>`). Si falta `rpmbuild` (`rpm-tools` en Arch), salta el .rpm avisando. Ya no hace falta `env -u ELECTRON_RUN_AS_NODE` para construir.
- **Dependencias explícitas y mínimas** por formato (`build.deb/rpm/pacman.depends`): Electron ya lleva casi todo. Sin libappindicator: `libappindicator-gtk3` **no existe en Arch** (la lista por defecto de electron-builder hacía el .pacman ininstalable) y la bandeja la gestiona Electron por D-Bus.
- El comentario del lanzador `.desktop` sale de `linux.description` (electron-builder ignora `desktop.entry.Comment`): mantenerla corta. Sección del .deb con `deb.packageCategory` (`net`) y grupo del .rpm con `rpm.packageCategory` (`Applications/Internet`). Para revisar el .rpm: `rpm -qip`, `rpm -qpR` y `rpm2cpio <rpm> | bsdtar -xf -` (bsdtar no abre el .rpm directamente).
- Responsable de los paquetes: solo el nombre "Shuriken Chat", sin correo (decisión del usuario).
- Comprobar sin instalar: `pacman -Qip dist/*.pacman`, `bsdtar -xOf <paquete> usr/share/applications/shuriken-chat.desktop | desktop-file-validate`, y el control del .deb con `bsdtar`.
- **Flathub/Flatpak: aparcado** por decisión del usuario. Cuando se retome: el repo de git.dark-pi.net es **privado** (Flathub necesita fuentes públicas) → el usuario eligió un **espejo en GitHub**; falta decidir el App ID (`io.github.<usuario>.ShurikenChat` o `net.dark_pi.ShurikenChat` verificando el dominio), metainfo AppStream, capturas, y manifiesto con `org.electronjs.Electron2.BaseApp` + `flatpak-node-generator`.

## Stack y por qué

- **Electron** (45.x) + electron-builder (AppImage/deb/rpm; nsis en Windows). Sin framework de frontend ni bundler: `ui/` son HTML/CSS/JS estáticos. JS en CommonJS.
- **Historia:** se empezó con Rust + Tauri v2, pero **WebKitGTK de Arch (2.54) está compilado sin WebRTC** (`RTCPeerConnection` no existe; comprobado). SSN entrega los mensajes al dock por WebRTC (VDO.Ninja), así que no llegaba nada. La alternativa sin WebRTC (`&server2`) obliga a cambiar ajustes en la extensión de SSN, y el usuario no lo quiere. OBS funciona porque usa CEF (Chromium) → se migró a Electron, que también lleva Chromium. No volver a webviews del sistema.
- `src-tauri/` es el código Tauri antiguo, **obsoleto**; pendiente de que el usuario confirme que se borra.

## Estructura

```text
src/main.js               Proceso principal: ventanas, menú contextual, bandeja, IPC, arrastre, permisos
src/config.js             Config (camelCase), normalize/defaults, chatUrl(), pageCss()
src/preload-chat.js       Preload aislado del chat: bloqueo de multimedia, clic derecho, arrastre/bordes
src/preload-settings.js   Expone window.shuriken.invoke(cmd, args) a settings.js (lista blanca de comandos)
src/sources/index.js      SourceManager: arranca/para conectores según config, backlog (150), formato de eventos normalizado (documentado ahí)
src/sources/twitch.js     Conector de Twitch: IRC por WebSocket anónimo (justinfan), reconexión con backoff, cola por canal
src/sources/twitch-parse.js  Puro y testeado: parseIrc, normalizeChannel, tokenize (texto/emotes/enlaces), insignias
src/sources/twitch-assets.js Emotes 7TV/BTTV/FFZ (canal + globales) e insignias (IVR), APIs públicas sin auth
src/sources/twitch-auth.js   Sesión opcional de Twitch: device code flow (cliente público), tokens cifrados, refresh, Helix
src/sources/twitch-eventsub.js EventSub por WebSocket: AutoMod (automod.message.hold/update v2) y aprobar/denegar
src/sources/kick.js          Conector de Kick: API pública del canal + Pusher (sin cuenta), 7TV, avisos
src/sources/kick-parse.js    Puro y testeado: normalizeKickChannel, parseKickContent ([emote:id:nombre]), insignias
ui/badges/kick/*.svg         Iconos propios de las insignias clásicas de Kick (vienen sin imagen)
src/sources/youtube.js       Conector de YouTube: busca el directo del canal y sondea el chat (sin cuenta ni claves)
src/sources/youtube-parse.js Puro y testeado: normalizeYoutubeTarget, parseLivePage, acciones del chat -> eventos
ui/badges/youtube/*.svg      Iconos propios: propietario, moderador, verificado (miembro = imagen del canal)
ui/chat.html/.css/.js     Render del chat propio (modo plataformas). En la app y, servido por HTTP, en OBS
src/obs-server.js         Servidor local para OBS (127.0.0.1 + clave): página /obs, ficheros del chat y datos por SSE
ui/obs.html, ui/obs.js    Página de OBS: reproduce la ventana (marco, tamaño, zoom) y la escala a la fuente
ui/obs-bridge.js          En OBS crea window.shurikenChat con los datos del servidor (en la app no hace nada)
ui/settings.html/.css/.js Ventana "Configuración…": formulario, importar URL de SSN, vista previa en vivo
ui/frame.html             Marco de la ventana del chat (borde, fondo chroma, esquinas); estilo inyectado con frameCss()
ui/welcome.html           Se muestra en la vista del chat si aún no hay sesión
assets/icon.svg           Icono fuente; assets/icons/*.png|ico para ventana, bandeja y empaquetado
scripts/start.js          Lanzador de `npm start` (quita ELECTRON_RUN_AS_NODE)
test/config.test.js       Tests de config (node --test)
```

## Arquitectura

- **Ventana chat = marco + vista**: la `BrowserWindow` carga `ui/frame.html` (borde, fondo, esquinas redondeadas) y SSN va en un `WebContentsView` hijo, desplazado `inset = borderWidth + margin` px y con `setBorderRadius(radius - inset)` (esquinas concéntricas). Así SSN ve un viewport del tamaño real y sus maquetaciones (scroll en documento o en `#output` con `fadedtop`, alturas en `100vh`) no se rompen; un margen hecho con CSS dentro de SSN cortaría mensajes. `layoutChat()` recoloca la vista en cada `resize` y al cambiar ajustes. Ambos webContents usan `preload-chat.js`; el estado `edges` dice a cada uno si detecta bordes de redimensión (el marco siempre; la vista solo si `inset < 6`). La vista no se destruye sola: se cierra en `closed`.
- **Fondo**: con chroma, el color lo pinta el marco (cubre también el margen) y la página de SSN se fuerza transparente para no sumar dos capas semitransparentes. El parámetro `chroma` se sigue poniendo en la URL (sirve para usar la URL generada en OBS).
- **Ventana chat (opciones)**: `frame:false`, `transparent:true`, `backgroundColor:#00000000`, `backgroundThrottling:false`, `sandbox:true`, `contextIsolation:true`, `nodeIntegrationInSubFrames:true` (para que el preload también corra en iframes). Título fijo "Shuriken Chat" (se bloquea `page-title-updated`).
- **CSS** de la página y del marco: `insertCSS` en cada `dom-ready` (`replaceCss`, una clave por webContents); al cambiar ajustes se hace `removeInsertedCSS` + `insertCSS`, sin recargar. Si cambia la URL → `loadURL`.
- **Arrastre/redimensión**: el preload envía `shuriken:drag-start` (dirección o null) y `drag-end`; el main sigue el cursor con `screen.getCursorScreenPoint()` cada 16 ms y hace `setPosition`/`setBounds`. Requiere X11 (ver abajo). Alt+arrastrar funciona sobre enlaces/botones.
- **IPC**: el main comprueba `event.sender` (chat vs ajustes). La web remota solo puede: `shuriken:menu`, `drag-start`, `drag-end`, `page-state`. Los comandos de ajustes (`get_settings`, `preview_settings`, `save_settings`, `revert_settings`) solo se aceptan desde la ventana de ajustes. **Al añadir un comando**: registrarlo en `registerIpc()` y, si es de ajustes, en la lista blanca de `preload-settings.js`.
- **Ajustes**: `preview_settings` aplica sin guardar; `save_settings` guarda; cerrar la ventana de ajustes vuelve a lo que hay en disco.
- **Menú contextual** (nativo): Configuración…, Zoom, Siempre visible, Chat para OBS, Bloquear posición y tamaño, Atravesar clics, Limpiar chat, Recargar, Salir.
- **Limpiar chat** (`clearChat`): en modo plataformas, `sources.clearAll()` emite `{type:"clear-all"}` (vacía el backlog y llega a la app y a OBS; los canales siguen conectados y su estado se conserva). En modo SSN no se puede vaciar el dock desde fuera: se recarga la vista y se envía `reload` a OBS para recargar su iframe.
- **Botones de la ventana** (arriba a la izquierda, los pinta el preload en la vista del chat: valen en modo plataformas y SSN): 📌 Siempre visible y 📡 Chat para OBS. **Solo aparecen con el ratón encima** (son controles, no parte del chat: así no salen en el directo y la ventana sigue igual que OBS). Atenuados si la opción está desactivada; tooltip con el estado. Se ocultan con "atravesar clics". Estado vía `pageState().toolbar`; clic → IPC `shuriken:toggle` (solo desde la vista del chat, frame principal). `setAlwaysOnTop` y `setObsEnabled` se aplican y guardan al momento (también desde Configuración → Ventana y el menú). **Bandeja**: Mostrar/ocultar, Atravesar clics (única forma de desactivarlo sin reiniciar), Configuración…, Salir.
- **Config** en `~/.config/shuriken-chat/config.json` (`%APPDATA%` en Windows). `userData` de Chromium se fija en esa misma carpeta (si no, sería "~/.config/Shuriken Chat").
  - `appearance`: lo que va a la URL (session, ln, scale, sidepadding, chroma RGBA hex, darkmode, bubble, textglow, randomcolor, fadedtop, hidemenu, extraParams) + marco (margin=10, borderWidth=1, borderColor RGBA hex, cornerRadius=10). Defaults = config elegida por el usuario: sidePadding 0, useChroma true con chroma 00000066, borde 1 px ffffff66 + CSS (transparentBg, opacity, hideScrollbar, customCss).
  - `hideMenu` (true por defecto) añade `&hidemenu`: SSN solo oculta su barra de controles sola dentro de OBS.
  - `system`: `nativeWayland` (false por defecto) y `compatRendering` (`app.disableHardwareAcceleration()`). Requieren reinicio.
  - `window`: x, y, width, height (DIP), zoom, alwaysOnTop, locked. `persistWindow()` **solo** sobrescribe la sección `window` en disco, para no guardar ajustes que se están previsualizando.
  - "Atravesar clics" **no se persiste** a propósito (evita quedar atrapado).
- **Sin cámara/micro (requisito del usuario)**: el preload ejecuta en el mundo de la página (`contextBridge.executeInMainWorld`) un bloqueo de `enumerateDevices` (→ []), `getUserMedia` y `getDisplayMedia` (→ NotAllowedError). Usa propiedades con getter + setter vacío: **SSN reasigna `getUserMedia`**, y con `writable:false` lanzaba un TypeError. Además el main deniega permisos (lista blanca: solo `clipboard-sanitized-write`).
- Los enlaces de los mensajes se abren en el navegador del sistema (`setWindowOpenHandler` + `will-navigate` a otro origen).
- Instancia única (`requestSingleInstanceLock`).
- **Medidas al redimensionar**: en cada `resize` el main envía `shuriken:size` (`getContentSize`, las mismas medidas que la tabla de OBS) a la vista del chat; el preload pinta una etiqueta centrada (estilos por CSSOM, valen con la CSP de SSN) que desaparece 1 s después. No sale en OBS.

## Chat propio (modo plataformas)

- Los conectores corren en el **proceso principal** (Node 24 de Electron: `WebSocket` y `fetch` globales; sin CORS) y emiten eventos normalizados. `main.js` los reenvía a la vista del chat (`shuriken:chat-event`); al cargar la página se mandan el estilo (`shuriken:chat-style`) y el backlog (`shuriken:chat-backlog`). El puente `window.shurikenChat` solo se expone en `ui/chat.html` (nunca en la web de SSN).
- **Seguridad del render**: todo lo que escriben los usuarios se inserta con `textContent`/nodos de texto, nunca `innerHTML`. Enlaces e imágenes solo http(s). CSP estricta en chat.html.
- **Twitch**: lectura anónima, sin cuenta ni claves. Emotes nativos (incluidos los de suscriptor del canal) por posición del tag `emotes` — **posiciones en caracteres Unicode, no UTF-16** (`Array.from`). Emotes de terceros por palabra: prioridad canal > global y 7TV > BTTV > FFZ. Zero-width: 7TV `flags & 1` o `data.flags & 256`; BTTV lista fija; FFZ `modifier`. Insignias con imágenes oficiales vía `api.ivr.fi/v2/twitch/badges/{global,channel?login=}`. El `room-id` (de ROOMSTATE) dispara la carga de emotes/insignias del canal.
- Los mensajes de cada canal se **encolan hasta que sus emotes están cargados** (máx. 4 s, `whenReady`) para que los primeros no salgan sin emotes; borrados/baneos van por la misma cola para no adelantarse.
- Eventos soportados: mensajes, /me, respuestas, primer mensaje, mensajes destacados, subs/regalos/raids/anuncios (USERNOTICE), borrado de mensaje (CLEARMSG), baneo/timeout (CLEARCHAT con usuario) y vaciado del chat.
- Opciones de Configuración que usa el render propio: darkMode, bubble, textGlow, randomColor, fadedTop, scale, sidePadding (+ el CSS común: transparencia, opacidad, CSS personalizado). Las exclusivas de SSN (sesión, idioma, hideMenu, extraParams, baseUrl, URL generada) se ocultan en modo plataformas (`.ssn-only`).
- `sources.mode` por defecto: "native", salvo que ya haya sesión de SSN (así quien actualiza no ve cambios).
- **Twitch no avisa si un canal no existe** (ni error ni JOIN): si no confirma la unión en 8 s (`JOIN_TIMEOUT_MS`) se emite un estado `error`. Al añadir un canal en Configuración se comprueba con IVR (`check_twitch_channel` → `lookupChannel`): rojo si no existe, punto rojo si está en directo.
- **Indicador de plataformas** (`#platforms` en chat.html, arriba a la derecha; sale también en OBS): un icono por plataforma con canales configurados (`style.channels`), altura 0,75em (≤ una letra del chat, escala con el texto) y punto con el peor estado de sus canales (`SEVERITY`: error 🔴 > desconectado/conectando 🟡 > sin directo ⚪ > conectado 🟢). Tooltip CSS (`:hover`) con el estado de cada canal. Sin canales de una plataforma, no hay icono.
- **El estado de conexión solo se muestra en los iconos de arriba** (y su tooltip). Ya no hay avisos de estado entre los mensajes ni panel de "esperando mensajes" (se quitaron por redundantes). `SourceManager.snapshot()` sigue incluyendo el último estado de cada canal para reenviarlo al recargar. Sin canales configurados se mantiene el aviso `#empty` ("clic derecho → Configuración…"), porque entonces no hay iconos.
- `twoLines` (true por defecto): texto debajo del nombre. En el chat propio es la clase `twolines`; en SSN añade `&twolines`. Al importar una URL de SSN sin ese parámetro se conserva la preferencia (igual que `hideMenu`).
- `showPlatform` (true por defecto): icono de la plataforma delante del nombre (`ui/platforms/<plataforma>.svg`, mapa `PLATFORMS` en chat.js). Se oculta con la clase `noplatform` sin volver a pintar. En SSN, si es false se añade `&hidesource` (SSN muestra los iconos de origen por defecto). **Al añadir una plataforma**: su SVG en `ui/platforms/` y su entrada en `PLATFORMS`.
- En modo SSN, cambiar opciones que van en la URL recarga el dock y **SSN pierde los mensajes** (no tiene historial): es inevitable. En modo plataformas el aspecto se aplica sin recargar (comprobado).

## OBS (fuente de navegador)

- **Requisito del usuario: en OBS se ve EXACTAMENTE igual que la ventana de la app** (en cualquier modo, también SSN), porque la app también sale en directo cuando se muestra el escritorio. Nada de versiones "parecidas": OBS carga **los mismos ficheros** del chat.
- `src/obs-server.js`: servidor HTTP de Node **solo en 127.0.0.1**, puerto `cfg.obs.port` (8187), clave aleatoria `cfg.obs.key` (se crea al arrancar y se guarda con `persistObsKey`; botón "Cambiar la clave"). `/obs` y `/events` exigen `?k=`; los demás ficheros, solo los de la lista blanca `STATIC` de `ui/` (nada fuera de ui/).
- `/events` es SSE: al conectar envía `layout`, `style`, `pagecss` y `backlog` (snapshot) y después `event` (cada evento del chat), y cambios de `layout`/`style`/`pagecss` (`obs.broadcast`). `pushObsLayout()` se llama al redimensionar (máx. 10/s), cambiar zoom, marco o fuente.
- `ui/obs.js` coloca un "escenario" del tamaño de la ventana (`getContentSize`) con el marco (`.frame`, `frameCss(a, ".frame")`: en OBS la opacidad va solo al marco para no multiplicarla con la del chat, que va dentro) y la vista del chat en un iframe desplazado `inset` con `innerRadius`. El zoom de la app = iframe de `tamaño/zoom` con `scale(zoom)`. Todo se escala con `scale(min(ancho/w, alto/h))` para llenar la fuente sin deformarse.
- Contenido del iframe (`obsSource()`): modo plataformas → `chat.html?k=` (mismo chat.js/chat.css; `obs-bridge.js` crea `window.shurikenChat` con SSE). Modo SSN → la URL de SSN + `&b64css=` (base64 de `encodeURIComponent(pageCss)`: SSN lo aplica; en un iframe de otro dominio no se puede inyectar CSS). Sin sesión → welcome.html. En SSN, cambiar el CSS recarga el iframe de OBS.
- **Trampa resuelta**: el servidor manda el estado inicial al instante y llega ANTES de que `chat.js` termine de descargarse → se perdía. `obs-bridge.js` guarda lo recibido y lo entrega al registrarse cada receptor (los mensajes, siempre después del historial).
- **Tabla de escalado** (Configuración → OBS → "Tamaño y posición según el lienzo de OBS"): `obs_info` devuelve la pantalla donde está la ventana (`screen.getDisplayMatching`) en píxeles reales (× `scaleFactor`) con el tamaño y la posición de la ventana. Para cada lienzo habitual (720/1080/1440/2160, 16:9) la escala es `altoLienzo / altoPantalla` (por la altura, para que valga con pantallas ultrapanorámicas). Se marca la fila de la pantalla actual y se refresca cada 1,5 s.
- En OBS no hay interacción (sin preload): los avisos del AutoMod se ven igual que en la app (plegados), sin botones activos.

## Kick

- **Sin cuenta y sin servidores**, como el modo WebSocket de SSN. La API oficial de Kick entrega el chat por webhooks (necesitaría un servidor): descartada porque el usuario quiere una app sin dependencias externas.
- Datos del canal: `GET kick.com/api/v2/channels/<slug>` (fetch normal de Node, sin cabeceras especiales) → `id` (canal), `chatroom.id`, `user_id`, `subscriber_badges`, `livestream`. 404 = no existe (se avisa al momento). En la URL los `_` del usuario son `-` (`normalizeKickChannel`).
- Tiempo real: Pusher `wss://ws-us2.pusher.com/app/34bf7a0ff419a2a775b9` (clave y clúster que usa SSN; las antiguas `eb1d5f…` y `32cbd6…` ya no valen). Canales públicos `chatrooms.<chatroomId>.v2`, `channel.<channelId>` y `channel_<channelId>` (auth vacío). Ping de Pusher según `activity_timeout`.
- Eventos: `App\Events\ChatMessageEvent` (type `message`/`reply`, emotes en el texto como `[emote:ID:nombre]` → `files.kick.com/emotes/ID/fullsize`), `MessageDeletedEvent` (`message.id`), baneos, `ChatroomClearEvent`, subs, subs regaladas, raids/hosts y KICKs. Kick no documenta los eventos poco frecuentes: se extraen con `pick()` probando varias rutas (como hace SSN).
- Insignias: `identity.badges` (clásicas sin imagen → iconos propios; suscriptor → imagen del canal según meses) + `identity.badges_v2` con `selected` (imagen propia de Kick, p. ej. niveles).
- 7TV funciona con Kick por **user_id** (`7tv.io/v3/users/kick/<user_id>`), no por id de canal.
- **Permisos de Claude Code**: el clasificador bloqueó probar Kick (lo consideró acceso a terceros). El usuario añadió reglas en `.claude/settings.local.json` (no se sube): scripts `node …/scratchpad/kick*`, `npm start`, `npm test` y `env -u ELECTRON_RUN_AS_NODE node_modules/electron/dist/electron *`. Para pruebas de la app, que el script fije `XDG_CONFIG_HOME` él mismo (así el comando encaja con la regla).

## YouTube

- **Sin cuenta ni claves**, como la web de YouTube (la API oficial tiene cuota diaria: descartada). El chat va ligado a cada **directo**, no al canal: el usuario escribe `@canal` (o URL de canal / de un directo) y la app busca el directo activo.
- Objetivos (`normalizeYoutubeTarget`): `@handle` (minúsculas), `channel/UC…` o `v:VIDEOID`. Se guardan así en `sources.youtube.channels`.
- Flujo (`YoutubeTarget`): `GET youtube.com/<objetivo>/live` (o `watch?v=`) → de la página: `<link rel="canonical" …watch?v=ID>`, `"isLive":true`, `INNERTUBE_CLIENT_VERSION` y la continuación de `liveChatRenderer`. Luego `POST youtubei/v1/live_chat/get_live_chat` con `{context:{client:{clientName:"WEB", clientVersion}}, continuation}`. La primera respuesta es el chat **destacado**: se cambia a "Chat en directo" con la continuación del `viewSelector` (`allMessagesContinuation`). Sondeo cada 3 s (o `timedContinuationData.timeoutMs`).
- **No se falsifica el User-Agent**: `youtube.com/live_chat` sin cabecera de navegador responde "navegador antiguo", por eso se usa la página del directo (que sí carga) + la API interna con JSON normal. El clasificador de permisos considera eludir protecciones falsificar cabeceras de navegador: no hacerlo.
- Sin directo: estado `offline` ("se conectará solo cuando empiece") y se vuelve a mirar cada 60 s. Si el chat deja de dar continuación, el directo ha terminado → vuelta a esperar. Los ids ya emitidos se recuerdan (`seen`) porque la primera respuesta repite mensajes recientes.
- Acciones: `liveChatTextMessageRenderer` (emojis normales como carácter; personalizados `isCustomEmoji` como imagen), Super Chat (`liveChatPaidMessageRenderer`, color ARGB → `--notice`), Super Sticker, miembros e hitos (`liveChatMembershipItemRenderer`), subs regaladas (`…GiftPurchaseAnnouncementRenderer` / `…GiftRedemption…`), regalos (`giftMessageViewModel`), borrados (`removeChatItemAction` / `markChatItemAsDeletedAction`), por autor (`…ByAuthor…` → `clear-user`), `replaceChatItemAction`. YouTube no tiene colores de usuario: color por hash.
- Insignias: `authorBadges[].liveChatAuthorBadgeRenderer`: `icon.iconType` OWNER / MODERATOR / VERIFIED → iconos propios; `customThumbnail` = insignia de miembro del canal.

## Sesión de Twitch y AutoMod (opcional)

- **Dos formas de conectar Twitch** (`sources.twitch.useAccount`): **con mi cuenta** → el canal es el del usuario que inicia sesión (automático) y hay AutoMod; **sin cuenta** → canales escritos a mano, solo lectura, sin AutoMod. Los canales efectivos los calcula `SourceManager.twitchChannels(sources)` (úsalo siempre, no `sources.twitch.channels` directamente). Por defecto: con cuenta, salvo que ya hubiera canales escritos. La sesión y la lista se conservan al alternar. Al iniciar/cerrar sesión se reaplica la config y se reenvía el estilo al chat.
- Leer el chat sigue siendo **anónimo** también con cuenta (IRC justinfan). La sesión solo hace falta para lo que Twitch no muestra a los espectadores: de momento, **mensajes retenidos por el AutoMod** (solo los ven el dueño del canal y sus moderadores).
- **Inicio de sesión**: device code grant flow con app de tipo **Público** (sin secreto). `POST id.twitch.tv/oauth2/device` (parámetro `scopes`, en plural) → el usuario entra en `verification_uri` (lleva el código; se abre con `shell.openExternal`) → se sondea `oauth2/token` con `grant_type=urn:ietf:params:oauth:grant-type:device_code`. Access token 4 h; el refresh token de clientes públicos es **de un solo uso** y caduca a los 30 días sin uso. Scope actual: `moderator:manage:automod` (añadir scopes obliga a volver a iniciar sesión).
- **Client ID**: público (se puede incluir en el código). `DEFAULT_CLIENT_ID` en twitch-auth.js (app registrada por el usuario: `ydsw4s6rvi9qild7izjdryl3zvtdb6`); se puede sobrescribir en Configuración (`sources.twitch.clientId`). Registrar la app exige 2FA en la cuenta de Twitch.
- **Tokens**: en `twitch-auth.json` (NO en config.json), cifrados con `safeStorage` **asíncrono** (`encryptStringAsync` / `decryptStringAsync` / `isAsyncEncryptionAvailable`; las versiones síncronas están obsoletas en Electron 45). En la máquina del usuario: kwallet6. Sin llavero: en claro con permisos 600. Cerrar sesión borra el fichero y revoca el token. La carga es asíncrona: `auth.ready`, y al terminar se emite `change` (el SourceManager se reaplica solo).
- **Trampa**: `decryptStringAsync` **NO descifra** lo cifrado con el antiguo `encryptString` (comprobado con kwallet6, aunque la documentación diga que sí). `load()` hace una migración de una vez: si falla el asíncrono, lee con `decryptString` y re-cifra con el asíncrono (el aviso de obsolescencia sale solo esa vez).
- **EventSub**: `wss://eventsub.wss.twitch.tv/ws`; tras `session_welcome` hay 10 s para suscribirse (`POST helix/eventsub/subscriptions`, transport websocket + session_id). Suscripciones `automod.message.hold` y `automod.message.update` versión 2 por canal (`broadcaster_user_id` + `moderator_user_id` = el usuario). 403 = no es moderador de ese canal (se muestra en Configuración). `session_reconnect`: conectar a `reconnect_url` y cerrar el viejo tras el welcome (las suscripciones se conservan).
- **Aprobar/denegar**: `POST helix/moderation/automod/message` `{user_id, msg_id, action: ALLOW|DENY}` → 204. Desde el chat por `window.shurikenChat.automod(id, allow)` → IPC `shuriken:automod`, que el main **solo acepta desde ui/chat.html** en modo plataformas (nunca desde la web de SSN).
- **Render**: el mensaje retenido NO se muestra; solo un aviso. Con el ratón encima se despliega (motivo, texto, botones) y el autoscroll se pausa (`hoverPause`). Al resolverse (`automod-update`) queda un aviso 20 s. Si se aprueba, el mensaje llega además por IRC como uno normal.

## Trampas conocidas (ya resueltas, no reintroducir)

- **X11 en Wayland**: Chromium elige la plataforma ANTES de ejecutar main.js. `app.commandLine.appendSwitch("ozone-platform","x11")` hace que el proceso de GPU se caiga 3 veces y todo vaya por software; `ozone-platform-hint` puesto así no tiene efecto. Solución: `relaunchWithX11IfNeeded()` relanza el ejecutable con `--ozone-platform=x11` (en AppImage relanza `$APPIMAGE`, porque el montaje desaparece al salir) y sale. **Electron rellena él mismo el switch con "wayland"**: comprobar el valor (`getSwitchValue`), no `hasSwitch`. `SHURIKEN_RELAUNCHED` evita bucles.
- **`ELECTRON_RUN_AS_NODE=1`** lo define la terminal de VS Code y convierte Electron en Node: `scripts/start.js` lo quita. Al lanzar el binario a mano usar `env -u ELECTRON_RUN_AS_NODE`.
- **`webContents.executeJavaScript` espera a que la página termine de cargar**, y SSN nunca termina (conexiones abiertas): usar `webContents.mainFrame.executeJavaScript`.
- npm 12 bloquea scripts de instalación: `electron-winstaller` está denegado (solo Windows); el binario de Electron sí se descarga.
- Al hacer `pkill` en pruebas, matar primero el proceso principal; si se matan antes los hijos sale un falso "GPU process isn't usable". Usar patrones tipo `[s]huriken-chat/...` para que `pkill -f` no se mate a sí mismo.
- **Registro de Chromium silenciado**: `--log-level=3` (solo fatales) salvo con `SHURIKEN_DEBUG=1`. **Como `--ozone-platform`, solo funciona en la línea de comandos real**: con `appendSwitch` (aunque lo reciban los procesos hijos) el aviso sigue saliendo, y con `--enable-logging` es peor (comprobado). Por eso lo añade `quietArgs()` al relanzar con X11 y `scripts/start.js` al lanzar `npm start`. Oculta avisos inofensivos como `GetVSyncParametersIfAvailable() failed` (XWayland no da la sincronía de la pantalla; Chromium usa 60 Hz), `atom_cache ... kAtomsToCache` y "Wake lock request failed" de SSN. Los `console.*` propios de la app (`[shuriken] …`) se siguen viendo. **El aviso de VSync es intermitente**: para comprobar que no sale, repetir varias ejecuciones de ≥30 s.

## Comandos

```sh
npm install
npm start                     # ejecutar (relanza en X11 si hay Wayland)
SHURIKEN_DEBUG=1 npm start    # consola de la página + diagnóstico (webrtc, dispositivos, cámara)
npm test                      # tests de config
npm run build                 # AppImage + deb + rpm + pacman en dist/ + SHA256SUMS.txt
npm run build -- appimage     # solo AppImage (o deb, rpm, pacman)
```

Para probar sin tocar la config del usuario: `XDG_CONFIG_HOME=<dir temporal> npm start`.

## Estado actual

- 🚧 Rama `packaging` (v0.6.1): AppImage + .deb + .rpm + .pacman. Revisados por dentro los cuatro; el .pacman instalado y probado por el usuario (arranca). Pendiente: PR y release con los cuatro paquetes. Flathub aparcado (ver "Empaquetado").
- ✅ v0.6.0 (OBS) fusionada y publicada.

- 🚧 Rama `obs` (v0.6.0): chat para OBS idéntico a la app. Probado: app y vista de OBS lado a lado (mismos mensajes, maquetación, marco y zoom, escalado ×1,48), modo SSN (URL con b64css), sección OBS en Configuración. Pendiente: que el usuario lo pruebe en OBS de verdad, PR y release.
- ✅ v0.5.0 (YouTube) fusionada y publicada.
- ✅ v0.4.0 (Kick) fusionada y publicada.
- ✅ v0.3.0 (Twitch) fusionada y publicada como release en el Forgejo (`fj release create`; `fj release view` busca por nombre, no por etiqueta).
- 🚧 AutoMod con sesión: hecho y probado sin sesión (render, hover, errores, tests). Client ID incluido; Twitch acepta el inicio del flujo. Pendiente: que el usuario inicie sesión y lo pruebe con un mensaje retenido real. La app está registrada como **Público** (comprobado en la consola; la `verification_uri` devuelta no lleva `public=true` aunque el ejemplo de la documentación sí, y es normal).
- 🚧 Rama `twitch` (v0.3.0): chat propio con Twitch. Probado en vivo con canales reales (mensajes, colores, insignias, emotes 7TV, añadir canal desde Configuración, canal inexistente, cambios de aspecto sin perder mensajes). Pendiente: que el usuario lo pruebe con su canal, fusionar en master y publicar release (falta saber cómo publicar en su Gitea: token o `tea`).
- ✅ master (v0.2.0): modo SSN sobre Electron, ya publicado en `origin`.
- `src-tauri/` se queda en el repo (el usuario dijo que da igual).

## Privacidad

El `session=` de SSN actúa como contraseña del chat del usuario: no escribirlo en el código, commits, tests ni documentación. En pruebas automáticas usar una sesión inventada.
