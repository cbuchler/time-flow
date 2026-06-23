# CLAUDE.md — Project Guidance

Standing context for this repository. Auto-loaded by Claude Code and referenced
by the run prompt and every subagent. Holds **what is true about the project,
the bars it must meet, and how agents operate.** The run prompt is only the
per-run plan; everything durable lives here.

---

## Project

We are rebuilding an existing, badly-degraded ("butchered") cross-platform app.
The current stack is described as React Native + Tauri + TypeScript + native
integrations + an existing backend and database. The goal is **a working,
maintainable, macOS-native-grade rebuilt application** — not a stack of review
documents. Audit work is a means to a rebuild decision, never the deliverable.

**Open architectural question (decided in the Charter, not assumed):** Tauri
renders a webview backed by Rust; React Native renders native components through
a bridge — they are not one combined runtime. The native-grade standard below
weighs strongly toward native rendering (e.g. React Native macOS / real AppKit
views) over a Tauri webview. Any plan that keeps Tauri for desktop must justify
how it reaches native-grade fidelity.

---

## Non-Negotiable Design & Platform Standard

A hard quality bar, not an aspiration.

- **Apple-native / macOS-native grade.** Must not look or behave like a web app
  shipped inside a desktop shell. "Looks close enough" does not pass.
- **Respect all applicable Apple HIG heuristics** and use **native platform
  primitives** — real controls, materials/vibrancy, window chrome, menu bar,
  keyboard shortcuts, focus rings, full-keyboard-access — not web reimplementations.
- **Settings is a separate window in the same app.** It opens as its own standard
  macOS Settings/Preferences window (app menu and ⌘,), **not** embedded in the
  main application UI. Embedding it in the primary UI breaks the app and is
  explicitly prohibited.
- **Precedence — HIG wins.** When the existing design or prototype conflicts with
  the Apple Human Interface Guidelines, **the guidelines take precedence.**
  Document the conflict and ship the HIG-conforming resolution; never reproduce a
  prototype's deviation just because it exists. If a conflict is non-obvious,
  escalate (see Decision Discipline below) rather than resolving it silently.

---

## Required Feature Set (parity source of truth)

Authoritative. Each behavior maps to at least one feature-parity-matrix row and
at least one acceptance test. Removals or changes require human approval — never
dropped silently.

**Settings window** (separate window per the standard above):
- **Projects** — create, edit, update, archive/delete.
- **Tasks** — create, edit, update, archive/delete.
- **Appearance** — choose between **System**, **Light**, **Dark**.

**Main app — entries & time tracking:**
- Log entries for the **current day**.
- **Toggle the time tracker per task** (on/off, per individual task).
- **Edit an existing entry.**
- When editing an entry, the user can **reassign it to a different project and/or
  task**, and the entry **may carry a note**.
- When **adding** an entry, the **Pomodoro section is hidden by default** and
  appears **only when its checkbox is toggled on**.
- Manual logging is allowed for the **current day and past days only — never
  future-dated**. Enforce in the UI *and* in validation.

> Placement: Projects/Tasks/Appearance live in the Settings window; entry logging
> and time tracking live in the main app. Confirm in the Charter if intent differs.

---

## Evidence & Quality Standards

- **Evidence format:** every finding cites `path/to/file.ext:line-range` plus
  commit SHA, and is tagged `AS-IS` or `TO-BE`. No unsupported claims, no vague
  conclusions.
- **AS-IS vs TO-BE:** as-is artifacts describe current (broken) reality; to-be
  artifacts describe the design. Never blend them in one document.
- **Screenshots:** only if the app can be built/run, or from existing assets;
  otherwise state that runtime evidence was unavailable.
- **Scoring rubric (1–10), per dimension:** 1–3 critical/unusable (blocks the
  rebuild) · 4–6 functional but significant debt · 7–8 solid, minor issues ·
  9–10 exemplary. Every score carries a one-line justification and its evidence.

---

## Output Conventions

All review and rebuild artifacts live under `/rebuild/`:

| Path | Contents |
|------|----------|
| `/rebuild/00-charter.md` | Confirmed Charter decisions, assumptions, constraints |
| `/rebuild/as-is/` | As-is assessments (`code`, `design`, `features`, `database`, `api`, `build-native`) |
| `/rebuild/20-target-architecture.md` | To-be architecture |
| `/rebuild/30-migration-and-parity.md` | Parity matrix, data migration, cutover plan |
| `/rebuild/impl/<module>.md` | Per-module implementation notes (code lives in the repo) |
| `/rebuild/40-testing.md` | Target test strategy |
| `/rebuild/99-executive-report.md` | Final executive report |

---

## Agent Operating Model

**Roles.** The **orchestrator** is Claude Opus 4.8, acting as Lead Software
Architect: it plans, delegates, reviews every deliverable against acceptance
criteria, returns substandard work with precise corrections, and resolves
cross-agent conflicts — it does **not** do the bulk of the work itself.
**Subagents** are Sonnet 4.6, one scoped task each, declaring mission, inputs,
outputs, validation checklist, completion criteria, and output directory.

**Decision Discipline (mandatory).** Subagents do not make decisions. When an
agent hits a choice not already settled by its scope, the Charter, the design
standard, or the feature set — architectural trade-offs, ambiguous requirements,
anything with more than one defensible answer — it **stops and escalates to the
orchestrator** and never guesses. Escalation format:

```
DECISION REQUEST
- Context: what's being built and where this arose (with file refs)
- Decision needed: the precise question
- Options: each with pros / cons / cost / risk
- Recommendation: the agent's pick and why
- Blocked: what work is paused pending the answer
```

The orchestrator decides, escalating onward to the human when it's the human's
call (anything in the Charter), and hands the resolution back. Trivial
design/prototype conflicts need no escalation — **HIG wins** by default; only
non-obvious conflicts escalate.

**Review loop.** After each deliverable the orchestrator checks completeness,
correctness, evidence, consistency, overlap, and gaps. An unsatisfactory
deliverable is returned **at most twice** with precise corrections; if still
failing, escalate to the human rather than loop. Return only the missing work.
Flag to the human if assessment heads past ~30 delegated tasks before
implementation begins.

### Subagent Roster

**As-is assessment**
| Agent | Mission | Output |
|-------|---------|--------|
| A1 — Code & Architecture | Software quality, debt, salvageability (`keep`/`refactor`/`discard`) | `/rebuild/as-is/code.md` |
| A2 — Design & UX | Tokens, primitives, HIG/platform fidelity, accessibility | `/rebuild/as-is/design.md` |
| A3 — Workflow & Feature Inventory | Every workflow (happy/failure/edge); feeds parity matrix | `/rebuild/as-is/features.md` |
| A4 — Database | Schema, integrity, normalization; ER diagram in Mermaid | `/rebuild/as-is/database.md` |
| A5 — API | Every endpoint; OpenAPI where possible | `/rebuild/as-is/api.md` |
| A6 — Build, Release & Native | Signing/notarization, updater vs OTA, native bridges | `/rebuild/as-is/build-native.md` |

**To-be rebuild**
| Agent | Mission | Output |
|-------|---------|--------|
| B1 — Target Architecture & Stack | Resolve the stack decision concretely; to-be architecture | `/rebuild/20-target-architecture.md` |
| B2 — Migration & Parity | Parity matrix, data migration, cutover + rollback | `/rebuild/30-migration-and-parity.md` |
| B3 — Implementation squads | Build per module against parity rows | repo code + `/rebuild/impl/<module>.md` |
| B4 — Test Strategy | Unit / integration / E2E / regression / manual QA | `/rebuild/40-testing.md` |

**Dependencies:** B1 needs A1–A6; B2 needs A3; B3 needs B1 + B2. Define a shared
handoff format so each agent reads upstream artifacts rather than re-deriving.

**Standard bindings:** A2, B1, B3 must enforce the Non-Negotiable Design &
Platform Standard (macOS-native grade, full HIG, separate Settings window). A3,
B2 must cover every Required Feature Set item — one parity row and one acceptance
test per behavior — including the edge rules (no future-dated entries, Pomodoro
hidden until toggled, reassignment and notes on entry edit).
