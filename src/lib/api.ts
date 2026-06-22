import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  AppConfig,
  AppStateView,
  ManualEntryInput,
  Project,
  ProjectInput,
  Task,
  TaskInput,
  TodayEntryView,
  TimeEntry,
} from "../types/app";

const hasTauriBridge = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const preview = createPreviewBackend();

export function getAppState(): Promise<AppStateView> {
  if (!hasTauriBridge) return preview.getAppState();
  return invoke("get_app_state");
}

export function onAppState(callback: (state: AppStateView) => void): Promise<() => void> {
  if (!hasTauriBridge) return preview.listen(callback);
  return listen<AppStateView>("app-state", (event) => callback(event.payload));
}

export function createProject(input: ProjectInput): Promise<Project> {
  if (!hasTauriBridge) return preview.createProject(input);
  return invoke("create_project", { input });
}

export function updateProject(id: string, input: ProjectInput): Promise<Project> {
  if (!hasTauriBridge) return preview.updateProject(id, input);
  return invoke("update_project", { id, input });
}

export function archiveProject(id: string): Promise<Project> {
  if (!hasTauriBridge) return preview.archiveProject(id);
  return invoke("archive_project", { id });
}

export function createTask(input: TaskInput): Promise<Task> {
  if (!hasTauriBridge) return preview.createTask(input);
  return invoke("create_task", { input });
}

export function updateTask(id: string, input: TaskInput): Promise<Task> {
  if (!hasTauriBridge) return preview.updateTask(id, input);
  return invoke("update_task", { id, input });
}

export function archiveTask(id: string): Promise<Task> {
  if (!hasTauriBridge) return preview.archiveTask(id);
  return invoke("archive_task", { id });
}

export function startTracking(projectId: string, taskId: string) {
  if (!hasTauriBridge) return preview.startTracking(projectId, taskId);
  return invoke("start_tracking", { projectId, taskId });
}

export function startFocus(projectId: string, taskId: string, config: AppConfig) {
  if (!hasTauriBridge) return preview.startFocus(projectId, taskId, config);
  return invoke("start_focus", {
    projectId,
    taskId,
    focusPlan: {
      focus_minutes: config.pomodoro.focus_minutes,
      short_break_minutes: config.pomodoro.short_break_minutes,
      long_break_minutes: config.pomodoro.long_break_minutes,
      rounds: config.pomodoro.rounds,
      long_break_after_rounds: config.pomodoro.long_break_after_rounds,
    },
  });
}

export function pauseSession() {
  if (!hasTauriBridge) return preview.pauseSession();
  return invoke("pause_session");
}

export function resumeSession() {
  if (!hasTauriBridge) return preview.resumeSession();
  return invoke("resume_session");
}

export function stopSession(): Promise<TimeEntry | null> {
  if (!hasTauriBridge) return preview.stopSession();
  return invoke("stop_session");
}

export function skipFocusPhase() {
  if (!hasTauriBridge) return preview.skipFocusPhase();
  return invoke("skip_focus_phase");
}

export function createManualEntry(input: ManualEntryInput): Promise<TimeEntry> {
  if (!hasTauriBridge) return preview.createManualEntry(input);
  return invoke("create_manual_entry", { input });
}

export function updateEntryDurationNote(
  entryId: string,
  durationSeconds: number,
  note: string | null,
): Promise<TimeEntry> {
  if (!hasTauriBridge) return preview.updateEntryDurationNote(entryId, durationSeconds, note);
  return invoke("update_entry_duration_note", { entryId, durationSeconds, note });
}

export function deleteTimeEntry(entryId: string): Promise<TimeEntry> {
  if (!hasTauriBridge) return preview.deleteTimeEntry(entryId);
  return invoke("delete_time_entry", { entryId });
}

export function updateConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  if (!hasTauriBridge) return preview.updateConfig(patch);
  return invoke("update_config", { patch });
}

export function recordUserActivity(): Promise<void> {
  if (!hasTauriBridge) return Promise.resolve();
  return invoke("record_user_activity");
}

function createPreviewBackend() {
  const projects: Project[] = [
    {
      id: "project_acme",
      name: "Acme Website",
      client: "Development",
      color: "#4295ff",
      billable: false,
      hourly_rate: null,
      archived_at: null,
    },
    {
      id: "project_internal",
      name: "Internal",
      client: null,
      color: "#9b9da1",
      billable: false,
      hourly_rate: null,
      archived_at: null,
    },
    {
      id: "project_mobile",
      name: "Mobile App",
      client: null,
      color: "#c45cf1",
      billable: false,
      hourly_rate: null,
      archived_at: null,
    },
    {
      id: "project_brand",
      name: "Brand Refresh",
      client: null,
      color: "#ffab35",
      billable: false,
      hourly_rate: null,
      archived_at: null,
    },
    {
      id: "project_docs",
      name: "Docs Portal",
      client: null,
      color: "#52d273",
      billable: false,
      hourly_rate: null,
      archived_at: null,
    },
  ];
  const tasks: Task[] = [
    { id: "task_components", project_id: "project_acme", name: "Build component library", archived_at: null },
    { id: "task_review", project_id: "project_acme", name: "Design review", archived_at: null },
    { id: "task_frontend", project_id: "project_acme", name: "Frontend Programming", archived_at: null },
    { id: "task_bug", project_id: "project_mobile", name: "Bug triage", archived_at: null },
    { id: "task_standup", project_id: "project_internal", name: "Standup", archived_at: null },
    { id: "task_web", project_id: "project_brand", name: "Web Design", archived_at: null },
    { id: "task_magazine", project_id: "project_brand", name: "Magazine Design", archived_at: null },
    { id: "task_presentations", project_id: "project_internal", name: "Presentations", archived_at: null },
    { id: "task_docs", project_id: "project_docs", name: "Documentation pass", archived_at: null },
  ];
  const today = new Date("2026-06-21T12:00:00.000Z");
  const entry = (idValue: string, projectId: string, taskId: string, seconds: number, note: string | null = null): TodayEntryView => {
    const project = projects.find((candidate) => candidate.id === projectId)!;
    const task = tasks.find((candidate) => candidate.id === taskId)!;
    return {
      project,
      task,
      entry: {
        id: idValue,
        project_id: projectId,
        task_id: taskId,
        started_at: today.toISOString(),
        ended_at: new Date(today.getTime() + seconds * 1000).toISOString(),
        duration_seconds: seconds,
        note,
        source: "timer",
      },
    };
  };
  let state: AppStateView = {
    config: {
      general: {
        launch_at_login: false,
        idle_auto_pause_enabled: true,
        idle_threshold_minutes: 10,
      },
      appearance: { mode: "system" },
      pomodoro: {
        focus_minutes: 25,
        short_break_minutes: 5,
        long_break_minutes: 15,
        rounds: 4,
        long_break_after_rounds: 4,
      },
    },
    projects,
    tasks,
    active_session: {
      id: "session_preview",
      project_id: "project_acme",
      task_id: "task_components",
      mode: "track",
      started_at: new Date(Date.now() - 85 * 60 * 1000 - 4 * 1000).toISOString(),
      paused_at: null,
      elapsed_seconds: 5104,
      focus: null,
    },
    today_entries: [
      entry("entry_bug", "project_mobile", "task_bug", 45 * 60),
      entry("entry_components", "project_acme", "task_components", 90 * 60, "Polish shared controls"),
      entry("entry_review", "project_acme", "task_review", 72 * 60),
      entry("entry_standup", "project_internal", "task_standup", 25 * 60),
    ],
    week: [
      { label: "Mon", seconds: 6000 },
      { label: "Tue", seconds: 0 },
      { label: "Wed", seconds: 0 },
      { label: "Thu", seconds: 0 },
      { label: "Fri", seconds: 19020 },
      { label: "Sat", seconds: 0 },
      { label: "Sun", seconds: 0 },
    ],
    platform: navigator.platform.toLowerCase().includes("win")
      ? "windows"
      : navigator.platform.toLowerCase().includes("linux")
        ? "linux"
        : "macos",
    theme: "system",
  };
  const listeners = new Set<(next: AppStateView) => void>();

  const emit = () => {
    const next = clone(state);
    listeners.forEach((listener) => listener(next));
  };

  const touchWeek = (seconds: number) => {
    const index = Math.min(6, Math.max(0, new Date().getDay() - 1));
    state.week[index] = {
      ...state.week[index],
      seconds: state.week[index].seconds + seconds,
    };
  };

  const commitActive = (): TimeEntry | null => {
    const active = state.active_session;
    if (!active) return null;
    const seconds = Math.max(1, active.elapsed_seconds || elapsed(active.started_at));
    const entry: TimeEntry = {
      id: id("entry"),
      project_id: active.project_id,
      task_id: active.task_id,
      started_at: active.started_at,
      ended_at: new Date().toISOString(),
      duration_seconds: seconds,
      note: null,
      source: active.mode === "focus" ? "focus" : "timer",
    };
    const project = state.projects.find((candidate) => candidate.id === entry.project_id);
    const task = state.tasks.find((candidate) => candidate.id === entry.task_id);
    if (project && task) {
      state.today_entries = [{ entry, project, task }, ...state.today_entries];
      touchWeek(seconds);
    }
    state.active_session = null;
    return entry;
  };

  setInterval(() => {
    if (state.active_session && !state.active_session.paused_at) {
      state.active_session = {
        ...state.active_session,
        elapsed_seconds: elapsed(state.active_session.started_at),
      };
      emit();
    }
  }, 1000);

  return {
    async getAppState() {
      return clone(state);
    },
    async listen(callback: (next: AppStateView) => void) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    async createProject(input: ProjectInput) {
      if (!input.name.trim()) throw new Error("Project name is required");
      const project: Project = {
        id: id("project"),
        name: input.name.trim(),
        client: input.client ?? null,
        color: input.color || "#0a84ff",
        billable: input.billable,
        hourly_rate: input.hourly_rate ?? null,
        archived_at: null,
      };
      state.projects = [...state.projects, project];
      emit();
      return project;
    },
    async updateProject(projectId: string, input: ProjectInput) {
      let updated: Project | null = null;
      state.projects = state.projects.map((project) => {
        if (project.id !== projectId) return project;
        updated = {
          ...project,
          name: input.name.trim(),
          client: input.client ?? null,
          color: input.color || project.color,
          billable: input.billable,
          hourly_rate: input.hourly_rate ?? null,
        };
        return updated;
      });
      if (!updated) throw new Error("Project not found");
      emit();
      return updated;
    },
    async archiveProject(projectId: string) {
      let archived: Project | null = null;
      state.projects = state.projects.map((project) => {
        if (project.id !== projectId) return project;
        archived = { ...project, archived_at: new Date().toISOString() };
        return archived;
      });
      if (!archived) throw new Error("Project not found");
      emit();
      return archived;
    },
    async createTask(input: TaskInput) {
      if (!input.name.trim()) throw new Error("Task name is required");
      const task: Task = {
        id: id("task"),
        project_id: input.project_id,
        name: input.name.trim(),
        archived_at: null,
      };
      state.tasks = [...state.tasks, task];
      emit();
      return task;
    },
    async updateTask(taskId: string, input: TaskInput) {
      let updated: Task | null = null;
      state.tasks = state.tasks.map((task) => {
        if (task.id !== taskId) return task;
        updated = {
          ...task,
          project_id: input.project_id,
          name: input.name.trim(),
        };
        return updated;
      });
      if (!updated) throw new Error("Task not found");
      emit();
      return updated;
    },
    async archiveTask(taskId: string) {
      let archived: Task | null = null;
      state.tasks = state.tasks.map((task) => {
        if (task.id !== taskId) return task;
        archived = { ...task, archived_at: new Date().toISOString() };
        return archived;
      });
      if (!archived) throw new Error("Task not found");
      emit();
      return archived;
    },
    async startTracking(projectId: string, taskId: string) {
      commitActive();
      state.active_session = {
        id: id("session"),
        project_id: projectId,
        task_id: taskId,
        mode: "track",
        started_at: new Date().toISOString(),
        paused_at: null,
        elapsed_seconds: 0,
        focus: null,
      };
      emit();
      return state.active_session;
    },
    async startFocus(projectId: string, taskId: string, config: AppConfig) {
      commitActive();
      const now = new Date().toISOString();
      state.active_session = {
        id: id("session"),
        project_id: projectId,
        task_id: taskId,
        mode: "focus",
        started_at: now,
        paused_at: null,
        elapsed_seconds: 0,
        focus: {
          focus_session_id: id("focus"),
          phase: "focus",
          round_index: 1,
          total_rounds: config.pomodoro.rounds,
          phase_started_at: now,
          phase_duration_seconds: config.pomodoro.focus_minutes * 60,
        },
      };
      emit();
      return state.active_session;
    },
    async pauseSession() {
      if (state.active_session && !state.active_session.paused_at) {
        state.active_session.paused_at = new Date().toISOString();
      }
      emit();
      return state.active_session;
    },
    async resumeSession() {
      if (state.active_session) {
        state.active_session.paused_at = null;
      }
      emit();
      return state.active_session;
    },
    async stopSession() {
      const entry = commitActive();
      emit();
      return entry;
    },
    async skipFocusPhase() {
      if (state.active_session?.focus) {
        state.active_session.focus.phase =
          state.active_session.focus.phase === "focus" ? "short_break" : "focus";
        state.active_session.focus.phase_started_at = new Date().toISOString();
      }
      emit();
      return state.active_session;
    },
    async createManualEntry(input: ManualEntryInput) {
      const project = state.projects.find((candidate) => candidate.id === input.project_id);
      const task = state.tasks.find((candidate) => candidate.id === input.task_id);
      if (!project || !task) throw new Error("Project and task are required");
      const started = new Date(input.started_at);
      const entry: TimeEntry = {
        id: id("entry"),
        project_id: input.project_id,
        task_id: input.task_id,
        started_at: started.toISOString(),
        ended_at: new Date(started.getTime() + input.duration_seconds * 1000).toISOString(),
        duration_seconds: input.duration_seconds,
        note: input.note ?? null,
        source: "manual",
      };
      state.today_entries = [{ entry, project, task }, ...state.today_entries];
      touchWeek(input.duration_seconds);
      emit();
      return entry;
    },
    async updateEntryDurationNote(entryId: string, durationSeconds: number, note: string | null) {
      let updated: TimeEntry | null = null;
      state.today_entries = state.today_entries.map((item) => {
        if (item.entry.id !== entryId) return item;
        updated = {
          ...item.entry,
          duration_seconds: durationSeconds,
          ended_at: new Date(new Date(item.entry.started_at).getTime() + durationSeconds * 1000).toISOString(),
          note,
        };
        return { ...item, entry: updated };
      });
      if (!updated) throw new Error("Entry not found");
      emit();
      return updated;
    },
    async deleteTimeEntry(entryId: string) {
      const item = state.today_entries.find((candidate) => candidate.entry.id === entryId);
      if (!item) throw new Error("Entry not found");
      state.today_entries = state.today_entries.filter((candidate) => candidate.entry.id !== entryId);
      emit();
      return item.entry;
    },
    async updateConfig(patch: Partial<AppConfig>) {
      state.config = {
        ...state.config,
        general: { ...state.config.general, ...patch.general },
        appearance: { ...state.config.appearance, ...patch.appearance },
        pomodoro: { ...state.config.pomodoro, ...patch.pomodoro },
      };
      emit();
      return clone(state.config);
    },
  };
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function elapsed(startedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
