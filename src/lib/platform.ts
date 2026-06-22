export type PlatformId = "macos" | "windows" | "gnome" | "kde";

export function normalizePlatform(raw: string): PlatformId {
  const lower = raw.toLowerCase();
  if (lower.includes("windows") || lower.includes("win")) return "windows";
  if (lower.includes("linux")) {
    const desktop = (globalThis as { process?: { env?: Record<string, string> } }).process?.env
      ?.XDG_CURRENT_DESKTOP;
    if (desktop?.toLowerCase().includes("kde")) return "kde";
    return "gnome";
  }
  return "macos";
}
