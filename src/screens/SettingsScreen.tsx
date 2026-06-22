import React from "react";
import { ScrollView, Text, View } from "react-native";
import { Button, Card, Field } from "../components/Primitives";
import { Tokens } from "../lib/tokens";
import { AppConfig, ThemeMode } from "../types/app";

export function SettingsScreen({
  config,
  tokens,
  onPatch,
}: {
  config: AppConfig;
  tokens: Tokens;
  onPatch: (patch: Partial<AppConfig>) => void;
}) {
  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
      <Card tokens={tokens} style={{ gap: 10 }}>
        <Text style={{ color: tokens.fg1, fontWeight: "800" }}>Pomodoro</Text>
        <NumberSetting
          tokens={tokens}
          label="Focus minutes"
          value={config.pomodoro.focus_minutes}
          onChange={(value) => onPatch({ pomodoro: { ...config.pomodoro, focus_minutes: value } })}
        />
        <NumberSetting
          tokens={tokens}
          label="Short break"
          value={config.pomodoro.short_break_minutes}
          onChange={(value) => onPatch({ pomodoro: { ...config.pomodoro, short_break_minutes: value } })}
        />
        <NumberSetting
          tokens={tokens}
          label="Long break"
          value={config.pomodoro.long_break_minutes}
          onChange={(value) => onPatch({ pomodoro: { ...config.pomodoro, long_break_minutes: value } })}
        />
        <NumberSetting
          tokens={tokens}
          label="Rounds"
          value={config.pomodoro.rounds}
          onChange={(value) => onPatch({ pomodoro: { ...config.pomodoro, rounds: value } })}
        />
      </Card>
      <Card tokens={tokens} style={{ gap: 10 }}>
        <Text style={{ color: tokens.fg1, fontWeight: "800" }}>General</Text>
        <ToggleRow
          tokens={tokens}
          label="Launch at login"
          value={config.general.launch_at_login}
          onToggle={() =>
            onPatch({
              general: {
                ...config.general,
                launch_at_login: !config.general.launch_at_login,
              },
            })
          }
        />
        <ToggleRow
          tokens={tokens}
          label="Idle auto-pause"
          value={config.general.idle_auto_pause_enabled}
          onToggle={() =>
            onPatch({
              general: {
                ...config.general,
                idle_auto_pause_enabled: !config.general.idle_auto_pause_enabled,
              },
            })
          }
        />
        <NumberSetting
          tokens={tokens}
          label="Idle threshold"
          value={config.general.idle_threshold_minutes}
          onChange={(value) =>
            onPatch({
              general: {
                ...config.general,
                idle_threshold_minutes: value,
              },
            })
          }
        />
      </Card>
      <Card tokens={tokens} style={{ gap: 10 }}>
        <Text style={{ color: tokens.fg1, fontWeight: "800" }}>Appearance</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["system", "light", "dark"] as ThemeMode[]).map((mode) => (
            <Button
              key={mode}
              tokens={tokens}
              label={mode[0].toUpperCase() + mode.slice(1)}
              variant={config.appearance.mode === mode ? "primary" : "secondary"}
              onPress={() => onPatch({ appearance: { mode } })}
            />
          ))}
        </View>
      </Card>
    </ScrollView>
  );
}

function NumberSetting({
  tokens,
  label,
  value,
  onChange,
}: {
  tokens: Tokens;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Field
          tokens={tokens}
          label={label}
          keyboardType="numeric"
          value={String(value)}
          onChangeText={(text) => {
            const parsed = Number.parseInt(text, 10);
            if (Number.isFinite(parsed)) onChange(parsed);
          }}
        />
      </View>
    </View>
  );
}

function ToggleRow({
  tokens,
  label,
  value,
  onToggle,
}: {
  tokens: Tokens;
  label: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ color: tokens.fg1, fontWeight: "700" }}>{label}</Text>
      <Button tokens={tokens} label={value ? "On" : "Off"} variant={value ? "primary" : "secondary"} onPress={onToggle} />
    </View>
  );
}
