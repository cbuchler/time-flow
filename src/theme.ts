import { useEffect, useState } from "react";
import { AppStateView } from "./types/app";

/**
 * Native macOS-grade theme. Colours are applied as CSS custom properties on the
 * document root so react-native-web StyleSheet rules can reference them via
 * `var(--c-…)` and re-theme without re-creating styles. Everything is authored
 * at real point sizes — there is no scale transform anywhere in the UI.
 */

export type Appearance = "light" | "dark";

export const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif";

function vars(theme: Appearance): Record<string, string> {
  return theme === "dark"
    ? {
        "--c-bg": "#28282c",
        "--c-titlebar": "#2a2a2c",
        "--c-content": "#1c1c1e",
        "--c-card": "#2c2c2e",
        "--c-sidebar": "rgba(255,255,255,0.04)",
        "--c-fg1": "#f5f5f7",
        "--c-fg2": "#c9c9ce",
        "--c-fg3": "#98989d",
        "--c-sep": "rgba(255,255,255,0.12)",
        "--c-sep2": "rgba(255,255,255,0.08)",
        "--c-accent": "#0a84ff",
        "--c-accent-soft": "rgba(10,132,255,0.22)",
        "--c-control": "rgba(120,120,128,0.32)",
        "--c-hover": "rgba(255,255,255,0.07)",
        "--c-green": "#34c759",
        "--c-red": "#ff453a",
        "--c-dash": "#6a6a6e",
        "--c-focus-ring": "rgba(10,132,255,0.5)",
        "--c-card-elev": "inset 0 0.5px 0 rgba(255,255,255,0.08), 0 1px 3px rgba(0,0,0,0.5)",
      }
    : {
        "--c-bg": "#f5f5f7",
        "--c-titlebar": "#f6f6f8",
        "--c-content": "#ececec",
        "--c-card": "#fbfbfd",
        "--c-sidebar": "rgba(255,255,255,0.6)",
        "--c-fg1": "#1d1d1f",
        "--c-fg2": "#56565c",
        "--c-fg3": "#86868b",
        "--c-sep": "rgba(0,0,0,0.10)",
        "--c-sep2": "rgba(0,0,0,0.08)",
        "--c-accent": "#007aff",
        "--c-accent-soft": "rgba(0,122,255,0.12)",
        "--c-control": "rgba(120,120,128,0.16)",
        "--c-hover": "rgba(120,120,128,0.12)",
        "--c-green": "#34c759",
        "--c-red": "#ff3b30",
        "--c-dash": "#b0b0b5",
        "--c-focus-ring": "rgba(0,122,255,0.5)",
        "--c-card-elev": "inset 0 0.5px 0 rgba(255,255,255,0.7), 0 1px 2px rgba(0,0,0,0.06)",
      };
}

function useSystemTheme(): Appearance {
  const [dark, setDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
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

/** Resolve the effective appearance from app state and apply the CSS variables. */
export function useResolvedTheme(state: AppStateView | null): Appearance {
  const system = useSystemTheme();
  const resolved: Appearance = state
    ? state.theme === "dark"
      ? "dark"
      : state.theme === "light"
        ? "light"
        : system
    : system;
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(vars(resolved)).forEach(([k, v]) => root.style.setProperty(k, v));
    root.style.colorScheme = resolved;
  }, [resolved]);
  return resolved;
}

export function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return err instanceof Error ? err.message : String(err);
}

/** Hours as a one-decimal value for the week strip, e.g. 22500s → "6.2". */
export function hoursDecimal(seconds: number): string {
  if (seconds <= 0) return "";
  return (seconds / 3600).toFixed(1);
}
