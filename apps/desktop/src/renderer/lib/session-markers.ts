/**
 * Sidebar session run markers (ui-spec §5.2) — glyphs next to the title, not badges.
 * States are derived from host events / running map; not a second source of truth.
 */
import type { ThreadRunState } from "./timeline.ts";

export type SessionMarker = {
  state: ThreadRunState;
  /** Short reason for tooltip (failed / waiting / aborted). */
  reason?: string;
};

/** States that mean the agent is still busy (composer stop, park-eligible). */
export function isBusyRunState(state: ThreadRunState | undefined): boolean {
  return state === "running" || state === "waiting" || state === "recovering";
}

/** Terminal outcomes that flash then clear (or clear after a short sticky window). */
export function isTerminalRunState(state: ThreadRunState | undefined): boolean {
  return state === "completed" || state === "failed" || state === "aborted" || state === "crashed";
}

/** How long the completed checkmark stays before returning to idle. */
export const COMPLETED_MARKER_MS = 2_500;

/**
 * How long failed / aborted / crashed glyphs stay before returning to idle.
 * Must not stick forever: a recovered session (new turn or just idle again)
 * should not keep showing an old failure after the user has moved on.
 */
export const STICKY_TERMINAL_MARKER_MS = 4_000;

function defaultSessionKey(raw: string | undefined | null): string {
  if (!raw) return "";
  let p = raw.replace(/\\/g, "/").replace(/\/+$/, "").trim().toLowerCase();
  if (p.startsWith("/private/")) p = p.slice("/private".length);
  return p;
}

export function sessionMarkerFromThread(
  thread: { path?: string; id?: string; active?: boolean },
  markers: Record<string, SessionMarker>,
  options?: {
    /** Normalize key the same way as shell-store.sessionRunKey */
    keyOf?: (raw: string | undefined | null) => string;
    /** Foreground run state fallback for the active row only. */
    foregroundState?: ThreadRunState | undefined;
    /**
     * Sessions still marked busy in the store. Used when the glyph map briefly
     * lags (e.g. terminal hop / applySessionOpen) so the spinner does not vanish.
     */
    runningSessions?: Record<string, true> | undefined;
  },
): SessionMarker | undefined {
  const keyOf = options?.keyOf ?? defaultSessionKey;
  const pathKey = keyOf(thread.path);
  const idKey = keyOf(thread.id);
  // Direct hit first; also try the alternate /private form for older map entries.
  const candidates = [pathKey, idKey].filter(Boolean);
  for (const key of candidates) {
    const hit = markers[key];
    if (hit) return hit;
  }
  for (const key of candidates) {
    if (key.startsWith("/private/")) {
      const alt = key.slice("/private".length);
      if (markers[alt]) return markers[alt];
    } else if (key.startsWith("/")) {
      const alt = `/private${key}`;
      if (markers[alt]) return markers[alt];
    }
  }
  // Busy map hit without a glyph entry (transient desync during terminal hops).
  const running = options?.runningSessions;
  if (running) {
    for (const key of candidates) {
      if (key && running[key]) return { state: "running" };
    }
  }
  const fg = options?.foregroundState;
  if (thread.active && fg && fg !== "idle") {
    return { state: fg };
  }
  return undefined;
}
