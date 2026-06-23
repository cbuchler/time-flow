use crate::{
    config::{self, AppConfig, AppPaths},
    db,
    error::AppResult,
    models::AppStateView,
    session,
};
use crate::error::AppError;
use chrono::{NaiveDate, Utc};
use parking_lot::Mutex;
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub struct AppState {
    pub paths: AppPaths,
    pub config: Mutex<AppConfig>,
    pub conn: Mutex<Connection>,
    /// Absolute path of the database the live `conn` is connected to. Tracked
    /// separately from `paths.db_file` (which is only the default) so the UI can
    /// show where data actually lives and so relocation can update it at runtime.
    pub db_path: Mutex<PathBuf>,
    pub last_user_activity: Mutex<chrono::DateTime<Utc>>,
    /// Instant the popover was last auto-hidden by losing focus. Lets a tray-icon
    /// click that *caused* that blur be treated as "dismiss" instead of bouncing
    /// the window straight back open. `None` until the first auto-hide.
    pub last_popover_hide: Mutex<Option<std::time::Instant>>,
    pub platform: String,
}

impl AppState {
    pub fn bootstrap(app: AppHandle) -> AppResult<Arc<Self>> {
        let paths = config::resolve_paths()?;
        let cfg = config::load_or_create_config(&paths)?;
        let db_path = config::effective_db_path(&paths, &cfg);
        let conn = db::open(&db_path)?;
        let state = Arc::new(Self {
            paths,
            config: Mutex::new(cfg),
            conn: Mutex::new(conn),
            db_path: Mutex::new(db_path),
            last_user_activity: Mutex::new(Utc::now()),
            last_popover_hide: Mutex::new(None),
            platform: std::env::consts::OS.to_string(),
        });
        spawn_timer_loop(app, state.clone());
        Ok(state)
    }

    /// Relocate the database to `new_path`: take a clean, consistent copy of the
    /// live database with `VACUUM INTO`, swap the in-memory connection over to it,
    /// and persist the new path to config. The original file is intentionally
    /// left untouched as a backup. Returns the path now in use.
    ///
    /// Errors (target already exists, unwritable folder, copy failure) leave the
    /// existing connection and config untouched — the swap only happens after the
    /// copy and re-open both succeed.
    pub fn change_database(&self, new_path: &Path) -> AppResult<PathBuf> {
        let current = self.db_path.lock().clone();
        if new_path == current {
            return Ok(current);
        }
        if new_path.exists() {
            return Err(AppError::Validation(
                "a database already exists in that folder — choose an empty location, or remove the existing timeflow.db first".into(),
            ));
        }
        let target = new_path.to_str().ok_or_else(|| {
            AppError::Validation("the chosen path is not valid UTF-8".into())
        })?;

        // Hold the connection lock across copy + swap so no command writes to the
        // old database between the snapshot and the cutover. `VACUUM INTO` writes
        // a fully self-contained copy; it fails if the parent folder is unwritable
        // or the target exists, so a failure here aborts before we touch `conn`.
        let mut conn = self.conn.lock();
        conn.execute("VACUUM INTO ?1", params![target])?;
        let new_conn = db::open(new_path)?;
        *conn = new_conn;
        drop(conn);
        *self.db_path.lock() = new_path.to_path_buf();
        Ok(new_path.to_path_buf())
    }

    pub fn view(&self) -> AppResult<AppStateView> {
        self.view_for_date(Utc::now().date_naive())
    }

    pub fn view_for_date(&self, selected_date: NaiveDate) -> AppResult<AppStateView> {
        // Clone the path first and release its lock immediately so we never hold
        // both db_path and conn at once (change_database locks them conn→db_path).
        let database_path = self.db_path.lock().to_string_lossy().to_string();
        let conn = self.conn.lock();
        // Lock config once and clone it; parking_lot::Mutex is not reentrant,
        // so locking it twice in the same expression would deadlock.
        let config = self.config.lock().clone();
        let theme = match config.appearance.mode {
            crate::config::ThemeMode::Light => "light".into(),
            crate::config::ThemeMode::Dark => "dark".into(),
            crate::config::ThemeMode::System => "system".into(),
        };
        let today_date = Utc::now().date_naive();
        Ok(AppStateView {
            config,
            projects: db::list_projects(&conn)?,
            tasks: db::list_tasks(&conn)?,
            active_session: session::active_session(&conn)?,
            selected_date,
            today_date,
            today_entries: db::list_entries_for_date(&conn, selected_date)?,
            week: db::week_totals(&conn, selected_date)?,
            platform: self.platform.clone(),
            theme,
            database_path,
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
        // Reflect tracking / idle state in the menu-bar title every tick.
        crate::tray::update_title(&app, crate::tray::compute_title(&state));
    });
}
