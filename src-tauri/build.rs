fn main() {
    // Declaramos los comandos propios para generar permisos `allow-<comando>`.
    // Así podemos dar acceso a la web remota de SSN solo a los comandos que necesita.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "show_menu",
            "start_drag",
            "start_resize",
            "page_ready",
            "get_settings",
            "preview_settings",
            "save_settings",
            "revert_settings",
        ])),
    )
    .expect("error al ejecutar tauri-build");
}
