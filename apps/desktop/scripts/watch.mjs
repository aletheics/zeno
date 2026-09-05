/**
 * Desktop watch launcher — hot reload for development.
 *
 * - Starts Vite dev server for renderer (HMR for React components).
 * - Watches main / preload / agent source files; restarts Electron on changes.
 * - `pnpm dev` (root) or `pnpm run dev` (apps/desktop).
 * - Interactive: real HOME. Isolated: `ZENO_ISOLATED=1` (temp HOME, fake model).
 */
import { spawn, execFileSync } from "node:child_process";
import { statSync, watchFile, unwatchFile } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { prepareLaunchEnv } from "./launch-env.mjs";

const require = createRequire(import.meta.url);
const electron = require("electron");
const appDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(appDir, "..");

const isolated = process.env.ZENO_ISOLATED === "1";
const prepared = await prepareLaunchEnv({ isolated });
console.log(prepared.label);

const devServerPort = process.env.VITE_DEV_SERVER_PORT
  ? Number(process.env.VITE_DEV_SERVER_PORT)
  : 5173;
const devServerUrl = `http://localhost:${devServerPort}`;

const isWin = process.platform === "win32";

/**
 * Resolve the vite-plus `vp` CLI entry (a plain JS file) instead of the `.cmd` shim.
 * Spawning `node <entry>` directly avoids an extra `cmd.exe` layer, so Ctrl+C no
 * longer triggers a "Terminate batch job (Y/N)?" prompt per child process.
 */
function resolveVpEntry() {
  const candidates = [desktopDir];
  let dir = desktopDir;
  for (let i = 0; i < 8; i++) {
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
    candidates.push(dir);
  }
  for (const base of candidates) {
    const entry = resolve(base, "node_modules", "vite-plus", "bin", "vp");
    try {
      if (statSync(entry).isFile()) return entry;
    } catch {
      // keep searching
    }
  }
  throw new Error("Unable to resolve vite-plus `vp` entry (node_modules/vite-plus/bin/vp)");
}

const vpEntry = resolveVpEntry();
const nodeBin = process.execPath;

/** Spawn a child with stdio inherited. Never wraps in a shell — keeps Ctrl+C clean on Windows. */
function run(cmd, args, opts = {}) {
  return spawn(cmd, args, {
    cwd: desktopDir,
    stdio: "inherit",
    ...opts,
  });
}

/** Spawn `vp` via `node <entry>` directly (no `.cmd` shim). */
function runVp(args, opts = {}) {
  return run(nodeBin, [vpEntry, ...args], opts);
}

// ── 1. Initial build ──
console.log("[watch] Building main / preload / agent ...");
for (const config of ["vite.main.config.ts", "vite.preload.config.ts", "vite.agent.config.ts"]) {
  execFileSync(nodeBin, [vpEntry, "build", "--config", config], {
    cwd: desktopDir,
    stdio: "inherit",
  });
}

// ── 2. Start Vite dev server for renderer (HMR) ──
console.log(`[watch] Starting Vite dev server on ${devServerUrl} ...`);
const rendererDev = runVp(
  ["dev", "--config", "vite.renderer.config.ts", "--port", String(devServerPort)],
  {
    env: { ...process.env },
  },
);

// Wait for dev server to be ready.
await new Promise((r) => setTimeout(r, 2000));

// ── 3. Electron lifecycle ──
let electronProc = null;
let restartTimer = null;
let pendingRestart = false;
/** Ignore file changes during startup — build watchers emit an initial build that must not restart. */
let startupGraceUntil = 0;
const DEBOUNCE_MS = 1200;
const KILL_WAIT_MS = 1500;
const STARTUP_GRACE_MS = 4000;

/** Kill Electron and wait for it to fully exit before resolving. */
function killElectron() {
  return new Promise((resolve) => {
    if (!electronProc) return resolve();
    const proc = electronProc;
    electronProc = null;

    // On Windows SIGTERM is unreliable; use taskkill for forceful cleanup.
    if (isWin) {
      try {
        const { execSync: exec } = require("node:child_process");
        exec(`taskkill /pid ${proc.pid} /T /F 2>nul`, { stdio: "ignore" });
      } catch {
        // process may already be gone
      }
    }

    proc.once("exit", () => resolve());
    proc.once("error", () => resolve());

    // Timeout: resolve even if the process hangs.
    setTimeout(resolve, KILL_WAIT_MS);

    try {
      proc.kill("SIGTERM");
    } catch {
      resolve();
    }
  });
}

async function launchElectron() {
  await killElectron();
  // Brief pause so OS releases file locks (disk cache, GPU cache).
  await new Promise((r) => setTimeout(r, 400));
  console.log("[watch] Launching Electron ...");
  electronProc = run(electron, [desktopDir], {
    env: {
      ...prepared.environment,
      VITE_DEV_SERVER_URL: devServerUrl,
    },
  });
  electronProc.on("exit", (code, signal) => {
    if (!pendingRestart) {
      console.log(`[watch] Electron exited (code ${code ?? signal})`);
    }
    electronProc = null;
  });
  electronProc.on("error", (err) => {
    console.error("[watch] Electron failed to start:", err.message);
    electronProc = null;
  });
  // Block restarts for a grace period so build-watcher initial builds don't trigger a second window.
  startupGraceUntil = Date.now() + STARTUP_GRACE_MS;
}

async function scheduleRestart() {
  if (Date.now() < startupGraceUntil) return;
  pendingRestart = true;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(async () => {
    restartTimer = null;
    pendingRestart = false;
    console.log("[watch] Backend rebuilt — restarting Electron ...");
    await launchElectron();
  }, DEBOUNCE_MS);
}

// Watch dist output files — only restart when backend build actually produces new output.
// `watchFile` uses stat polling, which is reliable on all platforms (unlike `watch` on dirs).
const distOutputs = [
  resolve(desktopDir, "dist", "main", "main.mjs"),
  resolve(desktopDir, "dist", "preload", "preload.cjs"),
  resolve(desktopDir, "dist", "agent-host", "agent-host.mjs"),
];

for (const file of distOutputs) {
  try {
    watchFile(file, { interval: 600 }, (curr, prev) => {
      if (curr.mtimeMs !== prev.mtimeMs) {
        void scheduleRestart();
      }
    });
    console.log(`[watch] Watching ${file}`);
  } catch (err) {
    console.warn(`[watch] Cannot watch ${file}:`, err.message);
  }
}

// ── 5. Launch Electron ──
void launchElectron();

// ── 6. Start build watchers (after Electron has loaded its main bundle) ──
// Started AFTER launchElectron so the watchers' initial rebuild cannot race
// Electron's first read of dist/main/main.mjs (the intermittent "Cannot find
// module" failure on alternate runs).
console.log("[watch] Starting build watchers for main / preload / agent ...");
const buildProcs = [
  runVp(["build", "--watch", "--config", "vite.main.config.ts"]),
  runVp(["build", "--watch", "--config", "vite.preload.config.ts"]),
  runVp(["build", "--watch", "--config", "vite.agent.config.ts"]),
];

// ── 6. Cleanup ──
let cleaning = false;
async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  console.log("\n[watch] Shutting down ...");
  if (restartTimer) clearTimeout(restartTimer);
  for (const file of distOutputs) {
    try {
      unwatchFile(file);
    } catch {
      /* ignore */
    }
  }
  await killElectron();
  for (const proc of [rendererDev, ...buildProcs]) {
    try {
      if (isWin) {
        const { execSync: exec } = require("node:child_process");
        exec(`taskkill /pid ${proc.pid} /T /F 2>nul`, { stdio: "ignore" });
      } else {
        proc.kill("SIGTERM");
      }
    } catch {
      // ignore
    }
  }
  prepared.cleanup().catch(() => {});
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
