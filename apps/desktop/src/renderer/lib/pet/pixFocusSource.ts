/**
 * pix state source for the ported bloub pet focus bridge.
 *
 * zeno-update fed `petFocusBridge` from `sessionLiveMapStore` / `sessionUnread` /
 * `sessionFinishedTurns` / `composerDraftStore`. pix has none of those, but the
 * same signals exist in `useShellStore`:
 *
 *   - `sessionMarkers` (per-session `ThreadRunState`)  → live map / focus kind
 *   - `threads` (titles)                              → focus + chip titles
 *   - `liveStream` / `backgroundLiveStreams`          → assistant stage snippets
 *   - persisted unread set (`loadUnreadThreads`)      → ready (finished + unread)
 *
 * Mapping (matches the approved plan):
 *   running / recovering → working
 *   waiting              → needs_you
 *   completed + unread   → ready
 *   failed/aborted/crashed → error
 *   idle / absent        → idle
 *
 * This module is self-contained: it subscribes to the zustand store for live
 * state + the `zeno-thread-prefs` event for unread changes. Tool titles and
 * finished-turn timestamps are tracked as a small in-memory side table updated
 * on marker transitions, so no hook into the main event loop is required.
 */

import type { ShellState } from "@/store/shell-store";
import { sessionKeyFromSnapshot, sessionRunKey } from "@/store/shell-store";
import { isBusyRunState, isTerminalRunState, type SessionMarker } from "@/lib/session-markers";
import type { ThreadRunState } from "@/lib/timeline";
import type { LiveStreamState } from "@/lib/live-stream";
import { loadUnreadThreads } from "@/lib/project-prefs";
import { type PetLiveState, type SessionLiveMap, type SessionLiveSnapshot } from "./pixLiveModel";
import type { PetFocus, PetFocusSession } from "./petFocus";
import type { PetTask } from "./petTasks";
import type { PetFocusBridgeOpts } from "./petFocusBridge";
import { petStageSnippetFromText } from "./petStageSnippets";

/** Non-idle live state for a busy/terminal session, or null when absent. */
function liveStateForRunState(state: ThreadRunState): PetLiveState | null {
  switch (state) {
    case "running":
    case "recovering":
      return "streaming";
    case "waiting":
      return "awaiting_permission";
    case "failed":
    case "aborted":
    case "crashed":
      return "disconnected";
    default:
      // idle + completed → no live entry. "ready" is finished + unread below.
      return null;
  }
}

function latestAssistantText(stream: LiveStreamState | undefined): string {
  if (!stream) return "";
  for (let i = stream.items.length - 1; i >= 0; i--) {
    const item = stream.items[i];
    if (item?.kind === "assistant") return item.text;
  }
  return "";
}

function latestRunningTool(stream: LiveStreamState | undefined): string | null {
  if (!stream) return null;
  for (let i = stream.items.length - 1; i >= 0; i--) {
    const item = stream.items[i];
    if (item?.kind === "tool" && item.status === "running") return item.toolName;
  }
  return null;
}

function derivePetSessions(state: ShellState): PetFocusSession[] {
  const rows: PetFocusSession[] = [];
  const seen = new Set<string>();
  for (const t of state.threads) {
    const id = sessionRunKey(t.path || t.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, title: t.title || null });
  }
  const fgKey = sessionKeyFromSnapshot(state.snapshot);
  if (fgKey && !seen.has(fgKey)) {
    rows.push({ id: fgKey, title: null });
  }
  return rows;
}

/** Latest assistant stage snippet per session (foreground + parked streams). */
function deriveSnippets(state: ShellState): Record<string, string> {
  const out: Record<string, string> = {};
  const fgKey = sessionKeyFromSnapshot(state.snapshot);
  if (fgKey) {
    const snippet = petStageSnippetFromText(latestAssistantText(state.liveStream));
    if (snippet) out[fgKey] = snippet;
  }
  for (const [key, stream] of Object.entries(state.backgroundLiveStreams)) {
    const snippet = petStageSnippetFromText(latestAssistantText(stream));
    if (snippet) out[key] = snippet;
  }
  return out;
}

export type PetFocusSourceOptions = {
  getState: () => ShellState;
  subscribe: (cb: () => void) => () => void;
  push: (focus: PetFocus) => void;
  pushTasks: (tasks: PetTask[]) => void;
  /** True when the desktop pet is enabled (gate the tick). Default: always. */
  isEnabled?: () => boolean;
};

export function createPetFocusSource(opts: PetFocusSourceOptions): PetFocusBridgeOpts {
  const { getState, subscribe, push, pushTasks } = opts;
  const isEnabled = opts.isEnabled ?? (() => true);
  const activityBySession = new Map<
    string,
    { startedAt: number | null; updatedAt: number; toolTitle: string | null }
  >();
  const finishedAtBySession = new Map<string, number>();
  let prevMarkers: Record<string, SessionMarker> = {};

  const getLiveMap = (): SessionLiveMap => {
    const state = getState();
    const markers = state.sessionMarkers;
    const now = Date.now();

    // Track marker transitions into a stable side table (start time, tool title,
    // finished-at) so the map carries sensible activity timestamps.
    for (const [key, marker] of Object.entries(markers)) {
      const prevState = prevMarkers[key]?.state;
      if (prevState === marker.state) continue;
      if (isBusyRunState(marker.state)) {
        const cur = activityBySession.get(key);
        activityBySession.set(key, {
          startedAt: cur?.startedAt ?? now,
          updatedAt: now,
          toolTitle: marker.reason?.trim() || cur?.toolTitle || null,
        });
      } else if (marker.state === "completed") {
        finishedAtBySession.set(key, now);
        activityBySession.delete(key);
      } else if (isTerminalRunState(marker.state)) {
        activityBySession.set(key, { startedAt: null, updatedAt: now, toolTitle: null });
      } else {
        activityBySession.delete(key);
      }
    }
    for (const key of Object.keys(prevMarkers)) {
      if (!(key in markers)) activityBySession.delete(key);
    }
    prevMarkers = { ...markers };

    const fgKey = sessionKeyFromSnapshot(state.snapshot);
    const fgTool = fgKey ? latestRunningTool(state.liveStream) : null;

    const map: SessionLiveMap = {};
    for (const [key, marker] of Object.entries(markers)) {
      const live = liveStateForRunState(marker.state);
      if (!live) continue;
      const act = activityBySession.get(key);
      const toolTitle =
        (key === fgKey && fgTool) || act?.toolTitle || marker.reason?.trim() || null;
      const snap: SessionLiveSnapshot = {
        sessionId: key,
        state: live,
        streamingMessageId: null,
        liveToolTitle: toolTitle,
        liveToolId: null,
        terminalReason: isTerminalRunState(marker.state) ? (marker.reason ?? null) : null,
        sawModelOutput: false,
        sawToolActivity: false,
        startedAt: act?.startedAt ?? now,
        updatedAt: act?.updatedAt ?? now,
        awaitingPermission: marker.state === "waiting",
      };
      map[key] = snap;
    }
    return map;
  };

  const getSessions = (): readonly PetFocusSession[] => derivePetSessions(getState());
  const getUnreadIds = (): ReadonlySet<string> =>
    new Set(
      loadUnreadThreads()
        .map((key) => sessionRunKey(key))
        .filter(Boolean),
    );
  const getFinishedTurns = (): Readonly<Record<string, number>> =>
    Object.fromEntries(finishedAtBySession);
  const getSnippets = (): Readonly<Record<string, string>> => deriveSnippets(getState());

  return {
    isEnabled,
    getSessions,
    getLiveMap,
    getUnreadIds,
    getFinishedTurns,
    subscribeLiveMap: (cb) => subscribe(cb),
    subscribeFinishedTurns: (cb) => subscribe(cb),
    onUnreadChange: (cb) => {
      const handler = () => cb();
      window.addEventListener("zeno-thread-prefs", handler);
      return () => window.removeEventListener("zeno-thread-prefs", handler);
    },
    push,
    pushTasks,
    getSnippets,
    getComposing: () => false,
  };
}
