mod app;
mod commands;
mod config;
mod db;
mod error;
mod models;
mod session;
mod tray;

use app::AppState;
use commands::*;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.handle()
                .set_activation_policy(tauri::ActivationPolicy::Accessory)?;

            let state = AppState::bootstrap(app.handle().clone())?;
            app.manage(state);
            tray::install_tray(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            get_config,
            update_config,
            create_project,
            update_project,
            archive_project,
            create_task,
            update_task,
            archive_task,
            start_tracking,
            start_focus,
            pause_session,
            resume_session,
            stop_session,
            skip_focus_phase,
            create_manual_entry,
            update_entry_duration_note,
            delete_time_entry,
            record_user_activity
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Time & Flow");
}
