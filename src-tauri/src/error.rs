use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("config error: {0}")]
    Config(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("validation error: {0}")]
    Validation(String),
    #[error("tauri error: {0}")]
    Tauri(#[from] tauri::Error),
    #[error("serialization error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Serialize)]
pub struct CommandError {
    pub message: String,
    pub kind: &'static str,
}

impl From<AppError> for CommandError {
    fn from(value: AppError) -> Self {
        let kind = match value {
            AppError::Db(_) => "database",
            AppError::Io(_) => "io",
            AppError::Config(_) => "config",
            AppError::NotFound(_) => "not_found",
            AppError::Validation(_) => "validation",
            AppError::Tauri(_) => "tauri",
            AppError::Json(_) => "serialization",
        };
        Self {
            message: value.to_string(),
            kind,
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;
pub type CommandResult<T> = Result<T, CommandError>;
