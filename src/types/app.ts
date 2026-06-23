export type ThemeMode = "system" | "light" | "dark";
export type SessionMode = "track" | "focus";
export type FocusPhase = "focus" | "short_break" | "long_break" | "complete";

export interface AppConfig {
  general: {
    launch_at_login: boolean;
    idle_auto_pause_enabled: boolean;
    idle_threshold_minutes: number;
    database_path?: string | null;
  };
  appearance: {
    mode: ThemeMode;
  };
  pomodoro: {
    focus_minutes: number;
    short_break_minutes: number;
    long_break_minutes: number;
    rounds: number;
    long_break_after_rounds: number;
  };
}

export interface Project {
  id: string;
  name: string;
  client?: string | null;
  color: string;
  billable: boolean;
  hourly_rate?: number | null;
  archived_at?: string | null;
}

export interface Task {
  id: string;
  project_id: string;
  name: string;
  archived_at?: string | null;
}

export interface TimeEntry {
  id: string;
  project_id: string;
  task_id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  note?: string | null;
  source: "timer" | "focus" | "manual";
}

export interface FocusState {
  focus_session_id: string;
  phase: FocusPhase;
  round_index: number;
  total_rounds: number;
  phase_started_at: string;
  phase_duration_seconds: number;
}

export interface ActiveSession {
  id: string;
  project_id: string;
  task_id: string;
  mode: SessionMode;
  started_at: string;
  paused_at?: string | null;
  elapsed_seconds: number;
  focus?: FocusState | null;
}

export interface TodayEntryView {
  entry: TimeEntry;
  project: Project;
  task: Task;
}

export interface WeekDayTotal {
  label: string;
  date: string;
  seconds: number;
}

export interface AppStateView {
  config: AppConfig;
  projects: Project[];
  tasks: Task[];
  active_session?: ActiveSession | null;
  selected_date: string;
  today_date: string;
  today_entries: TodayEntryView[];
  week: WeekDayTotal[];
  platform: string;
  theme: string;
  database_path: string;
}

export interface ProjectInput {
  name: string;
  client?: string | null;
  color: string;
  billable: boolean;
  hourly_rate?: number | null;
}

export interface TaskInput {
  project_id: string;
  name: string;
}

export interface ManualEntryInput {
  project_id: string;
  task_id: string;
  started_at: string;
  duration_seconds: number;
  note?: string | null;
}
