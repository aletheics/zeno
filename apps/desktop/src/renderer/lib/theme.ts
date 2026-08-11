import type { HostSnapshot } from "@zeno/contracts";

/** User preference: fixed light/dark or follow OS. */
export type ThemePreference = "light" | "dark" | "system";

/** Resolved shell appearance applied to `data-theme`. */
export type ResolvedColorMode = "light" | "dark";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function systemPrefersDark(
  getMatches: () => boolean = () =>
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches),
): boolean {
  try {
    return getMatches();
  } catch {
    return true;
  }
}

/** Resolve user theme preference against current system scheme. */
export function resolveColorMode(
  preference: ThemePreference,
  prefersDark: boolean = systemPrefersDark(),
): ResolvedColorMode {
  if (preference === "system") return prefersDark ? "dark" : "light";
  return preference;
}

/**
 * Electron `nativeTheme.themeSource` for chrome / `prefers-color-scheme`.
 * Must stay `"system"` while the user (and skin) follow the OS — forcing the
 * resolved light/dark value locks Chromium's media query and breaks follow-system.
 */
export function resolveNativeThemeSource(
  preference: ThemePreference,
  skinAppearance: "auto" | "light" | "dark" | undefined = "auto",
): "light" | "dark" | "system" {
  if (skinAppearance === "light" || skinAppearance === "dark") return skinAppearance;
  return preference;
}

/** Best-effort map from pi theme name to shell color mode. Does not write pi settings. */
export function colorModeFromPiTheme(
  themeName: string | undefined | null,
): ResolvedColorMode | undefined {
  if (!themeName) return undefined;
  const normalized = themeName.trim().toLowerCase();
  if (!normalized) return undefined;
  if (
    normalized.includes("dark") ||
    normalized.includes("night") ||
    normalized.includes("black") ||
    normalized === "dracula" ||
    normalized === "nord" ||
    normalized === "monokai"
  ) {
    return "dark";
  }
  if (
    normalized.includes("light") ||
    normalized.includes("day") ||
    normalized.includes("paper") ||
    normalized === "default"
  ) {
    return "light";
  }
  return undefined;
}

export function applyDocumentTheme(mode: ResolvedColorMode): void {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
}

/** Display helper: prefer explicit snapshot theme field if ever present; else model id only. */
export function piThemeLabel(snapshot: HostSnapshot | undefined): string {
  const record = snapshot as (HostSnapshot & { theme?: string }) | undefined;
  if (record?.theme && typeof record.theme === "string") return record.theme;
  return "pi theme (native)";
}

/** Cycle preference for the toolbar icon: system → light → dark → system. */
export function nextThemePreference(current: ThemePreference): ThemePreference {
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}
