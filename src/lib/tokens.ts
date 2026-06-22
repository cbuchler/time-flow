import { PlatformId } from "./platform";

export interface Tokens {
  platform: PlatformId;
  material: string;
  card: string;
  input: string;
  inputBorder: string;
  separator: string;
  fg1: string;
  fg2: string;
  fg3: string;
  accent: string;
  accentFg: string;
  danger: string;
  hover: string;
  radius: number;
  radiusSmall: number;
  radiusControl: number;
  width: number;
  height: number;
  fontFamily: string;
  titleAlign: "center" | "flex-start";
}

export function getTokens(platform: PlatformId, dark: boolean): Tokens {
  const base = dark
    ? {
        material: "#1f2024",
        card: "#2a2b30",
        input: "#303138",
        inputBorder: "1px solid rgba(255,255,255,0.11)",
        separator: "rgba(255,255,255,0.11)",
        fg1: "#f5f5f7",
        fg2: "#c9c9cf",
        fg3: "#8f9099",
        hover: "rgba(255,255,255,0.08)",
      }
    : {
        material: "#f7f7f8",
        card: "#ffffff",
        input: "#f1f2f4",
        inputBorder: "1px solid rgba(0,0,0,0.09)",
        separator: "rgba(0,0,0,0.10)",
        fg1: "#1d1d1f",
        fg2: "#55565c",
        fg3: "#8a8c94",
        hover: "rgba(0,0,0,0.06)",
      };

  const perPlatform: Record<PlatformId, Partial<Tokens>> = {
    macos: {
      accent: "#0a84ff",
      radius: 12,
      radiusSmall: 8,
      radiusControl: 9,
      width: 340,
      height: 556,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
      titleAlign: "center",
    },
    windows: {
      accent: dark ? "#60cdff" : "#005fb8",
      radius: 8,
      radiusSmall: 5,
      radiusControl: 5,
      width: 360,
      height: 580,
      fontFamily: "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
      titleAlign: "flex-start",
    },
    gnome: {
      accent: dark ? "#78aeed" : "#3584e4",
      radius: 12,
      radiusSmall: 9,
      radiusControl: 8,
      width: 350,
      height: 570,
      fontFamily: "Cantarell, system-ui, sans-serif",
      titleAlign: "center",
    },
    kde: {
      accent: "#3daee9",
      radius: 6,
      radiusSmall: 4,
      radiusControl: 4,
      width: 322,
      height: 548,
      fontFamily: "'Noto Sans', system-ui, sans-serif",
      titleAlign: "flex-start",
    },
  };

  return {
    platform,
    ...base,
    accentFg: "#ffffff",
    danger: "#e5484d",
    ...perPlatform[platform],
  } as Tokens;
}
