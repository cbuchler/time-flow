import React from "react";
import {
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { Tokens } from "../lib/tokens";

export function Shell({
  tokens,
  children,
}: {
  tokens: Tokens;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.shell,
        {
          width: tokens.width,
          height: tokens.height,
          backgroundColor: tokens.material,
          borderRadius: tokens.radius,
          fontFamily: tokens.fontFamily,
        } as ViewStyle,
      ]}
    >
      {children}
    </View>
  );
}

export function Header({
  tokens,
  title,
  status,
  canBack,
  onBack,
  action,
}: {
  tokens: Tokens;
  title: string;
  status?: string;
  canBack?: boolean;
  onBack?: () => void;
  action?: { label: string; onPress: () => void; disabled?: boolean };
}) {
  return (
    <View style={[styles.header, { borderBottomColor: tokens.separator }]}>
      <View style={styles.headerSide}>
        {canBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            style={({ pressed }) => [
              styles.textButton,
              pressed && { backgroundColor: tokens.hover },
            ]}
          >
            <Text style={{ color: tokens.accent, fontWeight: "600" }}>Back</Text>
          </Pressable>
        ) : (
          <Text style={{ color: tokens.fg3, fontSize: 12 }} numberOfLines={1}>
            {status ?? ""}
          </Text>
        )}
      </View>
      <View style={[styles.titleWrap, { alignItems: tokens.titleAlign }]}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: tokens.fg1 }]}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>
      <View style={[styles.headerSide, { alignItems: "flex-end" }]}>
        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            disabled={action.disabled}
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.textButton,
              pressed && !action.disabled && { backgroundColor: tokens.hover },
              action.disabled && { opacity: 0.4 },
            ]}
          >
            <Text style={{ color: tokens.accent, fontWeight: "700" }}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function Button({
  tokens,
  label,
  onPress,
  variant = "secondary",
  disabled,
  accessibilityLabel,
}: {
  tokens: Tokens;
  label: string;
  onPress: PressableProps["onPress"];
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const primary = variant === "primary";
  const danger = variant === "danger";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? tokens.accent : tokens.input,
          borderColor: primary ? tokens.accent : tokens.separator,
          borderRadius: tokens.radiusControl,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        pressed && !disabled && { borderColor: tokens.accent },
      ]}
    >
      <Text
        style={{
          color: primary ? tokens.accentFg : danger ? tokens.danger : tokens.fg1,
          fontWeight: "700",
          fontSize: 13,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({
  tokens,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  tokens: Tokens;
  label: string;
} & Pick<TextInputProps, "value" | "onChangeText" | "placeholder" | "keyboardType" | "multiline">) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: tokens.fg2 }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.fg3}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            backgroundColor: tokens.input,
            borderColor: tokens.separator,
            borderRadius: tokens.radiusControl,
            color: tokens.fg1,
            outlineStyle: "none",
          } as StyleProp<TextStyle>,
        ]}
      />
    </View>
  );
}

export function Card({
  tokens,
  children,
  style,
}: {
  tokens: Tokens;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tokens.card,
          borderColor: tokens.separator,
          borderRadius: tokens.radius,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function EmptyState({
  tokens,
  title,
  body,
  action,
}: {
  tokens: Tokens;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <Card tokens={tokens} style={{ gap: 8 }}>
      <Text style={[styles.emptyTitle, { color: tokens.fg1 }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: tokens.fg2 }]}>{body}</Text>
      {action ? <Button tokens={tokens} label={action.label} variant="primary" onPress={action.onPress} /> : null}
    </Card>
  );
}

export const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
    boxShadow: "0 18px 48px rgba(0,0,0,0.22)",
  } as ViewStyle,
  header: {
    height: 46,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerSide: {
    width: 76,
    minWidth: 76,
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
  },
  textButton: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  button: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  field: {
    gap: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
  input: {
    minHeight: 36,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  multiline: {
    minHeight: 78,
    textAlignVertical: "top",
  },
  card: {
    borderWidth: 1,
    padding: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 18,
  },
});
