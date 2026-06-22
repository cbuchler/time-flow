use crate::{
    app::AppState,
    config::{self, AppConfig, ConfigPatch},
    db,
    error::{CommandError, CommandResult},
    models::*,
    session,
};
use chrono::Utc;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn get_app_state(state: State<'_, Arc<AppState>>) -> CommandResult<AppStateView> {
    state.view().map_err(CommandError::from)
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
pub fn update_entry_duration_note(
    state: State<'_, Arc<AppState>>,
    entry_id: String,
    duration_seconds: i64,
    note: Option<String>,
) -> CommandResult<TimeEntry> {
    db::update_entry_duration_note(&state.conn.lock(), &entry_id, duration_seconds, note)
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
