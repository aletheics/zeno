/**
 * pix-local live-session projection for the ported bloub pet focus logic.
 *
 * Mirrors the minimal surface `petFocus.ts` needs from zeno-update's
 * `sessionLiveStore` (SessionLiveSnapshot / SessionLiveMap) and `agentDashboard`
 * (AgentDashboardStatus / mapDashboardStatus). The pix state source
 * (`pixFocusSource`) fills a `SessionLiveMap` from `useShellStore`.
 */

/** Host-equivalent live state for one session, as seen by the pet. */
export type PetLiveState =
  | "idle"
  | "connecting"
  | "streaming"
  | "awaiting_permission"
  | "ready"
  | "disconnected";

export interface SessionLiveSnapshot {
  sessionId: string;
  state: PetLiveState;
  streamingMessageId: string | null;
  liveToolTitle: string | null;
  liveToolId: string | null;
  terminalReason: string | null;
  sawModelOutput: boolean;
  sawToolActivity: boolean;
  startedAt: number | null;
  updatedAt: number;
  awaitingPermission: boolean;
}

export type SessionLiveMap = Record<string, SessionLiveSnapshot>;

export function emptyLiveSnapshot(
  sessionId: string,
  nowMs: number = Date.now(),
): SessionLiveSnapshot {
  return {
    sessionId,
    state: "idle",
    streamingMessageId: null,
    liveToolTitle: null,
    liveToolId: null,
    terminalReason: null,
    sawModelOutput: false,
    sawToolActivity: false,
    startedAt: null,
    updatedAt: nowMs,
    awaitingPermission: false,
  };
}

export type AgentDashboardStatus = "busy" | "permission" | "connecting" | "idle" | "error";

export function mapDashboardStatus(
  snap: SessionLiveSnapshot | undefined | null,
): AgentDashboardStatus {
  if (!snap) return "idle";
  if (snap.awaitingPermission || snap.state === "awaiting_permission") {
    return "permission";
  }
  if (snap.state === "connecting") return "connecting";
  if (snap.state === "streaming") return "busy";
  if (snap.state === "disconnected") return "error";
  return "idle";
}
