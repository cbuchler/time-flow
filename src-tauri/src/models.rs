use crate::config::AppConfig;
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub client: Option<String>,
    pub color: String,
    pub billable: bool,
    pub hourly_rate: Option<f64>,
    pub archived_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub archived_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeEntry {
    pub id: String,
    pub project_id: String,
    pub task_id: String,
    pub started_at: DateTime<Utc>,
    pub ended_at: DateTime<Utc>,
    pub duration_seconds: i64,
    pub note: Option<String>,
    pub source: EntrySource,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntrySource {
    Timer,
    Focus,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreakRecord {
    pub id: String,
    pub focus_session_id: String,
    pub started_at: DateTime<Utc>,
    pub ended_at: DateTime<Utc>,
    pub duration_seconds: i64,
    pub break_type: BreakType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BreakType {
    Short,
    Long,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveSession {
    pub id: String,
    pub project_id: String,
    pub task_id: String,
    pub mode: SessionMode,
    pub started_at: DateTime<Utc>,
    pub paused_at: Option<DateTime<Utc>>,
    pub elapsed_seconds: i64,
    pub focus: Option<FocusState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionMode {
    Track,
    Focus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FocusState {
    pub focus_session_id: String,
    pub phase: FocusPhase,
    pub round_index: u32,
    pub total_rounds: u32,
    pub phase_started_at: DateTime<Utc>,
    pub phase_duration_seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FocusPhase {
    Focus,
    ShortBreak,
    LongBreak,
    Complete,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeekDayTotal {
    pub label: String,
    pub date: NaiveDate,
    pub seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodayEntryView {
    pub entry: TimeEntry,
    pub project: Project,
    pub task: Task,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppStateView {
    pub config: AppConfig,
    pub projects: Vec<Project>,
    pub tasks: Vec<Task>,
    pub active_session: Option<ActiveSession>,
    pub selected_date: NaiveDate,
    pub today_date: NaiveDate,
    pub today_entries: Vec<TodayEntryView>,
    pub week: Vec<WeekDayTotal>,
    pub platform: String,
    pub theme: String,
    pub database_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInput {
    pub name: String,
    pub client: Option<String>,
    pub color: String,
    pub billable: bool,
    pub hourly_rate: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskInput {
    pub project_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManualEntryInput {
    pub project_id: String,
    pub task_id: String,
    pub started_at: DateTime<Utc>,
    pub duration_seconds: i64,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FocusPlan {
    pub focus_minutes: u32,
    pub short_break_minutes: u32,
    pub long_break_minutes: u32,
    pub rounds: u32,
    pub long_break_after_rounds: u32,
}
