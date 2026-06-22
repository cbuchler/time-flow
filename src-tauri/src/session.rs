use crate::{
    db,
    error::{AppError, AppResult},
    models::*,
};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

pub fn active_session(conn: &Connection) -> AppResult<Option<ActiveSession>> {
    let row = conn
        .query_row(
            "SELECT id, project_id, task_id, mode, started_at, paused_at
             FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            },
        )
        .optional()?;

    let Some((id, project_id, task_id, mode_raw, started_raw, paused_raw)) = row else {
        return Ok(None);
    };

    let started_at = db::parse_dt(started_raw);
    let paused_at = paused_raw.map(db::parse_dt);
    let elapsed_seconds = elapsed_seconds(conn, &id, started_at, paused_at)?;
    let mode = if mode_raw == "focus" {
        SessionMode::Focus
    } else {
        SessionMode::Track
    };
    let focus = if mode_raw == "focus" {
        focus_state(conn, &id)?
    } else {
        None
    };

    Ok(Some(ActiveSession {
        id,
        project_id,
        task_id,
        mode,
        started_at,
        paused_at,
        elapsed_seconds,
        focus,
    }))
}

pub fn start_tracking(
    conn: &Connection,
    project_id: &str,
    task_id: &str,
) -> AppResult<ActiveSession> {
    db::ensure_task_active(conn, project_id, task_id)?;
    commit_active(conn)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    conn.execute(
        "INSERT INTO sessions(id, project_id, task_id, mode, started_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'track', ?4, ?4, ?4)",
        params![id, project_id, task_id, now.to_rfc3339()],
    )?;
    db::audit(
        conn,
        "session",
        &id,
        "start_tracking",
        None::<&ActiveSession>,
        Some(&id),
    )?;
    active_session(conn)?.ok_or_else(|| AppError::NotFound("active session".into()))
}

pub fn start_focus(
    conn: &Connection,
    project_id: &str,
    task_id: &str,
    plan: FocusPlan,
) -> AppResult<ActiveSession> {
    db::ensure_task_active(conn, project_id, task_id)?;
    commit_active(conn)?;
    validate_focus_plan(&plan)?;
    let session_id = Uuid::new_v4().to_string();
    let focus_id = Uuid::new_v4().to_string();
    let now = Utc::now();
    conn.execute(
        "INSERT INTO sessions(id, project_id, task_id, mode, started_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'focus', ?4, ?4, ?4)",
        params![session_id, project_id, task_id, now.to_rfc3339()],
    )?;
    conn.execute(
        "INSERT INTO focus_sessions(id, session_id, phase, round_index, total_rounds, focus_seconds, short_break_seconds, long_break_seconds, long_break_after_rounds, phase_started_at)
         VALUES (?1, ?2, 'focus', 1, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            focus_id,
            session_id,
            plan.rounds,
            (plan.focus_minutes * 60) as i64,
            (plan.short_break_minutes * 60) as i64,
            (plan.long_break_minutes * 60) as i64,
            plan.long_break_after_rounds,
            now.to_rfc3339()
        ],
    )?;
    db::audit(
        conn,
        "session",
        &session_id,
        "start_focus",
        None::<&ActiveSession>,
        Some(&plan),
    )?;
    active_session(conn)?.ok_or_else(|| AppError::NotFound("active session".into()))
}

pub fn pause(conn: &Connection, reason: &str) -> AppResult<Option<ActiveSession>> {
    let Some(session) = active_session(conn)? else {
        return Ok(None);
    };
    if session.paused_at.is_some() {
        return Ok(Some(session));
    }
    let now = Utc::now();
    conn.execute(
        "UPDATE sessions SET paused_at=?1, updated_at=?1 WHERE id=?2",
        params![now.to_rfc3339(), session.id],
    )?;
    conn.execute(
        "INSERT INTO session_pauses(id, session_id, paused_at, reason) VALUES (?1, ?2, ?3, ?4)",
        params![
            Uuid::new_v4().to_string(),
            session.id,
            now.to_rfc3339(),
            reason
        ],
    )?;
    db::audit(
        conn,
        "session",
        &session.id,
        "pause",
        Some(&session),
        Some(&reason),
    )?;
    active_session(conn)
}

pub fn resume(conn: &Connection) -> AppResult<Option<ActiveSession>> {
    let Some(session) = active_session(conn)? else {
        return Ok(None);
    };
    if session.paused_at.is_none() {
        return Ok(Some(session));
    }
    let now = Utc::now();
    conn.execute(
        "UPDATE sessions SET paused_at=NULL, updated_at=?1 WHERE id=?2",
        params![now.to_rfc3339(), session.id],
    )?;
    conn.execute(
        "UPDATE session_pauses SET resumed_at=?1
         WHERE session_id=?2 AND resumed_at IS NULL",
        params![now.to_rfc3339(), session.id],
    )?;
    db::audit(
        conn,
        "session",
        &session.id,
        "resume",
        Some(&session),
        Some(&now.to_rfc3339()),
    )?;
    active_session(conn)
}

pub fn stop(conn: &Connection) -> AppResult<Option<TimeEntry>> {
    commit_active(conn)
}

pub fn commit_active(conn: &Connection) -> AppResult<Option<TimeEntry>> {
    let Some(session) = active_session(conn)? else {
        return Ok(None);
    };
    let ended_at = session.paused_at.unwrap_or_else(Utc::now);
    let duration_seconds = elapsed_seconds(conn, &session.id, session.started_at, Some(ended_at))?;
    conn.execute(
        "UPDATE sessions SET ended_at=?1, paused_at=NULL, updated_at=?1 WHERE id=?2",
        params![ended_at.to_rfc3339(), session.id],
    )?;
    conn.execute(
        "UPDATE session_pauses SET resumed_at=?1 WHERE session_id=?2 AND resumed_at IS NULL",
        params![ended_at.to_rfc3339(), session.id],
    )?;
    if duration_seconds <= 0 {
        db::audit(
            conn,
            "session",
            &session.id,
            "stop_without_entry",
            Some(&session),
            Some(&ended_at.to_rfc3339()),
        )?;
        return Ok(None);
    }
    let source = match session.mode {
        SessionMode::Focus => EntrySource::Focus,
        SessionMode::Track => EntrySource::Timer,
    };
    let entry = db::insert_time_entry(
        conn,
        &session.project_id,
        &session.task_id,
        Some(&session.id),
        session.started_at,
        ended_at,
        duration_seconds,
        None,
        source,
    )?;
    conn.execute(
        "UPDATE sessions SET committed_entry_id=?1 WHERE id=?2",
        params![entry.id, session.id],
    )?;
    db::audit(
        conn,
        "session",
        &session.id,
        "stop",
        Some(&session),
        Some(&entry),
    )?;
    Ok(Some(entry))
}

pub fn skip_focus_phase(conn: &Connection) -> AppResult<Option<ActiveSession>> {
    let Some(session) = active_session(conn)? else {
        return Ok(None);
    };
    if !matches!(session.mode, SessionMode::Focus) {
        return Err(AppError::Validation(
            "only focus sessions can skip phases".into(),
        ));
    }
    advance_focus_phase(conn, &session.id)?;
    active_session(conn)
}

pub fn tick_focus(conn: &Connection) -> AppResult<Option<ActiveSession>> {
    let Some(session) = active_session(conn)? else {
        return Ok(None);
    };
    if session.paused_at.is_some() || !matches!(session.mode, SessionMode::Focus) {
        return Ok(Some(session));
    }
    if let Some(focus) = &session.focus {
        let elapsed = (Utc::now() - focus.phase_started_at).num_seconds();
        if elapsed >= focus.phase_duration_seconds && focus.phase != FocusPhase::Complete {
            advance_focus_phase(conn, &session.id)?;
        }
    }
    active_session(conn)
}

fn advance_focus_phase(conn: &Connection, session_id: &str) -> AppResult<()> {
    let focus =
        focus_state(conn, session_id)?.ok_or_else(|| AppError::NotFound("focus session".into()))?;
    let now = Utc::now();
    let next = match focus.phase {
        FocusPhase::Focus => {
            let is_last = focus.round_index >= focus.total_rounds;
            if is_last {
                (FocusPhase::Complete, focus.round_index)
            } else if focus.round_index % focus.long_break_interval(conn)? == 0 {
                (FocusPhase::LongBreak, focus.round_index)
            } else {
                (FocusPhase::ShortBreak, focus.round_index)
            }
        }
        FocusPhase::ShortBreak | FocusPhase::LongBreak => {
            log_break(conn, &focus, now)?;
            (FocusPhase::Focus, focus.round_index + 1)
        }
        FocusPhase::Complete => (FocusPhase::Complete, focus.round_index),
    };
    conn.execute(
        "UPDATE focus_sessions SET phase=?1, round_index=?2, phase_started_at=?3 WHERE id=?4",
        params![
            phase_to_str(&next.0),
            next.1,
            now.to_rfc3339(),
            focus.focus_session_id
        ],
    )?;
    db::audit(
        conn,
        "focus_session",
        &focus.focus_session_id,
        "advance_phase",
        Some(&focus),
        Some(&next.0),
    )?;
    Ok(())
}

fn log_break(conn: &Connection, focus: &FocusState, ended_at: DateTime<Utc>) -> AppResult<()> {
    let break_type = match focus.phase {
        FocusPhase::ShortBreak => BreakType::Short,
        FocusPhase::LongBreak => BreakType::Long,
        _ => return Ok(()),
    };
    let duration_seconds = (ended_at - focus.phase_started_at).num_seconds().max(0);
    if duration_seconds == 0 {
        return Ok(());
    }
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO break_records(id, focus_session_id, started_at, ended_at, duration_seconds, break_type, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?4)",
        params![
            id,
            focus.focus_session_id,
            focus.phase_started_at.to_rfc3339(),
            ended_at.to_rfc3339(),
            duration_seconds,
            match break_type { BreakType::Short => "short", BreakType::Long => "long" }
        ],
    )?;
    db::audit(
        conn,
        "break_record",
        &id,
        "create",
        None::<&BreakRecord>,
        Some(&id),
    )?;
    Ok(())
}

fn focus_state(conn: &Connection, session_id: &str) -> AppResult<Option<FocusState>> {
    conn.query_row(
        "SELECT id, phase, round_index, total_rounds, focus_seconds, short_break_seconds, long_break_seconds, phase_started_at
         FROM focus_sessions WHERE session_id=?1",
        params![session_id],
        |row| {
            let phase = str_to_phase(row.get::<_, String>(1)?.as_str());
            let duration = match phase {
                FocusPhase::Focus => row.get(4)?,
                FocusPhase::ShortBreak => row.get(5)?,
                FocusPhase::LongBreak => row.get(6)?,
                FocusPhase::Complete => 0,
            };
            Ok(FocusState {
                focus_session_id: row.get(0)?,
                phase,
                round_index: row.get::<_, i64>(2)? as u32,
                total_rounds: row.get::<_, i64>(3)? as u32,
                phase_started_at: db::parse_dt(row.get::<_, String>(7)?),
                phase_duration_seconds: duration,
            })
        },
    )
    .optional()
    .map_err(AppError::from)
}

trait FocusInterval {
    fn long_break_interval(&self, conn: &Connection) -> AppResult<u32>;
}

impl FocusInterval for FocusState {
    fn long_break_interval(&self, conn: &Connection) -> AppResult<u32> {
        let value: i64 = conn.query_row(
            "SELECT long_break_after_rounds FROM focus_sessions WHERE id=?1",
            params![self.focus_session_id],
            |row| row.get(0),
        )?;
        Ok(value as u32)
    }
}

fn elapsed_seconds(
    conn: &Connection,
    session_id: &str,
    started_at: DateTime<Utc>,
    paused_or_end: Option<DateTime<Utc>>,
) -> AppResult<i64> {
    let end = paused_or_end.unwrap_or_else(Utc::now);
    let raw = (end - started_at).num_seconds().max(0);
    let paused: i64 = conn.query_row(
        "SELECT COALESCE(SUM(strftime('%s', COALESCE(resumed_at, ?2)) - strftime('%s', paused_at)), 0)
         FROM session_pauses WHERE session_id=?1",
        params![session_id, end.to_rfc3339()],
        |row| row.get(0),
    )?;
    Ok((raw - paused).max(0))
}

fn validate_focus_plan(plan: &FocusPlan) -> AppResult<()> {
    let valid_minutes = |value: u32| (1..=180).contains(&value);
    if !valid_minutes(plan.focus_minutes)
        || !valid_minutes(plan.short_break_minutes)
        || !valid_minutes(plan.long_break_minutes)
        || !(1..=12).contains(&plan.rounds)
        || !(1..=12).contains(&plan.long_break_after_rounds)
    {
        return Err(AppError::Validation("invalid focus plan".into()));
    }
    Ok(())
}

fn phase_to_str(phase: &FocusPhase) -> &'static str {
    match phase {
        FocusPhase::Focus => "focus",
        FocusPhase::ShortBreak => "short_break",
        FocusPhase::LongBreak => "long_break",
        FocusPhase::Complete => "complete",
    }
}

fn str_to_phase(value: &str) -> FocusPhase {
    match value {
        "short_break" => FocusPhase::ShortBreak,
        "long_break" => FocusPhase::LongBreak,
        "complete" => FocusPhase::Complete,
        _ => FocusPhase::Focus,
    }
}
