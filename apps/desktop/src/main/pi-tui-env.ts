/**
 * Environment for embedded pi TUI — align with agent-host so managed tools
 * (fd/rg under ~/.pi/agent/bin) are found and not re-downloaded every launch.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import {
  getActiveBundledBinDirs,
  getActiveBundledNodeExecutable,
  getActiveRuntimeIsolationEnv,
} from "./bundled-runtimes.ts";
import { augmentEnvPath, commonUserBinDirs, mergePathDirs } from "./shell-path.ts";

/** pi `ENV_AGENT_DIR` — tools live at `<agentDir>/bin`. */
export const PI_CODING_AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";

export function defaultPiAgentDir(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env[PI_CODING_AGENT_DIR_ENV]?.trim();
  if (fromEnv) return expandTilde(fromEnv, env);
  const home = env.USERPROFILE || env.HOME || homedir();
  return join(home, ".pi", "agent");
}

export function piManagedBinDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(defaultPiAgentDir(env), "bin");
}

function expandTilde(path: string, env: NodeJS.ProcessEnv): string {
  if (path === "~") return env.USERPROFILE || env.HOME || homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(env.USERPROFILE || env.HOME || homedir(), path.slice(2));
  }
  return path;
}

/**
 * Build env for `pi --session` PTY:
 * - stable PI_CODING_AGENT_DIR (shared with host / previous TUI runs)
 * - prepend managed bin + common tool locations so getToolPath finds fd/rg
 * - GUI-minimal PATH is augmented like the rest of packaged Zeno
 */
export function buildPiTuiEnv(baseEnv: NodeJS.ProcessEnv = process.env): Record<string, string> {
  // Bundled Node/Python bins first so TUI tools resolve without a system install.
  const augmented = augmentEnvPath(baseEnv, getActiveBundledBinDirs());
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(augmented)) {
    if (typeof value === "string") env[key] = value;
  }

  const agentDir = defaultPiAgentDir(augmented);
  env[PI_CODING_AGENT_DIR_ENV] = agentDir;

  const home = env.USERPROFILE || env.HOME || homedir();
  if (!env.USERPROFILE && process.platform === "win32") env.USERPROFILE = home;
  if (!env.HOME) env.HOME = home;

  // Managed bin first for fd/rg; then bundled runtimes; then user bins.
  const managedBin = join(agentDir, "bin");
  const extras = [managedBin, ...getActiveBundledBinDirs(), ...commonUserBinDirs(home)];
  const pathValue = mergePathDirs(env.PATH || env.Path || "", extras);

  env.PATH = pathValue;
  env.Path = pathValue;
  env.TERM = env.TERM || "xterm-256color";
  env.COLORTERM = env.COLORTERM || "truecolor";
  // The embedded renderer uses Ghostty's hardware cursor as the single
  // visible input caret. Pi's reverse-video editor caret is stripped before
  // the bytes reach the canvas.
  env.PI_HARDWARE_CURSOR = "1";

  // Explicit NODE_BINARY so resolvePiPtyLaunch prefers bundled node over PATH races.
  const bundledNode = getActiveBundledNodeExecutable();
  if (bundledNode) env.NODE_BINARY = bundledNode;

  // npm prefix + python venv isolation (managed installs stay under userData).
  for (const [key, value] of Object.entries(getActiveRuntimeIsolationEnv())) {
    env[key] = value;
  }

  return env;
}
