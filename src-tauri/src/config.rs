//! Configuración persistente de Shuriken Chat.
//!
//! Se guarda en `~/.config/shuriken-chat/config.json` (Linux)
//! o `%APPDATA%\shuriken-chat\config.json` (Windows).

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const DEFAULT_BASE_URL: &str = "https://socialstream.ninja/dock.html";

/// Aspecto del chat: casi todo se traduce a parámetros de la URL de SSN.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Appearance {
    pub base_url: String,
    pub session: String,
    pub language: String,
    pub scale: f64,
    pub side_padding: u32,
    pub use_chroma: bool,
    /// Color RGBA en hexadecimal sin `#` (p. ej. `00000066`).
    pub chroma: String,
    pub dark_mode: bool,
    pub bubble: bool,
    pub text_glow: bool,
    pub random_color: bool,
    pub faded_top: bool,
    /// Oculta la barra de controles del dock (SSN solo la oculta sola dentro de OBS).
    pub hide_menu: bool,
    /// Parámetros adicionales de SSN, tal cual: `a=1&b&c=texto`.
    pub extra_params: String,
    // --- Lo siguiente no va en la URL: se inyecta como CSS ---
    pub transparent_bg: bool,
    pub opacity: f64,
    pub hide_scrollbar: bool,
    pub custom_css: String,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            base_url: DEFAULT_BASE_URL.into(),
            session: String::new(),
            language: "es".into(),
            scale: 1.0,
            side_padding: 8,
            use_chroma: false,
            chroma: "00000066".into(),
            dark_mode: true,
            bubble: true,
            text_glow: false,
            random_color: true,
            faded_top: true,
            hide_menu: true,
            extra_params: String::new(),
            transparent_bg: true,
            opacity: 1.0,
            hide_scrollbar: true,
            custom_css: String::new(),
        }
    }
}

/// Opciones que requieren reiniciar la app.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct SystemOptions {
    /// En Wayland, ejecutar vía XWayland para poder fijar posición y "siempre visible".
    pub force_x11: bool,
    /// Desactiva el renderizado DMA-BUF de WebKitGTK (ventana en blanco con NVIDIA, etc.).
    pub compat_rendering: bool,
}

/// Estado de la ventana, gestionado desde el menú contextual.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct WindowState {
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub width: u32,
    pub height: u32,
    pub zoom: f64,
    pub always_on_top: bool,
    pub locked: bool,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            x: None,
            y: None,
            width: 420,
            height: 640,
            zoom: 1.0,
            always_on_top: true,
            locked: false,
        }
    }
}

/// Lo que edita la ventana de ajustes.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct UserSettings {
    pub appearance: Appearance,
    pub system: SystemOptions,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    pub appearance: Appearance,
    pub system: SystemOptions,
    pub window: WindowState,
}

fn config_path() -> PathBuf {
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
    };
    base.unwrap_or_else(|| PathBuf::from("."))
        .join("shuriken-chat")
        .join("config.json")
}

impl Config {
    pub fn load() -> Self {
        std::fs::read_to_string(config_path())
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self) -> std::io::Result<()> {
        let path = config_path();
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let json = serde_json::to_string_pretty(self).map_err(std::io::Error::other)?;
        std::fs::write(path, json)
    }

    pub fn user_settings(&self) -> UserSettings {
        UserSettings {
            appearance: self.appearance.clone(),
            system: self.system.clone(),
        }
    }
}

fn enc(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

fn fmt_num(n: f64) -> String {
    // 0.5 -> "0.5", 1.0 -> "1"
    let s = format!("{:.3}", n);
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

impl Appearance {
    /// URL completa del dock de SSN, o `None` si no hay sesión.
    pub fn chat_url(&self) -> Option<String> {
        let session = self.session.trim();
        if session.is_empty() {
            return None;
        }
        let base = match url::Url::parse(self.base_url.trim()) {
            Ok(u) if u.scheme() == "https" || u.scheme() == "http" => self.base_url.trim().to_string(),
            _ => DEFAULT_BASE_URL.to_string(),
        };

        let mut q: Vec<String> = vec![format!("session={}", enc(session))];
        if !self.language.trim().is_empty() {
            q.push(format!("ln={}", enc(self.language.trim())));
        }
        if (self.scale - 1.0).abs() > f64::EPSILON {
            q.push(format!("scale={}", fmt_num(self.scale)));
        }
        if self.random_color {
            q.push("randomcolor".into());
        }
        if self.faded_top {
            q.push("fadedtop".into());
        }
        if self.side_padding > 0 {
            q.push(format!("sidepadding={}", self.side_padding));
        }
        if self.text_glow {
            q.push("textglow".into());
        }
        if self.bubble {
            q.push("bubble".into());
        }
        if self.dark_mode {
            q.push("darkmode".into());
        }
        if self.hide_menu {
            q.push("hidemenu".into());
        }
        if self.use_chroma && !self.chroma.trim().is_empty() {
            q.push(format!("chroma={}", enc(self.chroma.trim().trim_start_matches('#'))));
        }
        for part in self.extra_params.split(['&', '\n']) {
            let part = part.trim().trim_start_matches('?');
            if !part.is_empty() {
                q.push(part.to_string());
            }
        }

        let sep = if base.contains('?') { '&' } else { '?' };
        Some(format!("{base}{sep}{}", q.join("&")))
    }

    /// CSS que inyectamos en la página del chat.
    pub fn page_css(&self) -> String {
        let mut css = String::new();
        if self.transparent_bg && !self.use_chroma {
            css.push_str(
                "html,body{background:transparent!important;background-color:transparent!important;}\n",
            );
        }
        if self.opacity < 0.999 {
            css.push_str(&format!("html{{opacity:{:.2};}}\n", self.opacity.clamp(0.1, 1.0)));
        }
        if self.hide_scrollbar {
            css.push_str("::-webkit-scrollbar{display:none!important;}html,body{scrollbar-width:none!important;}\n");
        }
        css.push_str(&self.custom_css);
        css
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_url_like_ssn() {
        let a = Appearance {
            session: "ABC".into(),
            scale: 0.5,
            use_chroma: true,
            chroma: "0006".into(),
            text_glow: true,
            ..Default::default()
        };
        assert_eq!(
            a.chat_url().unwrap(),
            "https://socialstream.ninja/dock.html?session=ABC&ln=es&scale=0.5&randomcolor&fadedtop&sidepadding=8&textglow&bubble&darkmode&hidemenu&chroma=0006"
        );
    }

    #[test]
    fn no_session_no_url() {
        assert!(Appearance::default().chat_url().is_none());
    }
}
