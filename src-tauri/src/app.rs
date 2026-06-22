use crate::{
    config::{self, AppConfig, AppPaths},
    db,
    error::AppResult,
    models::AppStateView,
    session,
};
use chrono::Utc;
use parking_lot::Mutex;
use rusqlite::Connection;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub struct AppState {
    pub paths: AppPaths,
    pub config: Mutex<AppConfig>,
    pub conn: Mutex<Connection>,
    pub last_user_activity: Mutex<chrono::DateTime<Utc>>,
    pub platform: String,
}

impl AppState {
    pub fn bootstrap(app: AppHandle) -> AppResult<Arc<Self>> {
        let paths = config::resolve_paths()?;
        let cfg = config::load_or_create_config(&paths)?;
        let conn = db::open(&paths.db_file)?;
        let state = Arc::new(Self {
            paths,
            config: Mutex::new(cfg),
            conn: Mutex::new(conn),
            last_user_activity: Mutex::new(Utc::now()),
            platform: std::env::consts::OS.to_string(),
        });
        spawn_timer_loop(app, state.clone());
        Ok(state)
    }

    pub fn view(&self) -> AppResult<AppStateView> {
        let conn = self.conn.lock();
        // Lock config once and clone it; parking_lot::Mutex is not reentrant,
        // so locking it twice in the same expression would deadlock.
        let config = self.config.lock().clone();
        let theme = match config.appearance.mode {
            crate::config::ThemeMode::Light => "light".into(),
            crate::config::ThemeMode::Dark => "dark".into(),
            crate::config::ThemeMode::System => "system".into(),
        };
        Ok(AppStateView {
            config,
            projects: db::list_projects(&conn)?,
            tasks: db::list_tasks(&conn)?,
            active_session: session::active_session(&conn)?,
            today_entries: db::list_today_entries(&conn)?,
            week: db::week_totals(&conn)?,
            platform: self.platform.clone(),
            theme,
        })
    }
}

fn spawn_timer_loop(app: AppHandle, state: Arc<AppState>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(1));
        let tick = {
            let conn = state.conn.lock();
            session::tick_focus(&conn)
        };
        let should_idle_pause = {
            let cfg = state.config.lock().clone();
            if !cfg.general.idle_auto_pause_enabled {
                false
            } else {
                let idle_seconds = (Utc::now() - *state.last_user_activity.lock()).num_seconds();
                idle_seconds >= (cfg.general.idle_threshold_minutes as i64 * 60)
            }
        };
        if should_idle_pause {
            let conn = state.conn.lock();
            let elapsed = session::active_session(&conn)
                .ok()
                .flatten()
                .map(|s| s.elapsed_seconds)
                .unwrap_or(0);
            let _ = session::pause(&conn, "idle_auto_pause");
            let _ = app.emit("session-idle-paused", elapsed);
        }
        if tick.is_ok() {
            if let Ok(view) = state.view() {
                let _ = app.emit("app-state", view);
            }
        };
    });
}
