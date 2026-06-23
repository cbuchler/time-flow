mod app;
mod commands;
mod config;
mod db;
mod error;
mod idle;
mod menu;
mod models;
mod session;
mod tray;

use app::AppState;
use commands::*;
use tauri::{Manager, WindowEvent};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
            menu::build_app_menu(app.handle())?;
            Ok(())
        })
        // Auto-dismiss the menubar popover when it loses focus (the user clicks
        // outside it) — standard NSPopover behaviour. Scoped to "main" so the
        // Settings window, a normal app window, is never auto-hidden.
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::Focused(false) = event {
                    if window.is_visible().unwrap_or(false) {
                        let app = window.app_handle();
                        if let Some(state) = app.try_state::<std::sync::Arc<AppState>>() {
                            *state.last_popover_hide.lock() = Some(std::time::Instant::now());
                        }
                        let _ = window.hide();
                    }
                }
            }
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
            update_entry,
            delete_time_entry,
            record_user_activity,
            set_database_location,
            open_settings
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Time & Flow");
}
