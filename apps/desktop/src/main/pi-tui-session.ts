/**
 * Pure decision helpers for embedded pi TUI (terminal mode).
 * No PTY / Electron imports — unit-tested without native modules.
 */

export type PiTuiOpenRequest = {
  /** Absolute path to the session JSONL file. */
  sessionFile: string;
  /** Working directory for the pi process. */
  cwd: string;
  cols?: number;
  rows?: number;
};

export type PiTuiLaunchPlan = {
  sessionFile: string;
  cwd: string;
  sessionKey: string;
  args: string[];
  cols: number;
  rows: number;
};

/**
 * Normalize session path for equality / ownership / park keys.
 *
 * macOS: `/var` is a symlink to `/private/var`. Host snapshots, sidebar rows, and
 * `realpath` may disagree — without collapsing that prefix, the first terminal
 * open works but switch/hop fails to match the parked PTY or exclusive guard.
 */
export function normalizeSessionKey(sessionPath: string): string {
  let p = sessionPath.replace(/\\/g, "/").replace(/\/+$/, "").trim().toLowerCase();
  if (!p) return "";
  // Collapse Apple firmlink prefix so /var/... === /private/var/...
  if (p.startsWith("/private/")) p = p.slice("/private".length);
  return p;
}

/** True when two session paths refer to the same JSONL (slash / case / /private). */
export function sessionKeysMatch(
  a: string | undefined | null,
  b: string | undefined | null,
): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  return normalizeSessionKey(a) === normalizeSessionKey(b);
}

/**
 * Build argv for interactive pi TUI bound to an existing session file.
 * Equivalent to: `pi --session <path>` in a system terminal.
 */
export function buildPiTuiArgs(sessionFile: string): string[] {
  const file = sessionFile.trim();
  if (!file) throw new Error("sessionFile is required for terminal mode");
  return ["--session", file];
}

export function planPiTuiLaunch(request: PiTuiOpenRequest): PiTuiLaunchPlan {
  const sessionFile = request.sessionFile.trim();
  const cwd = request.cwd.trim();
  if (!sessionFile) throw new Error("sessionFile is required for terminal mode");
  if (!cwd) throw new Error("cwd is required for terminal mode");
  const cols = Math.max(20, Math.floor(request.cols ?? 80));
  const rows = Math.max(5, Math.floor(request.rows ?? 24));
  return {
    sessionFile,
    cwd,
    sessionKey: normalizeSessionKey(sessionFile),
    args: buildPiTuiArgs(sessionFile),
    cols,
    rows,
  };
}

/**
 * Mutual exclusion: only one interactive TUI may own a session at a time,
 * and host prompt must not run while TUI owns the interactive surface.
 */
export class PiTuiExclusiveGuard {
  #ownerKey: string | null = null;

  ownerKey(): string | null {
    return this.#ownerKey;
  }

  isActive(): boolean {
    return this.#ownerKey !== null;
  }

  owns(sessionKey: string): boolean {
    return this.#ownerKey !== null && this.#ownerKey === normalizeSessionKey(sessionKey);
  }

  /**
   * Acquire exclusive interactive ownership for `sessionKey`.
   * Re-acquiring the same key is a no-op success (idempotent open).
   */
  tryAcquire(sessionKey: string): { ok: true } | { ok: false; reason: string } {
    const key = normalizeSessionKey(sessionKey);
    if (!key) return { ok: false, reason: "Invalid session key" };
    if (this.#ownerKey && this.#ownerKey !== key) {
      return {
        ok: false,
        reason: "Another terminal session is already open; close it before opening a new one",
      };
    }
    this.#ownerKey = key;
    return { ok: true };
  }

  /**
   * Session hops must transfer ownership. Refusing mid-hop leaves the UI unable
   * to open TUI after the first session (guard desync / path-key mismatch).
   */
  transferTo(sessionKey: string): { ok: true } | { ok: false; reason: string } {
    const key = normalizeSessionKey(sessionKey);
    if (!key) return { ok: false, reason: "Invalid session key" };
    this.#ownerKey = key;
    return { ok: true };
  }

  release(sessionKey?: string): void {
    if (!this.#ownerKey) return;
    if (sessionKey === undefined || this.#ownerKey === normalizeSessionKey(sessionKey)) {
      this.#ownerKey = null;
    }
  }

  /** Host chat prompt path must call this before starting a turn. */
  assertHostPromptAllowed(): void {
    if (this.#ownerKey) {
      throw new Error(
        "Terminal mode owns interactive control for this session; switch back to chat to prompt from the view",
      );
    }
  }
}
