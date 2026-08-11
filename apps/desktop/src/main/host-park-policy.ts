/**
 * Pure helpers for multi-workspace host parking (cross-project switch speed).
 * No Electron imports — unit-tested in isolation.
 */

/** Cap parked utility-process hosts to bound memory / open handles. */
export const MAX_PARKED_HOSTS = 5;

export function normalizeHostCwdKey(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export type ParkedHostRef = {
  sessionKey: string;
  workspaceCwd?: string | undefined;
  snapshotCwd?: string | undefined;
  /** True when an agent.prompt is still in-flight on this host. */
  busy: boolean;
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

/**
 * Choose which parked host to evict when over capacity.
 * Prefer idle (not busy) hosts; among those, first in list (oldest if caller orders FIFO).
 */
export function pickParkedEvictionKey(parked: readonly ParkedHostRef[]): string | undefined {
  if (parked.length === 0) return undefined;
  const idle = parked.find((p) => !p.busy);
  return (idle ?? parked[0])?.sessionKey;
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
