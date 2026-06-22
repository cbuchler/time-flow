import React, { useState } from "react";
import { Alert, ScrollView, Text } from "react-native";
import { Button, Card, Field } from "../components/Primitives";
import { ProjectTaskForm } from "../components/ProjectTaskForm";
import { fromLocalInput, todayInputValue } from "../lib/format";
import { Tokens } from "../lib/tokens";
import { AppStateView } from "../types/app";

export function ManualEntryScreen({
  state,
  tokens,
  onSave,
}: {
  state: AppStateView;
  tokens: Tokens;
  onSave: (input: { projectId: string; taskId?: string; newTaskName?: string; startedAt: string; durationSeconds: number; note: string }) => void;
}) {
  const [selection, setSelection] = useState<{ projectId: string; taskId?: string; newTaskName?: string } | null>(null);
  const [startedAt, setStartedAt] = useState(todayInputValue());
  const [minutes, setMinutes] = useState("30");
  const [note, setNote] = useState("");
  const durationSeconds = Math.max(0, Number.parseInt(minutes, 10) || 0) * 60;

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
      <ProjectTaskForm
        tokens={tokens}
        projects={state.projects}
        tasks={state.tasks}
        submitLabel="Use selection"
        onSubmit={setSelection}
      />
      <Card tokens={tokens} style={{ gap: 10 }}>
        <Text style={{ color: tokens.fg1, fontWeight: "800" }}>Manual entry</Text>
        <Field tokens={tokens} label="Started" value={startedAt} onChangeText={setStartedAt} />
        <Field tokens={tokens} label="Duration minutes" keyboardType="numeric" value={minutes} onChangeText={setMinutes} />
        <Field tokens={tokens} label="Note" value={note} onChangeText={setNote} multiline placeholder="Optional" />
        <Text style={{ color: tokens.fg3, fontSize: 12 }}>
          Overlaps are allowed in V1. Review the time before saving if this entry overlaps existing work.
        </Text>
        <Button
          tokens={tokens}
          label="Save entry"
          variant="primary"
          disabled={!selection || durationSeconds <= 0}
          onPress={() => {
            if (!selection) return;
            const runSave = () =>
              onSave({
                ...selection,
                startedAt: fromLocalInput(startedAt),
                durationSeconds,
                note,
              });
            if (state.today_entries.length) {
              Alert.alert("Possible overlap", "Manual entries may overlap existing entries. Save anyway?", [
                { text: "Cancel", style: "cancel" },
                { text: "Save", onPress: runSave },
              ]);
            } else {
              runSave();
            }
          }}
        />
      </Card>
    </ScrollView>
  );
}
