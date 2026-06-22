import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, ViewStyle } from "react-native";
import {
  createManualEntry,
  createProject,
  createTask,
  deleteTimeEntry,
  archiveProject,
  archiveTask,
  getAppState,
  onAppState,
  pauseSession,
  recordUserActivity,
  resumeSession,
  skipFocusPhase,
  startFocus,
  startTracking,
  stopSession,
  updateConfig,
  updateEntryDurationNote,
  updateProject,
  updateTask,
} from "./lib/api";
import { formatDuration } from "./lib/format";
import { AppStateView, ManualEntryInput, Project, ProjectInput, Task, TaskInput, TodayEntryView } from "./types/app";

type Route = "home" | "settings" | "manual";
type SettingsPage = "general" | "focus" | "projects" | "tasks";
type SettingsEditor =
  | { type: "newProject" }
  | { type: "editProject"; project: Project }
  | { type: "newTask" }
  | { type: "editTask"; task: Task }
  | null;

function useSystemTheme(): "light" | "dark" {
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return dark ? "dark" : "light";
}

export function App() {
  const [state, setState] = useState<AppStateView | null>(null);
  const [route, setRoute] = useState<Route>("home");
  const [settingsPage, setSettingsPage] = useState<SettingsPage>("general");
  const [settingsEditor, setSettingsEditor] = useState<SettingsEditor>(null);
  const [newTimerOpen, setNewTimerOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TodayEntryView | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectName, setProjectName] = useState("Acme Website");
  const [taskName, setTaskName] = useState("Build component library");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [idlePromptSeconds, setIdlePromptSeconds] = useState<number | null>(null);

  const systemTheme = useSystemTheme();
  const resolvedTheme: "light" | "dark" = state
    ? state.theme === "dark" ? "dark" : state.theme === "light" ? "light" : systemTheme
    : systemTheme;
  // resolvedTheme available for styling — full token application is a future task
  void resolvedTheme;

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const hasTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (hasTauri) {
      void import("@tauri-apps/api/event").then(({ listen }) => {
        void listen<number>("session-idle-paused", (event) => {
          setIdlePromptSeconds(event.payload);
        }).then((fn) => { unlisten = fn; });
      });
    }
    return () => unlisten?.();
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await getAppState();
      setState(next);
      setSelectedProjectId((current) => current || next.projects.find((p) => !p.archived_at)?.id || "");
      setProjectName((current) => current || next.projects.find((p) => !p.archived_at)?.name || "");
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    let dispose: (() => void) | undefined;
    void onAppState((next) => {
      setState(next);
      setSelectedProjectId((current) => current || next.projects.find((p) => !p.archived_at)?.id || "");
      setProjectName((current) => current || next.projects.find((p) => !p.archived_at)?.name || "");
    }).then((unlisten) => {
      dispose = unlisten;
    });
    return () => dispose?.();
  }, [refresh]);

  useEffect(() => {
    let lastSent = 0;
    const handler = () => {
      const ts = Date.now();
      if (ts - lastSent > 15_000) {
        lastSent = ts;
        void recordUserActivity();
      }
    };
    window.addEventListener("mousemove", handler);
    window.addEventListener("keydown", handler);
    window.addEventListener("pointerdown", handler);
    return () => {
      window.removeEventListener("mousemove", handler);
      window.removeEventListener("keydown", handler);
      window.removeEventListener("pointerdown", handler);
    };
  }, []);

  const selectedProject = useMemo(
    () =>
      state?.projects.find((project) => project.id === selectedProjectId) ??
      state?.projects.find((project) => project.name.toLowerCase() === projectName.trim().toLowerCase()),
    [projectName, selectedProjectId, state?.projects],
  );

  const selectedTask = useMemo(() => {
    if (!state || !selectedProject) return undefined;
    return state.tasks.find(
      (task) =>
        task.project_id === selectedProject.id &&
        task.name.toLowerCase() === taskName.trim().toLowerCase(),
    );
  }, [selectedProject, state, taskName]);

  const viewport = useViewportSize();
  const popoverScale = Math.min(1, (viewport.width - 48) / 680, (viewport.height - 98) / 1112);
  const settingsScale = Math.min(1, (viewport.width - 48) / 1364, (viewport.height - 48) / 1214);

  const run = useCallback(
    async (action: () => Promise<unknown>, after?: () => void) => {
      try {
        await action();
        after?.();
        await refresh();
        setError(null);
      } catch (err) {
        setError(errorMessage(err));
      }
    },
    [refresh],
  );

  const startSelectedTimer = useCallback(async () => {
    if (!state) return;
    let project = selectedProject;
    if (!project) {
      project = await createProject({
        name: projectName.trim() || "New Project",
        client: "Development",
        color: "#1688f8",
        billable: false,
        hourly_rate: null,
      });
    }
    let task = selectedTask;
    if (!task) {
      task = await createTask({ project_id: project.id, name: taskName.trim() || "Task name" });
    }
    if (focusMode) {
      await startFocus(project.id, task.id, state.config);
    } else {
      await startTracking(project.id, task.id);
    }
  }, [focusMode, projectName, selectedProject, selectedTask, state, taskName]);

  if (!state) {
    return (
      <View style={styles.desktop}>
        <Text style={styles.loading}>Loading Time & Flow</Text>
      </View>
    );
  }

  return (
    <View style={styles.desktop}>
      {route === "settings" ? (
        <View style={[styles.scaledSettingsWrap, { width: 1364 * settingsScale, height: 1214 * settingsScale }]}>
          <View style={scaledSurfaceStyle(settingsScale)}>
            <SettingsWindow
              state={state}
              page={settingsPage}
              setPage={setSettingsPage}
              editor={settingsEditor}
              setEditor={setSettingsEditor}
              onClose={() => setRoute("home")}
              onPatch={(patch) => void run(() => updateConfig(patch))}
              onCreateProject={(input) => void run(() => createProject(input), () => setSettingsEditor(null))}
              onUpdateProject={(id, input) => void run(() => updateProject(id, input), () => setSettingsEditor(null))}
              onArchiveProject={(id) => void run(() => archiveProject(id), () => setSettingsEditor(null))}
              onCreateTask={(input) => void run(() => createTask(input), () => setSettingsEditor(null))}
              onUpdateTask={(id, input) => void run(() => updateTask(id, input), () => setSettingsEditor(null))}
              onArchiveTask={(id) => void run(() => archiveTask(id), () => setSettingsEditor(null))}
            />
          </View>
        </View>
      ) : (
        <>
          <MenuBar active={Boolean(state.active_session)} elapsed={state.active_session?.elapsed_seconds ?? 0} now={now} />
          <View style={[styles.scaledPopoverWrap, { width: 680 * popoverScale, height: 1112 * popoverScale }]}>
            <View style={scaledSurfaceStyle(popoverScale)}>
              <View style={styles.popoverStage}>
                <MacPopover
                  state={state}
                  now={now}
                  onNewTimer={() => {
                    setFocusMode(false);
                    setNewTimerOpen(true);
                  }}
                  onSettings={() => setRoute("settings")}
                  onResume={(item) => void run(() => startTracking(item.entry.project_id, item.entry.task_id))}
                  onEdit={setEditingEntry}
                  onStop={() => void run(stopSession)}
                  onPause={() => void run(pauseSession)}
                  onResumeSession={() => void run(resumeSession)}
                  onManualEntry={() => setRoute("manual")}
                />
                {newTimerOpen ? (
                  <NewTimerOverlay
                    state={state}
                    focusMode={focusMode}
                    setFocusMode={setFocusMode}
                    selectedProject={selectedProject}
                    selectedProjectId={selectedProjectId}
                    setSelectedProjectId={setSelectedProjectId}
                    projectName={projectName}
                    setProjectName={setProjectName}
                    taskName={taskName}
                    setTaskName={setTaskName}
                    onCancel={() => setNewTimerOpen(false)}
                    onStart={() => void run(startSelectedTimer, () => setNewTimerOpen(false))}
                  />
                ) : null}
                {editingEntry ? (
                  <EntryEditOverlay
                    item={editingEntry}
                    onCancel={() => setEditingEntry(null)}
                    onSave={(durationSeconds, note) =>
                      void run(
                        () => updateEntryDurationNote(editingEntry.entry.id, durationSeconds, note),
                        () => setEditingEntry(null),
                      )
                    }
                    onDelete={() =>
                      void run(
                        () => deleteTimeEntry(editingEntry.entry.id),
                        () => setEditingEntry(null),
                      )
                    }
                  />
                ) : null}
                {route === "manual" ? (
                  <ManualEntryOverlay
                    state={state}
                    onCancel={() => setRoute("home")}
                    onSave={(input) => void run(() => createManualEntry(input), () => setRoute("home"))}
                  />
                ) : null}
                {idlePromptSeconds !== null ? (
                  <IdlePromptOverlay
                    idleSeconds={idlePromptSeconds}
                    onKeep={() => { void run(resumeSession); setIdlePromptSeconds(null); }}
                    onDiscard={() => { void run(stopSession); setIdlePromptSeconds(null); }}
                  />
                ) : null}
              </View>
            </View>
          </View>
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function useViewportSize() {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

function scaledSurfaceStyle(scale: number): ViewStyle {
  return {
    transform: [{ scale }],
    transformOrigin: "top center",
  } as unknown as ViewStyle;
}

function MenuBar({ active, elapsed, now }: { active: boolean; elapsed: number; now: Date }) {
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dateStr = `${dayNames[now.getDay()]} ${now.getDate()} ${monthNames[now.getMonth()]}  ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  return (
    <View style={styles.menuBar}>
      <View style={[styles.trayPill, active && styles.trayPillActive]}>
        <View style={styles.recDot} />
        <Text style={styles.trayIcon}>◷</Text>
        <Text style={styles.trayTime}>{active ? formatDuration(elapsed) : "--:--"}</Text>
      </View>
      <Text style={styles.menuIcon}>⌁</Text>
      <Text style={styles.menuIcon}>▰</Text>
      <Text style={styles.menuDate}>{dateStr}</Text>
    </View>
  );
}

function MacPopover({
  state,
  now,
  onNewTimer,
  onSettings,
  onResume,
  onEdit,
  onStop,
  onPause,
  onResumeSession,
  onManualEntry,
}: {
  state: AppStateView;
  now: Date;
  onNewTimer: () => void;
  onSettings: () => void;
  onResume: (item: TodayEntryView) => void;
  onEdit: (item: TodayEntryView) => void;
  onStop: () => void;
  onPause: () => void;
  onResumeSession: () => void;
  onManualEntry: () => void;
}) {
  const rows = state.today_entries;
  const activeId = state.active_session?.task_id;

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const calTitle = `Today, ${now.getDate()} ${monthNames[now.getMonth()]}`;

  const dayAbbrevs = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const todayLabel = dayAbbrevs[now.getDay()];

  const activeProjects = state.projects.filter((p) => !p.archived_at);
  return (
    <View style={styles.popover}>
      <View style={styles.popTopLip} />
      <View style={styles.calendarHeader}>
        <Text style={styles.calendarTitle}>{calTitle}</Text>
        <View style={styles.weekNav}>
          {state.week.map((day) => {
            const isToday = day.label === todayLabel;
            return (
              <View key={day.label} style={styles.dayCell}>
                <View style={isToday ? styles.todayBubble : undefined}>
                  <Text style={isToday ? styles.todayLetter : styles.dayLetter}>{day.label[0]}</Text>
                </View>
                <Text style={isToday ? styles.dayValueActive : styles.dayValue}>
                  {day.seconds > 0 ? formatShort(day.seconds) : ""}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      <ScrollView style={styles.entryList}>
        {activeProjects.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Welcome to Time & Flow</Text>
            <Text style={styles.emptyStateSubtext}>Create a project to start tracking time.</Text>
            <Pressable onPress={onSettings} style={styles.emptyStateAction}>
              <Text style={styles.emptyStateActionText}>Create a Project</Text>
            </Pressable>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No time logged today</Text>
            <Pressable onPress={onNewTimer} style={styles.emptyStateAction}>
              <Text style={styles.emptyStateActionText}>Start a Timer</Text>
            </Pressable>
          </View>
        ) : (
          rows.map((item) => {
            const running = activeId === item.task.id;
            const paused = running && Boolean(state.active_session?.paused_at);
            return (
              <Pressable key={item.entry.id} onPress={() => onEdit(item)} style={styles.entryRow}>
                <View style={[styles.projectRail, { backgroundColor: item.project.color }]} />
                <View style={styles.entryText}>
                  <Text style={styles.projectName}>{item.project.name}</Text>
                  <Text style={styles.taskTitle}>{item.task.name}</Text>
                  {item.entry.note ? <Text style={styles.note}>{item.entry.note}</Text> : null}
                </View>
                <Text style={styles.rowDuration}>{formatShort(item.entry.duration_seconds)}</Text>
                {running ? (
                  <View style={styles.rowButtonGroup}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={paused ? `Resume ${item.task.name}` : `Pause ${item.task.name}`}
                      onPress={paused ? onResumeSession : onPause}
                      style={[styles.rowPlay, styles.rowStop]}
                    >
                      <Text style={styles.stopGlyph}>{paused ? "▶" : "‖"}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Stop ${item.task.name}`}
                      onPress={onStop}
                      style={[styles.rowPlay, styles.rowStop]}
                    >
                      <Text style={styles.stopGlyph}>■</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Resume ${item.task.name}`}
                    onPress={() => onResume(item)}
                    style={styles.rowPlay}
                  >
                    <Text style={styles.playGlyph}>▶</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })
        )}
        <View style={styles.grayFill} />
      </ScrollView>
      <View style={styles.footer}>
        <Pressable accessibilityRole="button" accessibilityLabel="New Timer" onPress={onNewTimer} style={styles.newTimerButton}>
          <Text style={styles.buttonPlay}>▶</Text>
          <Text style={styles.newTimerText}>New Timer</Text>
        </Pressable>
        <Pressable onPress={onManualEntry} style={styles.manualButton}>
          <Text style={styles.manualText}>+ Manual</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={onSettings} style={styles.gearButton}>
          <Text style={styles.gear}>⚙</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ManualEntryOverlay({
  state,
  onCancel,
  onSave,
}: {
  state: AppStateView;
  onCancel: () => void;
  onSave: (input: ManualEntryInput) => void;
}) {
  const activeProjects = state.projects.filter((p) => !p.archived_at);
  const [projectId, setProjectId] = useState(activeProjects[0]?.id ?? "");
  const [taskId, setTaskId] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [note, setNote] = useState("");
  const [startedAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - 30);
    return d.toISOString().slice(0, 16);
  });

  const projectTasks = state.tasks.filter((t) => t.project_id === projectId && !t.archived_at);
  const durationSeconds = Math.max(0, (parseInt(minutes, 10) || 0) * 60);
  const canSave = projectId.length > 0 && taskId.length > 0 && durationSeconds > 0;

  return (
    <View style={styles.overlay}>
      <Text style={styles.overlayTitle}>Manual Entry</Text>
      <Text style={styles.formLabel}>Project</Text>
      <View style={styles.selectField}>
        <View style={[styles.projectDot, { backgroundColor: activeProjects.find(p => p.id === projectId)?.color ?? "#1688f8" }]} />
        <Text style={[styles.taskInput, { paddingVertical: 4 }]}>
          {activeProjects.find(p => p.id === projectId)?.name ?? "Select project"}
        </Text>
      </View>
      <View style={styles.autocompleteList}>
        {activeProjects.map((project) => (
          <Pressable
            key={project.id}
            onPress={() => { setProjectId(project.id); setTaskId(""); }}
            style={styles.suggestionRow}
          >
            <View style={styles.suggestionLine}>
              <View style={[styles.projectDot, { backgroundColor: project.color }]} />
              <Text style={styles.suggestionTitle}>{project.name}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      <Text style={styles.formLabel}>Task</Text>
      <View style={styles.autocompleteList}>
        {projectTasks.map((task) => (
          <Pressable
            key={task.id}
            onPress={() => setTaskId(task.id)}
            style={[styles.suggestionRow, taskId === task.id && { backgroundColor: "#1d3557" }]}
          >
            <Text style={styles.suggestionTitle}>{task.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.formLabel}>Duration (minutes)</Text>
      <View style={styles.selectField}>
        <TextInput
          accessibilityLabel="Duration minutes"
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="numeric"
          style={styles.taskInput}
        />
        <Text style={styles.unitText}>min</Text>
      </View>
      <Text style={styles.formLabel}>Note (optional)</Text>
      <View style={[styles.selectField, styles.noteField]}>
        <TextInput
          accessibilityLabel="Entry note"
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="Optional"
          placeholderTextColor="#999ba0"
          style={[styles.taskInput, styles.noteInput]}
        />
      </View>
      <View style={styles.modalActions}>
        <Pressable onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => canSave && onSave({ project_id: projectId, task_id: taskId, started_at: new Date(startedAt).toISOString(), duration_seconds: durationSeconds, note: note.trim() || null })}
          style={[styles.startButton, !canSave && { opacity: 0.45 }]}
          disabled={!canSave}
        >
          <Text style={styles.startText}>Save Entry</Text>
        </Pressable>
      </View>
    </View>
  );
}

function IdlePromptOverlay({
  idleSeconds,
  onKeep,
  onDiscard,
}: {
  idleSeconds: number;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const minutes = Math.round(idleSeconds / 60);
  return (
    <View style={[styles.overlay, { justifyContent: "center" }]}>
      <Text style={styles.overlayTitle}>Mac was idle</Text>
      <Text style={[styles.editRuleText, { textAlign: "center", marginBottom: 16 }]}>
        Your timer was paused after {minutes} minute{minutes !== 1 ? "s" : ""} of inactivity.
        What would you like to do with this time?
      </Text>
      <View style={styles.modalActions}>
        <Pressable onPress={onDiscard} style={styles.deleteButton}>
          <Text style={styles.deleteText}>Discard Idle Time</Text>
        </Pressable>
        <Pressable onPress={onKeep} style={styles.startButton}>
          <Text style={styles.startText}>Keep & Resume</Text>
        </Pressable>
      </View>
    </View>
  );
}

function EntryEditOverlay({
  item,
  onCancel,
  onSave,
  onDelete,
}: {
  item: TodayEntryView;
  onCancel: () => void;
  onSave: (durationSeconds: number, note: string | null) => void;
  onDelete: () => void;
}) {
  const [minutes, setMinutes] = useState(String(Math.max(1, Math.round(item.entry.duration_seconds / 60))));
  const [note, setNote] = useState(item.entry.note ?? "");
  const durationSeconds = Math.max(0, Number.parseInt(minutes, 10) || 0) * 60;

  return (
    <View style={styles.overlay}>
      <Text style={styles.overlayTitle}>Edit Entry</Text>
      <View style={styles.editSummary}>
        <View style={[styles.projectRail, { backgroundColor: item.project.color, height: 58 }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.projectName}>{item.project.name}</Text>
          <Text style={styles.taskTitle}>{item.task.name}</Text>
        </View>
      </View>
      <Text style={styles.formLabel}>Duration</Text>
      <View style={styles.selectField}>
        <TextInput
          accessibilityLabel="Duration minutes"
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="numeric"
          style={styles.taskInput}
        />
        <Text style={styles.unitText}>min</Text>
      </View>
      <Text style={styles.formLabel}>Note</Text>
      <View style={[styles.selectField, styles.noteField]}>
        <TextInput
          accessibilityLabel="Entry note"
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="Optional"
          placeholderTextColor="#999ba0"
          style={[styles.taskInput, styles.noteInput]}
        />
      </View>
      <Text style={styles.editRuleText}>
        Stopped entries allow duration and note changes. Project and task stay fixed.
      </Text>
      <View style={styles.modalActions}>
        <Pressable onPress={onDelete} style={styles.deleteButton}>
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
        <Pressable onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => onSave(durationSeconds, note.trim() ? note.trim() : null)}
          style={[styles.startButton, durationSeconds <= 0 && { opacity: 0.45 }]}
          disabled={durationSeconds <= 0}
        >
          <Text style={styles.startText}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ManualEntryOverlay({
  state,
  onCancel,
  onSave,
}: {
  state: AppStateView;
  onCancel: () => void;
  onSave: (input: ManualEntryInput) => void;
}) {
  const activeProjects = state.projects.filter((p) => !p.archived_at);
  const [projectId, setProjectId] = useState(activeProjects[0]?.id ?? "");
  const [taskId, setTaskId] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [note, setNote] = useState("");

  const projectTasks = state.tasks.filter((t) => t.project_id === projectId && !t.archived_at);
  const durationSeconds = Math.max(0, (parseInt(minutes, 10) || 0) * 60);
  const canSave = projectId.length > 0 && taskId.length > 0 && durationSeconds > 0;

  return (
    <View style={styles.overlay}>
      <Text style={styles.overlayTitle}>Manual Entry</Text>
      <Text style={styles.formLabel}>Project</Text>
      <View style={styles.autocompleteList}>
        {activeProjects.map((project) => (
          <Pressable
            key={project.id}
            accessibilityRole="button"
            onPress={() => { setProjectId(project.id); setTaskId(""); }}
            style={[styles.suggestionRow, projectId === project.id && { backgroundColor: "#1d3557" }]}
          >
            <View style={styles.suggestionLine}>
              <View style={[styles.projectDot, { backgroundColor: project.color }]} />
              <Text style={styles.suggestionTitle}>{project.name}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      <Text style={styles.formLabel}>Task</Text>
      <View style={styles.autocompleteList}>
        {projectTasks.length === 0 ? (
          <Text style={[styles.suggestionTitle, { color: "#9ca3af", padding: 8 }]}>No tasks — select a project first</Text>
        ) : projectTasks.map((task) => (
          <Pressable
            key={task.id}
            accessibilityRole="button"
            onPress={() => setTaskId(task.id)}
            style={[styles.suggestionRow, taskId === task.id && { backgroundColor: "#1d3557" }]}
          >
            <Text style={styles.suggestionTitle}>{task.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.formLabel}>Duration (minutes)</Text>
      <View style={styles.selectField}>
        <TextInput
          accessibilityLabel="Duration minutes"
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="numeric"
          style={styles.taskInput}
        />
        <Text style={styles.unitText}>min</Text>
      </View>
      <Text style={styles.formLabel}>Note (optional)</Text>
      <View style={[styles.selectField, styles.noteField]}>
        <TextInput
          accessibilityLabel="Entry note"
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="Optional"
          placeholderTextColor="#999ba0"
          style={[styles.taskInput, styles.noteInput]}
        />
      </View>
      <View style={styles.modalActions}>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (!canSave) return;
            onSave({
              project_id: projectId,
              task_id: taskId,
              started_at: new Date(Date.now() - durationSeconds * 1000).toISOString(),
              duration_seconds: durationSeconds,
              note: note.trim() || null,
            });
          }}
          style={[styles.startButton, !canSave && { opacity: 0.45 }]}
          disabled={!canSave}
        >
          <Text style={styles.startText}>Save Entry</Text>
        </Pressable>
      </View>
    </View>
  );
}

function IdlePromptOverlay({
  idleSeconds,
  onKeep,
  onDiscard,
}: {
  idleSeconds: number;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const minutes = Math.round(idleSeconds / 60);
  return (
    <View style={[styles.overlay, { justifyContent: "center" }]}>
      <Text style={styles.overlayTitle}>Mac was idle</Text>
      <Text style={[styles.editRuleText, { textAlign: "center" as const, marginBottom: 16 }]}>
        {`Your timer was paused after ${minutes} minute${minutes !== 1 ? "s" : ""} of inactivity. Keep this time or discard it?`}
      </Text>
      <View style={styles.modalActions}>
        <Pressable accessibilityRole="button" onPress={onDiscard} style={styles.deleteButton}>
          <Text style={styles.deleteText}>Discard Idle Time</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onKeep} style={styles.startButton}>
          <Text style={styles.startText}>Keep &amp; Resume</Text>
        </Pressable>
      </View>
    </View>
  );
}

function NewTimerOverlay({
  state,
  focusMode,
  setFocusMode,
  selectedProject,
  selectedProjectId,
  setSelectedProjectId,
  projectName,
  setProjectName,
  taskName,
  setTaskName,
  onCancel,
  onStart,
}: {
  state: AppStateView;
  focusMode: boolean;
  setFocusMode: (value: boolean) => void;
  selectedProject?: Project;
  selectedProjectId: string;
  setSelectedProjectId: (value: string) => void;
  projectName: string;
  setProjectName: (value: string) => void;
  taskName: string;
  setTaskName: (value: string) => void;
  onCancel: () => void;
  onStart: () => void;
}) {
  const activeProjectId = selectedProject?.id ?? selectedProjectId;
  const projectTasks = state.tasks.filter((task) => task.project_id === activeProjectId && !task.archived_at);
  const projectSuggestions = state.projects
    .filter((project) => !project.archived_at)
    .filter((project) => project.name.toLowerCase().includes(projectName.trim().toLowerCase()))
    .slice(0, 5);
  const taskSuggestions = projectTasks
    .filter((task) => task.name.toLowerCase().includes(taskName.trim().toLowerCase()))
    .slice(0, 5);
  return (
    <View style={styles.overlay}>
      <Text style={styles.overlayTitle}>New Timer</Text>
      <Text style={styles.formLabel}>Project</Text>
      <View style={styles.selectField}>
        <View style={[styles.projectDot, { backgroundColor: selectedProject?.color ?? "#1688f8" }]} />
        <TextInput
          accessibilityLabel="Project"
          value={projectName}
          onChangeText={(value) => {
            setProjectName(value);
            const exact = state.projects.find(
              (project) => project.name.toLowerCase() === value.trim().toLowerCase(),
            );
            setSelectedProjectId(exact?.id ?? "");
          }}
          placeholder="Project"
          placeholderTextColor="#77787c"
          style={styles.taskInput}
        />
        <Text style={styles.fieldChevron}>⌄</Text>
      </View>
      <View style={styles.autocompleteList}>
        {projectSuggestions.map((project) => (
          <Pressable
            key={project.id}
            onPress={() => {
              setSelectedProjectId(project.id);
              setProjectName(project.name);
            }}
            style={styles.suggestionRow}
          >
            <View style={styles.suggestionLine}>
              <View style={[styles.projectDot, { backgroundColor: project.color }]} />
              <View>
                <Text style={styles.suggestionTitle}>{project.name}</Text>
                <Text style={styles.suggestionMeta}>{project.client || `${state.tasks.filter((task) => task.project_id === project.id).length} tasks`}</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </View>
      <Text style={styles.formLabel}>Task</Text>
      <View style={styles.selectField}>
        <TextInput
          accessibilityLabel="Task name"
          value={taskName}
          onChangeText={setTaskName}
          placeholder="Task name"
          placeholderTextColor="#77787c"
          style={styles.taskInput}
        />
        <Text style={styles.fieldChevron}>⌄</Text>
      </View>
      {!focusMode ? (
        <View style={styles.autocompleteList}>
          {taskSuggestions.map((task) => (
            <Pressable key={task.id} onPress={() => setTaskName(task.name)} style={styles.suggestionRow}>
              <Text style={styles.suggestionTitle}>{task.name}</Text>
              <Text style={styles.suggestionMeta}>{selectedProject?.name ?? "Project"} · Development</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Pressable onPress={() => setFocusMode(!focusMode)} style={styles.focusToggle}>
        <View style={[styles.checkbox, focusMode && styles.checkboxOn]}>
          {focusMode ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <View>
          <Text style={styles.focusTitle}>Focus Session</Text>
          <Text style={styles.focusSub}>Use Pomodoro timing for this timer</Text>
        </View>
      </Pressable>
      {focusMode ? <FocusOptions /> : null}
      <View style={styles.modalActions}>
        <Pressable onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={onStart} style={styles.startButton}>
          <Text style={styles.buttonPlay}>▶</Text>
          <Text style={styles.startText}>{focusMode ? "Start Focus" : "Start Timer"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function FocusOptions() {
  return (
    <>
      <View style={styles.optionGroup}>
        <Stepper label="Focus" sub="Default from Settings" value="25 min" />
        <Stepper label="Rounds" sub="Default from Settings" value="4×" />
      </View>
      <View style={styles.optionGroup}>
        <Stepper label="Break time" sub="Length of each break" value="5 min" />
        <Stepper label="Break every" sub="How often to pause" value="Round" />
      </View>
    </>
  );
}

function Stepper({ label, sub, value }: { label: string; sub: string; value: string }) {
  return (
    <View style={styles.stepperRow}>
      <View>
        <Text style={styles.stepperLabel}>{label}</Text>
        <Text style={styles.stepperSub}>{sub}</Text>
      </View>
      <View style={styles.stepper}>
        <Text style={styles.stepperSymbol}>−</Text>
        <Text style={styles.stepperValue}>{value}</Text>
        <Text style={styles.stepperSymbol}>+</Text>
      </View>
    </View>
  );
}

function SettingsWindow({
  state,
  page,
  setPage,
  editor,
  setEditor,
  onClose,
  onPatch,
  onCreateProject,
  onUpdateProject,
  onArchiveProject,
  onCreateTask,
  onUpdateTask,
  onArchiveTask,
}: {
  state: AppStateView;
  page: SettingsPage;
  setPage: (page: SettingsPage) => void;
  editor: SettingsEditor;
  setEditor: (editor: SettingsEditor) => void;
  onClose: () => void;
  onPatch: (patch: Partial<AppStateView["config"]>) => void;
  onCreateProject: (input: ProjectInput) => void;
  onUpdateProject: (id: string, input: ProjectInput) => void;
  onArchiveProject: (id: string) => void;
  onCreateTask: (input: TaskInput) => void;
  onUpdateTask: (id: string, input: TaskInput) => void;
  onArchiveTask: (id: string) => void;
}) {
  const title = editor
    ? editor.type === "newProject"
      ? "New Project"
      : editor.type === "editProject"
        ? "Edit Project"
        : editor.type === "newTask"
          ? "New Task"
          : "Edit Task"
    : page[0].toUpperCase() + page.slice(1);
  const navigatePage = (next: SettingsPage) => {
    setEditor(null);
    setPage(next);
  };
  return (
    <View style={styles.settingsWindow}>
      <View style={styles.windowTop}>
        <View style={styles.traffic}>
          <Pressable onPress={onClose} style={[styles.light, { backgroundColor: "#ff5f57" }]} />
          <View style={[styles.light, { backgroundColor: "#ffbd2e" }]} />
          <View style={[styles.light, { backgroundColor: "#28c840" }]} />
        </View>
        <Text style={styles.windowTitle}>{title}</Text>
      </View>
      <View style={styles.settingsBody}>
        <View style={styles.sidebar}>
          <SidebarItem label="General" icon="◷" active={page === "general" && !editor} onPress={() => navigatePage("general")} />
          <SidebarItem label="Focus" icon="◷" active={page === "focus" && !editor} onPress={() => navigatePage("focus")} />
          <SidebarItem label="Projects" icon="╦" active={page === "projects" || Boolean(editor?.type.includes("Project"))} onPress={() => navigatePage("projects")} />
          <SidebarItem label="Tasks" icon="☰" active={page === "tasks" || Boolean(editor?.type.includes("Task"))} onPress={() => navigatePage("tasks")} />
        </View>
        <ScrollView style={styles.settingsPane} contentContainerStyle={styles.settingsPaneContent}>
          {editor?.type === "newProject" ? (
            <ProjectForm
              onCancel={() => setEditor(null)}
              onSubmit={onCreateProject}
            />
          ) : editor?.type === "editProject" ? (
            <ProjectForm
              project={editor.project}
              onCancel={() => setEditor(null)}
              onSubmit={(input) => onUpdateProject(editor.project.id, input)}
              onArchive={() => onArchiveProject(editor.project.id)}
            />
          ) : editor?.type === "newTask" ? (
            <TaskForm
              state={state}
              onCancel={() => setEditor(null)}
              onSubmit={onCreateTask}
            />
          ) : editor?.type === "editTask" ? (
            <TaskForm
              state={state}
              task={editor.task}
              onCancel={() => setEditor(null)}
              onSubmit={(input) => onUpdateTask(editor.task.id, input)}
              onArchive={() => onArchiveTask(editor.task.id)}
            />
          ) : page === "general" ? (
            <GeneralSettings config={state.config} onPatch={onPatch} />
          ) : page === "focus" ? (
            <FocusSettings config={state.config} onPatch={onPatch} />
          ) : page === "projects" ? (
            <ProjectSettings state={state} onNew={() => setEditor({ type: "newProject" })} onEdit={(project) => setEditor({ type: "editProject", project })} />
          ) : (
            <TaskSettings state={state} onNew={() => setEditor({ type: "newTask" })} onEdit={(task) => setEditor({ type: "editTask", task })} />
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function SidebarItem({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.sidebarItem, active && styles.sidebarItemActive]}>
      <Text style={[styles.sidebarIcon, active && styles.sidebarTextActive]}>{icon}</Text>
      <Text style={[styles.sidebarText, active && styles.sidebarTextActive]}>{label}</Text>
    </Pressable>
  );
}

function GeneralSettings({
  config,
  onPatch,
}: {
  config: AppStateView["config"];
  onPatch: (patch: Partial<AppStateView["config"]>) => void;
}) {
  return (
    <>
      <Text style={styles.settingsSection}>APPEARANCE</Text>
      <View style={styles.segmentOuter}>
        {(["system", "light", "dark"] as const).map((mode) => (
          <Pressable key={mode} onPress={() => onPatch({ appearance: { mode } })} style={[styles.segment, config.appearance.mode === mode && styles.segmentActive]}>
            <Text style={styles.segmentText}>{mode[0].toUpperCase() + mode.slice(1)}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.settingsSection}>STARTUP</Text>
      <View style={styles.prefGroup}>
        <PrefToggle
          title="Idle detection"
          sub="Prompt when the Mac has been idle."
          value={config.general.idle_auto_pause_enabled}
          onPress={() =>
            onPatch({
              general: {
                ...config.general,
                idle_auto_pause_enabled: !config.general.idle_auto_pause_enabled,
              },
            })
          }
        />
        <PrefToggle
          title="Launch at login"
          sub="Start Time & Flow automatically."
          value={config.general.launch_at_login}
          onPress={() =>
            onPatch({
              general: {
                ...config.general,
                launch_at_login: !config.general.launch_at_login,
              },
            })
          }
        />
      </View>
    </>
  );
}

function FocusSettings({
  config,
  onPatch,
}: {
  config: AppStateView["config"];
  onPatch: (patch: Partial<AppStateView["config"]>) => void;
}) {
  const pomodoro = config.pomodoro;
  const update = (key: keyof typeof pomodoro, delta: number) => {
    const next = Math.max(1, Number(pomodoro[key]) + delta);
    onPatch({ pomodoro: { ...pomodoro, [key]: next } });
  };
  return (
    <>
      <Text style={styles.settingsSection}>TIMER</Text>
      <View style={styles.prefGroup}>
        <SettingStepper title="Focus length" value={`${pomodoro.focus_minutes} min`} onMinus={() => update("focus_minutes", -1)} onPlus={() => update("focus_minutes", 1)} />
        <SettingStepper title="Short break" value={`${pomodoro.short_break_minutes} min`} onMinus={() => update("short_break_minutes", -1)} onPlus={() => update("short_break_minutes", 1)} />
        <SettingStepper title="Long break" value={`${pomodoro.long_break_minutes} min`} onMinus={() => update("long_break_minutes", -1)} onPlus={() => update("long_break_minutes", 1)} />
        <SettingStepper title="Rounds before long break" value={`${pomodoro.long_break_after_rounds}`} onMinus={() => update("long_break_after_rounds", -1)} onPlus={() => update("long_break_after_rounds", 1)} />
      </View>
    </>
  );
}

function ProjectSettings({
  state,
  onNew,
  onEdit,
}: {
  state: AppStateView;
  onNew: () => void;
  onEdit: (project: Project) => void;
}) {
  const visibleProjects = state.projects.filter((project) => !project.archived_at);
  return (
    <>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.settingsSection}>PROJECTS</Text>
        <Pressable onPress={onNew} style={styles.secondaryBlueButton}>
          <Text style={styles.secondaryBlueText}>New Project</Text>
        </Pressable>
      </View>
      <View style={styles.prefGroup}>
        <View style={styles.listHeader}>
          <Text style={styles.listHeaderTitle}>Projects</Text>
          <Text style={styles.listHeaderMeta}>{visibleProjects.length} total</Text>
        </View>
        {visibleProjects.map((project) => (
          <View key={project.id} style={styles.manageRow}>
            <View style={[styles.smallDot, { backgroundColor: project.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.manageTitle}>{project.name}</Text>
              <Text style={styles.manageSub}>
                {state.tasks.filter((task) => task.project_id === project.id).length} tasks
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${project.name}`} onPress={() => onEdit(project)}>
              <Text style={styles.editGlyph}>⌕</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </>
  );
}

function TaskSettings({
  state,
  onNew,
  onEdit,
}: {
  state: AppStateView;
  onNew: () => void;
  onEdit: (task: Task) => void;
}) {
  const visibleTasks = state.tasks.filter((task) => !task.archived_at);
  return (
    <>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.settingsSection}>TASKS</Text>
        <Pressable onPress={onNew} style={styles.secondaryBlueButton}>
          <Text style={styles.secondaryBlueText}>New Task</Text>
        </Pressable>
      </View>
      <View style={styles.prefGroup}>
        <View style={styles.listHeader}>
          <Text style={styles.listHeaderTitle}>Tasks</Text>
          <Text style={styles.listHeaderMeta}>{visibleTasks.length} total</Text>
        </View>
        {visibleTasks.map((task) => {
          const project = state.projects.find((candidate) => candidate.id === task.project_id);
          return (
            <View key={task.id} style={styles.manageRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.manageTitle}>{task.name}</Text>
                <Text style={styles.manageSub}>{project?.name ?? "Global task"}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${task.name}`} onPress={() => onEdit(task)}>
                <Text style={styles.editGlyph}>⌕</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </>
  );
}

function ProjectForm({
  project,
  onSubmit,
  onCancel,
  onArchive,
}: {
  project?: Project;
  onSubmit: (input: ProjectInput) => void;
  onCancel: () => void;
  onArchive?: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [client, setClient] = useState(project?.client ?? "");
  const [color, setColor] = useState(project?.color ?? "#4295ff");
  const [billable, setBillable] = useState(project?.billable ?? false);
  const [hourlyRate, setHourlyRate] = useState(project?.hourly_rate ? String(project.hourly_rate) : "");
  const canSave = name.trim().length > 0;
  const colors = ["#4295ff", "#9b9da1", "#c45cf1", "#ffab35", "#52d273", "#ff5f57"];

  return (
    <>
      <Text style={styles.settingsSection}>{project ? "PROJECT" : "NEW PROJECT"}</Text>
      <View style={styles.prefGroup}>
        <FormTextRow label="Name" value={name} onChange={setName} placeholder="Acme Website" />
        <FormTextRow label="Client" value={client} onChange={setClient} placeholder="Optional" />
        <View style={styles.formRow}>
          <View>
            <Text style={styles.prefTitle}>Color</Text>
            <Text style={styles.prefSub}>Used in lists and timer rows.</Text>
          </View>
          <View style={styles.swatches}>
            {colors.map((candidate) => (
              <Pressable
                key={candidate}
                onPress={() => setColor(candidate)}
                style={[
                  styles.swatch,
                  { backgroundColor: candidate },
                  color === candidate && styles.swatchSelected,
                ]}
              />
            ))}
          </View>
        </View>
        <Pressable onPress={() => setBillable(!billable)} style={styles.prefRow}>
          <View>
            <Text style={styles.prefTitle}>Billable</Text>
            <Text style={styles.prefSub}>Keep billing metadata for later reports.</Text>
          </View>
          <View style={[styles.toggle, billable && styles.toggleOn]}>
            <View style={[styles.toggleKnob, billable && styles.toggleKnobOn]} />
          </View>
        </Pressable>
        {billable ? (
          <FormTextRow label="Hourly rate" value={hourlyRate} onChange={setHourlyRate} placeholder="Optional" />
        ) : null}
      </View>
      <SettingsActions
        canSave={canSave}
        saveLabel={project ? "Save Project" : "Create Project"}
        onCancel={onCancel}
        onArchive={onArchive}
        onSave={() =>
          onSubmit({
            name: name.trim(),
            client: client.trim() || null,
            color,
            billable,
            hourly_rate: hourlyRate.trim() ? Number(hourlyRate) : null,
          })
        }
      />
    </>
  );
}

function TaskForm({
  state,
  task,
  onSubmit,
  onCancel,
  onArchive,
}: {
  state: AppStateView;
  task?: Task;
  onSubmit: (input: TaskInput) => void;
  onCancel: () => void;
  onArchive?: () => void;
}) {
  const activeProjects = state.projects.filter((project) => !project.archived_at);
  const [name, setName] = useState(task?.name ?? "");
  const [projectId, setProjectId] = useState(task?.project_id ?? activeProjects[0]?.id ?? "");
  const canSave = name.trim().length > 0 && projectId.length > 0;

  return (
    <>
      <Text style={styles.settingsSection}>{task ? "TASK" : "NEW TASK"}</Text>
      <View style={styles.prefGroup}>
        <FormTextRow label="Name" value={name} onChange={setName} placeholder="Build component library" />
        <View style={styles.formStackRow}>
          <Text style={styles.prefTitle}>Project</Text>
          <View style={styles.projectPickerGrid}>
            {activeProjects.map((project) => (
              <Pressable
                key={project.id}
                onPress={() => setProjectId(project.id)}
                style={[styles.projectPick, projectId === project.id && styles.projectPickActive]}
              >
                <View style={[styles.smallDot, { backgroundColor: project.color }]} />
                <Text style={[styles.projectPickText, projectId === project.id && styles.projectPickTextActive]}>
                  {project.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
      <SettingsActions
        canSave={canSave}
        saveLabel={task ? "Save Task" : "Create Task"}
        onCancel={onCancel}
        onArchive={onArchive}
        onSave={() => onSubmit({ project_id: projectId, name: name.trim() })}
      />
    </>
  );
}

function FormTextRow({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.formRow}>
      <Text style={styles.prefTitle}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#9a9ca0"
        style={styles.settingsInput}
      />
    </View>
  );
}

function SettingsActions({
  canSave,
  saveLabel,
  onSave,
  onCancel,
  onArchive,
}: {
  canSave: boolean;
  saveLabel: string;
  onSave: () => void;
  onCancel: () => void;
  onArchive?: () => void;
}) {
  return (
    <View style={styles.settingsActions}>
      {onArchive ? (
        <Pressable onPress={onArchive} style={styles.archiveButton}>
          <Text style={styles.archiveText}>Archive</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onCancel} style={styles.settingsCancelButton}>
        <Text style={styles.settingsCancelText}>Cancel</Text>
      </Pressable>
      <Pressable disabled={!canSave} onPress={onSave} style={[styles.settingsSaveButton, !canSave && { opacity: 0.45 }]}>
        <Text style={styles.settingsSaveText}>{saveLabel}</Text>
      </Pressable>
    </View>
  );
}

function PrefToggle({
  title,
  sub,
  value,
  onPress,
}: {
  title: string;
  sub: string;
  value: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.prefRow}>
      <View>
        <Text style={styles.prefTitle}>{title}</Text>
        <Text style={styles.prefSub}>{sub}</Text>
      </View>
      <View style={[styles.toggle, value && styles.toggleOn]}>
        <View style={[styles.toggleKnob, value && styles.toggleKnobOn]} />
      </View>
    </Pressable>
  );
}

function SettingStepper({
  title,
  value,
  onMinus,
  onPlus,
}: {
  title: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={styles.settingStepperRow}>
      <Text style={styles.prefTitle}>{title}</Text>
      <View style={styles.settingStepper}>
        <Pressable onPress={onMinus}>
          <Text style={styles.stepperSymbol}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable onPress={onPlus}>
          <Text style={styles.stepperSymbol}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function formatShort(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return err instanceof Error ? err.message : String(err);
}

const styles = StyleSheet.create({
  desktop: {
    minHeight: "100vh" as unknown as number,
    backgroundColor: "#111219",
    alignItems: "center",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
  },
  loading: { color: "#fff", marginTop: 80 },
  error: {
    position: "absolute",
    bottom: 16,
    color: "#fff",
    backgroundColor: "#d33",
    padding: 10,
    borderRadius: 8,
    fontWeight: "700",
  },
  scaledPopoverWrap: {
    marginTop: 28,
    overflow: "visible",
    alignItems: "center",
  },
  scaledSettingsWrap: {
    marginTop: 22,
    overflow: "visible",
    alignItems: "center",
  },
  menuBar: {
    height: 62,
    width: "100%" as unknown as number,
    backgroundColor: "#e8e8ec",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 26,
    paddingRight: 34,
    borderBottomWidth: 1,
    borderBottomColor: "#c8c8cd",
  },
  trayPill: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  trayPillActive: {
    borderWidth: 3,
    borderColor: "#0a84ff",
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#ff3b30" },
  trayIcon: { fontSize: 27, color: "#1d1d1f", lineHeight: 30 },
  trayTime: { fontSize: 26, color: "#1d1d1f", fontWeight: "700", fontVariant: ["tabular-nums"] },
  menuIcon: { fontSize: 26, color: "#1d1d1f", fontWeight: "700" },
  menuDate: { fontSize: 27, color: "#1d1d1f", fontWeight: "700" },
  popoverStage: { width: 680, marginTop: 28, position: "relative" },
  popover: {
    width: 680,
    height: 1112,
    borderRadius: 34,
    overflow: "hidden",
    backgroundColor: "#f0f1f5",
    boxShadow: "0 20px 60px rgba(0,0,0,0.35)" as unknown as string,
  },
  popTopLip: { height: 26, backgroundColor: "#aeb1b7" },
  calendarHeader: {
    height: 218,
    backgroundColor: "#d6d7da",
    borderBottomWidth: 1,
    borderBottomColor: "#bfc1c5",
    alignItems: "center",
  },
  calendarTitle: { marginTop: 18, fontSize: 27, fontWeight: "800", color: "#202124" },
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    marginTop: 44,
  },
  chevron: { fontSize: 54, color: "#97999d", marginHorizontal: 4 },
  dayCell: { width: 54, alignItems: "center", gap: 8 },
  dayLetter: { fontSize: 34, fontWeight: "800", color: "#6d6e72" },
  todayBubble: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#1688f8",
    alignItems: "center",
    justifyContent: "center",
  },
  todayLetter: { fontSize: 34, fontWeight: "900", color: "#fff" },
  dayValue: { fontSize: 23, color: "#93959a", fontWeight: "800", minHeight: 28 },
  dayValueActive: { fontSize: 23, color: "#1688f8", fontWeight: "900", minHeight: 28 },
  entryList: { flex: 1, backgroundColor: "#f4f5f8" },
  entryRow: {
    minHeight: 158,
    paddingHorizontal: 36,
    borderBottomWidth: 1,
    borderBottomColor: "#c4c6ca",
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
  },
  editSummary: {
    minHeight: 92,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "rgba(255,255,255,0.42)",
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 22,
    marginBottom: 24,
  },
  projectRail: { width: 16, height: 68, borderRadius: 8 },
  entryText: { flex: 1, minWidth: 0 },
  projectName: { color: "#a2a4a8", fontSize: 23, fontWeight: "800" },
  taskTitle: { color: "#202126", fontSize: 29, fontWeight: "800", marginTop: 4 },
  note: { color: "#737579", fontSize: 25, marginTop: 4 },
  rowDuration: {
    width: 104,
    textAlign: "right",
    color: "#17181d",
    fontSize: 42,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  rowButtonGroup: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  rowPlay: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: "#d9dade",
    alignItems: "center",
    justifyContent: "center",
  },
  rowStop: { borderColor: "#1688f8" },
  playGlyph: { color: "#b7b9bd", fontSize: 28, marginLeft: 4 },
  stopGlyph: { color: "#1688f8", fontSize: 22 },
  grayFill: { height: 124, backgroundColor: "#a7aaaf" },
  footer: {
    height: 114,
    backgroundColor: "#cfd1d5",
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 24,
  },
  newTimerButton: {
    flex: 1,
    height: 66,
    borderRadius: 22,
    backgroundColor: "#0a84ff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  buttonPlay: { color: "#fff", fontSize: 24, fontWeight: "700" },
  newTimerText: { color: "#fff", fontSize: 29, fontWeight: "800" },
  manualButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  manualText: { fontSize: 13, color: "#9ca3af" },
  gearButton: {
    width: 78,
    height: 78,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.95)",
    backgroundColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  gear: { color: "#707276", fontSize: 42, lineHeight: 46 },
  overlay: {
    position: "absolute",
    left: -34,
    right: -34,
    top: -62,
    paddingTop: 24,
    paddingHorizontal: 30,
    paddingBottom: 28,
    borderRadius: 34,
    backgroundColor: "rgba(244,245,249,0.94)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.75)",
    boxShadow: "0 18px 44px rgba(0,0,0,0.22)" as unknown as string,
  },
  overlayTitle: { textAlign: "center", fontSize: 29, color: "#202126", fontWeight: "800", marginBottom: 34 },
  formLabel: { color: "#6f7175", fontSize: 24, fontWeight: "800", marginBottom: 10 },
  selectField: {
    height: 72,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "rgba(255,255,255,0.45)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 22,
    marginBottom: 26,
    gap: 16,
  },
  projectDot: { width: 20, height: 20, borderRadius: 6 },
  selectText: { color: "#202126", fontSize: 29, fontWeight: "800" },
  choiceDim: { opacity: 0.35 },
  fieldChevron: { marginLeft: "auto", color: "#a3a5a9", fontSize: 32, fontWeight: "800" },
  taskInput: {
    flex: 1,
    color: "#202126",
    fontSize: 29,
    fontWeight: "800",
  },
  unitText: { fontSize: 13, color: "#9ca3af", marginLeft: 4 },
  noteField: { minHeight: 60 },
  noteInput: { flex: 1 },
  editRuleText: { color: "#8d8f94", fontSize: 20, marginTop: -10, marginBottom: 20 },
  autocompleteList: {
    marginTop: -16,
    marginBottom: 24,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "rgba(255,255,255,0.86)",
    overflow: "hidden",
  },
  suggestionRow: { paddingHorizontal: 24, paddingVertical: 16 },
  suggestionLine: { flexDirection: "row", alignItems: "center", gap: 16 },
  suggestionTitle: { fontSize: 27, fontWeight: "800", color: "#202126" },
  suggestionMeta: { fontSize: 23, color: "#9a9ca0", marginTop: 2 },
  focusToggle: {
    minHeight: 96,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "rgba(255,255,255,0.42)",
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 22,
    marginBottom: 24,
  },
  checkbox: {
    width: 38,
    height: 38,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#dcdde1",
    backgroundColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: "#1688f8", borderColor: "#1688f8" },
  checkmark: { color: "#fff", fontSize: 28, fontWeight: "900" },
  focusTitle: { color: "#202126", fontSize: 28, fontWeight: "800" },
  focusSub: { color: "#999ba0", fontSize: 24, marginTop: 3 },
  optionGroup: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#fff",
    backgroundColor: "rgba(255,255,255,0.34)",
    overflow: "hidden",
    marginBottom: 22,
  },
  stepperRow: {
    minHeight: 96,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.10)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepperLabel: { color: "#202126", fontSize: 27, fontWeight: "800" },
  stepperSub: { color: "#999ba0", fontSize: 23, marginTop: 2 },
  stepper: {
    width: 214,
    height: 56,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.62)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  stepperSymbol: { color: "#737579", fontSize: 28, fontWeight: "800" },
  stepperValue: { color: "#202126", fontSize: 27, fontWeight: "800" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 16 },
  cancelButton: {
    width: 146,
    height: 56,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "rgba(255,255,255,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { color: "#202126", fontSize: 27, fontWeight: "700" },
  deleteButton: {
    width: 130,
    height: 56,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "rgba(255,59,48,0.22)",
    backgroundColor: "rgba(255,59,48,0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: "auto",
  },
  deleteText: { color: "#ff3b30", fontSize: 25, fontWeight: "800" },
  startButton: {
    height: 58,
    borderRadius: 18,
    backgroundColor: "#0a84ff",
    paddingHorizontal: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  startText: { color: "#fff", fontSize: 27, fontWeight: "800" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 12 },
  emptyStateText: { fontSize: 15, color: "#e5e7eb", fontWeight: "500", textAlign: "center" },
  emptyStateSubtext: { fontSize: 13, color: "#9ca3af", textAlign: "center", paddingHorizontal: 24 },
  emptyStateAction: { backgroundColor: "#1d4ed8", borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 },
  emptyStateActionText: { fontSize: 13, color: "#ffffff", fontWeight: "600" },
  settingsWindow: {
    width: 1364,
    height: 1214,
    marginTop: 22,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#e7e8ed",
    boxShadow: "0 20px 70px rgba(0,0,0,0.35)" as unknown as string,
  },
  windowTop: {
    height: 88,
    backgroundColor: "#f5f5f7",
    borderBottomWidth: 1,
    borderBottomColor: "#d6d7da",
    justifyContent: "center",
    alignItems: "center",
  },
  traffic: { position: "absolute", left: 32, top: 31, flexDirection: "row", gap: 16 },
  light: { width: 24, height: 24, borderRadius: 12 },
  windowTitle: { color: "#202126", fontSize: 29, fontWeight: "800" },
  settingsBody: { flex: 1, flexDirection: "row" },
  sidebar: {
    width: 360,
    backgroundColor: "#eef0f3",
    borderRightWidth: 1,
    borderRightColor: "#d8d9dd",
    paddingTop: 28,
    paddingHorizontal: 22,
    gap: 14,
  },
  sidebarItem: { height: 58, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 20, paddingHorizontal: 20 },
  sidebarItemActive: { backgroundColor: "#1688f8" },
  sidebarIcon: { color: "#202126", fontSize: 28, width: 24 },
  sidebarText: { color: "#202126", fontSize: 27, fontWeight: "700" },
  sidebarTextActive: { color: "#fff" },
  settingsPane: { flex: 1, backgroundColor: "#e4e5ea" },
  settingsPaneContent: { padding: 40, paddingRight: 54 },
  settingsSection: { color: "#8b8d92", fontSize: 23, fontWeight: "900", letterSpacing: 3, marginBottom: 14 },
  segmentOuter: {
    borderRadius: 20,
    backgroundColor: "#f5f6f8",
    padding: 20,
    flexDirection: "row",
    marginBottom: 38,
  },
  segment: {
    flex: 1,
    height: 54,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: { backgroundColor: "#fff", boxShadow: "0 2px 4px rgba(0,0,0,0.18)" as unknown as string },
  segmentText: { color: "#202126", fontSize: 25, fontWeight: "800" },
  prefGroup: { borderRadius: 16, overflow: "hidden", backgroundColor: "#f5f6f8", marginBottom: 34 },
  prefRow: {
    minHeight: 118,
    paddingHorizontal: 22,
    borderBottomWidth: 1,
    borderBottomColor: "#d8d9dd",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  prefTitle: { color: "#202126", fontSize: 28, fontWeight: "800" },
  prefSub: { color: "#8d8f94", fontSize: 24, marginTop: 3 },
  formRow: {
    minHeight: 96,
    paddingHorizontal: 22,
    borderBottomWidth: 1,
    borderBottomColor: "#d8d9dd",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
  },
  formStackRow: {
    paddingHorizontal: 22,
    paddingVertical: 22,
    borderBottomWidth: 1,
    borderBottomColor: "#d8d9dd",
    gap: 16,
  },
  settingsInput: {
    width: 520,
    height: 52,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#d8d9dd",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    color: "#202126",
    fontSize: 24,
    fontWeight: "600",
  },
  swatches: { flexDirection: "row", gap: 12 },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "transparent",
  },
  swatchSelected: {
    borderColor: "#202126",
    boxShadow: "0 0 0 3px rgba(10,132,255,0.24)" as unknown as string,
  },
  projectPickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  projectPick: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: "#eceef2",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  projectPickActive: { backgroundColor: "#1688f8" },
  projectPickText: { color: "#202126", fontSize: 22, fontWeight: "800" },
  projectPickTextActive: { color: "#fff" },
  settingsActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 14,
  },
  archiveButton: {
    marginRight: "auto",
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 18,
    backgroundColor: "rgba(255,59,48,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,59,48,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  archiveText: { color: "#ff3b30", fontSize: 21, fontWeight: "800" },
  settingsCancelButton: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 20,
    backgroundColor: "#f5f6f8",
    borderWidth: 1,
    borderColor: "#d8d9dd",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsCancelText: { color: "#202126", fontSize: 21, fontWeight: "800" },
  settingsSaveButton: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 20,
    backgroundColor: "#1688f8",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsSaveText: { color: "#fff", fontSize: 21, fontWeight: "900" },
  toggle: { width: 78, height: 42, borderRadius: 21, backgroundColor: "#dbdde1", padding: 3 },
  toggleOn: { backgroundColor: "#1688f8" },
  toggleKnob: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#fff", boxShadow: "0 2px 4px rgba(0,0,0,0.25)" as unknown as string },
  toggleKnobOn: { marginLeft: 36 },
  settingStepperRow: {
    minHeight: 106,
    paddingHorizontal: 22,
    borderBottomWidth: 1,
    borderBottomColor: "#d8d9dd",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingStepper: {
    width: 192,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d8d9dd",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  secondaryBlueButton: { backgroundColor: "#cbdcf6", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  secondaryBlueText: { color: "#0067d9", fontSize: 24, fontWeight: "800" },
  listHeader: {
    height: 62,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#d8d9dd",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  listHeaderTitle: { color: "#202126", fontSize: 25, fontWeight: "800" },
  listHeaderMeta: { color: "#8d8f94", fontSize: 24 },
  manageRow: {
    minHeight: 94,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#d8d9dd",
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  smallDot: { width: 20, height: 20, borderRadius: 6 },
  manageTitle: { color: "#202126", fontSize: 26, fontWeight: "800" },
  manageSub: { color: "#8d8f94", fontSize: 24, marginTop: 2 },
  editGlyph: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#eceef2",
    textAlign: "center",
    lineHeight: 46,
    color: "#76787d",
    fontSize: 28,
  },
  emptyState: { flex: 1, alignItems: "center" as const, justifyContent: "center", paddingVertical: 48, gap: 12 },
  emptyStateText: { fontSize: 15, color: "#e5e7eb", fontWeight: "500" as const, textAlign: "center" as const },
  emptyStateSubtext: { fontSize: 13, color: "#9ca3af", textAlign: "center" as const, paddingHorizontal: 24 },
  emptyStateAction: { backgroundColor: "#1d4ed8", borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8, marginTop: 4 },
  emptyStateActionText: { fontSize: 13, color: "#ffffff", fontWeight: "600" as const },
  manualButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  manualText: { fontSize: 13, color: "#9ca3af" },
});
