import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, ViewStyle } from "react-native";
import { listen } from "@tauri-apps/api/event";
import {
  createManualEntry,
  createProject,
  createTask,
  deleteTimeEntry,
  getAppState,
  onAppState,
  openSettings,
  recordUserActivity,
  resumeSession,
  startFocus,
  startTracking,
  stopSession,
  updateEntry,
} from "./lib/api";
import { formatDuration } from "./lib/format";
import { errorMessage, hoursDecimal, useResolvedTheme } from "./theme";
import { ActiveSession, AppStateView, Project, Task, TodayEntryView } from "./types/app";

const c = (v: string) => v as unknown as string; // CSS var color helper for TS

interface RowVM {
  task: Task;
  project: Project | null;
  seconds: number;
  active: boolean;
}
interface GroupVM {
  key: string;
  project: Project | null;
  total: number;
  rows: RowVM[];
}

function buildGroups(state: AppStateView): GroupVM[] {
  const byProject = new Map<string, GroupVM>();
  const groupFor = (project: Project | null): GroupVM => {
    const key = project?.id ?? "__none__";
    let g = byProject.get(key);
    if (!g) {
      g = { key, project, total: 0, rows: [] };
      byProject.set(key, g);
    }
    return g;
  };
  for (const item of state.today_entries) {
    const g = groupFor(item.project ?? null);
    let r = g.rows.find((row) => row.task.id === item.task.id);
    if (!r) {
      r = { task: item.task, project: item.project ?? null, seconds: 0, active: false };
      g.rows.push(r);
    }
    r.seconds += item.entry.duration_seconds;
    g.total += item.entry.duration_seconds;
  }
  const as = state.selected_date === state.today_date ? state.active_session : null;
  if (as) {
    const project = state.projects.find((p) => p.id === as.project_id) ?? null;
    const task = state.tasks.find((t) => t.id === as.task_id);
    if (task) {
      const g = groupFor(project);
      let r = g.rows.find((row) => row.task.id === task.id);
      if (!r) {
        r = { task, project, seconds: 0, active: true };
        g.rows.push(r);
      }
      r.active = true;
    }
  }
  // Active project group floats to the top, then largest first.
  return [...byProject.values()].sort((a, b) => {
    const aa = a.rows.some((r) => r.active) ? 1 : 0;
    const bb = b.rows.some((r) => r.active) ? 1 : 0;
    if (aa !== bb) return bb - aa;
    return b.total - a.total;
  });
}

function focusRemaining(session: ActiveSession, now: number): number {
  if (!session.focus) return 0;
  const elapsed = (now - new Date(session.focus.phase_started_at).getTime()) / 1000;
  return Math.max(0, Math.round(session.focus.phase_duration_seconds - elapsed));
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function prettyDate(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return "Today";
  if (dateKey === addDays(todayKey, -1)) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(`${dateKey}T12:00:00.000Z`),
  );
}

export function App() {
  const [state, setState] = useState<AppStateView | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [newTimerOpen, setNewTimerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [editing, setEditing] = useState<TodayEntryView | null>(null);
  const [idleSeconds, setIdleSeconds] = useState<number | null>(null);

  useResolvedTheme(state);

  const refresh = useCallback(async () => {
    try {
      setState(await getAppState(selectedDate));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [selectedDate]);

  useEffect(() => {
    void refresh();
    let dispose: (() => void) | undefined;
    void onAppState(() => void refresh()).then((un) => {
      dispose = un;
    });
    return () => dispose?.();
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let un: (() => void) | undefined;
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      void listen<number>("session-idle-paused", (e) => setIdleSeconds(e.payload)).then((fn) => {
        un = fn;
      });
    }
    return () => un?.();
  }, []);

  useEffect(() => {
    let last = 0;
    const handler = () => {
      const ts = Date.now();
      if (ts - last > 15_000) {
        last = ts;
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

  const run = useCallback(
    async (action: () => Promise<unknown>, after?: () => void) => {
      try {
        await action();
        after?.();
        await refresh();
      } catch (err) {
        setError(errorMessage(err));
      }
    },
    [refresh],
  );

  const groups = useMemo(() => (state ? buildGroups(state) : []), [state]);
  const todayTotal = useMemo(
    () => (state ? state.today_entries.reduce((s, e) => s + e.entry.duration_seconds, 0) : 0),
    [state],
  );
  const weekTotal = useMemo(
    () => (state ? state.week.reduce((s, d) => s + d.seconds, 0) : 0),
    [state],
  );

  if (!state) {
    return (
      <View style={styles.app}>
        <Text style={styles.loading}>Loading…</Text>
      </View>
    );
  }

  const active = state.active_session ?? null;
  const status =
    !active ? { label: "Idle", live: false } :
    active.mode === "focus" && active.focus
      ? { label: `Focusing · Round ${active.focus.round_index}/${active.focus.total_rounds}`, live: true }
      : { label: "Tracking", live: true };

  const nextWeekDate = addDays(state.selected_date, 7);
  const canGoForward = state.week[state.week.length - 1]?.date < state.today_date;
  const isPastDay = state.selected_date < state.today_date;
  const selectedTotalLabel = prettyDate(state.selected_date, state.today_date);

  return (
    <View style={styles.app}>
      <View style={styles.head}>
        <View style={styles.status}>
          <View style={[styles.statusDot, status.live && styles.statusDotLive]} />
          <Text style={[styles.statusText, status.live && styles.statusTextLive]} numberOfLines={1}>
            {status.label}
          </Text>
        </View>
        <Text style={styles.title}>Time &amp; Flow</Text>
        <View style={styles.statusRight} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.sec}>
          <View style={styles.weekNav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous week"
              style={styles.navBtn}
              onPress={() => setSelectedDate(addDays(state.selected_date, -7))}
            >
              <Text style={styles.navGlyph}>‹</Text>
            </Pressable>
            <Text style={styles.secL}>This Week</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next week"
              disabled={!canGoForward}
              style={[styles.navBtn, !canGoForward && styles.navBtnDisabled]}
              onPress={() => setSelectedDate(nextWeekDate > state.today_date ? state.today_date : nextWeekDate)}
            >
              <Text style={styles.navGlyph}>›</Text>
            </Pressable>
          </View>
          <Text style={styles.secR}>{formatDuration(weekTotal, true)}</Text>
        </View>
        <View style={styles.week}>
          {state.week.map((day, i) => {
            const selected = day.date === state.selected_date;
            const future = day.date > state.today_date;
            const hrs = hoursDecimal(day.seconds);
            return (
              <Pressable
                key={`${day.date}-${i}`}
                accessibilityRole="button"
                accessibilityLabel={day.label}
                disabled={future}
                onPress={() => setSelectedDate(day.date)}
                style={[styles.day, selected && styles.daySel, future && styles.dayDisabled]}
              >
                <Text style={[styles.dayLbl, selected && styles.dayTextSel]}>{day.label[0]}</Text>
                <Text style={[styles.dayVal, !hrs && styles.dayValEmpty, selected && styles.dayTextSel]}>
                  {hrs || "–"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.sec}>
          <Text style={styles.secL}>{selectedTotalLabel}</Text>
          <View style={styles.secActions}>
            {isPastDay ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add manual entry"
                style={styles.iconBtn}
                onPress={() => setManualOpen(true)}
              >
                <Text style={styles.iconGlyph}>＋</Text>
              </Pressable>
            ) : null}
            <Text style={styles.secR}>{formatDuration(todayTotal)}</Text>
          </View>
        </View>

        {groups.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{`No time logged ${state.selected_date === state.today_date ? "today" : "this day"}`}</Text>
            {isPastDay ? (
              <Pressable accessibilityRole="button" onPress={() => setManualOpen(true)} style={styles.emptyBtn}>
                <Text style={styles.emptyBtnText}>Add Entry</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => setNewTimerOpen(true)} style={styles.emptyBtn}>
                <Text style={styles.emptyBtnText}>Start a Timer</Text>
              </Pressable>
            )}
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.key}>
              <View style={styles.grp}>
                {g.project ? (
                  <View style={[styles.pdot, { backgroundColor: g.project.color }]} />
                ) : (
                  <View style={[styles.pdot, styles.pdotNone]} />
                )}
                <Text style={styles.pname} numberOfLines={1}>{g.project ? g.project.name : "No Project"}</Text>
                <Text style={styles.ptot}>{formatDuration(g.total, true)}</Text>
              </View>
              <View style={styles.tasks}>
                {g.rows.map((r) => {
                  const isFocus = r.active && active?.mode === "focus";
                  const dur = r.active
                    ? isFocus
                      ? `focusing · ${formatDuration(focusRemaining(active!, now), true)} left`
                      : `running · ${formatDuration(active!.elapsed_seconds)}`
                    : formatDuration(r.seconds);
                  const entryItem = state.today_entries.find((e) => e.task.id === r.task.id) ?? null;
                  return (
                    <View key={r.task.id} style={[styles.row, r.active && styles.rowActive]}>
                      <Pressable
                        accessibilityRole="button"
                        style={styles.rowBody}
                        onPress={() => entryItem && setEditing(entryItem)}
                      >
                        <Text style={styles.taskName} numberOfLines={1}>{r.task.name}</Text>
                        <Text style={[styles.taskDur, r.active && styles.taskDurLive]}>{dur}</Text>
                      </Pressable>
                      {r.active ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Stop tracking"
                          style={styles.stopBtn}
                          onPress={() => void run(stopSession)}
                        >
                          <View style={styles.stopSquare} />
                        </Pressable>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Start ${r.task.name}`}
                          style={styles.playBtn}
                          onPress={() => void run(() => startTracking(r.task.project_id, r.task.id))}
                        >
                          <PlayTriangle />
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.foot}>
        <Pressable accessibilityRole="button" onPress={() => setNewTimerOpen(true)} style={styles.newTimer}>
          <PlayTriangle color="#fff" />
          <Text style={styles.newTimerText}>New Timer</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => void openSettings()} style={styles.gear}>
          <Text style={styles.gearGlyph}>⚙</Text>
        </Pressable>
      </View>

      {newTimerOpen ? (
        <NewTimerSheet
          state={state}
          onCancel={() => setNewTimerOpen(false)}
          onStart={(args) => void run(() => startSelected(state, args), () => setNewTimerOpen(false))}
        />
      ) : null}
      {manualOpen ? (
        <ManualEntrySheet
          state={state}
          dateKey={state.selected_date}
          onCancel={() => setManualOpen(false)}
          onSave={(projectId, taskId, secs, note) =>
            void run(
              () =>
                createManualEntry({
                  project_id: projectId,
                  task_id: taskId,
                  started_at: `${state.selected_date}T12:00:00.000Z`,
                  duration_seconds: secs,
                  note,
                }),
              () => setManualOpen(false),
            )
          }
        />
      ) : null}
      {editing ? (
        <EditEntrySheet
          state={state}
          item={editing}
          onCancel={() => setEditing(null)}
          onSave={(projectId, taskId, secs, note) => void run(() => updateEntry(editing.entry.id, projectId, taskId, secs, note), () => setEditing(null))}
          onDelete={() => void run(() => deleteTimeEntry(editing.entry.id), () => setEditing(null))}
        />
      ) : null}
      {idleSeconds !== null ? (
        <IdlePrompt
          seconds={idleSeconds}
          onKeep={() => { void run(resumeSession); setIdleSeconds(null); }}
          onDiscard={() => { void run(stopSession); setIdleSeconds(null); }}
        />
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

interface StartArgs {
  projectName: string;
  projectId: string;
  taskName: string;
  focus: boolean;
  pomodoro: AppStateView["config"]["pomodoro"];
}

async function startSelected(state: AppStateView, args: StartArgs) {
  let project =
    state.projects.find((p) => p.id === args.projectId) ??
    state.projects.find((p) => p.name.toLowerCase() === args.projectName.trim().toLowerCase());
  if (!project) {
    project = await createProject({ name: args.projectName.trim() || "New Project", color: "#0a84ff", billable: false });
  }
  let task = state.tasks.find(
    (t) => t.project_id === project!.id && t.name.toLowerCase() === args.taskName.trim().toLowerCase(),
  );
  if (!task) {
    task = await createTask({ project_id: project.id, name: args.taskName.trim() || "Task" });
  }
  if (args.focus) {
    await startFocus(project.id, task.id, { ...state.config, pomodoro: args.pomodoro });
  } else {
    await startTracking(project.id, task.id);
  }
}

function PlayTriangle({ color }: { color?: string }) {
  return (
    <svg width={10} height={11} viewBox="0 0 10 11" style={{ display: "block", marginLeft: 1 }}>
      <path d="M0 0l10 5.5L0 11z" fill={color ?? "var(--c-accent)"} />
    </svg>
  );
}

function NewTimerSheet({
  state,
  onCancel,
  onStart,
}: {
  state: AppStateView;
  onCancel: () => void;
  onStart: (args: StartArgs) => void;
}) {
  const activeProjects = state.projects.filter((p) => !p.archived_at);
  const [projectName, setProjectName] = useState(activeProjects[0]?.name ?? "");
  const [projectId, setProjectId] = useState(activeProjects[0]?.id ?? "");
  const [taskName, setTaskName] = useState("");
  const [focus, setFocus] = useState(false);
  const [pomodoro, setPomodoro] = useState(state.config.pomodoro);

  const projectSuggestions = activeProjects
    .filter((p) => p.name.toLowerCase().includes(projectName.trim().toLowerCase()))
    .slice(0, 4);
  const tasks = state.tasks.filter((t) => t.project_id === projectId && !t.archived_at);
  const taskSuggestions = tasks
    .filter((t) => t.name.toLowerCase().includes(taskName.trim().toLowerCase()))
    .slice(0, 4);

  const adjust = (key: keyof typeof pomodoro, delta: number) =>
    setPomodoro({ ...pomodoro, [key]: Math.max(1, Number(pomodoro[key]) + delta) });

  return (
    <View style={styles.sheetBackdrop}>
      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
        <Text style={styles.sheetTitle}>New Timer</Text>

        <Text style={styles.fLabel}>Project</Text>
        <View style={styles.fInput}>
          {(() => {
            const p = activeProjects.find((x) => x.id === projectId);
            return <View style={[styles.fdot, { backgroundColor: p?.color ?? "#0a84ff" }]} />;
          })()}
          <TextInput
            accessibilityLabel="Project"
            value={projectName}
            onChangeText={(v) => {
              setProjectName(v);
              const exact = activeProjects.find((p) => p.name.toLowerCase() === v.trim().toLowerCase());
              setProjectId(exact?.id ?? "");
            }}
            placeholder="Project name"
            placeholderTextColor={c("var(--c-fg3)")}
            style={styles.fField}
          />
        </View>
        {projectSuggestions.length > 0 && (
          <View style={styles.suggest}>
            {projectSuggestions.map((p) => (
              <Pressable key={p.id} style={styles.suggestRow} onPress={() => { setProjectId(p.id); setProjectName(p.name); }}>
                <View style={[styles.fdot, { backgroundColor: p.color }]} />
                <Text style={styles.suggestText}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.fLabel}>Task</Text>
        <View style={styles.fInput}>
          <TextInput
            accessibilityLabel="Task"
            value={taskName}
            onChangeText={setTaskName}
            placeholder="Task name"
            placeholderTextColor={c("var(--c-fg3)")}
            style={styles.fField}
          />
        </View>
        {!focus && taskSuggestions.length > 0 && (
          <View style={styles.suggest}>
            {taskSuggestions.map((t) => (
              <Pressable key={t.id} style={styles.suggestRow} onPress={() => setTaskName(t.name)}>
                <Text style={styles.suggestText}>{t.name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: focus }} style={styles.checkRow} onPress={() => setFocus(!focus)}>
          <View style={[styles.chk, focus && styles.chkOn]}>{focus ? <Text style={styles.chkMark}>✓</Text> : null}</View>
          <View style={{ flex: 1 }}>
            <Text style={styles.checkTitle}>Focus Session</Text>
            <Text style={styles.checkSub}>Use Pomodoro timing &amp; round/break reminders</Text>
          </View>
        </Pressable>

        {focus && (
          <View style={styles.focusOpts}>
            <PStep label="Focus length" value={`${pomodoro.focus_minutes} min`} onMinus={() => adjust("focus_minutes", -1)} onPlus={() => adjust("focus_minutes", 1)} />
            <PStep label="Short break" value={`${pomodoro.short_break_minutes} min`} onMinus={() => adjust("short_break_minutes", -1)} onPlus={() => adjust("short_break_minutes", 1)} />
            <PStep label="Long break" value={`${pomodoro.long_break_minutes} min`} onMinus={() => adjust("long_break_minutes", -1)} onPlus={() => adjust("long_break_minutes", 1)} />
            <PStep label="Rounds" value={`${pomodoro.rounds}`} onMinus={() => adjust("rounds", -1)} onPlus={() => adjust("rounds", 1)} last />
          </View>
        )}

        <View style={styles.sheetActions}>
          <Pressable accessibilityRole="button" style={styles.btnSecondary} onPress={onCancel}>
            <Text style={styles.btnSecondaryText}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.btnPrimary}
            onPress={() => onStart({ projectName, projectId, taskName, focus, pomodoro })}
          >
            <PlayTriangle color="#fff" />
            <Text style={styles.btnPrimaryText}>{focus ? "Start Focus" : "Start Timer"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function PStep({ label, value, onMinus, onPlus, last }: { label: string; value: string; onMinus: () => void; onPlus: () => void; last?: boolean }) {
  return (
    <View style={[styles.pstep, !last && styles.pstepBorder]}>
      <Text style={styles.pstepLabel}>{label}</Text>
      <View style={styles.pstepRight}>
        <Text style={styles.pstepValue}>{value}</Text>
        <View style={styles.pm}>
          <Pressable accessibilityRole="button" onPress={onMinus} style={styles.pmBtn}><Text style={styles.pmGlyph}>−</Text></Pressable>
          <View style={styles.pmSep} />
          <Pressable accessibilityRole="button" onPress={onPlus} style={styles.pmBtn}><Text style={styles.pmGlyph}>+</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

// Shared project + task selector for logging/editing entries: a search field
// that suggests existing projects (then existing tasks within the chosen
// project) as you type. Entries must reference an existing task, so this only
// ever resolves to ids that exist — it never creates master data.
function ProjectTaskSearch({
  state,
  projectId,
  taskId,
  setProjectId,
  setTaskId,
}: {
  state: AppStateView;
  projectId: string;
  taskId: string;
  setProjectId: (id: string) => void;
  setTaskId: (id: string) => void;
}) {
  const activeProjects = state.projects.filter((p) => !p.archived_at);
  const resolveProject = (id: string) => state.projects.find((p) => p.id === id) ?? null;
  const [projectName, setProjectName] = useState(() => resolveProject(projectId)?.name ?? "");
  const [taskName, setTaskName] = useState(() => state.tasks.find((t) => t.id === taskId)?.name ?? "");

  const selectedProject = resolveProject(projectId);
  const projectTasks = state.tasks.filter((t) => t.project_id === projectId && !t.archived_at);

  const norm = (v: string) => v.trim().toLowerCase();
  const projectMatches = activeProjects.filter((p) => norm(p.name).includes(norm(projectName))).slice(0, 5);
  const taskMatches = projectTasks.filter((t) => norm(t.name).includes(norm(taskName))).slice(0, 5);
  // Don't show a dropdown whose only row is the already-chosen item.
  const showProjects = projectMatches.length > 0 && !(projectMatches.length === 1 && projectMatches[0].id === projectId);
  const showTasks = !!projectId && taskMatches.length > 0 && !(taskMatches.length === 1 && taskMatches[0].id === taskId);

  const onProjectText = (v: string) => {
    setProjectName(v);
    const exact = activeProjects.find((p) => norm(p.name) === norm(v));
    setProjectId(exact?.id ?? "");
    // Any project edit invalidates the task selection.
    setTaskId("");
    setTaskName("");
  };
  const chooseProject = (id: string, name: string) => {
    setProjectId(id);
    setProjectName(name);
    setTaskId("");
    setTaskName("");
  };
  const onTaskText = (v: string) => {
    setTaskName(v);
    const exact = projectTasks.find((t) => norm(t.name) === norm(v));
    setTaskId(exact?.id ?? "");
  };

  return (
    <>
      <Text style={styles.fLabel}>Project</Text>
      <View style={styles.fInput}>
        <View style={[styles.fdot, selectedProject ? { backgroundColor: selectedProject.color } : styles.pdotNone]} />
        <TextInput
          accessibilityLabel="Project"
          value={projectName}
          onChangeText={onProjectText}
          placeholder="Search projects…"
          placeholderTextColor={c("var(--c-fg3)")}
          style={styles.fField}
        />
      </View>
      {showProjects && (
        <View style={styles.suggest}>
          {projectMatches.map((p) => (
            <Pressable key={p.id} style={styles.suggestRow} onPress={() => chooseProject(p.id, p.name)}>
              <View style={[styles.fdot, { backgroundColor: p.color }]} />
              <Text style={styles.suggestText}>{p.name}</Text>
              {p.id === projectId ? <Text style={styles.pickCheck}>✓</Text> : null}
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.fLabel}>Task</Text>
      <View style={[styles.fInput, !projectId && styles.disabled]}>
        <TextInput
          accessibilityLabel="Task"
          value={taskName}
          editable={!!projectId}
          onChangeText={onTaskText}
          placeholder={projectId ? "Search tasks…" : "Choose a project first"}
          placeholderTextColor={c("var(--c-fg3)")}
          style={styles.fField}
        />
      </View>
      {showTasks && (
        <View style={styles.suggest}>
          {taskMatches.map((t) => (
            <Pressable
              key={t.id}
              style={styles.suggestRow}
              onPress={() => { setTaskId(t.id); setTaskName(t.name); }}
            >
              <Text style={styles.suggestText}>{t.name}</Text>
              {t.id === taskId ? <Text style={styles.pickCheck}>✓</Text> : null}
            </Pressable>
          ))}
        </View>
      )}
      {projectId && projectTasks.length === 0 ? (
        <Text style={styles.pickEmpty}>No tasks in this project yet.</Text>
      ) : null}
    </>
  );
}

function ManualEntrySheet({
  state,
  dateKey,
  onCancel,
  onSave,
}: {
  state: AppStateView;
  dateKey: string;
  onCancel: () => void;
  onSave: (projectId: string, taskId: string, seconds: number, note: string | null) => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [note, setNote] = useState("");
  const seconds = Math.max(0, parseInt(minutes, 10) || 0) * 60;
  const activeProjects = state.projects.filter((p) => !p.archived_at);
  const tasks = state.tasks.filter((t) => t.project_id === projectId && !t.archived_at);

  const canSave = seconds > 0 && projectId.length > 0 && taskId.length > 0 && dateKey <= state.today_date;

  return (
    <View style={styles.sheetBackdrop}>
      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
        <Text style={styles.sheetTitle}>Add Entry</Text>
        <Text style={styles.sheetSub}>{prettyDate(dateKey, state.today_date)}</Text>

        <Text style={styles.fLabel}>Project</Text>
        <View style={styles.pickList}>
          {activeProjects.map((p) => (
            <Pressable key={p.id} accessibilityRole="button" style={styles.pickRow} onPress={() => setProjectId(p.id)}>
              <View style={[styles.fdot, { backgroundColor: p.color }]} />
              <Text style={styles.pickText} numberOfLines={1}>{p.name}</Text>
              {projectId === p.id ? <Text style={styles.pickCheck}>✓</Text> : null}
            </Pressable>
          ))}
        </View>

        <Text style={styles.fLabel}>Task</Text>
        <View style={styles.pickList}>
          {tasks.length === 0 ? (
            <Text style={styles.pickEmpty}>No tasks in this project</Text>
          ) : (
            tasks.map((t) => (
              <Pressable key={t.id} accessibilityRole="button" style={styles.pickRow} onPress={() => setTaskId(t.id)}>
                <Text style={styles.pickText} numberOfLines={1}>{t.name}</Text>
                {taskId === t.id ? <Text style={styles.pickCheck}>✓</Text> : null}
              </Pressable>
            ))
          )}
        </View>

        <Text style={styles.fLabel}>Duration (minutes)</Text>
        <View style={styles.fInput}>
          <TextInput accessibilityLabel="Duration minutes" value={minutes} onChangeText={setMinutes} keyboardType="numeric" style={styles.fField} />
        </View>
        <Text style={styles.fLabel}>Note</Text>
        <View style={[styles.fInput, styles.fInputMultiline]}>
          <TextInput accessibilityLabel="Note" value={note} onChangeText={setNote} multiline placeholder="Optional" placeholderTextColor={c("var(--c-fg3)")} style={[styles.fField, styles.fFieldMultiline]} />
        </View>

        <View style={styles.sheetActions}>
          <Pressable accessibilityRole="button" style={styles.btnSecondary} onPress={onCancel}>
            <Text style={styles.btnSecondaryText}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={[styles.btnPrimary, !canSave && styles.disabled]} disabled={!canSave} onPress={() => onSave(projectId, taskId, seconds, note.trim() ? note.trim() : null)}>
            <Text style={styles.btnPrimaryText}>Save</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function EditEntrySheet({
  state,
  item,
  onCancel,
  onSave,
  onDelete,
}: {
  state: AppStateView;
  item: TodayEntryView;
  onCancel: () => void;
  onSave: (projectId: string, taskId: string, seconds: number, note: string | null) => void;
  onDelete: () => void;
}) {
  const activeProjects = state.projects.filter((p) => !p.archived_at);
  const [projectId, setProjectId] = useState(item.project.id);
  const [taskId, setTaskId] = useState(item.task.id);
  const [minutes, setMinutes] = useState(String(Math.max(1, Math.round(item.entry.duration_seconds / 60))));
  const [note, setNote] = useState(item.entry.note ?? "");
  const seconds = Math.max(0, parseInt(minutes, 10) || 0) * 60;

  const tasks = state.tasks.filter((t) => t.project_id === projectId && !t.archived_at);
  // Keep the task selection valid when the project changes.
  useEffect(() => {
    if (!tasks.some((t) => t.id === taskId)) setTaskId(tasks[0]?.id ?? "");
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSave = seconds > 0 && projectId.length > 0 && taskId.length > 0;

  return (
    <View style={styles.sheetBackdrop}>
      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
        <Text style={styles.sheetTitle}>Edit Entry</Text>

        <Text style={styles.fLabel}>Project</Text>
        <View style={styles.pickList}>
          {activeProjects.map((p) => (
            <Pressable key={p.id} accessibilityRole="button" style={styles.pickRow} onPress={() => setProjectId(p.id)}>
              <View style={[styles.fdot, { backgroundColor: p.color }]} />
              <Text style={styles.pickText} numberOfLines={1}>{p.name}</Text>
              {projectId === p.id ? <Text style={styles.pickCheck}>✓</Text> : null}
            </Pressable>
          ))}
        </View>

        <Text style={styles.fLabel}>Task</Text>
        <View style={styles.pickList}>
          {tasks.length === 0 ? (
            <Text style={styles.pickEmpty}>No tasks in this project</Text>
          ) : (
            tasks.map((t) => (
              <Pressable key={t.id} accessibilityRole="button" style={styles.pickRow} onPress={() => setTaskId(t.id)}>
                <Text style={styles.pickText} numberOfLines={1}>{t.name}</Text>
                {taskId === t.id ? <Text style={styles.pickCheck}>✓</Text> : null}
              </Pressable>
            ))
          )}
        </View>

        <Text style={styles.fLabel}>Duration (minutes)</Text>
        <View style={styles.fInput}>
          <TextInput accessibilityLabel="Duration minutes" value={minutes} onChangeText={setMinutes} keyboardType="numeric" style={styles.fField} />
        </View>
        <Text style={styles.fLabel}>Note</Text>
        <View style={[styles.fInput, styles.fInputMultiline]}>
          <TextInput accessibilityLabel="Note" value={note} onChangeText={setNote} multiline placeholder="Optional" placeholderTextColor={c("var(--c-fg3)")} style={[styles.fField, styles.fFieldMultiline]} />
        </View>

        <View style={styles.sheetActions}>
          <Pressable accessibilityRole="button" style={styles.btnDanger} onPress={onDelete}>
            <Text style={styles.btnDangerText}>Delete</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.btnSecondary} onPress={onCancel}>
            <Text style={styles.btnSecondaryText}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={[styles.btnPrimary, !canSave && styles.disabled]} disabled={!canSave} onPress={() => onSave(projectId, taskId, seconds, note.trim() ? note.trim() : null)}>
            <Text style={styles.btnPrimaryText}>Save</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function IdlePrompt({ seconds, onKeep, onDiscard }: { seconds: number; onKeep: () => void; onDiscard: () => void }) {
  const minutes = Math.round(seconds / 60);
  return (
    <View style={[styles.sheetBackdrop, styles.center]}>
      <View style={styles.idleCard}>
        <Text style={styles.sheetTitle}>Mac was idle</Text>
        <Text style={styles.idleBody}>
          {`Your timer paused after ${minutes} minute${minutes !== 1 ? "s" : ""} of inactivity. Keep this time or discard it?`}
        </Text>
        <View style={styles.sheetActions}>
          <Pressable accessibilityRole="button" style={styles.btnDanger} onPress={onDiscard}><Text style={styles.btnDangerText}>Discard</Text></Pressable>
          <Pressable accessibilityRole="button" style={styles.btnPrimary} onPress={onKeep}><Text style={styles.btnPrimaryText}>Keep &amp; Resume</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  app: {
    height: "100vh" as unknown as number,
    backgroundColor: c("var(--c-bg)"),
    borderRadius: 12,
    overflow: "hidden",
    flexDirection: "column",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
  },
  loading: { color: c("var(--c-fg2)"), margin: "auto" as unknown as number, fontSize: 13 },
  error: { position: "absolute", left: 12, right: 12, bottom: 12, backgroundColor: "#d7372f", color: "#fff", padding: 9, borderRadius: 8, fontSize: 12, fontWeight: "600" },

  head: { flexDirection: "row", alignItems: "center", height: 44, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: c("var(--c-sep)") },
  status: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#b0b0b5" },
  statusDotLive: { backgroundColor: c("var(--c-accent)") },
  statusText: { fontSize: 12, fontWeight: "600", color: c("var(--c-fg3)") },
  statusTextLive: { color: c("var(--c-accent)") },
  title: { fontSize: 13, fontWeight: "700", color: c("var(--c-fg1)"), letterSpacing: -0.1 },
  statusRight: { flex: 1 },

  body: { flex: 1 },
  bodyContent: { paddingBottom: 8 },

  sec: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 13, paddingBottom: 6 },
  weekNav: { flexDirection: "row", alignItems: "center", gap: 6 },
  navBtn: { width: 20, height: 20, borderRadius: 6, backgroundColor: c("var(--c-control)"), alignItems: "center", justifyContent: "center" },
  navBtnDisabled: { opacity: 0.35 },
  navGlyph: { fontSize: 17, lineHeight: 18, color: c("var(--c-fg2)") },
  secL: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: c("var(--c-fg3)") },
  secR: { fontSize: 13, fontWeight: "700", color: c("var(--c-fg1)"), fontVariant: ["tabular-nums"] },
  secActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { width: 22, height: 22, borderRadius: 7, backgroundColor: c("var(--c-control)"), alignItems: "center", justifyContent: "center" },
  iconGlyph: { fontSize: 13, lineHeight: 16, color: c("var(--c-accent)"), fontWeight: "700" },

  week: { flexDirection: "row", justifyContent: "space-between", gap: 3, paddingHorizontal: 12, paddingBottom: 8 },
  day: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 6, borderRadius: 9 },
  daySel: { backgroundColor: c("var(--c-accent)") },
  dayDisabled: { opacity: 0.35 },
  dayLbl: { fontSize: 11, fontWeight: "600", color: c("var(--c-fg3)") },
  dayVal: { fontSize: 13, fontWeight: "600", color: c("var(--c-fg1)"), fontVariant: ["tabular-nums"] },
  dayValEmpty: { color: c("var(--c-fg3)") },
  dayTextSel: { color: "#fff" },

  empty: { alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyTitle: { fontSize: 13, color: c("var(--c-fg3)") },
  emptyBtn: { backgroundColor: c("var(--c-control)"), paddingHorizontal: 14, height: 30, borderRadius: 8, justifyContent: "center" },
  emptyBtnText: { fontSize: 13, fontWeight: "600", color: c("var(--c-fg1)") },

  grp: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  pdot: { width: 9, height: 9, borderRadius: 5 },
  pdotNone: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: c("var(--c-dash)"), borderStyle: "dashed" },
  pname: { flex: 1, fontSize: 13, fontWeight: "600", color: c("var(--c-fg1)"), letterSpacing: -0.1 },
  ptot: { fontSize: 13, fontWeight: "600", color: c("var(--c-fg1)"), fontVariant: ["tabular-nums"] },

  tasks: { marginHorizontal: 8, marginBottom: 2, paddingLeft: 17, borderLeftWidth: 1.5, borderLeftColor: c("var(--c-sep)") },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 7, paddingLeft: 10, paddingRight: 8, borderRadius: 8 },
  rowActive: { backgroundColor: c("var(--c-accent-soft)") },
  rowBody: { flex: 1, minWidth: 0 },
  taskName: { fontSize: 13, color: c("var(--c-fg1)"), letterSpacing: -0.1 },
  taskDur: { fontSize: 11, color: c("var(--c-fg3)"), marginTop: 1, fontVariant: ["tabular-nums"] },
  taskDurLive: { color: c("var(--c-accent)"), fontWeight: "600" },

  playBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: c("var(--c-accent)"), alignItems: "center", justifyContent: "center" },
  stopBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: c("var(--c-red)"), alignItems: "center", justifyContent: "center" },
  stopSquare: { width: 9, height: 9, borderRadius: 2, backgroundColor: "#fff" },

  foot: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderTopWidth: 0.5, borderTopColor: c("var(--c-sep)") },
  newTimer: { flex: 1, height: 30, borderRadius: 8, backgroundColor: c("var(--c-accent)"), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  newTimerText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  gear: { width: 30, height: 30, borderRadius: 8, backgroundColor: c("var(--c-control)"), alignItems: "center", justifyContent: "center" },
  gearGlyph: { fontSize: 15, color: c("var(--c-fg2)") },

  // sheets
  sheetBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.16)" },
  center: { alignItems: "center", justifyContent: "center" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "100%" as unknown as number, backgroundColor: c("var(--c-bg)"), borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  sheetContent: { padding: 16 },
  sheetTitle: { fontSize: 14, fontWeight: "700", textAlign: "center", color: c("var(--c-fg1)"), marginBottom: 12 },
  sheetSub: { fontSize: 12, color: c("var(--c-fg3)"), textAlign: "center", marginTop: -8, marginBottom: 12 },

  fLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: c("var(--c-fg3)"), marginTop: 10, marginBottom: 5, marginLeft: 2 },
  fInput: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c("var(--c-card)"), borderWidth: 0.5, borderColor: c("var(--c-sep)"), borderRadius: 8, paddingHorizontal: 10, height: 38 },
  fInputMultiline: { height: 72, alignItems: "flex-start", paddingVertical: 8 },
  fdot: { width: 9, height: 9, borderRadius: 5 },
  fField: { flex: 1, fontSize: 13, color: c("var(--c-fg1)"), borderWidth: 0, backgroundColor: "transparent" },
  fFieldMultiline: { height: 56, textAlignVertical: "top" },

  suggest: { backgroundColor: c("var(--c-card)"), borderRadius: 8, marginTop: 4, overflow: "hidden" },
  suggestRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  suggestText: { fontSize: 13, color: c("var(--c-fg1)") },

  pickList: { backgroundColor: c("var(--c-card)"), borderRadius: 8, borderWidth: 0.5, borderColor: c("var(--c-sep2)"), overflow: "hidden" },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, height: 34 },
  pickText: { flex: 1, fontSize: 13, color: c("var(--c-fg1)") },
  pickCheck: { fontSize: 14, fontWeight: "700", color: c("var(--c-accent)") },
  pickEmpty: { fontSize: 12, color: c("var(--c-fg3)"), paddingHorizontal: 10, paddingVertical: 9 },

  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  chk: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: c("var(--c-fg3)"), alignItems: "center", justifyContent: "center" },
  chkOn: { backgroundColor: c("var(--c-accent)"), borderColor: c("var(--c-accent)") },
  chkMark: { color: "#fff", fontSize: 11, fontWeight: "800" },
  checkTitle: { fontSize: 13, fontWeight: "600", color: c("var(--c-fg1)") },
  checkSub: { fontSize: 11, color: c("var(--c-fg3)"), marginTop: 1 },

  focusOpts: { marginTop: 12, backgroundColor: c("var(--c-card)"), borderRadius: 10, paddingHorizontal: 12, borderWidth: 0.5, borderColor: c("var(--c-sep2)") },
  pstep: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 9 },
  pstepBorder: { borderBottomWidth: 0.5, borderBottomColor: c("var(--c-sep2)") },
  pstepLabel: { fontSize: 13, color: c("var(--c-fg1)") },
  pstepRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  pstepValue: { fontSize: 13, fontWeight: "600", color: c("var(--c-fg1)"), minWidth: 52, textAlign: "right", fontVariant: ["tabular-nums"] },
  pm: { flexDirection: "row", backgroundColor: c("var(--c-control)"), borderRadius: 7, overflow: "hidden" },
  pmBtn: { width: 28, height: 24, alignItems: "center", justifyContent: "center" },
  pmSep: { width: 0.5, backgroundColor: c("var(--c-sep)") },
  pmGlyph: { fontSize: 15, color: c("var(--c-fg1)") },

  sheetActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  btnPrimary: { flex: 1, height: 34, borderRadius: 8, backgroundColor: c("var(--c-accent)"), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  btnPrimaryText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  btnSecondary: { flex: 1, height: 34, borderRadius: 8, backgroundColor: c("var(--c-control)"), alignItems: "center", justifyContent: "center" },
  btnSecondaryText: { color: c("var(--c-fg1)"), fontSize: 13, fontWeight: "600" },
  btnDanger: { height: 34, paddingHorizontal: 14, borderRadius: 8, backgroundColor: "transparent", alignItems: "center", justifyContent: "center" },
  btnDangerText: { color: c("var(--c-red)"), fontSize: 13, fontWeight: "600" },
  disabled: { opacity: 0.45 },

  editSummary: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  editProj: { fontSize: 13, fontWeight: "600", color: c("var(--c-fg1)") },
  editTask: { fontSize: 12, color: c("var(--c-fg3)"), marginTop: 1 },

  idleCard: { width: 280, backgroundColor: c("var(--c-bg)"), borderRadius: 14, padding: 18, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" as unknown as undefined },
  idleBody: { fontSize: 12, color: c("var(--c-fg2)"), textAlign: "center", lineHeight: 18, marginBottom: 16 },
});

// Cast helper so StyleSheet typing accepts our few web-only values.
const _styleEscape: ViewStyle | undefined = undefined;
void _styleEscape;
