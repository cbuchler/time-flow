use crate::{
    app::AppState,
    config::{self, AppConfig, ConfigPatch},
    db,
    error::{CommandError, CommandResult},
    models::*,
    session,
};
use chrono::{NaiveDate, Utc};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn get_app_state(
    state: State<'_, Arc<AppState>>,
    selected_date: Option<String>,
) -> CommandResult<AppStateView> {
    let date = selected_date
        .map(|value| {
            NaiveDate::parse_from_str(&value, "%Y-%m-%d")
                .map_err(|_| crate::error::AppError::Validation("invalid selected date".into()))
        })
        .transpose()
        .map_err(CommandError::from)?
        .unwrap_or_else(|| Utc::now().date_naive());
    state.view_for_date(date).map_err(CommandError::from)
}

#[tauri::command]
pub fn get_config(state: State<'_, Arc<AppState>>) -> CommandResult<AppConfig> {
    Ok(state.config.lock().clone())
}

#[tauri::command]
pub fn update_config(
    state: State<'_, Arc<AppState>>,
    patch: ConfigPatch,
) -> CommandResult<AppConfig> {
    let mut cfg = state.config.lock();
    let before = cfg.clone();
    cfg.apply_patch(patch).map_err(CommandError::from)?;
    config::save_config(&state.paths, &cfg).map_err(CommandError::from)?;
    {
        let conn = state.conn.lock();
        db::audit(
            &conn,
            "config",
            "config",
            "update",
            Some(&before),
            Some(&*cfg),
        )
        .map_err(CommandError::from)?;
    }
    Ok(cfg.clone())
}

#[tauri::command]
pub fn create_project(
    state: State<'_, Arc<AppState>>,
    input: ProjectInput,
) -> CommandResult<Project> {
    db::create_project(&state.conn.lock(), input).map_err(CommandError::from)
}

#[tauri::command]
pub fn update_project(
    state: State<'_, Arc<AppState>>,
    id: String,
    input: ProjectInput,
) -> CommandResult<Project> {
    db::update_project(&state.conn.lock(), &id, input).map_err(CommandError::from)
}

#[tauri::command]
pub fn archive_project(state: State<'_, Arc<AppState>>, id: String) -> CommandResult<Project> {
    db::archive_project(&state.conn.lock(), &id).map_err(CommandError::from)
}

#[tauri::command]
pub fn create_task(state: State<'_, Arc<AppState>>, input: TaskInput) -> CommandResult<Task> {
    db::create_task(&state.conn.lock(), input).map_err(CommandError::from)
}

#[tauri::command]
pub fn update_task(
    state: State<'_, Arc<AppState>>,
    id: String,
    input: TaskInput,
) -> CommandResult<Task> {
    db::update_task(&state.conn.lock(), &id, input).map_err(CommandError::from)
}

#[tauri::command]
pub fn archive_task(state: State<'_, Arc<AppState>>, id: String) -> CommandResult<Task> {
    db::archive_task(&state.conn.lock(), &id).map_err(CommandError::from)
}

#[tauri::command]
pub fn start_tracking(
    state: State<'_, Arc<AppState>>,
    project_id: String,
    task_id: String,
) -> CommandResult<ActiveSession> {
    session::start_tracking(&state.conn.lock(), &project_id, &task_id).map_err(CommandError::from)
}

#[tauri::command]
pub fn start_focus(
    state: State<'_, Arc<AppState>>,
    project_id: String,
    task_id: String,
    focus_plan: FocusPlan,
) -> CommandResult<ActiveSession> {
    session::start_focus(&state.conn.lock(), &project_id, &task_id, focus_plan)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn pause_session(state: State<'_, Arc<AppState>>) -> CommandResult<Option<ActiveSession>> {
    session::pause(&state.conn.lock(), "user").map_err(CommandError::from)
}

#[tauri::command]
pub fn resume_session(state: State<'_, Arc<AppState>>) -> CommandResult<Option<ActiveSession>> {
    session::resume(&state.conn.lock()).map_err(CommandError::from)
}

#[tauri::command]
pub fn stop_session(state: State<'_, Arc<AppState>>) -> CommandResult<Option<TimeEntry>> {
    session::stop(&state.conn.lock()).map_err(CommandError::from)
}

#[tauri::command]
pub fn skip_focus_phase(state: State<'_, Arc<AppState>>) -> CommandResult<Option<ActiveSession>> {
    session::skip_focus_phase(&state.conn.lock()).map_err(CommandError::from)
}

#[tauri::command]
pub fn create_manual_entry(
    state: State<'_, Arc<AppState>>,
    input: ManualEntryInput,
) -> CommandResult<TimeEntry> {
    db::create_manual_entry(&state.conn.lock(), input).map_err(CommandError::from)
}

#[tauri::command]
pub fn update_entry(
    state: State<'_, Arc<AppState>>,
    entry_id: String,
    project_id: String,
    task_id: String,
    duration_seconds: i64,
    note: Option<String>,
) -> CommandResult<TimeEntry> {
    db::update_entry(&state.conn.lock(), &entry_id, &project_id, &task_id, duration_seconds, note)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn delete_time_entry(
    state: State<'_, Arc<AppState>>,
    entry_id: String,
) -> CommandResult<TimeEntry> {
    db::delete_time_entry(&state.conn.lock(), &entry_id).map_err(CommandError::from)
}

#[tauri::command]
pub fn record_user_activity(state: State<'_, Arc<AppState>>) -> CommandResult<()> {
    *state.last_user_activity.lock() = Utc::now();
    Ok(())
}

/// Open a native folder picker and relocate the database into the chosen folder
/// (as `timeflow.db`), migrating the current data over. Returns the path now in
/// use; if the user cancels the picker, returns the unchanged current path.
///
/// `(async)` forces this onto a worker thread. A plain sync command runs on the
/// main thread, where `blocking_pick_folder` would deadlock: it dispatches the
/// native panel to the main thread's event loop and blocks the caller until it
/// returns — fatal if the caller *is* the main thread.
#[tauri::command(async)]
pub fn set_database_location(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> CommandResult<String> {
    // Safe here: this runs off the main thread, so the blocking call parks this
    // worker while the panel is serviced normally on the main thread.
    let picked = app.dialog().file().blocking_pick_folder();
    let folder = match picked.and_then(|f| f.into_path().ok()) {
        Some(dir) => dir,
        None => {
            // Cancelled — report the current location, no change made.
            return Ok(state.db_path.lock().to_string_lossy().to_string());
        }
    };
    let new_path = folder.join("timeflow.db");

    let final_path = state
        .change_database(&new_path)
        .map_err(CommandError::from)?;

    // Persist the new location so it survives a relaunch.
    {
        let mut cfg = state.config.lock();
        cfg.general.database_path = Some(final_path.to_string_lossy().to_string());
        config::save_config(&state.paths, &cfg).map_err(CommandError::from)?;
    }

    // Push refreshed state so every open window reflects the new path immediately.
    if let Ok(view) = state.view() {
        let _ = app.emit("app-state", view);
    }
    Ok(final_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_settings(app: AppHandle) -> CommandResult<()> {
    crate::menu::open_settings(&app)
        .map_err(crate::error::AppError::from)
        .map_err(CommandError::from)
}
