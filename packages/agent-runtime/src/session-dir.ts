import { getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

/** Matches pi `ENV_SESSION_DIR` (`PI_CODING_AGENT_SESSION_DIR`). */
export const PIX_SESSION_DIR_ENV = "PI_CODING_AGENT_SESSION_DIR";

export type SessionDirSource = "explicit" | "env" | "settings" | "default";

export interface ResolvePixSessionDirOptions {
  cwd: string;
  agentDir?: string;
  /** Host-level explicit override (test/CLI only). Product normal path must omit this. */
  explicit?: string;
  env?: NodeJS.ProcessEnv;
  /** Pre-read settings sessionDir; when omitted, loads global settings. */
  settingsSessionDir?: string | null;
}

export interface ResolvedPixSessionDir {
  /** Absolute session directory, or undefined when callers should use SessionManager default. */
  sessionDir: string | undefined;
  source: SessionDirSource;
}

function expandTildePath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
  return path;
}

function normalizeOptionalPath(path: string | undefined | null): string | undefined {
  if (!path) return undefined;
  const expanded = expandTildePath(path.trim());
  if (!expanded) return undefined;
  return isAbsolute(expanded) ? resolve(expanded) : resolve(expanded);
}

/**
 * Resolve session storage directory with the same precedence as pi CLI:
 * explicit host option > `PI_CODING_AGENT_SESSION_DIR` > settings.sessionDir > default.
 *
 * Product normal startup must not pass `explicit`.
 */
export function resolvePixSessionDir(options: ResolvePixSessionDirOptions): ResolvedPixSessionDir {
  const explicit = normalizeOptionalPath(options.explicit);
  if (explicit) return { sessionDir: explicit, source: "explicit" };

  const env = options.env ?? process.env;
  const fromEnv = normalizeOptionalPath(env[PIX_SESSION_DIR_ENV]);
  if (fromEnv) return { sessionDir: fromEnv, source: "env" };

  let settingsSessionDir = options.settingsSessionDir;
  if (settingsSessionDir === undefined) {
    const agentDir = options.agentDir ?? getAgentDir();
    const settings = SettingsManager.create(options.cwd, agentDir, { projectTrusted: false });
    settingsSessionDir = settings.getSessionDir() ?? null;
  }
  const fromSettings = normalizeOptionalPath(settingsSessionDir);
  if (fromSettings) return { sessionDir: fromSettings, source: "settings" };

  return { sessionDir: undefined, source: "default" };
}
