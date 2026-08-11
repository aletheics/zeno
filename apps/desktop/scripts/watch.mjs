/**
 * Desktop watch launcher — hot reload for development.
 *
 * - Starts Vite dev server for renderer (HMR for React components).
 * - Watches main / preload / agent builds; restarts Electron on backend changes.
 * - `pnpm watch` (root) or `pnpm run watch` (apps/desktop).
 * - Interactive: real HOME. Isolated: `PIX_ISOLATED=1` (temp HOME, fake model).
 */
import { spawn, execSync } from "node:child_process";
import { watch } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { prepareLaunchEnv } from "./launch-env.mjs";

const require = createRequire(import.meta.url);
const electron = require("electron");
const appDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(appDir, "..");

const isolated = process.env.PIX_ISOLATED === "1";
const prepared = await prepareLaunchEnv({ isolated });
console.log(prepared.label);

const devServerPort = process.env.VITE_DEV_SERVER_PORT
  ? Number(process.env.VITE_DEV_SERVER_PORT)
  : 5173;
const devServerUrl = `http://localhost:${devServerPort}`;

const isWin = process.platform === "win32";

/**
 * Find the vp binary in the workspace node_modules.
 * pnpm hoists vite-plus to the root, so we search upwards.
 */
function resolveVpBin() {
  // Try desktop-local first, then walk up to workspace root.
  const candidates = [desktopDir];
  let dir = desktopDir;
  while (true) {
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
    candidates.push(dir);
    if (candidates.length > 8) break; // safety
  }
  for (const base of candidates) {
    const bin = resolve(base, "node_modules", ".bin", isWin ? "vp.cmd" : "vp");
    try {
      // Use statSync to check existence — require.resolve won't find bin entries.
      const { statSync } = require("node:fs");
      if (statSync(bin).isFile()) return bin;
    } catch {
      // keep searching
    }
  }
  // Fallback: trust that vp is on PATH (e.g. when run via pnpm run watch).
  return isWin ? "vp.cmd" : "vp";
}

const vpBin = resolveVpBin();

/** Spawn a child with stdio inherited. Returns the ChildProcess. */
function run(cmd, args, opts = {}) {
  return spawn(cmd, args, {
    cwd: desktopDir,
    stdio: "inherit",
    ...opts,
  });
}

// ── 1. Initial build of main / preload / agent (needed before first Electron launch) ──
console.log("[watch] Building main / preload / agent ...");
execSync(
  [
    `"${vpBin}" build --config vite.main.config.ts`,
    `"${vpBin}" build --config vite.preload.config.ts`,
    `"${vpBin}" build --config vite.agent.config.ts`,
  ].join(" && "),
  { cwd: desktopDir, stdio: "inherit", shell: true },
);

// ── 2. Start Vite dev server for renderer (HMR) ──
console.log(`[watch] Starting Vite dev server on ${devServerUrl} ...`);
const rendererDev = run(
  vpBin,
  ["--config", "vite.renderer.config.ts", "--port", String(devServerPort)],
  {
    env: { ...process.env },
  },
);

// Give the dev server a moment to start before launching Electron.
await new Promise((r) => setTimeout(r, 1500));

// ── 3. Start build watchers for main / preload / agent ──
console.log("[watch] Starting build watchers ...");
const mainWatch = run(vpBin, ["build", "--watch", "--config", "vite.main.config.ts"]);
const preloadWatch = run(vpBin, ["build", "--watch", "--config", "vite.preload.config.ts"]);
const agentWatch = run(vpBin, ["build", "--watch", "--config", "vite.agent.config.ts"]);

// ── 4. Electron lifecycle (restart on backend dist changes) ──
let electronProc = null;
let restartTimer = null;
const DEBOUNCE_MS = 500;

function launchElectron() {
  if (electronProc) {
    try {
      electronProc.kill("SIGTERM");
    } catch {
      // process already dead
    }
    electronProc = null;
  }
  console.log("[watch] Launching Electron ...");
  electronProc = run(electron, [desktopDir], {
    env: {
      ...prepared.environment,
      VITE_DEV_SERVER_URL: devServerUrl,
    },
  });
  electronProc.on("exit", (code, signal) => {
    // If we scheduled a restart, don't log — the restart will log instead.
    if (!restartTimer) {
      console.log(`[watch] Electron exited (code ${code ?? signal})`);
    }
    electronProc = null;
  });
  electronProc.on("error", (err) => {
    console.error("[watch] Electron failed to start:", err.message);
    electronProc = null;
  });
}

function scheduleRestart() {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    console.log("[watch] Backend rebuilt — restarting Electron ...");
    launchElectron();
  }, DEBOUNCE_MS);
}

// Watch dist output directories for builds completing.
const distMain = resolve(desktopDir, "dist", "main");
const distPreload = resolve(desktopDir, "dist", "preload");
const distAgent = resolve(desktopDir, "dist", "agent-host");

for (const dir of [distMain, distPreload, distAgent]) {
  try {
    watch(dir, { recursive: true }, (_event, filename) => {
      // Filter out sourcemaps and temp files so only real output triggers restart.
      if (filename && !filename.endsWith(".map") && !filename.endsWith(".tmp")) {
        scheduleRestart();
      }
    });
  } catch {
    console.warn(`[watch] Cannot watch ${dir} (will be created after first build)`);
  }
}

// ── 5. Initial Electron launch ──
launchElectron();

// ── 6. Cleanup on exit ──
let cleaning = false;
function cleanup() {
  if (cleaning) return;
  cleaning = true;
  console.log("\n[watch] Shutting down ...");
  if (restartTimer) clearTimeout(restartTimer);
  if (electronProc) {
    try {
      electronProc.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  for (const proc of [rendererDev, mainWatch, preloadWatch, agentWatch]) {
    try {
      proc.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  prepared.cleanup().catch(() => {});
  // Give processes a moment to exit.
  setTimeout(() => process.exit(0), 300);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
