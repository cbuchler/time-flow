use crate::error::{AppError, AppResult};
use directories::BaseDirs;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub config_file: PathBuf,
    pub db_file: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub general: GeneralConfig,
    pub appearance: AppearanceConfig,
    pub pomodoro: PomodoroConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneralConfig {
    pub launch_at_login: bool,
    pub idle_auto_pause_enabled: bool,
    pub idle_threshold_minutes: u32,
    /// Absolute path to the SQLite database file. `None` means the default
    /// per-platform location (see `resolve_paths`). Set when the user relocates
    /// their data from Settings. `#[serde(default)]` keeps older config.toml
    /// files (written before this field existed) parseable.
    #[serde(default)]
    pub database_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceConfig {
    pub mode: ThemeMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThemeMode {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PomodoroConfig {
    pub focus_minutes: u32,
    pub short_break_minutes: u32,
    pub long_break_minutes: u32,
    pub rounds: u32,
    pub long_break_after_rounds: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ConfigPatch {
    pub general: Option<GeneralConfigPatch>,
    pub appearance: Option<AppearanceConfigPatch>,
    pub pomodoro: Option<PomodoroConfigPatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GeneralConfigPatch {
    pub launch_at_login: Option<bool>,
    pub idle_auto_pause_enabled: Option<bool>,
    pub idle_threshold_minutes: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppearanceConfigPatch {
    pub mode: Option<ThemeMode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PomodoroConfigPatch {
    pub focus_minutes: Option<u32>,
    pub short_break_minutes: Option<u32>,
    pub long_break_minutes: Option<u32>,
    pub rounds: Option<u32>,
    pub long_break_after_rounds: Option<u32>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            general: GeneralConfig {
                launch_at_login: false,
                idle_auto_pause_enabled: true,
                idle_threshold_minutes: 10,
                database_path: None,
            },
            appearance: AppearanceConfig {
                mode: ThemeMode::System,
            },
            pomodoro: PomodoroConfig {
                focus_minutes: 25,
                short_break_minutes: 5,
                long_break_minutes: 15,
                rounds: 4,
                long_break_after_rounds: 4,
            },
        }
    }
}

impl AppConfig {
    pub fn apply_patch(&mut self, patch: ConfigPatch) -> AppResult<()> {
        if let Some(general) = patch.general {
            if let Some(value) = general.launch_at_login {
                self.general.launch_at_login = value;
            }
            if let Some(value) = general.idle_auto_pause_enabled {
                self.general.idle_auto_pause_enabled = value;
            }
            if let Some(value) = general.idle_threshold_minutes {
                if !(1..=240).contains(&value) {
                    return Err(AppError::Validation(
                        "idle threshold must be between 1 and 240 minutes".into(),
                    ));
                }
                self.general.idle_threshold_minutes = value;
            }
        }
        if let Some(appearance) = patch.appearance {
            if let Some(value) = appearance.mode {
                self.appearance.mode = value;
            }
        }
        if let Some(pomodoro) = patch.pomodoro {
            if let Some(value) = pomodoro.focus_minutes {
                validate_minutes("focus minutes", value)?;
                self.pomodoro.focus_minutes = value;
            }
            if let Some(value) = pomodoro.short_break_minutes {
                validate_minutes("short break minutes", value)?;
                self.pomodoro.short_break_minutes = value;
            }
            if let Some(value) = pomodoro.long_break_minutes {
                validate_minutes("long break minutes", value)?;
                self.pomodoro.long_break_minutes = value;
            }
            if let Some(value) = pomodoro.rounds {
                if !(1..=12).contains(&value) {
                    return Err(AppError::Validation(
                        "rounds must be between 1 and 12".into(),
                    ));
                }
                self.pomodoro.rounds = value;
            }
            if let Some(value) = pomodoro.long_break_after_rounds {
                if !(1..=12).contains(&value) {
                    return Err(AppError::Validation(
                        "long break interval must be between 1 and 12".into(),
                    ));
                }
                self.pomodoro.long_break_after_rounds = value;
            }
        }
        Ok(())
    }
}

fn validate_minutes(label: &str, value: u32) -> AppResult<()> {
    if !(1..=180).contains(&value) {
        return Err(AppError::Validation(format!(
            "{label} must be between 1 and 180"
        )));
    }
    Ok(())
}

pub fn resolve_paths() -> AppResult<AppPaths> {
    let base_dirs = BaseDirs::new()
        .ok_or_else(|| AppError::Config("could not resolve OS application directories".into()))?;
    let (config_dir, data_dir) = platform_dirs(&base_dirs);
    fs::create_dir_all(&config_dir)?;
    fs::create_dir_all(&data_dir)?;
    Ok(AppPaths {
        config_file: config_dir.join("config.toml"),
        db_file: data_dir.join("timeflow.db"),
    })
}

#[cfg(target_os = "macos")]
fn platform_dirs(base_dirs: &BaseDirs) -> (PathBuf, PathBuf) {
    let app_support = base_dirs
        .home_dir()
        .join("Library/Application Support/Time and Flow");
    (app_support.clone(), app_support)
}

#[cfg(target_os = "windows")]
fn platform_dirs(base_dirs: &BaseDirs) -> (PathBuf, PathBuf) {
    let app_data = base_dirs.config_dir().join("Time and Flow");
    (app_data.clone(), app_data)
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn platform_dirs(base_dirs: &BaseDirs) -> (PathBuf, PathBuf) {
    (
        base_dirs.config_dir().join("time-and-flow"),
        base_dirs.data_dir().join("time-and-flow"),
    )
}

/// The database file actually opened at startup: the user's configured override
/// when its parent directory still exists, otherwise the default location. The
/// parent-exists guard means a deleted/unmounted custom folder degrades to the
/// default rather than crashing on launch.
pub fn effective_db_path(paths: &AppPaths, config: &AppConfig) -> PathBuf {
    config
        .general
        .database_path
        .as_ref()
        .map(PathBuf::from)
        .filter(|p| p.parent().map(|dir| dir.exists()).unwrap_or(false))
        .unwrap_or_else(|| paths.db_file.clone())
}

pub fn load_or_create_config(paths: &AppPaths) -> AppResult<AppConfig> {
    if !paths.config_file.exists() {
        let config = AppConfig::default();
        save_config(paths, &config)?;
        return Ok(config);
    }
    let raw = fs::read_to_string(&paths.config_file)?;
    toml::from_str(&raw).map_err(|err| AppError::Config(format!("invalid TOML config: {err}")))
}

pub fn save_config(paths: &AppPaths, config: &AppConfig) -> AppResult<()> {
    let raw = toml::to_string_pretty(config)
        .map_err(|err| AppError::Config(format!("could not serialize config: {err}")))?;
    fs::write(&paths.config_file, raw)?;
    Ok(())
}
