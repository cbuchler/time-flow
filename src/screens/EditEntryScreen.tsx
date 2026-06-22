import React, { useState } from "react";
import { ScrollView, Text } from "react-native";
import { Button, Card, Field } from "../components/Primitives";
import { formatDuration } from "../lib/format";
import { Tokens } from "../lib/tokens";
import { TodayEntryView } from "../types/app";

export function EditEntryScreen({
  tokens,
  item,
  onSave,
}: {
  tokens: Tokens;
  item: TodayEntryView;
  onSave: (durationSeconds: number, note: string | null) => void;
}) {
  const [minutes, setMinutes] = useState(String(Math.max(1, Math.round(item.entry.duration_seconds / 60))));
  const [note, setNote] = useState(item.entry.note ?? "");
  const durationSeconds = Math.max(0, Number.parseInt(minutes, 10) || 0) * 60;
  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
      <Card tokens={tokens} style={{ gap: 8 }}>
        <Text style={{ color: tokens.fg1, fontWeight: "800" }}>{item.task.name}</Text>
        <Text style={{ color: tokens.fg2 }}>{item.project.name}</Text>
        <Text style={{ color: tokens.fg3, fontSize: 12 }}>
          Only duration and note can be edited after an entry is stopped. Original duration:{" "}
          {formatDuration(item.entry.duration_seconds, true)}.
        </Text>
      </Card>
      <Card tokens={tokens} style={{ gap: 10 }}>
        <Field tokens={tokens} label="Duration minutes" keyboardType="numeric" value={minutes} onChangeText={setMinutes} />
        <Field tokens={tokens} label="Note" value={note} onChangeText={setNote} multiline placeholder="Optional" />
        <Button
          tokens={tokens}
          label="Save"
          variant="primary"
          disabled={durationSeconds <= 0}
          onPress={() => onSave(durationSeconds, note.trim() ? note.trim() : null)}
        />
      </Card>
    </ScrollView>
  );
}
