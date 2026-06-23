import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  archiveProject,
  archiveTask,
  createProject,
  createTask,
  getAppState,
  onAppState,
  setDatabaseLocation,
  updateConfig,
  updateProject,
  updateTask,
} from "./lib/api";
import { errorMessage, useResolvedTheme } from "./theme";
import { AppConfig, AppStateView, Project, ProjectInput, Task, TaskInput, ThemeMode } from "./types/app";

const c = (v: string) => v as unknown as string;

type Page = "general" | "focus" | "projects" | "tasks";
type Editor =
  | { type: "newProject" }
  | { type: "editProject"; project: Project }
  | { type: "newTask" }
  | { type: "editTask"; task: Task }
  | null;

const SWATCHES = ["#0a84ff", "#8e8e93", "#bf5af2", "#ff9f0a", "#34c759", "#ff3b30"];

export function SettingsRoot() {
  const [state, setState] = useState<AppStateView | null>(null);
  const [page, setPage] = useState<Page>("general");
  const [editor, setEditor] = useState<Editor>(null);
  const [error, setError] = useState<string | null>(null);

  useResolvedTheme(state);

  const refresh = useCallback(async () => {
    try {
      setState(await getAppState());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    let dispose: (() => void) | undefined;
    void onAppState(setState).then((un) => { dispose = un; });
    return () => dispose?.();
  }, [refresh]);

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

  // Reflect the active pane in the window title bar (like System Settings),
  // instead of a static "Settings" plus a large in-content heading.
  const windowTitle =
    editor?.type === "newProject" ? "New Project" :
    editor?.type === "editProject" ? "Edit Project" :
    editor?.type === "newTask" ? "New Task" :
    editor?.type === "editTask" ? "Edit Task" :
    page === "general" ? "General" :
    page === "focus" ? "Focus" :
    page === "projects" ? "Projects" : "Tasks";
  useEffect(() => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      void import("@tauri-apps/api/window")
        .then(({ getCurrentWindow }) => getCurrentWindow().setTitle(windowTitle))
        .catch(() => {});
    }
  }, [windowTitle]);

  if (!state) {
    return <View style={styles.win}><Text style={styles.loading}>Loading…</Text></View>;
  }

  const go = (p: Page) => { setEditor(null); setPage(p); };

  return (
    <View style={styles.win}>
      <View style={styles.sidebar}>
        <SidebarItem label="General" glyph="◷" color="#8e8e93" active={page === "general" && !editor} onPress={() => go("general")} />
        <SidebarItem label="Focus" glyph="◉" color="#ff3b30" active={page === "focus" && !editor} onPress={() => go("focus")} />
        <SidebarItem label="Projects" glyph="▦" color="#34c759" active={page === "projects" || Boolean(editor && editor.type.includes("roject"))} onPress={() => go("projects")} />
        <SidebarItem label="Tasks" glyph="☰" color="#0a84ff" active={page === "tasks" || Boolean(editor && editor.type.includes("ask"))} onPress={() => go("tasks")} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {editor?.type === "newProject" ? (
          <ProjectForm onCancel={() => setEditor(null)} onSubmit={(input) => run(() => createProject(input), () => setEditor(null))} />
        ) : editor?.type === "editProject" ? (
          <ProjectForm project={editor.project} onCancel={() => setEditor(null)} onSubmit={(input) => run(() => updateProject(editor.project.id, input), () => setEditor(null))} onArchive={() => run(() => archiveProject(editor.project.id), () => setEditor(null))} />
        ) : editor?.type === "newTask" ? (
          <TaskForm state={state} onCancel={() => setEditor(null)} onSubmit={(input) => run(() => createTask(input), () => setEditor(null))} />
        ) : editor?.type === "editTask" ? (
          <TaskForm state={state} task={editor.task} onCancel={() => setEditor(null)} onSubmit={(input) => run(() => updateTask(editor.task.id, input), () => setEditor(null))} onArchive={() => run(() => archiveTask(editor.task.id), () => setEditor(null))} />
        ) : page === "general" ? (
          <GeneralPage config={state.config} databasePath={state.database_path} onChangeDatabase={() => run(() => setDatabaseLocation())} onPatch={(p) => run(() => updateConfig(p))} />
        ) : page === "focus" ? (
          <FocusPage config={state.config} onPatch={(p) => run(() => updateConfig(p))} />
        ) : page === "projects" ? (
          <ProjectsPage state={state} onNew={() => setEditor({ type: "newProject" })} onEdit={(project) => setEditor({ type: "editProject", project })} />
        ) : (
          <TasksPage state={state} onNew={() => setEditor({ type: "newTask" })} onEdit={(task) => setEditor({ type: "editTask", task })} />
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
}

function SidebarItem({ label, glyph, color, active, onPress }: { label: string; glyph: string; color: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.sb, active && styles.sbActive]}>
      <View style={[styles.sbIcon, { backgroundColor: active ? "rgba(255,255,255,0.25)" : color }]}><Text style={styles.sbGlyph}>{glyph}</Text></View>
      <Text style={[styles.sbLabel, active && styles.sbLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function GeneralPage({ config, databasePath, onChangeDatabase, onPatch }: { config: AppConfig; databasePath: string; onChangeDatabase: () => void; onPatch: (p: Partial<AppConfig>) => void }) {
  return (
    <>
      <GroupLabel>Appearance</GroupLabel>
      <Card>
        <Cell title="Theme" sub="Match the system or pick a fixed appearance.">
          <Segmented<ThemeMode>
            options={[["system", "System"], ["light", "Light"], ["dark", "Dark"]]}
            value={config.appearance.mode}
            onChange={(mode) => onPatch({ appearance: { mode } })}
          />
        </Cell>
      </Card>

      <GroupLabel>Idle detection</GroupLabel>
      <Card>
        <Cell title="Pause when idle" sub="Pause the running timer after a period with no input.">
          <Switch value={config.general.idle_auto_pause_enabled} onChange={(v) => onPatch({ general: { ...config.general, idle_auto_pause_enabled: v } })} />
        </Cell>
        <Cell title="Idle threshold" sub="Minutes of inactivity before pausing.">
          <Stepper value={`${config.general.idle_threshold_minutes} min`} onMinus={() => onPatch({ general: { ...config.general, idle_threshold_minutes: Math.max(1, config.general.idle_threshold_minutes - 1) } })} onPlus={() => onPatch({ general: { ...config.general, idle_threshold_minutes: config.general.idle_threshold_minutes + 1 } })} />
        </Cell>
      </Card>
      <Text style={styles.note}>Idle is measured from system-wide keyboard and mouse activity. After the threshold passes with no input, the timer pauses and you're asked whether to keep or discard the idle time.</Text>

      <GroupLabel>Startup</GroupLabel>
      <Card>
        <Cell title="Launch at login" sub="Start Time &amp; Flow automatically.">
          <Switch value={config.general.launch_at_login} onChange={(v) => onPatch({ general: { ...config.general, launch_at_login: v } })} />
        </Cell>
      </Card>

      <GroupLabel>Storage</GroupLabel>
      <Card>
        <Cell title="Database file" sub={databasePath}>
          <Pressable accessibilityRole="button" onPress={onChangeDatabase} style={styles.cancelBtn}><Text style={styles.cancelText}>Change…</Text></Pressable>
        </Cell>
      </Card>
      <Text style={styles.note}>This is the SQLite file holding your projects, tasks, and time entries. Changing the location copies your current data into the new folder and switches to it immediately. The original file is left in place as a backup; the folder you pick must not already contain a timeflow.db.</Text>
    </>
  );
}

function FocusPage({ config, onPatch }: { config: AppConfig; onPatch: (p: Partial<AppConfig>) => void }) {
  const p = config.pomodoro;
  const upd = (key: keyof typeof p, delta: number) => onPatch({ pomodoro: { ...p, [key]: Math.max(1, Number(p[key]) + delta) } });
  return (
    <>
      <GroupLabel>Pomodoro timing</GroupLabel>
      <Card>
        <Cell title="Focus length"><Stepper value={`${p.focus_minutes} min`} onMinus={() => upd("focus_minutes", -1)} onPlus={() => upd("focus_minutes", 1)} /></Cell>
        <Cell title="Short break"><Stepper value={`${p.short_break_minutes} min`} onMinus={() => upd("short_break_minutes", -1)} onPlus={() => upd("short_break_minutes", 1)} /></Cell>
        <Cell title="Long break"><Stepper value={`${p.long_break_minutes} min`} onMinus={() => upd("long_break_minutes", -1)} onPlus={() => upd("long_break_minutes", 1)} /></Cell>
        <Cell title="Rounds"><Stepper value={`${p.rounds}`} onMinus={() => upd("rounds", -1)} onPlus={() => upd("rounds", 1)} /></Cell>
        <Cell title="Long break after"><Stepper value={`${p.long_break_after_rounds}`} onMinus={() => upd("long_break_after_rounds", -1)} onPlus={() => upd("long_break_after_rounds", 1)} /></Cell>
      </Card>
    </>
  );
}

function ProjectsPage({ state, onNew, onEdit }: { state: AppStateView; onNew: () => void; onEdit: (p: Project) => void }) {
  const projects = state.projects.filter((p) => !p.archived_at);
  return (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.groupLabel}>{`${projects.length} total`}</Text>
        <Pressable accessibilityRole="button" style={styles.addBtn} onPress={onNew}><Text style={styles.addBtnText}>+ New Project</Text></Pressable>
      </View>
      <Card>
        {projects.map((p, i) => (
          <ListRow key={p.id} first={i === 0} onPress={() => onEdit(p)} dotColor={p.color} title={p.name} sub={`${state.tasks.filter((t) => t.project_id === p.id && !t.archived_at).length} tasks`} />
        ))}
        {projects.length === 0 ? <View style={styles.cell}><Text style={styles.cellSub}>No projects yet.</Text></View> : null}
      </Card>
    </>
  );
}

function TasksPage({ state, onNew, onEdit }: { state: AppStateView; onNew: () => void; onEdit: (t: Task) => void }) {
  const tasks = state.tasks.filter((t) => !t.archived_at);
  return (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.groupLabel}>{`${tasks.length} total`}</Text>
        <Pressable accessibilityRole="button" style={styles.addBtn} onPress={onNew}><Text style={styles.addBtnText}>+ New Task</Text></Pressable>
      </View>
      <Card>
        {tasks.map((t, i) => {
          const project = state.projects.find((p) => p.id === t.project_id);
          return <ListRow key={t.id} first={i === 0} onPress={() => onEdit(t)} dotColor={project?.color} title={t.name} sub={project ? project.name : "Global · no project"} />;
        })}
        {tasks.length === 0 ? <View style={styles.cell}><Text style={styles.cellSub}>No tasks yet.</Text></View> : null}
      </Card>
    </>
  );
}

function ProjectForm({ project, onSubmit, onCancel, onArchive }: { project?: Project; onSubmit: (input: ProjectInput) => void; onCancel: () => void; onArchive?: () => void }) {
  const [name, setName] = useState(project?.name ?? "");
  const [color, setColor] = useState(project?.color ?? SWATCHES[0]);
  const canSave = name.trim().length > 0;
  return (
    <>
      <Crumb label="‹ Projects" onPress={onCancel} />
      <Card>
        <Cell title="Name"><TextInput accessibilityLabel="Name" value={name} onChangeText={setName} placeholder="Project name" placeholderTextColor={c("var(--c-fg3)")} style={styles.tInput} /></Cell>
        <Cell title="Color" sub="Used in lists and timer rows.">
          <View style={styles.swatches}>
            {SWATCHES.map((s) => (
              <Pressable key={s} accessibilityRole="button" onPress={() => setColor(s)} style={[styles.swatch, { backgroundColor: s }, color === s && styles.swatchSel]} />
            ))}
          </View>
        </Cell>
      </Card>
      <FormActions canSave={canSave} saveLabel={project ? "Save Project" : "Create Project"} onSave={() => onSubmit({ name: name.trim(), color, billable: false, client: null, hourly_rate: null })} onCancel={onCancel} onArchive={onArchive} />
    </>
  );
}

function TaskForm({ state, task, onSubmit, onCancel, onArchive }: { state: AppStateView; task?: Task; onSubmit: (input: TaskInput) => void; onCancel: () => void; onArchive?: () => void }) {
  const projects = state.projects.filter((p) => !p.archived_at);
  const [name, setName] = useState(task?.name ?? "");
  const [projectId, setProjectId] = useState(task?.project_id ?? projects[0]?.id ?? "");
  const canSave = name.trim().length > 0 && projectId.length > 0;
  return (
    <>
      <Crumb label="‹ Tasks" onPress={onCancel} />
      <Card><Cell title="Name"><TextInput accessibilityLabel="Name" value={name} onChangeText={setName} placeholder="Task name" placeholderTextColor={c("var(--c-fg3)")} style={styles.tInput} /></Cell></Card>
      <GroupLabel>Project</GroupLabel>
      <Card>
        {projects.map((p, i) => (
          <Pressable key={p.id} accessibilityRole="button" onPress={() => setProjectId(p.id)} style={[styles.cell, i > 0 && styles.cellBorder]}>
            <View style={[styles.dot, { backgroundColor: p.color }]} />
            <View style={styles.cellText}><Text style={styles.cellTitle}>{p.name}</Text></View>
            {projectId === p.id ? <Text style={styles.pick}>✓</Text> : null}
          </Pressable>
        ))}
      </Card>
      <FormActions canSave={canSave} saveLabel={task ? "Save Task" : "Create Task"} onSave={() => onSubmit({ project_id: projectId, name: name.trim() })} onCancel={onCancel} onArchive={onArchive} />
    </>
  );
}

/* ---------- primitives ---------- */

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.groupLabel}>{children}</Text>;
}
function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
function Cell({ title, sub, children, first }: { title: string; sub?: string; children?: React.ReactNode; first?: boolean }) {
  return (
    <View style={[styles.cell, !first && styles.cellBorder]}>
      <View style={styles.cellText}>
        <Text style={styles.cellTitle}>{title}</Text>
        {sub ? <Text style={styles.cellSub}>{sub}</Text> : null}
      </View>
      {children}
    </View>
  );
}
function ListRow({ dotColor, title, sub, onPress, first }: { dotColor?: string; title: string; sub: string; onPress: () => void; first?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.cell, !first && styles.cellBorder]}>
      <View style={[styles.dot, dotColor ? { backgroundColor: dotColor } : styles.dotNone]} />
      <View style={styles.cellText}>
        <Text style={styles.cellTitle}>{title}</Text>
        <Text style={styles.cellSub}>{sub}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}
function Segmented<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented}>
      {options.map(([val, label]) => (
        <Pressable key={val} accessibilityRole="button" onPress={() => onChange(val)} style={[styles.segItem, value === val && styles.segItemOn]}>
          <Text style={[styles.segText, value === val && styles.segTextOn]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
function Switch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={[styles.switch, value && styles.switchOn]}>
      <View style={[styles.knob, value && styles.knobOn]} />
    </Pressable>
  );
}
function Stepper({ value, onMinus, onPlus }: { value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperValue}>{value}</Text>
      <View style={styles.pm}>
        <Pressable accessibilityRole="button" accessibilityLabel="Decrease" onPress={onMinus} style={styles.pmBtn}><Text style={styles.pmGlyph}>−</Text></Pressable>
        <View style={styles.pmSep} />
        <Pressable accessibilityRole="button" accessibilityLabel="Increase" onPress={onPlus} style={styles.pmBtn}><Text style={styles.pmGlyph}>+</Text></Pressable>
      </View>
    </View>
  );
}
function Crumb({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.crumb}><Text style={styles.crumbText}>{label}</Text></Pressable>;
}
function FormActions({ canSave, saveLabel, onSave, onCancel, onArchive }: { canSave: boolean; saveLabel: string; onSave: () => void; onCancel: () => void; onArchive?: () => void }) {
  return (
    <View style={styles.formActions}>
      {onArchive ? <Pressable accessibilityRole="button" onPress={onArchive} style={styles.archiveBtn}><Text style={styles.archiveText}>Archive</Text></Pressable> : null}
      <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={!canSave} onPress={onSave} style={[styles.saveBtn, !canSave && styles.disabled]}><Text style={styles.saveText}>{saveLabel}</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  win: { flexDirection: "row", height: "100vh" as unknown as number, backgroundColor: "transparent", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif" },
  loading: { margin: "auto" as unknown as number, fontSize: 13, color: c("var(--c-fg2)") },
  error: { backgroundColor: "#d7372f", color: "#fff", padding: 10, borderRadius: 8, fontSize: 12, fontWeight: "600", marginTop: 16 },

  // Transparent so the native Liquid Glass sidebar material shows through.
  sidebar: { width: 200, backgroundColor: "transparent", borderRightWidth: 0.5, borderRightColor: c("var(--c-sep)"), paddingHorizontal: 12, paddingTop: 14, gap: 2 },
  sb: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  sbActive: { backgroundColor: c("var(--c-accent)") },
  sbIcon: { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  sbGlyph: { color: "#fff", fontSize: 12 },
  sbLabel: { fontSize: 13, fontWeight: "500", color: c("var(--c-fg1)") },
  sbLabelActive: { color: "#fff" },

  content: { flex: 1, backgroundColor: c("var(--c-content)") },
  contentInner: { padding: 24, paddingBottom: 40 },
  h1: { fontSize: 19, fontWeight: "700", color: c("var(--c-fg1)"), marginBottom: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  addBtn: { backgroundColor: c("var(--c-accent)"), height: 28, paddingHorizontal: 14, borderRadius: 14, justifyContent: "center", marginBottom: 8 },
  addBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  groupLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase", color: c("var(--c-fg3)"), marginBottom: 8, marginLeft: 4 },
  note: { fontSize: 11, color: c("var(--c-fg3)"), lineHeight: 16, marginTop: 2, marginBottom: 22, marginHorizontal: 4 },
  card: { backgroundColor: c("var(--c-card)"), borderRadius: 12, overflow: "hidden", marginBottom: 22, boxShadow: c("var(--c-card-elev)") as unknown as undefined },
  cell: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 11, minHeight: 44 },
  cellBorder: { borderTopWidth: 0.5, borderTopColor: c("var(--c-sep2)") },
  cellText: { flex: 1 },
  cellTitle: { fontSize: 13, fontWeight: "500", color: c("var(--c-fg1)") },
  cellSub: { fontSize: 11, color: c("var(--c-fg3)"), marginTop: 1, lineHeight: 15 },
  dot: { width: 11, height: 11, borderRadius: 6 },
  dotNone: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: c("var(--c-dash)"), borderStyle: "dashed" },
  chevron: { fontSize: 17, fontWeight: "600", color: c("var(--c-fg3)") },
  pick: { fontSize: 15, fontWeight: "700", color: c("var(--c-accent)") },

  tInput: { width: 240, textAlign: "right", fontSize: 13, color: c("var(--c-fg1)"), borderWidth: 0, backgroundColor: "transparent" },

  segmented: { flexDirection: "row", backgroundColor: c("var(--c-control)"), borderRadius: 9, padding: 2 },
  segItem: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 7 },
  segItemOn: { backgroundColor: c("var(--c-card)"), boxShadow: "0 1px 3px rgba(0,0,0,0.14)" as unknown as undefined },
  segText: { fontSize: 13, fontWeight: "500", color: c("var(--c-fg1)") },
  segTextOn: { fontWeight: "600" },

  switch: { width: 38, height: 23, borderRadius: 12, backgroundColor: c("var(--c-control)"), padding: 2, justifyContent: "center" },
  switchOn: { backgroundColor: c("var(--c-green)") },
  knob: { width: 19, height: 19, borderRadius: 10, backgroundColor: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" as unknown as undefined },
  knobOn: { marginLeft: 15 },

  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepperValue: { fontSize: 13, fontWeight: "500", color: c("var(--c-fg1)"), minWidth: 54, textAlign: "right", fontVariant: ["tabular-nums"] },
  pm: { flexDirection: "row", backgroundColor: c("var(--c-control)"), borderRadius: 7, overflow: "hidden" },
  pmBtn: { width: 30, height: 26, alignItems: "center", justifyContent: "center" },
  pmSep: { width: 0.5, backgroundColor: c("var(--c-sep)") },
  pmGlyph: { fontSize: 15, color: c("var(--c-fg1)") },

  swatches: { flexDirection: "row", gap: 8 },
  swatch: { width: 22, height: 22, borderRadius: 11 },
  swatchSel: { borderWidth: 2, borderColor: c("var(--c-card)"), boxShadow: "0 0 0 2px var(--c-accent)" as unknown as undefined },

  crumb: { marginBottom: 12 },
  crumbText: { color: c("var(--c-accent)"), fontSize: 13, fontWeight: "600" },
  formActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  archiveBtn: { marginRight: "auto" as unknown as number },
  archiveText: { color: c("var(--c-red)"), fontSize: 13, fontWeight: "600" },
  cancelBtn: { height: 30, paddingHorizontal: 18, borderRadius: 15, backgroundColor: c("var(--c-control)"), justifyContent: "center" },
  cancelText: { fontSize: 13, fontWeight: "600", color: c("var(--c-fg1)") },
  saveBtn: { height: 30, paddingHorizontal: 18, borderRadius: 15, backgroundColor: c("var(--c-accent)"), justifyContent: "center" },
  saveText: { fontSize: 13, fontWeight: "600", color: "#fff" },
  disabled: { opacity: 0.45 },
});
