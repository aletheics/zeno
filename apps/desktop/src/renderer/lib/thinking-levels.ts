/**
 * Composer thinking-level helpers.
 * HostSnapshot.availableThinkingLevels is the official list for the active model
 * (pi getSupportedThinkingLevels / thinkingLevelMap). Never invent extra levels in UI.
 */

/** Full pi ThinkingLevel set (settings/rpc + thinkingLevelMap keys). */
export const ALL_THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ThinkingLevelId = (typeof ALL_THINKING_LEVELS)[number];

/** Only show host-confirmed model levels; a cold/unknown host safely exposes off. */
export function resolveDisplayThinkingLevels(available: readonly string[] | undefined): string[] {
  if (available && available.length > 0) {
    return available.map((level) => level.trim().toLowerCase()).filter(Boolean);
  }
  return ["off"];
}

/** Keep current selection on the available list (UI clamp; session also clamps on apply). */
export function clampToAvailableThinkingLevel(level: string, available: readonly string[]): string {
  const normalized = level.trim().toLowerCase();
  if (available.includes(normalized)) return normalized;
  if (available.includes(level)) return level;
  return available[0] ?? "off";
}

/** True when the model exposes any thinking level other than off. */
export function modelSupportsThinking(available: readonly string[]): boolean {
  return available.some((level) => level.trim().toLowerCase() !== "off");
}
