/**
 * PTY lifecycle for embedded pi TUI.
 *
 * Performance:
 * - Same session: suspend/resume reuses the live process (chat ⇄ terminal).
 * - Other sessions: park up to N warm processes and promote on switch (terminal ⇄ terminal).
 *
 * Correctness:
 * - Data is bound to the live handle + generation (stale processes never feed the UI).
 * - open() for a different session parks the current one instead of always killing.
 */
import {
  chmodSync,
  closeSync,
  existsSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";
import { getActiveBundledNodeExecutable } from "./bundled-runtimes.ts";
import { normalizeSessionKey, type PiTuiLaunchPlan } from "./pi-tui-session.ts";
import { buildPiTuiEnv } from "./pi-tui-env.ts";
import { candidateCommandPaths } from "./shell-path.ts";

export type PtyExitEvent = { exitCode: number; signal?: number };

export type PtyHandle = {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: PtyExitEvent) => void): void;
};

export type PtySpawnOptions = {
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
};

export type PtySpawnFn = (file: string, args: string[], options: PtySpawnOptions) => PtyHandle;

export type PiTuiPtyOpenResult = {
  sessionKey: string;
  sessionFile: string;
  cwd: string;
  /** True when an existing process was reused (resume or promote from park). */
  resumed: boolean;
  generation: number;
};

export type PiTuiPtyCallbacks = {
  onData: (data: string) => void;
  onExit: (event: PtyExitEvent) => void;
};

type LivePty = {
  pty: PtyHandle;
  sessionKey: string;
  sessionFile: string;
  cwd: string;
  generation: number;
};

type ParkedPty = {
  pty: PtyHandle;
  sessionKey: string;
  sessionFile: string;
  cwd: string;
  parkedAt: number;
};

/** Max background pi processes kept for instant terminal session hops. */
export const MAX_PARKED_PTYS = 4;

export type PiTuiPtyStatus = {
  live?: {
    sessionFile: string;
    suspended: boolean;
  };
  parkedSessionFiles: string[];
};

/**
 * Manages one live pi TUI PTY plus a small park of warm sessions.
 */
export class PiTuiPtyController {
  #spawn: PtySpawnFn;
  #resolvePiPath: () => Promise<string>;
  #live: LivePty | null = null;
  #suspended = false;
  #dataListener: ((data: string) => void) | null = null;
  #exitListener: ((event: PtyExitEvent) => void) | null = null;
  #generation = 0;
  #parked = new Map<string, ParkedPty>();
  /** Serialize open() so session hops cannot interleave park/spawn (macOS races). */
  #openChain: Promise<unknown> = Promise.resolve();

  constructor(spawn: PtySpawnFn, resolvePiPath: () => Promise<string>) {
    this.#spawn = spawn;
    this.#resolvePiPath = resolvePiPath;
  }

  isOpen(): boolean {
    return this.#live !== null && !this.#suspended;
  }

  isAlive(): boolean {
    return this.#live !== null;
  }

  isSuspended(): boolean {
    return this.#suspended && this.#live !== null;
  }

  sessionKey(): string | null {
    return this.#live?.sessionKey ?? null;
  }

  sessionFile(): string | null {
    return this.#live?.sessionFile ?? null;
  }

  generation(): number {
    return this.#generation;
  }

  status(): PiTuiPtyStatus {
    return {
      ...(this.#live
        ? {
            live: {
              sessionFile: this.#live.sessionFile,
              suspended: this.#suspended,
            },
          }
        : {}),
      parkedSessionFiles: [...this.#parked.values()].map((entry) => entry.sessionFile),
    };
  }

  async open(plan: PiTuiLaunchPlan, callbacks: PiTuiPtyCallbacks): Promise<PiTuiPtyOpenResult> {
    // One open at a time: concurrent hops (unmount+mount) previously interleaved
    // park/spawn and left the second session dead on macOS.
    const run = this.#openChain.then(() => this.#openExclusive(plan, callbacks));
    this.#openChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async #openExclusive(
    plan: PiTuiLaunchPlan,
    callbacks: PiTuiPtyCallbacks,
  ): Promise<PiTuiPtyOpenResult> {
    const sessionKey = normalizeSessionKey(plan.sessionKey || plan.sessionFile);
    if (!sessionKey) throw new Error("sessionFile is required for terminal mode");

    // Same live session → resume (chat ⇄ terminal on one session).
    if (this.#live && this.#live.sessionKey === sessionKey) {
      this.#suspended = false;
      this.#dataListener = callbacks.onData;
      this.#exitListener = callbacks.onExit;
      // Ghostty remounted empty — nudge size so pi repaints the full screen.
      const cols = plan.cols;
      const rows = plan.rows;
      const altC = cols > 20 ? cols - 1 : cols + 1;
      const altR = rows > 5 ? rows - 1 : rows + 1;
      try {
        this.#live.pty.resize(altC, altR);
        this.#live.pty.resize(cols, rows);
      } catch {
        try {
          this.#live.pty.resize(cols, rows);
        } catch {
          // ignore
        }
      }
      return {
        sessionKey,
        sessionFile: plan.sessionFile,
        cwd: plan.cwd,
        resumed: true,
        generation: this.#live.generation,
      };
    }

    // Different live session → park it warm for a later hop back.
    if (this.#live) {
      this.#parkLive();
    }

    // Promote a parked process for this session (terminal ⇄ terminal hop).
    const parked = this.#parked.get(sessionKey);
    if (parked) {
      this.#parked.delete(sessionKey);
      const generation = ++this.#generation;
      this.#live = {
        pty: parked.pty,
        sessionKey,
        // Prefer the caller's path so renderer sessionFile checks stay stable.
        sessionFile: plan.sessionFile,
        cwd: plan.cwd || parked.cwd,
        generation,
      };
      this.#suspended = false;
      this.#dataListener = callbacks.onData;
      this.#exitListener = callbacks.onExit;
      // Force a full TUI repaint into the new Ghostty canvas. Same-size resize is
      // often ignored by pi, which left a blank/corrupt surface after session hops.
      const cols = plan.cols;
      const rows = plan.rows;
      const altC = cols > 20 ? cols - 1 : cols + 1;
      const altR = rows > 5 ? rows - 1 : rows + 1;
      try {
        parked.pty.resize(altC, altR);
        parked.pty.resize(cols, rows);
      } catch {
        try {
          parked.pty.resize(cols, rows);
        } catch {
          // ignore
        }
      }
      return {
        sessionKey,
        sessionFile: plan.sessionFile,
        cwd: plan.cwd || parked.cwd,
        resumed: true,
        generation,
      };
    }

    // Cold spawn.
    const generation = ++this.#generation;
    const piPath = await this.#resolvePiPath();
    if (!piPath.trim()) throw new Error("pi executable not found; install the pi CLI first");
    if (generation !== this.#generation) {
      throw new Error("Terminal open superseded");
    }

    const env = buildPiTuiEnv(process.env);
    const launch = resolvePiPtyLaunch(piPath, plan.args, env);
    let pty: PtyHandle;
    try {
      pty = this.#spawn(launch.file, launch.args, {
        name: "xterm-256color",
        cols: plan.cols,
        rows: plan.rows,
        cwd: plan.cwd,
        env: launch.env,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to start terminal (${detail}). file=${launch.file} args=${JSON.stringify(launch.args.slice(0, 4))} cwd=${plan.cwd}`,
      );
    }

    if (generation !== this.#generation) {
      try {
        pty.kill();
      } catch {
        // ignore
      }
      throw new Error("Terminal open superseded");
    }

    this.#live = {
      pty,
      sessionKey,
      sessionFile: plan.sessionFile,
      cwd: plan.cwd,
      generation,
    };
    this.#suspended = false;
    this.#dataListener = callbacks.onData;
    this.#exitListener = callbacks.onExit;
    this.#wireHandle(pty);

    return {
      sessionKey,
      sessionFile: plan.sessionFile,
      cwd: plan.cwd,
      resumed: false,
      generation,
    };
  }

  /** Wire once per process at spawn; park/promote reuses the same handlers. */
  #wireHandle(pty: PtyHandle): void {
    pty.onData((data) => {
      if (!this.#live || this.#live.pty !== pty || this.#suspended) return;
      this.#dataListener?.(data);
    });
    pty.onExit((event) => {
      if (this.#live?.pty === pty) {
        this.#live = null;
        this.#suspended = false;
        this.#dataListener = null;
        const exitListener = this.#exitListener;
        this.#exitListener = null;
        exitListener?.(event);
        return;
      }
      // Parked process died — drop from park.
      for (const [key, entry] of this.#parked) {
        if (entry.pty === pty) {
          this.#parked.delete(key);
          break;
        }
      }
    });
  }

  #parkLive(): void {
    const live = this.#live;
    if (!live) return;
    this.#dataListener = null;
    this.#exitListener = null;
    this.#suspended = false;
    this.#live = null;
    const key = normalizeSessionKey(live.sessionKey || live.sessionFile);
    if (!key) {
      try {
        live.pty.kill();
      } catch {
        // ignore
      }
      return;
    }
    // Drop existing park entry for same key, then insert.
    const existing = this.#parked.get(key);
    if (existing) {
      try {
        existing.pty.kill();
      } catch {
        // ignore
      }
    }
    this.#parked.set(key, {
      pty: live.pty,
      sessionKey: key,
      sessionFile: live.sessionFile,
      cwd: live.cwd,
      parkedAt: Date.now(),
    });
    this.#trimPark();
  }

  #trimPark(): void {
    while (this.#parked.size > MAX_PARKED_PTYS) {
      let oldestKey: string | null = null;
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [key, entry] of this.#parked) {
        if (entry.parkedAt < oldestAt) {
          oldestAt = entry.parkedAt;
          oldestKey = key;
        }
      }
      if (!oldestKey) break;
      const entry = this.#parked.get(oldestKey);
      this.#parked.delete(oldestKey);
      try {
        entry?.pty.kill();
      } catch {
        // ignore
      }
    }
  }

  /** Detach UI feed but keep process live for instant re-enter (same session). */
  suspend(): { sessionFile: string | null } {
    if (!this.#live) return { sessionFile: null };
    this.#suspended = true;
    this.#dataListener = null;
    return { sessionFile: this.#live.sessionFile };
  }

  write(data: string): void {
    if (!this.#live || this.#suspended) throw new Error("Terminal is not open");
    this.#live.pty.write(data);
  }

  resize(cols: number, rows: number): void {
    if (!this.#live) return;
    this.#live.pty.resize(Math.max(20, cols), Math.max(5, rows));
  }

  /** Kill live process only (parked sessions stay warm). */
  dispose(): { sessionFile: string | null } {
    const file = this.#live?.sessionFile ?? null;
    const live = this.#live;
    this.#generation += 1;
    this.#live = null;
    this.#suspended = false;
    this.#dataListener = null;
    this.#exitListener = null;
    if (live) {
      try {
        live.pty.kill();
      } catch {
        // ignore
      }
    }
    return { sessionFile: file };
  }

  /** Kill the PTY bound to one session, whether it is live, suspended, or parked. */
  disposeSession(sessionFile: string): boolean {
    const key = normalizeSessionKey(sessionFile);
    if (!key) return false;
    if (this.#live?.sessionKey === key) {
      this.dispose();
      return true;
    }
    const parked = this.#parked.get(key);
    if (!parked) return false;
    this.#parked.delete(key);
    try {
      parked.pty.kill();
    } catch {
      // ignore
    }
    return true;
  }

  /** Kill live + all parked processes (app quit / hard reset). */
  disposeAll(): void {
    this.dispose();
    for (const entry of this.#parked.values()) {
      try {
        entry.pty.kill();
      } catch {
        // ignore
      }
    }
    this.#parked.clear();
  }
}

/**
 * node-pty ships `spawn-helper` next to the native addon. pnpm / electron-builder /
 * zip often drop the execute bit, which surfaces as:
 *   Error: posix_spawnp failed.
 * Restore +x before the first spawn (dev + packaged).
 */
export function ensureNodePtySpawnHelperExecutable(
  requireFn: NodeRequire = createRequire(import.meta.url),
): string | undefined {
  if (process.platform === "win32") return undefined;
  try {
    // Same resolution path as node-pty/lib/unixTerminal.js
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const utils = requireFn("node-pty/lib/utils.js") as {
      loadNativeModule: (name: string) => { dir: string };
    };
    const native = utils.loadNativeModule("pty");
    const unixDir = dirname(requireFn.resolve("node-pty/lib/unixTerminal.js"));
    let helperPath = resolve(unixDir, native.dir, "spawn-helper");
    // Packaged: helper lives next to unpacked .node, not inside app.asar.
    helperPath = helperPath
      .replaceAll("app.asar", "app.asar.unpacked")
      .replaceAll("node_modules.asar", "node_modules.asar.unpacked");
    if (!existsSync(helperPath)) {
      console.warn("[zeno] node-pty spawn-helper missing:", helperPath);
      return undefined;
    }
    const mode = statSync(helperPath).mode;
    if ((mode & 0o111) === 0) {
      chmodSync(helperPath, mode | 0o755);
      console.log("[zeno] restored execute bit on node-pty spawn-helper:", helperPath);
    }
    return helperPath;
  } catch (error) {
    console.warn("[zeno] ensureNodePtySpawnHelperExecutable failed:", error);
    return undefined;
  }
}

export type PiPtyLaunch = {
  file: string;
  args: string[];
  env: Record<string, string>;
};

/**
 * Build argv for node-pty. `pi` is usually a `#!/usr/bin/env node` script; spawning
 * the script path directly can fail when env lookup is flaky. Prefer `node <script> …`.
 *
 * Packaged builtin CLI is asar-unpacked onto a real filesystem path so **system Node**
 * can run it. Spawning `process.execPath` + `ELECTRON_RUN_AS_NODE` also works for asar,
 * but on macOS Launch Services treats that as a second Zeno launch (Dock bounce); force-
 * quitting the bounced icon kills the PTY and drops terminal mode. Prefer system Node.
 */
export function resolvePiPtyLaunch(
  piPath: string,
  args: string[],
  env: Record<string, string>,
): PiPtyLaunch {
  const file = piPath.trim();
  if (!file) throw new Error("pi executable not found; install the pi CLI first");

  let resolved = file;
  try {
    // realpathSync on asar paths is fine inside Electron; skip when missing so we
    // still keep the virtual asar path for ELECTRON_RUN_AS_NODE fallback.
    if (existsSync(file)) resolved = realpathSync(file);
  } catch {
    resolved = file;
  }
  // Prefer app.asar.unpacked real files when present (packaged TUI path).
  resolved = toSpawnableFilesystemPath(resolved);

  if (!shouldSpawnViaNode(resolved)) {
    return { file: resolved, args: [...args], env };
  }

  const insideAsar = isInsideAsarArchive(resolved);
  // System Node cannot load modules from asar — only use it for real paths.
  const systemNode = insideAsar ? undefined : resolveSystemNodeExecutable(env);
  const electronNode = resolveElectronNodeExecutable();
  const nodePath = systemNode || electronNode;
  if (!nodePath) {
    // No interpreter — last resort is the script path (shebang / Windows assoc).
    return { file: resolved, args: [...args], env };
  }

  const nextEnv = { ...env };
  const usingElectronNode = Boolean(electronNode && nodePath === electronNode);
  if (usingElectronNode) {
    // Fallback only: asar-only CLI or no system Node on PATH (GUI-minimal env).
    nextEnv.ELECTRON_RUN_AS_NODE = "1";
  } else {
    // Drop a stale flag if a previous launch left it in the inherited env.
    delete nextEnv.ELECTRON_RUN_AS_NODE;
  }

  const nodeDir = dirname(nodePath);
  const pathKey = process.platform === "win32" && nextEnv.Path && !nextEnv.PATH ? "Path" : "PATH";
  const current = nextEnv[pathKey] || nextEnv.PATH || nextEnv.Path || "";
  if (!current.toLowerCase().includes(nodeDir.toLowerCase())) {
    const sep = process.platform === "win32" ? ";" : ":";
    nextEnv.PATH = `${nodeDir}${sep}${current}`;
    if (process.platform === "win32") nextEnv.Path = nextEnv.PATH;
  }
  return { file: nodePath, args: [resolved, ...args], env: nextEnv };
}

/**
 * True when `filePath` is inside an Electron asar archive (not asar.unpacked).
 * System Node cannot load modules from asar; Electron-as-Node can.
 */
export function isInsideAsarArchive(filePath: string): boolean {
  const p = filePath.replace(/\\/g, "/");
  // Match …/app.asar/… or …/app.asar, but not …/app.asar.unpacked/…
  return /\/app\.asar(?:\/|$)/i.test(p);
}

/**
 * Map virtual `app.asar/…` paths to `app.asar.unpacked/…` when the file was
 * unpacked for spawning (system Node / no Dock bounce). Otherwise return as-is.
 */
export function toSpawnableFilesystemPath(filePath: string): string {
  const raw = filePath.trim();
  if (!raw || !isInsideAsarArchive(raw)) return raw;
  const asPosix = raw.replace(/\\/g, "/");
  const unpackedPosix = asPosix.replace(/\/app\.asar\//gi, "/app.asar.unpacked/");
  if (unpackedPosix === asPosix) return raw;
  if (!existsSync(unpackedPosix)) return raw;
  return process.platform === "win32" ? unpackedPosix.replace(/\//g, "\\") : unpackedPosix;
}

function shouldSpawnViaNode(resolvedPath: string): boolean {
  // Paths inside asar are almost always JS entrypoints (and openSync may fail
  // outside Electron). Treat them as node scripts without reading the file.
  if (isInsideAsarArchive(resolvedPath)) return true;
  if (/\.(c?js|mjs)$/i.test(resolvedPath)) return true;
  let fd: number | undefined;
  try {
    fd = openSync(resolvedPath, "r");
    const buf = Buffer.alloc(120);
    const n = readSync(fd, buf, 0, 120, 0);
    const head = buf.subarray(0, n).toString("utf8");
    return /^#!.*\bnode(?:\s|$)/m.test(head);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Real Node binary for PTY spawn — never Electron's process.execPath.
 * Order: NODE_BINARY env → bundled Node (default on) → PATH / common bins.
 */
function resolveSystemNodeExecutable(env: Record<string, string>): string | undefined {
  const fromEnv = env.NODE_BINARY?.trim() || env.npm_node_execpath?.trim();
  if (fromEnv && existsSync(fromEnv) && !isElectronBinaryPath(fromEnv)) return fromEnv;

  // Bundled runtime (Resources/runtimes/node) — preferred over host PATH so clean
  // machines and GUI launches never fall through to Electron-as-Node Dock bounce.
  const bundled = getActiveBundledNodeExecutable();
  if (bundled && existsSync(bundled)) return bundled;

  for (const candidate of candidateCommandPaths("node", env)) {
    if (!existsSync(candidate)) continue;
    // Prefer real node over vite-plus shims when both appear.
    const norm = candidate.replace(/\\/g, "/").toLowerCase();
    if (norm.includes("/.vite-plus/bin/")) continue;
    if (isElectronBinaryPath(candidate)) continue;
    return candidate;
  }
  // Last resort: shim still better than nothing (but not Electron).
  const fallback = candidateCommandPaths("node", env)[0];
  if (fallback && existsSync(fallback) && !isElectronBinaryPath(fallback)) return fallback;
  return undefined;
}

function isElectronBinaryPath(filePath: string): boolean {
  const base = filePath.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  // Packaged app binary (Zeno / Zeno.exe) or electron dev binary — not usable as
  // system node without ELECTRON_RUN_AS_NODE.
  return base === "electron" || base === "electron.exe" || base === "zeno" || base === "zeno.exe";
}

/**
 * Electron main binary used as Node via ELECTRON_RUN_AS_NODE.
 * Only when running inside Electron (packaged or `electron .` dev).
 */
function resolveElectronNodeExecutable(): string | undefined {
  if (!process.versions.electron) return undefined;
  const exec = process.execPath?.trim();
  if (!exec || !existsSync(exec)) return undefined;
  return exec;
}

/** Real node-pty spawn used by the Electron main process. */
export async function createNodePtySpawn(): Promise<PtySpawnFn> {
  ensureNodePtySpawnHelperExecutable();
  const pty = await import("node-pty");
  return (file, args, options) => {
    // Defense in depth: helper may be restored after first import on some layouts.
    ensureNodePtySpawnHelperExecutable();
    if (!file || (isAbsolute(file) && !existsSync(file) && process.platform !== "win32")) {
      throw new Error(`PTY executable not found: ${file}`);
    }
    try {
      const proc = pty.spawn(file, args, {
        name: options.name,
        cols: options.cols,
        rows: options.rows,
        cwd: options.cwd,
        env: options.env,
        ...(process.platform === "win32" ? { useConpty: true } : {}),
      });
      return {
        write: (data) => {
          proc.write(data);
        },
        resize: (cols, rows) => {
          proc.resize(cols, rows);
        },
        kill: (signal) => {
          proc.kill(signal);
        },
        onData: (listener) => {
          proc.onData((data) => {
            listener(typeof data === "string" ? data : Buffer.from(data).toString("utf8"));
          });
        },
        onExit: (listener) => {
          proc.onExit((e) => {
            listener({
              exitCode: e.exitCode,
              ...(typeof e.signal === "number" ? { signal: e.signal } : {}),
            });
          });
        },
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      // Re-attempt chmod once more — some installers re-copy without +x.
      ensureNodePtySpawnHelperExecutable();
      throw new Error(
        /posix_spawnp|spawn/i.test(detail)
          ? `${detail} (node-pty spawn-helper may lack execute permission; Zeno tried to restore it. file=${file})`
          : detail,
      );
    }
  };
}
