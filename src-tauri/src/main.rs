#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;

use config::{Config, UserSettings};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Manager, PhysicalPosition, PhysicalSize, RunEvent, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent, Wry,
};
use tauri_runtime::ResizeDirection;

const CHAT: &str = "chat";
const SETTINGS: &str = "settings";
const INJECT_JS: &str = include_str!("inject.js");
const NO_MEDIA_JS: &str = include_str!("no_media.js");

const ZOOM_STEP: f64 = 0.1;
const ZOOM_MIN: f64 = 0.3;
const ZOOM_MAX: f64 = 3.0;

struct AppState {
    cfg: Mutex<Config>,
    /// URL cargada actualmente en la ventana del chat.
    current_url: Mutex<Option<String>>,
    /// "Atravesar clics" no se guarda: así un reinicio siempre lo desactiva.
    click_through: Mutex<bool>,
}

#[derive(Serialize)]
struct PageState {
    css: String,
    locked: bool,
}

type CmdResult<T = ()> = Result<T, String>;

fn err<E: ToString>(e: E) -> String {
    e.to_string()
}

fn st(app: &AppHandle) -> tauri::State<'_, AppState> {
    app.state::<AppState>()
}

fn cfg(app: &AppHandle) -> Config {
    with_cfg(app, |c| c.clone())
}

/// Ejecuta `f` con la configuración bloqueada para modificarla.
fn with_cfg<R>(app: &AppHandle, f: impl FnOnce(&mut Config) -> R) -> R {
    let state = st(app);
    let mut guard = state.cfg.lock().unwrap();
    f(&mut guard)
}

fn click_through(app: &AppHandle) -> bool {
    let state = st(app);
    let v = *state.click_through.lock().unwrap();
    v
}

fn chat_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(CHAT)
}

// ---------------------------------------------------------------------------
// Comandos llamados desde las páginas
// ---------------------------------------------------------------------------

#[tauri::command]
fn show_menu(app: AppHandle, window: tauri::Window) -> CmdResult {
    let menu = context_menu(&app).map_err(err)?;
    window.popup_menu(&menu).map_err(err)
}

#[tauri::command]
fn start_drag(app: AppHandle, window: tauri::Window) -> CmdResult {
    if cfg(&app).window.locked {
        return Ok(());
    }
    window.start_dragging().map_err(err)
}

#[tauri::command]
fn start_resize(app: AppHandle, window: tauri::Window, direction: String) -> CmdResult {
    if cfg(&app).window.locked {
        return Ok(());
    }
    let dir = match direction.as_str() {
        "North" => ResizeDirection::North,
        "South" => ResizeDirection::South,
        "East" => ResizeDirection::East,
        "West" => ResizeDirection::West,
        "NorthEast" => ResizeDirection::NorthEast,
        "NorthWest" => ResizeDirection::NorthWest,
        "SouthEast" => ResizeDirection::SouthEast,
        "SouthWest" => ResizeDirection::SouthWest,
        other => return Err(format!("dirección no válida: {other}")),
    };
    window.start_resize_dragging(dir).map_err(err)
}

#[tauri::command]
fn page_ready(app: AppHandle) -> PageState {
    page_state(&cfg(&app))
}

#[derive(Serialize)]
struct SettingsView {
    #[serde(flatten)]
    settings: UserSettings,
    url: Option<String>,
}

#[tauri::command]
fn get_settings(app: AppHandle) -> SettingsView {
    let c = cfg(&app);
    SettingsView {
        url: c.appearance.chat_url(),
        settings: c.user_settings(),
    }
}

/// Aplica los ajustes en vivo, sin guardarlos. Devuelve la URL resultante.
#[tauri::command]
fn preview_settings(app: AppHandle, settings: UserSettings) -> CmdResult<Option<String>> {
    apply_settings(&app, settings)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: UserSettings) -> CmdResult<Option<String>> {
    let url = apply_settings(&app, settings)?;
    cfg(&app).save().map_err(err)?;
    Ok(url)
}

/// Descarta los cambios no guardados y vuelve a lo que hay en disco.
#[tauri::command]
fn revert_settings(app: AppHandle) -> CmdResult<SettingsView> {
    let disk = Config::load();
    apply_settings(&app, disk.user_settings())?;
    Ok(get_settings(app))
}

// ---------------------------------------------------------------------------
// Aplicar configuración a la ventana del chat
// ---------------------------------------------------------------------------

fn page_state(c: &Config) -> PageState {
    PageState {
        css: c.appearance.page_css(),
        locked: c.window.locked,
    }
}

fn push_page_state(app: &AppHandle) {
    if let Some(win) = chat_window(app) {
        let state = serde_json::to_string(&page_state(&cfg(app))).unwrap_or_default();
        let _ = win.eval(format!(
            "window.__shuriken && window.__shuriken.update({state});"
        ));
    }
}

fn apply_settings(app: &AppHandle, settings: UserSettings) -> CmdResult<Option<String>> {
    let url = settings.appearance.chat_url();
    with_cfg(app, |c| {
        c.appearance = settings.appearance;
        c.system = settings.system;
    });
    if let (Some(win), Some(new_url)) = (chat_window(app), url.clone()) {
        let state = st(app);
        let mut current = state.current_url.lock().unwrap();
        if current.as_deref() != Some(new_url.as_str()) {
            win.navigate(new_url.parse().map_err(err)?).map_err(err)?;
            *current = Some(new_url);
        }
    }
    push_page_state(app);
    Ok(url)
}

/// Guarda solo el estado de la ventana, sin tocar ajustes de aspecto
/// que se estén previsualizando sin guardar.
fn persist_window(app: &AppHandle) {
    let mut disk = Config::load();
    disk.window = cfg(app).window;
    if let Err(e) = disk.save() {
        eprintln!("[shuriken] no se pudo guardar la configuración: {e}");
    }
}

fn set_zoom(app: &AppHandle, zoom: f64) {
    let zoom = (zoom.clamp(ZOOM_MIN, ZOOM_MAX) * 100.0).round() / 100.0;
    with_cfg(app, |c| c.window.zoom = zoom);
    if let Some(win) = chat_window(app) {
        let _ = win.set_zoom(zoom);
    }
    persist_window(app);
}

fn set_click_through(app: &AppHandle, value: bool) {
    {
        let state = st(app);
        *state.click_through.lock().unwrap() = value;
    }
    if let Some(win) = chat_window(app) {
        let _ = win.set_ignore_cursor_events(value);
    }
}

// ---------------------------------------------------------------------------
// Menús
// ---------------------------------------------------------------------------

fn context_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let c = cfg(app);
    let click_through = click_through(app);
    let pct = (c.window.zoom * 100.0).round();

    let zoom = Submenu::with_items(
        app,
        format!("Zoom ({pct}%)"),
        true,
        &[
            &MenuItem::with_id(app, "zoom_in", "Acercar  (+10%)", true, None::<&str>)?,
            &MenuItem::with_id(app, "zoom_out", "Alejar  (−10%)", true, None::<&str>)?,
            &MenuItem::with_id(app, "zoom_reset", "Restablecer (100%)", true, None::<&str>)?,
        ],
    )?;

    Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "settings", "Apariencia…", true, None::<&str>)?,
            &zoom,
            &PredefinedMenuItem::separator(app)?,
            &CheckMenuItem::with_id(app, "on_top", "Siempre visible", true, c.window.always_on_top, None::<&str>)?,
            &CheckMenuItem::with_id(app, "locked", "Bloquear posición y tamaño", true, c.window.locked, None::<&str>)?,
            &CheckMenuItem::with_id(
                app,
                "click_through",
                "Atravesar clics (se desactiva desde la bandeja)",
                true,
                click_through,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "reload", "Recargar chat", true, None::<&str>)?,
            &MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?,
        ],
    )
}

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "toggle_visible", "Mostrar / ocultar chat", true, None::<&str>)?,
            &MenuItem::with_id(app, "toggle_click_through", "Activar / desactivar atravesar clics", true, None::<&str>)?,
            &MenuItem::with_id(app, "settings", "Apariencia…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?,
        ],
    )?;
    let mut tray = TrayIconBuilder::with_id("shuriken-tray")
        .tooltip("Shuriken Chat")
        .menu(&menu);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn handle_menu(app: &AppHandle, id: &str) {
    match id {
        "settings" => open_settings(app),
        "zoom_in" => set_zoom(app, cfg(app).window.zoom + ZOOM_STEP),
        "zoom_out" => set_zoom(app, cfg(app).window.zoom - ZOOM_STEP),
        "zoom_reset" => set_zoom(app, 1.0),
        "on_top" => {
            let v = with_cfg(app, |c| {
                c.window.always_on_top = !c.window.always_on_top;
                c.window.always_on_top
            });
            if let Some(win) = chat_window(app) {
                let _ = win.set_always_on_top(v);
            }
            persist_window(app);
        }
        "locked" => {
            with_cfg(app, |c| c.window.locked = !c.window.locked);
            push_page_state(app);
            persist_window(app);
        }
        "click_through" | "toggle_click_through" => {
            let v = !click_through(app);
            set_click_through(app, v);
        }
        "toggle_visible" => {
            if let Some(win) = chat_window(app) {
                if win.is_visible().unwrap_or(true) {
                    let _ = win.hide();
                } else {
                    let _ = win.show();
                }
            }
        }
        "reload" => {
            if let Some(win) = chat_window(app) {
                let _ = win.eval("location.reload()");
            }
        }
        "quit" => {
            persist_window(app);
            app.exit(0);
        }
        _ => {}
    }
}

// ---------------------------------------------------------------------------
// Ventanas
// ---------------------------------------------------------------------------

fn open_settings(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(SETTINGS) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let built = WebviewWindowBuilder::new(app, SETTINGS, WebviewUrl::App("settings.html".into()))
        .title("Shuriken Chat · Apariencia")
        .inner_size(560.0, 780.0)
        .min_inner_size(420.0, 400.0)
        .build();
    match built {
        Ok(w) => {
            // Si se cierra sin guardar, se descartan los cambios previsualizados.
            let handle = app.clone();
            w.on_window_event(move |e| {
                if let WindowEvent::Destroyed = e {
                    let _ = apply_settings(&handle, Config::load().user_settings());
                }
            });
        }
        Err(e) => eprintln!("[shuriken] no se pudo abrir la ventana de ajustes: {e}"),
    }
}

fn create_chat_window(app: &AppHandle) -> tauri::Result<()> {
    let c = cfg(app);
    let url = c.appearance.chat_url();
    let webview_url = match &url {
        Some(u) => WebviewUrl::External(u.parse().expect("URL de chat válida")),
        None => WebviewUrl::App("welcome.html".into()),
    };
    {
        let state = st(app);
        *state.current_url.lock().unwrap() = url;
    }

    let win = WebviewWindowBuilder::new(app, CHAT, webview_url)
        .title("Shuriken Chat")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(true)
        .always_on_top(c.window.always_on_top)
        .inner_size(420.0, 640.0)
        .min_inner_size(120.0, 80.0)
        .initialization_script_for_all_frames(NO_MEDIA_JS)
        .initialization_script(INJECT_JS)
        .build()?;

    // Restaurar geometría (en Wayland nativo la posición la decide el compositor).
    let _ = win.set_size(PhysicalSize::new(c.window.width.max(120), c.window.height.max(80)));
    if let (Some(x), Some(y)) = (c.window.x, c.window.y) {
        let _ = win.set_position(PhysicalPosition::new(x, y));
    }
    let _ = win.set_zoom(c.window.zoom);

    #[cfg(target_os = "linux")]
    enable_webrtc(&win);

    let handle = app.clone();
    win.on_window_event(move |e| match e {
        WindowEvent::Moved(p) => with_cfg(&handle, |c| {
            c.window.x = Some(p.x);
            c.window.y = Some(p.y);
        }),
        WindowEvent::Resized(s) if s.width > 0 && s.height > 0 => with_cfg(&handle, |c| {
            c.window.width = s.width;
            c.window.height = s.height;
        }),
        WindowEvent::CloseRequested { .. } => {
            persist_window(&handle);
            handle.exit(0);
        }
        _ => {}
    });
    Ok(())
}

/// WebKitGTK trae WebRTC desactivado por defecto, y SSN lo necesita
/// para recibir los mensajes vía VDO.Ninja (solo canal de datos).
/// Cámara, micrófono y captura de pantalla se deniegan siempre; además
/// `no_media.js` impide que las páginas siquiera enumeren dispositivos.
#[cfg(target_os = "linux")]
fn enable_webrtc(win: &WebviewWindow) {
    let _ = win.with_webview(|wv| {
        use webkit2gtk::glib::Cast;
        use webkit2gtk::{
            DeviceInfoPermissionRequest, PermissionRequestExt, SettingsExt,
            UserMediaPermissionRequest, WebViewExt,
        };
        let view = wv.inner();
        if let Some(settings) = view.settings() {
            settings.set_enable_webrtc(true);
        }
        view.connect_permission_request(|_, req| {
            if req.downcast_ref::<UserMediaPermissionRequest>().is_some()
                || req.downcast_ref::<DeviceInfoPermissionRequest>().is_some() {
                req.deny();
                return true;
            }
            false
        });
    });
}

fn main() {
    let config = Config::load();

    #[cfg(target_os = "linux")]
    {
        // Debe hacerse antes de inicializar GTK.
        if config.system.force_x11 && std::env::var_os("WAYLAND_DISPLAY").is_some() {
            std::env::set_var("GDK_BACKEND", "x11");
        }
        if config.system.compat_rendering {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    let first_run = config.appearance.session.trim().is_empty();

    tauri::Builder::default()
        .manage(AppState {
            cfg: Mutex::new(config),
            current_url: Mutex::new(None),
            click_through: Mutex::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            show_menu,
            start_drag,
            start_resize,
            page_ready,
            get_settings,
            preview_settings,
            save_settings,
            revert_settings,
        ])
        .on_menu_event(|app, event| handle_menu(app, event.id().as_ref()))
        .setup(move |app| {
            let handle = app.handle();
            create_chat_window(handle)?;
            if let Err(e) = create_tray(handle) {
                eprintln!("[shuriken] sin icono en la bandeja: {e}");
            }
            if first_run {
                open_settings(handle);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error al iniciar Shuriken Chat")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                persist_window(app);
            }
        });
}
