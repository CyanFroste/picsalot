// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod state;
mod types;
mod utils;

use anyhow::Result;
use state::State;
use tauri::Manager;

#[tokio::main]
async fn main() -> Result<()> {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_pictures,
            commands::process_pictures,
            commands::move_to_trash
        ])
        .setup(move |app| {
            app.manage(State::new(
                app.package_info().name.clone(),
                app.path().app_cache_dir()?,
                app.path().app_log_dir()?,
            ));

            Ok(())
        })
        .run(tauri::generate_context!())?;

    Ok(())
}
