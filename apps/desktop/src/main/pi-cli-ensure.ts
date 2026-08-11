/**
 * Detect the global `pi` CLI and install the latest package when missing.
 * Product mode only — skipped for isolated/e2e fixtures.
 *
 * Packaged Electron has a minimal GUI PATH; always resolve against augmented
 * user bin dirs so we do not re-run `npm install -g` every launch.
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import {
  applyProcessPathAugmentation,
  augmentEnvPath,
  candidateCommandPaths,
} from "./shell-path.ts";

const execFileAsync = promisify(execFile);

export const PI_NPM_PACKAGE = "@earendil-works/pi-coding-agent";

/**
 * True when `path` is a monorepo / project dependency shim, not a user-global install.
 * Examples to reject:
 *   apps/desktop/node_modules/.bin/pi
 *   node_modules/.pnpm/.../pi-coding-agent/dist/cli.js
 * Global installs live under npm root -g, …/lib/node_modules, AppData/npm, etc.
 */
export function isProjectLocalPiPath(filePath: string): boolean {
  let resolved = filePath;
  try {
    if (existsSync(filePath)) resolved = realpathSync(filePath);
  } catch {
    resolved = filePath;
  }
  const norm = resolved.replace(/\\/g, "/");

  // Always reject package bin shims from a project install.
  if (/\/node_modules\/\.bin(\/|$)/i.test(norm)) return true;

  if (!/\/node_modules\//i.test(norm)) return false;

  // Known global node_modules layouts (keep).
  if (/\/lib\/node_modules\//i.test(norm)) return false;
  if (/\/\.vite-plus\/.*\/lib\/node_modules\//i.test(norm)) return false;
  if (/\/(?:Roaming|Local)\/npm\/node_modules\//i.test(norm)) return false;
  if (/\/npm\/node_modules\//i.test(norm) && /\/AppData\//i.test(norm)) return false;
  // pnpm global store sometimes: ~/.local/share/pnpm/global/...
  if (/\/pnpm\/global\//i.test(norm)) return false;

  // Everything else under node_modules (including monorepo .pnpm) is project-local.
  return true;
}

export type PiCliProgressPhase =
  | "checking"
  | "installing"
  | "progress"
  | "complete"
  | "error"
  | "skipped";

export type PiCliProgressEvent = {
  phase: PiCliProgressPhase;
  message: string;
  path?: string;
  version?: string;
  installedNow?: boolean;
};

export type PiCliEnsureResult = {
  installed: boolean;
  alreadyPresent: boolean;
  installedNow: boolean;
  skipped: boolean;
  path?: string;
  version?: string;
  error?: string;
};

export type PiCliEnsureOptions = {
  onProgress?: (event: PiCliProgressEvent) => void;
  /** Override env (tests). Defaults to process.env (augmented). */
  env?: NodeJS.ProcessEnv;
  /** Force install even when already present (not used by product). */
  force?: boolean;
};

let ensureInFlight: Promise<PiCliEnsureResult> | undefined;

/**
 * Whether startup/bootstrap may run `npm install -g` for the global pi CLI.
 *
 * Default is **false**: Agent Host + terminal default to the **builtin** SDK
 * (Settings → Pi). Global install is opt-in via Settings or `ensurePiCli({ force: true })`.
 * Set PIX_FORCE_PI_INSTALL=1 only for explicit debug/CI that needs auto global install.
 */
export function shouldAutoInstallPiCli(env: NodeJS.ProcessEnv = process.env): boolean {
  // Explicit opt-outs always win (fixtures / e2e).
  if (env.PIX_SKIP_PI_INSTALL === "1" || env.PIX_SKIP_PI_INSTALL === "true") return false;
  if (env.PIX_ISOLATED === "1" || env.PIX_ISOLATED === "true") return false;
  if (env.PIX_WORKSPACE?.trim()) return false;
  if (env.PI_CODING_AGENT_DIR?.trim() && env.PIX_ENABLE_TEST_COMMANDS === "1") return false;
  // Opt-in only (debug/CI). Product default never auto-installs.
  if (env.PIX_FORCE_PI_INSTALL === "1" || env.PIX_FORCE_PI_INSTALL === "true") return true;
  return false;
}

function emit(onProgress: PiCliEnsureOptions["onProgress"], event: PiCliProgressEvent): void {
  // Always log so `pnpm dev` terminal shows install work even when UI chrome is hidden.
  console.log(`[pix:pi] ${event.phase}: ${event.message}`);
  try {
    onProgress?.(event);
  } catch {
    // UI listeners must not break install.
  }
}

function isVitePlusShim(path: string): boolean {
  const norm = path.replace(/\\/g, "/").toLowerCase();
  // ~/.vite-plus/bin/{node,npm,npx,vp} are thin shims; prefer real runtimes when installing.
  return (
    norm.includes("/.vite-plus/bin/") ||
    norm.endsWith("/.vite-plus/bin/npm") ||
    norm.endsWith("/.vite-plus/bin/npm.cmd") ||
    norm.endsWith("/vp") ||
    norm.endsWith("/vp.exe")
  );
}

async function resolveOnPath(command: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  // Fast path: known user bins (works with GUI PATH).
  const known = candidateCommandPaths(command, env);
  if (command === "npm" || command === "npm.cmd") {
    const preferred = known.find((p) => !isVitePlusShim(p));
    if (preferred) return preferred;
  } else if (known[0]) {
    return known[0];
  }

  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("where.exe", [command], {
        env,
        windowsHide: true,
        timeout: 8_000,
        maxBuffer: 1024 * 1024,
      });
      const candidates = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && existsSync(line));
      if (command === "npm" || command === "npm.cmd") {
        const preferred = candidates.find(
          (line) => /\.(cmd|exe|bat)$/i.test(line) && !isVitePlusShim(line),
        );
        if (preferred) return preferred;
        const shim = candidates.find((line) => /\.(cmd|exe|bat)$/i.test(line));
        return shim ?? candidates[0];
      }
      const preferred = candidates.find((line) => /\.(cmd|exe|bat)$/i.test(line));
      return preferred ?? candidates[0];
    }
    const { stdout } = await execFileAsync("which", ["-a", command], {
      env,
      timeout: 8_000,
      maxBuffer: 1024 * 1024,
    });
    const candidates = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && existsSync(line));
    if (command === "npm") {
      return candidates.find((p) => !isVitePlusShim(p)) ?? candidates[0];
    }
    return candidates[0];
  } catch {
    return known[0];
  }
}

async function readPiVersion(piPath: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  try {
    const { stdout, stderr } = await execFileAsync(piPath, ["--version"], {
      env,
      windowsHide: true,
      timeout: 12_000,
      maxBuffer: 1024 * 1024,
    });
    const text = `${stdout}\n${stderr}`.trim();
    const match = /(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/.exec(text);
    return match?.[1] ?? (text.split(/\r?\n/)[0]?.trim() || undefined);
  } catch {
    return undefined;
  }
}

/** npm global prefix (directory that contains the `pi` shim on Windows, or parent of bin/ on Unix). */
async function npmGlobalPrefix(
  npmPath: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(npmPath, ["prefix", "-g"], {
      env,
      windowsHide: true,
      // Run outside any project so packageManager/devEngines cannot fail the probe.
      cwd: process.platform === "win32" ? env.TEMP || env.TMP || homedir() : "/tmp",
      timeout: 12_000,
      maxBuffer: 1024 * 1024,
    });
    const prefix = stdout.trim().split(/\r?\n/)[0]?.trim();
    return prefix || undefined;
  } catch {
    return undefined;
  }
}

function candidatePiPaths(prefix: string): string[] {
  if (process.platform === "win32") {
    return [join(prefix, "pi.cmd"), join(prefix, "pi.exe"), join(prefix, "pi")];
  }
  return [join(prefix, "bin", "pi"), join(prefix, "pi")];
}

function detected(path: string, version: string | undefined): { path: string; version?: string } {
  return version ? { path, version } : { path };
}

/** Ensure the directory of a found binary is on process PATH for later host/TUI spawns. */
function ensureDirOnProcessPath(binPath: string): void {
  const dir = dirname(binPath);
  if (!dir) return;
  const current = process.env.PATH || process.env.Path || "";
  const parts = current.split(process.platform === "win32" ? ";" : ":");
  const hit = parts.some((p) =>
    process.platform === "win32" ? p.toLowerCase() === dir.toLowerCase() : p === dir,
  );
  if (hit) return;
  const sep = process.platform === "win32" ? ";" : ":";
  const next = `${dir}${sep}${current}`;
  process.env.PATH = next;
  if (process.platform === "win32") process.env.Path = next;
}

/** Collect every PATH hit for `pi` (not just the first). */
async function resolveAllOnPath(command: string, env: NodeJS.ProcessEnv): Promise<string[]> {
  const known = candidateCommandPaths(command, env);
  const found: string[] = [];
  const seen = new Set<string>();
  const push = (p: string | undefined) => {
    if (!p || !existsSync(p) || isProjectLocalPiPath(p)) return;
    const key = process.platform === "win32" ? p.toLowerCase() : p;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(p);
  };
  for (const p of known) push(p);

  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("where.exe", [command], {
        env,
        windowsHide: true,
        timeout: 8_000,
        maxBuffer: 1024 * 1024,
      });
      for (const line of stdout.split(/\r?\n/).map((l) => l.trim())) push(line);
    } else {
      const { stdout } = await execFileAsync("which", ["-a", command], {
        env,
        timeout: 8_000,
        maxBuffer: 1024 * 1024,
      });
      for (const line of stdout.split(/\r?\n/).map((l) => l.trim())) push(line);
    }
  } catch {
    // ignore
  }
  return found;
}

/**
 * Locate a **user-global** `pi` CLI (not monorepo / project node_modules).
 * Exported for tests.
 */
export async function detectPiCli(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ path?: string; version?: string }> {
  const resolvedEnv = augmentEnvPath(env);

  // 1) Prefer npm global prefix (true `npm install -g` location).
  const npmPath =
    (await resolveOnPath("npm", resolvedEnv)) ?? (await resolveOnPath("npm.cmd", resolvedEnv));
  if (npmPath) {
    const prefix = await npmGlobalPrefix(npmPath, resolvedEnv);
    if (prefix) {
      for (const candidate of candidatePiPaths(prefix)) {
        if (!existsSync(candidate) || isProjectLocalPiPath(candidate)) continue;
        return detected(candidate, await readPiVersion(candidate, resolvedEnv));
      }
    }
  }

  // 2) PATH hits — skip project node_modules/.bin and monorepo packages.
  for (const fromPath of await resolveAllOnPath("pi", resolvedEnv)) {
    return detected(fromPath, await readPiVersion(fromPath, resolvedEnv));
  }

  // 3) Common user-global bins (GUI launch often misses these on PATH).
  const home = resolvedEnv.HOME || resolvedEnv.USERPROFILE || homedir();
  const extras =
    process.platform === "win32"
      ? [
          join(home, "AppData", "Roaming", "npm", "pi.cmd"),
          join(home, "AppData", "Roaming", "npm", "pi"),
          join(home, "AppData", "Local", "npm", "pi.cmd"),
        ]
      : [
          join(home, ".vite-plus", "bin", "pi"),
          join(home, ".npm-global", "bin", "pi"),
          join(home, ".local", "bin", "pi"),
          join(home, ".local", "share", "fnm", "aliases", "default", "bin", "pi"),
          join(home, ".volta", "bin", "pi"),
          join(home, ".nvm", "current", "bin", "pi"),
          "/opt/homebrew/bin/pi",
          "/usr/local/bin/pi",
        ];
  const seen = new Set<string>();
  for (const candidate of extras) {
    if (!candidate || seen.has(candidate) || !existsSync(candidate)) continue;
    if (isProjectLocalPiPath(candidate)) continue;
    seen.add(candidate);
    return detected(candidate, await readPiVersion(candidate, resolvedEnv));
  }

  return {};
}

function spawnNpmInstall(npmPath: string, env: NodeJS.ProcessEnv): ChildProcess {
  const args = ["install", "-g", "--ignore-scripts", `${PI_NPM_PACKAGE}@latest`];
  // Install from a neutral cwd so monorepo packageManager/devEngines cannot block npm.
  const cwd = process.platform === "win32" ? env.TEMP || env.TMP || homedir() : "/tmp";
  // On Windows, always shell + prefer .cmd path so PATHEXT resolves correctly.
  if (process.platform === "win32") {
    const cmd =
      /\.(cmd|bat|exe)$/i.test(npmPath) || npmPath.toLowerCase().endsWith("npm.cmd")
        ? npmPath
        : "npm.cmd";
    return spawn(cmd, args, {
      env,
      cwd,
      windowsHide: true,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
  return spawn(npmPath, args, {
    env,
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function pipeInstallOutput(
  child: ChildProcess,
  onProgress: PiCliEnsureOptions["onProgress"],
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let tail = "";
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };

    const onChunk = (chunk: Buffer | string) => {
      const text = String(chunk);
      tail = (tail + text).slice(-4000);
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        // npm is chatty; surface useful lines only.
        if (
          /^(npm\s+(error|ERR!)|error|ERR!)/i.test(line) ||
          /added \d+|removed \d+|changed \d+|up to date|@earendil-works\/pi-coding-agent|package|install/i.test(
            line,
          )
        ) {
          emit(onProgress, {
            phase: "progress",
            message: line.slice(0, 240),
          });
        }
      }
    };

    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (code === 0) finish();
      else {
        const detail = tail.trim().split(/\r?\n/).filter(Boolean).slice(-6).join(" | ");
        finish(
          new Error(
            detail
              ? `npm install failed (exit ${code}): ${detail}`
              : `npm install failed with exit code ${code ?? -1}`,
          ),
        );
      }
    });
  });
}

/**
 * Detect (and optionally install) the global `pi` CLI.
 * By default only detects — install requires `force: true` or PIX_FORCE_PI_INSTALL.
 * Concurrent callers share one in-flight promise.
 */
export function ensurePiCli(options: PiCliEnsureOptions = {}): Promise<PiCliEnsureResult> {
  if (ensureInFlight) return ensureInFlight;
  ensureInFlight = ensurePiCliOnce(options).finally(() => {
    ensureInFlight = undefined;
  });
  return ensureInFlight;
}

async function ensurePiCliOnce(options: PiCliEnsureOptions): Promise<PiCliEnsureResult> {
  // Packaged Dock launches need user bins before any which/npm work.
  applyProcessPathAugmentation();
  const env = augmentEnvPath(options.env ?? process.env);
  // Keep process.env in sync so agent-host / PTY inherit the same PATH.
  if (env.PATH) process.env.PATH = env.PATH;
  if (process.platform === "win32" && env.Path) process.env.Path = env.Path;

  const onProgress = options.onProgress;

  emit(onProgress, { phase: "checking", message: "Checking for pi CLI…" });
  const existing = await detectPiCli(env);
  if (existing.path && !options.force) {
    ensureDirOnProcessPath(existing.path);
    const result: PiCliEnsureResult = {
      installed: true,
      alreadyPresent: true,
      installedNow: false,
      skipped: false,
      path: existing.path,
      ...(existing.version ? { version: existing.version } : {}),
    };
    emit(onProgress, {
      phase: "complete",
      message: existing.version ? `pi ${existing.version} is installed` : "pi is installed",
      path: existing.path,
      ...(existing.version ? { version: existing.version } : {}),
      installedNow: false,
    });
    return result;
  }

  // Default product policy: detect only. Install is opt-in (Settings / force).
  if (!shouldAutoInstallPiCli(env) && !options.force) {
    const skipped: PiCliEnsureResult = {
      installed: false,
      alreadyPresent: false,
      installedNow: false,
      skipped: true,
    };
    emit(onProgress, {
      phase: "skipped",
      message: "Global pi auto-install is off (builtin SDK is default).",
    });
    return skipped;
  }

  const npmPath = (await resolveOnPath("npm", env)) ?? (await resolveOnPath("npm.cmd", env));
  if (!npmPath) {
    const error = "npm was not found on PATH. Install Node.js/npm, then click Install global pi.";
    emit(onProgress, { phase: "error", message: error });
    return {
      installed: false,
      alreadyPresent: false,
      installedNow: false,
      skipped: false,
      error,
    };
  }

  emit(onProgress, {
    phase: "installing",
    message: `Installing latest ${PI_NPM_PACKAGE}…`,
  });

  try {
    const child = spawnNpmInstall(npmPath, env);
    await pipeInstallOutput(child, onProgress);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit(onProgress, { phase: "error", message });
    return {
      installed: false,
      alreadyPresent: false,
      installedNow: false,
      skipped: false,
      error: message,
    };
  }

  // Prefer the npm global bin directory for subsequent resolution inside this process.
  const prefix = await npmGlobalPrefix(npmPath, env);
  const nextEnv: NodeJS.ProcessEnv = { ...env };
  if (prefix) {
    const binDir = process.platform === "win32" ? prefix : join(prefix, "bin");
    // Electron on Windows often uses `Path`; keep both in sync.
    const current = nextEnv.PATH || nextEnv.Path || "";
    if (!current.toLowerCase().includes(binDir.toLowerCase())) {
      nextEnv.PATH = `${binDir}${process.platform === "win32" ? ";" : ":"}${current}`;
      nextEnv.Path = nextEnv.PATH;
    }
    // Best-effort: mutate process.env so later host spawns inherit the global bin.
    if (!process.env.PATH?.toLowerCase().includes(binDir.toLowerCase())) {
      process.env.PATH = nextEnv.PATH;
      if (process.platform === "win32") process.env.Path = nextEnv.PATH;
    }
  }

  const installed = await detectPiCli(nextEnv);
  if (!installed.path) {
    const error = `Installed ${PI_NPM_PACKAGE} but could not locate the pi executable. Restart the terminal/app or add npm's global bin to PATH.`;
    emit(onProgress, { phase: "error", message: error });
    return {
      installed: false,
      alreadyPresent: false,
      installedNow: false,
      skipped: false,
      error,
    };
  }

  ensureDirOnProcessPath(installed.path);

  const result: PiCliEnsureResult = {
    installed: true,
    alreadyPresent: false,
    installedNow: true,
    skipped: false,
    path: installed.path,
    ...(installed.version ? { version: installed.version } : {}),
  };
  emit(onProgress, {
    phase: "complete",
    message: installed.version ? `Installed pi ${installed.version}` : "Installed pi successfully",
    path: installed.path,
    ...(installed.version ? { version: installed.version } : {}),
    installedNow: true,
  });
  return result;
}
