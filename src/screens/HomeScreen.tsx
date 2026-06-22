import React from "react";
import { ScrollView, Text, View } from "react-native";
import { ActiveSession, AppStateView, TodayEntryView } from "../types/app";
import { Button, Card, EmptyState } from "../components/Primitives";
import { Tokens } from "../lib/tokens";
import { formatClock, formatDuration } from "../lib/format";

export function HomeScreen({
  state,
  tokens,
  onStart,
  onFocus,
  onSettings,
  onManual,
  onResumeEntry,
  onEditEntry,
  onPause,
  onResume,
  onStop,
  onSkip,
}: {
  state: AppStateView;
  tokens: Tokens;
  onStart: () => void;
  onFocus: () => void;
  onSettings: () => void;
  onManual: () => void;
  onResumeEntry: (entry: TodayEntryView) => void;
  onEditEntry: (entry: TodayEntryView) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSkip: () => void;
}) {
  const hasActiveProjectTask =
    state.projects.some((project) => !project.archived_at) &&
    state.tasks.some((task) => !task.archived_at);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 12 }}>
        {state.active_session ? (
          <ActiveCard
            tokens={tokens}
            session={state.active_session}
            state={state}
            onPause={onPause}
            onResume={onResume}
            onStop={onStop}
            onSkip={onSkip}
          />
        ) : hasActiveProjectTask ? (
          <EmptyState
            tokens={tokens}
            title="Ready when you are"
            body="Start a timer from a project task, or use Focus when you want a Pomodoro session."
            action={{ label: "New timer", onPress: onStart }}
          />
        ) : (
          <EmptyState
            tokens={tokens}
            title="Set up your first project"
            body="Time entries need a project and reusable task. Create both once, then resume that work from Today."
            action={{ label: "Create project", onPress: onStart }}
          />
        )}
        <WeekStrip state={state} tokens={tokens} />
        <TodayList
          entries={state.today_entries}
          tokens={tokens}
          onResumeEntry={onResumeEntry}
          onEditEntry={onEditEntry}
        />
      </ScrollView>
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          padding: 12,
          borderTopWidth: 1,
          borderTopColor: tokens.separator,
        }}
      >
        <Button tokens={tokens} label="New timer" variant="primary" onPress={onStart} />
        <Button tokens={tokens} label="Focus" disabled={!hasActiveProjectTask} onPress={onFocus} />
        <Button tokens={tokens} label="Manual" disabled={!hasActiveProjectTask} onPress={onManual} />
        <Button tokens={tokens} label="Settings" onPress={onSettings} />
      </View>
    </View>
  );
}

function ActiveCard({
  tokens,
  session,
  state,
  onPause,
  onResume,
  onStop,
  onSkip,
}: {
  tokens: Tokens;
  session: ActiveSession;
  state: AppStateView;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSkip: () => void;
}) {
  const project = state.projects.find((candidate) => candidate.id === session.project_id);
  const task = state.tasks.find((candidate) => candidate.id === session.task_id);
  const paused = Boolean(session.paused_at);
  return (
    <Card tokens={tokens} style={{ gap: 12, borderColor: tokens.accent }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: project?.color ?? tokens.accent }} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: tokens.fg1, fontWeight: "800", fontSize: 15 }} numberOfLines={1}>
            {task?.name ?? "Task"}
          </Text>
          <Text style={{ color: tokens.fg3, fontSize: 12 }} numberOfLines={1}>
            {project?.name ?? "Project"} · {session.mode === "focus" ? "Focus" : paused ? "Paused" : "Tracking"}
          </Text>
        </View>
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={{ color: tokens.fg1, fontVariant: ["tabular-nums"], fontSize: 38, fontWeight: "800" }}
      >
        {formatDuration(session.elapsed_seconds)}
      </Text>
      {session.focus ? (
        <Text style={{ color: tokens.fg2, fontSize: 13 }}>
          {session.focus.phase.replace("_", " ")} · round {session.focus.round_index} of{" "}
          {session.focus.total_rounds}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button tokens={tokens} label={paused ? "Resume" : "Pause"} variant="primary" onPress={paused ? onResume : onPause} />
        {session.mode === "focus" ? <Button tokens={tokens} label="Skip" onPress={onSkip} /> : null}
        <Button tokens={tokens} label="Stop" variant="danger" onPress={onStop} />
      </View>
    </Card>
  );
}

function WeekStrip({ state, tokens }: { state: AppStateView; tokens: Tokens }) {
  const max = Math.max(1, ...state.week.map((day) => day.seconds));
  const total = state.week.reduce((sum, day) => sum + day.seconds, 0);
  return (
    <Card tokens={tokens} style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: tokens.fg1, fontWeight: "800" }}>This week</Text>
        <Text style={{ color: tokens.fg2 }}>{formatDuration(total, true)}</Text>
      </View>
      <View style={{ height: 58, flexDirection: "row", alignItems: "flex-end", gap: 7 }}>
        {state.week.map((day) => (
          <View key={day.label} style={{ flex: 1, alignItems: "center", gap: 4 }}>
            <View
              style={{
                width: "100%",
                minHeight: 3,
                height: Math.max(3, (day.seconds / max) * 42),
                borderRadius: 3,
                backgroundColor: day.seconds ? tokens.accent : tokens.separator,
              }}
            />
            <Text style={{ color: tokens.fg3, fontSize: 10 }}>{day.label.slice(0, 1)}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function TodayList({
  entries,
  tokens,
  onResumeEntry,
  onEditEntry,
}: {
  entries: TodayEntryView[];
  tokens: Tokens;
  onResumeEntry: (entry: TodayEntryView) => void;
  onEditEntry: (entry: TodayEntryView) => void;
}) {
  const total = entries.reduce((sum, item) => sum + item.entry.duration_seconds, 0);
  return (
    <Card tokens={tokens} style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: tokens.fg1, fontWeight: "800" }}>Today</Text>
        <Text style={{ color: tokens.fg2 }}>{formatDuration(total, true)}</Text>
      </View>
      {entries.length === 0 ? (
        <Text style={{ color: tokens.fg2, fontSize: 13 }}>No time logged today.</Text>
      ) : (
        entries.map((item) => (
          <View
            key={item.entry.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingVertical: 8,
              borderTopWidth: 1,
              borderTopColor: tokens.separator,
            }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: item.project.color }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: tokens.fg1, fontWeight: "700" }} numberOfLines={1}>
                {item.task.name}
              </Text>
              <Text style={{ color: tokens.fg3, fontSize: 12 }} numberOfLines={1}>
                {item.project.name} · {formatClock(item.entry.started_at)} ·{" "}
                {formatDuration(item.entry.duration_seconds, true)}
              </Text>
            </View>
            <Button tokens={tokens} label="Edit" onPress={() => onEditEntry(item)} />
            <Button tokens={tokens} label="Play" variant="primary" accessibilityLabel={`Resume ${item.task.name}`} onPress={() => onResumeEntry(item)} />
          </View>
        ))
      )}
    </Card>
  );
}
