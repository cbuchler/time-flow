# Time & Flow Design Contract

This document is the required entrypoint for all implementation work. Read it before changing UI, persistence, platform integration, or tests. For UI work, also read the relevant platform document and the shared component/accessibility/empty-state documents.

## Product Intent

Time & Flow is an offline-first tray/menu-bar time tracker. The popover is the main app surface: users start work, resume tasks, manage Pomodoro sessions, edit limited entry details, and change settings inside one compact transient window.

V1 proves reliable local timekeeping, native-feeling tray behavior, and cross-platform UI fidelity. It is not a reporting, sync, billing, or team product.

## Scope

In scope:

- macOS menu bar, Windows tray, GNOME indicator, KDE tray.
- Transient popover as the main app surface.
- Projects and reusable tasks.
- Live tracking entries requiring project and task.
- Pomodoro/focus sessions.
- Break records separated from work totals.
- Manual entries.
- Editing stopped entries: duration and optional note only.
- Archive-only projects/tasks.
- Idle auto-pause.
- OS notifications for Pomodoro/session events.
- Launch at login.
- OS theme detection.
- Guided first-run and empty states.
- Home summaries only: active session, Today, compact Week strip.
- Local audit log retained indefinitely.
- TOML config and SQLite/libSQL-compatible local database.
- Local packaged fonts/assets only.

Out of scope:

- Cloud sync, hosted Turso, accounts, backup/import/export, reports, CSV/JSON export, auto-update, global shortcuts, advanced dock/taskbar controls, advanced startup controls, user-facing audit history, billing, teams, configurable rounding, detailed notification preferences, and native React Native macOS/Windows shells.

## Architecture Rules

- Tauri owns native desktop behavior, filesystem access, SQLite, TOML config, timer state, idle detection, notifications, launch at login, OS theme detection, and audit logging.
- React Native Web owns the shared UI rendered inside the Tauri WebView.
- The frontend never directly accesses SQLite, TOML, the filesystem, or authoritative timer state.
- All runtime assets must be local. No CDN fonts, remote scripts, remote images, or network-required behavior.
- Tauri capabilities must be least-privilege. Do not add broad filesystem, shell, HTTP, or OS permissions.
- Use strict CSP. If a feature needs looser CSP, update this contract first.

## Navigation Model

Use a fixed-footprint navigation stack:

- Home is the root.
- Start, Settings, New Project, Manual Entry, and Edit Entry are pushed screens.
- Back returns to the previous screen.
- No full application window is used for V1.
- No modal/sheet is introduced unless a platform document explicitly requires it and the root contract is updated.

## Data Invariants

- Work time entries always require `project_id` and `task_id`.
- Project names are unique case-insensitively.
- Task names are unique case-insensitively within a project.
- Projects and tasks are archived, not hard-deleted.
- Pomodoro breaks are stored as separate break records and excluded from work, billing, project, and task totals.
- Stopped entries expose duration and note edits only.
- Audit events are append-only and retained indefinitely.
- Durations are stored as exact seconds.

## Platform Routing

Read these before platform-specific UI or native work:

- macOS: `platforms/macos/DESIGN.md`
- Windows: `platforms/windows/DESIGN.md`
- GNOME: `platforms/gnome/DESIGN.md`
- KDE: `platforms/kde/DESIGN.md`
- Components: `components/DESIGN.md`
- Accessibility: `accessibility/DESIGN.md`
- Empty states: `empty-states/DESIGN.md`

## Agent Rules

- Implementation agents/subagents may use only `Codex 5.4-mini` or `Sonnet`.
- Use `Sonnet` for design contracts, Rust core, native integration, and QA review.
- Use `Codex 5.4-mini` for bounded UI, settings, empty states, tests, and documentation follow-through.
- If implementation constraints conflict with these documents, propose or apply a design-doc update before implementing divergent behavior.

## Acceptance Gates

- No UI work starts before this document and relevant platform/component docs exist.
- No scaffold is accepted without strict CSP and explicit Tauri capabilities.
- No persistence feature merges without migration tests.
- No timer feature merges without restart and pause/resume tests.
- No platform build is accepted without tray launch, popover positioning, hide-on-blur, and theme detection checks.
- No screen is accepted without empty, loading, error, keyboard, accessibility, and text-overflow states.
- No release candidate is accepted if runtime behavior requires network access.
