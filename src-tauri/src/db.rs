use crate::{
    error::{AppError, AppResult},
    models::*,
};
use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;
use uuid::Uuid;

pub fn open(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL COLLATE NOCASE UNIQUE,
          client TEXT,
          color TEXT NOT NULL,
          billable INTEGER NOT NULL,
          hourly_rate REAL,
          archived_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id),
          name TEXT NOT NULL COLLATE NOCASE,
          archived_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(project_id, name)
        );
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id),
          task_id TEXT NOT NULL REFERENCES tasks(id),
          mode TEXT NOT NULL,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          paused_at TEXT,
          committed_entry_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS session_pauses (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(id),
          paused_at TEXT NOT NULL,
          resumed_at TEXT,
          reason TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS focus_sessions (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(id),
          phase TEXT NOT NULL,
          round_index INTEGER NOT NULL,
          total_rounds INTEGER NOT NULL,
          focus_seconds INTEGER NOT NULL,
          short_break_seconds INTEGER NOT NULL,
          long_break_seconds INTEGER NOT NULL,
          long_break_after_rounds INTEGER NOT NULL,
          phase_started_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS time_entries (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id),
          task_id TEXT NOT NULL REFERENCES tasks(id),
          session_id TEXT REFERENCES sessions(id),
          started_at TEXT NOT NULL,
          ended_at TEXT NOT NULL,
          duration_seconds INTEGER NOT NULL,
          note TEXT,
          source TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS break_records (
          id TEXT PRIMARY KEY,
          focus_session_id TEXT NOT NULL REFERENCES focus_sessions(id),
          started_at TEXT NOT NULL,
          ended_at TEXT NOT NULL,
          duration_seconds INTEGER NOT NULL,
          break_type TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL,
          at TEXT NOT NULL,
          before_json TEXT,
          after_json TEXT
        );
        INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));
        ",
    )?;
    Ok(())
}

pub fn audit<T: Serialize, U: Serialize>(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
    action: &str,
    before: Option<&T>,
    after: Option<&U>,
) -> AppResult<()> {
    let before_json = before.map(serde_json::to_string).transpose()?;
    let after_json = after.map(serde_json::to_string).transpose()?;
    conn.execute(
        "INSERT INTO audit_log(id, entity_type, entity_id, action, at, before_json, after_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            Uuid::new_v4().to_string(),
            entity_type,
            entity_id,
            action,
            Utc::now().to_rfc3339(),
            before_json,
            after_json
        ],
    )?;
    Ok(())
}

pub fn create_project(conn: &Connection, input: ProjectInput) -> AppResult<Project> {
    validate_name("project name", &input.name)?;
    let now = Utc::now().to_rfc3339();
    let project = Project {
        id: Uuid::new_v4().to_string(),
        name: input.name.trim().to_string(),
        client: clean_opt(input.client),
        color: if input.color.trim().is_empty() {
            "#0a84ff".into()
        } else {
            input.color
        },
        billable: input.billable,
        hourly_rate: input.hourly_rate,
        archived_at: None,
    };
    conn.execute(
        "INSERT INTO projects(id, name, client, color, billable, hourly_rate, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![
            project.id,
            project.name,
            project.client,
            project.color,
            project.billable as i32,
            project.hourly_rate,
            now
        ],
    )
    .map_err(unique_error("project name already exists"))?;
    audit(
        conn,
        "project",
        &project.id,
        "create",
        None::<&Project>,
        Some(&project),
    )?;
    Ok(project)
}

pub fn update_project(conn: &Connection, id: &str, input: ProjectInput) -> AppResult<Project> {
    validate_name("project name", &input.name)?;
    let before = get_project(conn, id)?;
    conn.execute(
        "UPDATE projects SET name=?1, client=?2, color=?3, billable=?4, hourly_rate=?5, updated_at=?6 WHERE id=?7",
        params![
            input.name.trim(),
            clean_opt(input.client),
            input.color,
            input.billable as i32,
            input.hourly_rate,
            Utc::now().to_rfc3339(),
            id
        ],
    )
    .map_err(unique_error("project name already exists"))?;
    let after = get_project(conn, id)?;
    audit(conn, "project", id, "update", Some(&before), Some(&after))?;
    Ok(after)
}

pub fn archive_project(conn: &Connection, id: &str) -> AppResult<Project> {
    let before = get_project(conn, id)?;
    conn.execute(
        "UPDATE projects SET archived_at=?1, updated_at=?1 WHERE id=?2 AND archived_at IS NULL",
        params![Utc::now().to_rfc3339(), id],
    )?;
    let after = get_project(conn, id)?;
    audit(conn, "project", id, "archive", Some(&before), Some(&after))?;
    Ok(after)
}

pub fn create_task(conn: &Connection, input: TaskInput) -> AppResult<Task> {
    validate_name("task name", &input.name)?;
    ensure_project_active(conn, &input.project_id)?;
    let now = Utc::now().to_rfc3339();
    let task = Task {
        id: Uuid::new_v4().to_string(),
        project_id: input.project_id,
        name: input.name.trim().to_string(),
        archived_at: None,
    };
    conn.execute(
        "INSERT INTO tasks(id, project_id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
        params![task.id, task.project_id, task.name, now],
    )
    .map_err(unique_error("task name already exists for this project"))?;
    audit(conn, "task", &task.id, "create", None::<&Task>, Some(&task))?;
    Ok(task)
}

pub fn update_task(conn: &Connection, id: &str, input: TaskInput) -> AppResult<Task> {
    validate_name("task name", &input.name)?;
    ensure_project_active(conn, &input.project_id)?;
    let before = get_task(conn, id)?;
    conn.execute(
        "UPDATE tasks SET project_id=?1, name=?2, updated_at=?3 WHERE id=?4",
        params![
            input.project_id,
            input.name.trim(),
            Utc::now().to_rfc3339(),
            id
        ],
    )
    .map_err(unique_error("task name already exists for this project"))?;
    let after = get_task(conn, id)?;
    audit(conn, "task", id, "update", Some(&before), Some(&after))?;
    Ok(after)
}

pub fn archive_task(conn: &Connection, id: &str) -> AppResult<Task> {
    let before = get_task(conn, id)?;
    conn.execute(
        "UPDATE tasks SET archived_at=?1, updated_at=?1 WHERE id=?2 AND archived_at IS NULL",
        params![Utc::now().to_rfc3339(), id],
    )?;
    let after = get_task(conn, id)?;
    audit(conn, "task", id, "archive", Some(&before), Some(&after))?;
    Ok(after)
}

pub fn create_manual_entry(conn: &Connection, input: ManualEntryInput) -> AppResult<TimeEntry> {
    ensure_task_active(conn, &input.project_id, &input.task_id)?;
    if input.duration_seconds <= 0 {
        return Err(AppError::Validation(
            "duration must be greater than zero".into(),
        ));
    }
    let ended_at = input.started_at + Duration::seconds(input.duration_seconds);
    let now = Utc::now();
    if input.started_at > now || ended_at > now {
        return Err(AppError::Validation(
            "manual entries cannot be future-dated".into(),
        ));
    }
    let entry = insert_time_entry(
        conn,
        &input.project_id,
        &input.task_id,
        None,
        input.started_at,
        ended_at,
        input.duration_seconds,
        input.note,
        EntrySource::Manual,
    )?;
    Ok(entry)
}

#[allow(clippy::too_many_arguments)]
pub fn insert_time_entry(
    conn: &Connection,
    project_id: &str,
    task_id: &str,
    session_id: Option<&str>,
    started_at: DateTime<Utc>,
    ended_at: DateTime<Utc>,
    duration_seconds: i64,
    note: Option<String>,
    source: EntrySource,
) -> AppResult<TimeEntry> {
    if duration_seconds <= 0 {
        return Err(AppError::Validation(
            "duration must be greater than zero".into(),
        ));
    }
    ensure_task_exists(conn, project_id, task_id)?;
    let now = Utc::now().to_rfc3339();
    let entry = TimeEntry {
        id: Uuid::new_v4().to_string(),
        project_id: project_id.into(),
        task_id: task_id.into(),
        started_at,
        ended_at,
        duration_seconds,
        note: clean_opt(note),
        source,
    };
    conn.execute(
        "INSERT INTO time_entries(id, project_id, task_id, session_id, started_at, ended_at, duration_seconds, note, source, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
        params![
            entry.id,
            entry.project_id,
            entry.task_id,
            session_id,
            entry.started_at.to_rfc3339(),
            entry.ended_at.to_rfc3339(),
            entry.duration_seconds,
            entry.note,
            source_to_str(&entry.source),
            now
        ],
    )?;
    audit(
        conn,
        "time_entry",
        &entry.id,
        "create",
        None::<&TimeEntry>,
        Some(&entry),
    )?;
    Ok(entry)
}

pub fn update_entry(
    conn: &Connection,
    id: &str,
    project_id: &str,
    task_id: &str,
    duration_seconds: i64,
    note: Option<String>,
) -> AppResult<TimeEntry> {
    if duration_seconds <= 0 {
        return Err(AppError::Validation(
            "duration must be greater than zero".into(),
        ));
    }
    // The entry may be reassigned to a different project/task; guard that the
    // task actually belongs to the chosen project so we never write a mismatch.
    let task_project: String = conn
        .query_row(
            "SELECT project_id FROM tasks WHERE id=?1",
            params![task_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound(format!("task {task_id}")))?;
    if task_project != project_id {
        return Err(AppError::Validation(
            "task does not belong to the selected project".into(),
        ));
    }
    let before = get_time_entry(conn, id)?;
    let ended_at = before.started_at + Duration::seconds(duration_seconds);
    conn.execute(
        "UPDATE time_entries SET project_id=?1, task_id=?2, duration_seconds=?3, ended_at=?4, note=?5, updated_at=?6 WHERE id=?7",
        params![
            project_id,
            task_id,
            duration_seconds,
            ended_at.to_rfc3339(),
            clean_opt(note),
            Utc::now().to_rfc3339(),
            id
        ],
    )?;
    let after = get_time_entry(conn, id)?;
    audit(conn, "time_entry", id, "update", Some(&before), Some(&after))?;
    Ok(after)
}

pub fn delete_time_entry(conn: &Connection, id: &str) -> AppResult<TimeEntry> {
    let before = get_time_entry(conn, id)?;
    conn.execute("DELETE FROM time_entries WHERE id=?1", params![id])?;
    audit(
        conn,
        "time_entry",
        id,
        "delete",
        Some(&before),
        None::<&TimeEntry>,
    )?;
    Ok(before)
}

pub fn list_projects(conn: &Connection) -> AppResult<Vec<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, client, color, billable, hourly_rate, archived_at FROM projects ORDER BY archived_at IS NOT NULL, name",
    )?;
    rows_projects(&mut stmt, [])
}

pub fn list_tasks(conn: &Connection) -> AppResult<Vec<Task>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, archived_at FROM tasks ORDER BY archived_at IS NOT NULL, name",
    )?;
    rows_tasks(&mut stmt, [])
}

pub fn list_entries_for_date(conn: &Connection, date: NaiveDate) -> AppResult<Vec<TodayEntryView>> {
    let start = date.and_time(NaiveTime::MIN).and_utc();
    let end = start + Duration::days(1);
    let mut stmt = conn.prepare(
        "SELECT e.id, e.project_id, e.task_id, e.started_at, e.ended_at, e.duration_seconds, e.note, e.source,
                p.id, p.name, p.client, p.color, p.billable, p.hourly_rate, p.archived_at,
                t.id, t.project_id, t.name, t.archived_at
         FROM time_entries e
         JOIN projects p ON p.id = e.project_id
         JOIN tasks t ON t.id = e.task_id
         WHERE e.started_at >= ?1 AND e.started_at < ?2
         ORDER BY e.started_at DESC",
    )?;
    let rows = stmt.query_map(params![start.to_rfc3339(), end.to_rfc3339()], |row| {
        Ok(TodayEntryView {
            entry: TimeEntry {
                id: row.get(0)?,
                project_id: row.get(1)?,
                task_id: row.get(2)?,
                started_at: parse_dt(row.get::<_, String>(3)?),
                ended_at: parse_dt(row.get::<_, String>(4)?),
                duration_seconds: row.get(5)?,
                note: row.get(6)?,
                source: str_to_source(row.get::<_, String>(7)?.as_str()),
            },
            project: Project {
                id: row.get(8)?,
                name: row.get(9)?,
                client: row.get(10)?,
                color: row.get(11)?,
                billable: row.get::<_, i64>(12)? == 1,
                hourly_rate: row.get(13)?,
                archived_at: row.get::<_, Option<String>>(14)?.map(parse_dt),
            },
            task: Task {
                id: row.get(15)?,
                project_id: row.get(16)?,
                name: row.get(17)?,
                archived_at: row.get::<_, Option<String>>(18)?.map(parse_dt),
            },
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

pub fn week_totals(conn: &Connection, selected_date: NaiveDate) -> AppResult<Vec<WeekDayTotal>> {
    let monday =
        selected_date - Duration::days(selected_date.weekday().num_days_from_monday() as i64);
    let mut days = Vec::with_capacity(7);
    for offset in 0..7 {
        let day = monday + Duration::days(offset);
        let start = day.and_time(NaiveTime::MIN).and_utc();
        let end = start + Duration::days(1);
        let seconds: i64 = conn.query_row(
            "SELECT COALESCE(SUM(duration_seconds), 0) FROM time_entries WHERE started_at >= ?1 AND started_at < ?2",
            params![start.to_rfc3339(), end.to_rfc3339()],
            |row| row.get(0),
        )?;
        days.push(WeekDayTotal {
            label: day.format("%a").to_string(),
            date: day,
            seconds,
        });
    }
    Ok(days)
}

pub fn get_project(conn: &Connection, id: &str) -> AppResult<Project> {
    conn.query_row(
        "SELECT id, name, client, color, billable, hourly_rate, archived_at FROM projects WHERE id=?1",
        params![id],
        row_project,
    )
    .map_err(|err| match err {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("project".into()),
        other => AppError::Db(other),
    })
}

pub fn get_task(conn: &Connection, id: &str) -> AppResult<Task> {
    conn.query_row(
        "SELECT id, project_id, name, archived_at FROM tasks WHERE id=?1",
        params![id],
        row_task,
    )
    .map_err(|err| match err {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("task".into()),
        other => AppError::Db(other),
    })
}

pub fn get_time_entry(conn: &Connection, id: &str) -> AppResult<TimeEntry> {
    conn.query_row(
        "SELECT id, project_id, task_id, started_at, ended_at, duration_seconds, note, source FROM time_entries WHERE id=?1",
        params![id],
        row_time_entry,
    )
    .map_err(|err| match err {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("time entry".into()),
        other => AppError::Db(other),
    })
}

pub fn ensure_task_active(conn: &Connection, project_id: &str, task_id: &str) -> AppResult<()> {
    let active: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM tasks t JOIN projects p ON p.id=t.project_id
             WHERE t.id=?1 AND t.project_id=?2 AND t.archived_at IS NULL AND p.archived_at IS NULL",
            params![task_id, project_id],
            |row| row.get(0),
        )
        .optional()?;
    active
        .map(|_| ())
        .ok_or_else(|| AppError::Validation("project/task must exist and be active".into()))
}

pub fn ensure_task_exists(conn: &Connection, project_id: &str, task_id: &str) -> AppResult<()> {
    let exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM tasks WHERE id=?1 AND project_id=?2",
            params![task_id, project_id],
            |row| row.get(0),
        )
        .optional()?;
    exists
        .map(|_| ())
        .ok_or_else(|| AppError::Validation("project/task must exist".into()))
}

fn ensure_project_active(conn: &Connection, project_id: &str) -> AppResult<()> {
    let active: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM projects WHERE id=?1 AND archived_at IS NULL",
            params![project_id],
            |row| row.get(0),
        )
        .optional()?;
    active
        .map(|_| ())
        .ok_or_else(|| AppError::Validation("project must exist and be active".into()))
}

fn rows_projects<P: rusqlite::Params>(
    stmt: &mut rusqlite::Statement<'_>,
    params: P,
) -> AppResult<Vec<Project>> {
    let rows = stmt.query_map(params, row_project)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn rows_tasks<P: rusqlite::Params>(
    stmt: &mut rusqlite::Statement<'_>,
    params: P,
) -> AppResult<Vec<Task>> {
    let rows = stmt.query_map(params, row_task)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn row_project(row: &rusqlite::Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        client: row.get(2)?,
        color: row.get(3)?,
        billable: row.get::<_, i64>(4)? == 1,
        hourly_rate: row.get(5)?,
        archived_at: row.get::<_, Option<String>>(6)?.map(parse_dt),
    })
}

fn row_task(row: &rusqlite::Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        archived_at: row.get::<_, Option<String>>(3)?.map(parse_dt),
    })
}

fn row_time_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<TimeEntry> {
    Ok(TimeEntry {
        id: row.get(0)?,
        project_id: row.get(1)?,
        task_id: row.get(2)?,
        started_at: parse_dt(row.get::<_, String>(3)?),
        ended_at: parse_dt(row.get::<_, String>(4)?),
        duration_seconds: row.get(5)?,
        note: row.get(6)?,
        source: str_to_source(row.get::<_, String>(7)?.as_str()),
    })
}

pub fn parse_dt(value: String) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(&value)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}

pub fn source_to_str(source: &EntrySource) -> &'static str {
    match source {
        EntrySource::Timer => "timer",
        EntrySource::Focus => "focus",
        EntrySource::Manual => "manual",
    }
}

fn str_to_source(value: &str) -> EntrySource {
    match value {
        "focus" => EntrySource::Focus,
        "manual" => EntrySource::Manual,
        _ => EntrySource::Timer,
    }
}

fn clean_opt(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let trimmed = text.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn validate_name(label: &str, value: &str) -> AppResult<()> {
    if value.trim().is_empty() {
        return Err(AppError::Validation(format!("{label} is required")));
    }
    Ok(())
}

fn unique_error(message: &'static str) -> impl FnOnce(rusqlite::Error) -> AppError {
    move |err| match err {
        rusqlite::Error::SqliteFailure(code, _) if code.extended_code == 2067 => {
            AppError::Validation(message.into())
        }
        other => AppError::Db(other),
    }
}
