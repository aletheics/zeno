/**
 * Desktop watch launcher — hot reload for development.
 *
 * - Starts Vite dev server for renderer (HMR for React components).
 * - Watches main / preload / agent source files; restarts Electron on changes.
 * - `pnpm dev` (root) or `pnpm run dev` (apps/desktop).
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
 */
function resolveVpBin() {
  const candidates = [desktopDir];
  let dir = desktopDir;
  for (let i = 0; i < 8; i++) {
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
    candidates.push(dir);
  }
  for (const base of candidates) {
    const bin = resolve(base, "node_modules", ".bin", isWin ? "vp.cmd" : "vp");
    try {
      const { statSync } = require("node:fs");
      if (statSync(bin).isFile()) return bin;
    } catch {
      // keep searching
    }
  }
  return isWin ? "vp.cmd" : "vp";
}

const vpBin = resolveVpBin();

/** Spawn a child with stdio inherited. On Windows uses shell for .cmd compatibility. */
function run(cmd, args, opts = {}) {
  return spawn(cmd, args, {
    cwd: desktopDir,
    stdio: "inherit",
    shell: isWin,
    ...opts,
  });
}

// ── 1. Initial build ──
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

// Wait for dev server to be ready.
await new Promise((r) => setTimeout(r, 2000));

// ── 3. Start build watchers ──
console.log("[watch] Starting build watchers for main / preload / agent ...");
const buildProcs = [
  run(vpBin, ["build", "--watch", "--config", "vite.main.config.ts"]),
  run(vpBin, ["build", "--watch", "--config", "vite.preload.config.ts"]),
  run(vpBin, ["build", "--watch", "--config", "vite.agent.config.ts"]),
];

// ── 4. Electron lifecycle ──
let electronProc = null;
let restartTimer = null;
let pendingRestart = false;
const DEBOUNCE_MS = 800;

function killElectron() {
  if (!electronProc) return;
  try {
    electronProc.kill("SIGTERM");
  } catch {
    // already dead
  }
  electronProc = null;
}

function launchElectron() {
  killElectron();
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
}

function scheduleRestart() {
  pendingRestart = true;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    pendingRestart = false;
    console.log("[watch] Backend rebuilt — restarting Electron ...");
    launchElectron();
  }, DEBOUNCE_MS);
}

// Watch source directories (not dist — more reliable cross-platform).
const srcMain = resolve(desktopDir, "src", "main");
const srcPreload = resolve(desktopDir, "src", "preload");
const srcAgent = resolve(desktopDir, "src", "agent-host");

for (const dir of [srcMain, srcPreload, srcAgent]) {
  try {
    watch(dir, { recursive: true }, (_event, filename) => {
      if (filename && /\.(ts|tsx|mjs|js)$/.test(filename)) {
        // Source changed — build watchers will rebuild; restart after debounce.
        scheduleRestart();
      }
    });
    console.log(`[watch] Watching ${dir}`);
  } catch (err) {
    console.warn(`[watch] Cannot watch ${dir}:`, err.message);
  }
}

// ── 5. Launch Electron ──
launchElectron();

// ── 6. Cleanup ──
let cleaning = false;
function cleanup() {
  if (cleaning) return;
  cleaning = true;
  console.log("\n[watch] Shutting down ...");
  if (restartTimer) clearTimeout(restartTimer);
  killElectron();
  for (const proc of [rendererDev, ...buildProcs]) {
    try {
      proc.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  prepared.cleanup().catch(() => {});
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
