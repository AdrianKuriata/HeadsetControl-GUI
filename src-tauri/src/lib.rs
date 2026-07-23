//! Application wiring: plugins, IPC handlers, Tauri builder.
//!
//! Kept free of headset domain logic — that lives in [`backend`], exposed to the
//! frontend through the thin commands in [`commands`].

mod backend;
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
