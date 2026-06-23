# Rebuild Charter

Status: **Confirmed (lightweight)** — 2026-06-22

This project is being continued as iterative work on the existing app, not a
full from-scratch orchestration. Only the decisions actually made are recorded
here; unresolved items are marked.

## 1. Stack decision — CONFIRMED

**Tauri 2 + React 18 + `react-native-web`, Rust backend, SQLite.**

The human confirmed (2026-06-22) to keep the existing Tauri-webview stack and
treat it as decided, continuing feature/polish work rather than pivoting to
native rendering (RN-macOS / AppKit).

> Trade-off explicitly accepted: this waives the "native rendering over a Tauri
> webview" preference in `CLAUDE.md`'s design standard. The remaining HIG /
> macOS-native-grade obligations (real Settings window, ⌘, menu, materials,
> keyboard access, no fake desktop chrome) still stand and must be met within
> the Tauri shell.

## 2–7. Other Charter items — not yet formally resolved

Platforms/min-OS, backend keep/rebuild, migration approach, parity source, and
constraints have not been separately confirmed. Current working assumptions:
macOS-first; backend = the existing Rust+SQLite in `src-tauri/` (keep);
parity source = Required Feature Set in `CLAUDE.md`. Revisit if intent differs.

## Immediate work queue (post-Charter)

1. **Settings as a separate macOS window** — ✅ DONE (2026-06-22). Settings now
   opens as its own decorated Tauri window (`menu.rs`), from the app menu (⌘,),
   the tray "Settings…" item, and the popover gear. Activation policy switches
   Accessory→Regular while open (Dock icon + menu bar) and reverts on close.
   Frontend branches on window label (`main.tsx` → `App` vs `SettingsRoot`).
2. **Native UI overhaul** — IN PROGRESS (2026-06-22). Root cause was the
   app-wide scaled-mock approach (popover authored at 680×1112, Settings at
   1364×1214, then CSS `transform: scale()`d down). Design signed off via an
   interactive HTML mock (`rebuild/design-mock.html`).
   - **Phase 1 — DONE (frontend, native point sizes, no scaling):** rewrote the
     view layer into `src/theme.ts` + `src/Popover.tsx` + `src/Settings.tsx`
     (`App.tsx` is now a barrel). Popover: header (no clock), week strip
     (day+hours, no bars), indented tasks, single start/stop toggle per row,
     New Timer sheet with Focus toggle, Focusing renders like Tracking. Settings:
     native sidebar + inset grouped cards, **light + dark**, simplified Project
     form, Tasks list + form.
   - **Phase 2 — IN PROGRESS (backend/Rust):** ✅ week navigation (prev/next
     weeks), past-day viewing + manual-entry date (manual button shows only on
     past days, as an icon), and backend future-date validation are done
     (2026-06-22). Remaining: focus push notifications (round/break start+end),
     live menu-bar status text (Idle / elapsed / Focus countdown), real
     NSPopover vibrancy + 340pt window sizing, "count breaks within task vs
     separate" setting, and true global tasks (nullable project_id + schema).

   **Approved design/feature changes (human-confirmed 2026-06-22):**
   - Projects are **name + color only** (no client/billable/hourly-rate) — tool
     is not freelancer-centric.
   - **Manual pause removed** from the UI; row toggle is start/stop only (idle
     auto-pause still works under the hood, resumes via the idle prompt).
   - Focus sessions look identical to tracking; the difference is notifications.

3. **Feature-parity gaps** against the Required Feature Set:
   - **Edit entry reassign project/task + note** — ✅ DONE (2026-06-22). Backend
     `db::update_entry` / `update_entry` command now updates project_id, task_id,
     duration, and note (guards task belongs to project). The popover edit sheet
     has project + task pickers (task list follows the chosen project).
   - Past-day manual logging + future-date validation — ✅ DONE (2026-06-22).
   - Pomodoro-hidden-until-toggled: satisfied (Focus checkbox gates options in
     the New Timer sheet).
