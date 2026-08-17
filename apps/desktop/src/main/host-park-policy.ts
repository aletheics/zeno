/**
 * Pure helpers for multi-session host parking (tab-like switch, no abort).
 * No Electron imports — unit-tested in isolation.
 */

/** Cap idle parked hosts. Busy parks are never evicted to make room. */
export const MAX_PARKED_HOSTS = 5;

/** Idle parked hosts are reaped after this TTL so warm reuse stays bounded. */
export const PARKED_IDLE_TTL_MS = 10 * 60 * 1000;

export function normalizeHostCwdKey(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export type ParkedHostRef = {
  sessionKey: string;
  workspaceCwd?: string | undefined;
  snapshotCwd?: string | undefined;
  /** True when an agent.prompt is still in-flight on this host. */
  busy: boolean;
  /** When this host entered the park table (recency / FIFO). */
  parkedAt: number;
  /** When the last in-flight prompt settled; unset while busy. */
  idleSince?: number | undefined;
};

/** Resolve a parked host for the given workspace cwd (project or conversation home). */
export function findParkedSessionKeyByCwd(
  parked: readonly ParkedHostRef[],
  cwd: string,
): string | undefined {
  const key = normalizeHostCwdKey(cwd);
  if (!key) return undefined;
  for (const p of parked) {
    const pc = p.workspaceCwd?.trim() || p.snapshotCwd?.trim();
    if (pc && normalizeHostCwdKey(pc) === key) return p.sessionKey;
  }
  return undefined;
}

function idleStamp(p: ParkedHostRef): number {
  return p.idleSince ?? p.parkedAt;
}

/**
 * Oldest idle park. Busy hosts are never chosen — caller must allow over-cap
 * when every parked runtime is still generating.
 */
export function pickParkedEvictionKey(parked: readonly ParkedHostRef[]): string | undefined {
  let oldest: ParkedHostRef | undefined;
  for (const p of parked) {
    if (p.busy) continue;
    if (!oldest || idleStamp(p) < idleStamp(oldest)) oldest = p;
  }
  return oldest?.sessionKey;
}

/** Idle parks whose warm window has expired. */
export function pickExpiredIdleParkKeys(
  parked: readonly ParkedHostRef[],
  now: number,
  ttlMs: number = PARKED_IDLE_TTL_MS,
): string[] {
  if (ttlMs <= 0) return [];
  return parked.filter((p) => !p.busy && idleStamp(p) + ttlMs <= now).map((p) => p.sessionKey);
}

export function idleParkedCount(parked: readonly ParkedHostRef[]): number {
  return parked.reduce((n, p) => n + (p.busy ? 0 : 1), 0);
}

/** Whether parking should be attempted for a live foreground host. */
export function shouldParkForeground(input: {
  hasHost: boolean;
  hasSnapshot: boolean;
  hostStopping: boolean;
  /** When false, only park if busy (legacy). When true, park idle too for reuse. */
  allowIdle: boolean;
  busy: boolean;
  sessionKey: string | undefined;
}): boolean {
  if (!input.hasHost || !input.hasSnapshot || input.hostStopping) return false;
  if (!input.sessionKey) return false;
  if (!input.allowIdle && !input.busy) return false;
  return true;
}

/**
 * Parked hosts stay first-class: sidebar + reconnect need more than settle/fail.
 * Skip agent.started — re-binding that event re-lights finished sidebar rows.
 */
const FORWARDED_PARKED_RUNTIME_EVENTS = new Set<string>([
  "agent.settled",
  "message.failed",
  "message.delta",
  "message.completed",
  "thinking.delta",
  "user.message",
  "retry.started",
  "retry.ended",
  "tool.started",
  "tool.completed",
  "compaction.started",
  "compaction.completed",
]);

export function shouldForwardParkedRuntimeEvent(eventType: string): boolean {
  return FORWARDED_PARKED_RUNTIME_EVENTS.has(eventType);
}
