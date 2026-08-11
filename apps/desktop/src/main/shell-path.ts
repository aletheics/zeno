/**
 * GUI-launched Electron (Dock / Finder / Start Menu) inherits a minimal PATH.
 * Dev launches from a shell keep full PATH — that is why packaged Zeno fails to
 * find `pi` / `node` / `npm` and falls into slow npm install / tool re-download.
 *
 * Pure, sync helpers: scan well-known user bin dirs and prepend them.
 */
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/** Directories that commonly hold node / npm / pi when launched outside a login shell. */
export function commonUserBinDirs(home: string = homedir()): string[] {
  if (process.platform === "win32") {
    return [
      join(home, "AppData", "Roaming", "npm"),
      join(home, "AppData", "Local", "Microsoft", "WinGet", "Links"),
      join(home, "scoop", "shims"),
      join(home, "AppData", "Local", "Programs", "cursor", "resources", "app", "bin"),
      "C:\\Program Files\\nodejs",
      "C:\\Program Files (x86)\\nodejs",
    ].filter((dir) => existsSync(dir));
  }

  const dirs: string[] = [
    // Real Node from vite-plus runtimes (prefer over ~/.vite-plus/bin wrappers).
    ...vitePlusRuntimeBinDirs(home),
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    join(home, ".vite-plus", "bin"),
    join(home, ".local", "bin"),
    join(home, ".npm-global", "bin"),
    join(home, ".volta", "bin"),
    join(home, ".asdf", "shims"),
    join(home, ".local", "share", "fnm", "aliases", "default", "bin"),
    join(home, ".nvm", "current", "bin"),
    join(home, ".cargo", "bin"),
    join(home, ".pi", "agent", "bin"),
  ];

  // nvm: ~/.nvm/versions/node/<ver>/bin — pick newest existing without spawning nvm.
  const nvmVersions = join(home, ".nvm", "versions", "node");
  if (existsSync(nvmVersions)) {
    try {
      const versions = readdirSync(nvmVersions)
        .filter((name) => !name.startsWith("."))
        .sort()
        .reverse();
      for (const ver of versions) {
        const bin = join(nvmVersions, ver, "bin");
        if (existsSync(bin)) dirs.push(bin);
      }
    } catch {
      // ignore
    }
  }

  return uniqueExistingDirs(dirs);
}

function vitePlusRuntimeBinDirs(home: string): string[] {
  const root = join(home, ".vite-plus", "js_runtime", "node");
  if (!existsSync(root)) return [];
  try {
    return readdirSync(root)
      .filter((name) => !name.startsWith("."))
      .sort()
      .reverse()
      .map((ver) => join(root, ver, "bin"))
      .filter((bin) => existsSync(bin));
  } catch {
    return [];
  }
}

function uniqueExistingDirs(dirs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of dirs) {
    if (!dir || !existsSync(dir)) continue;
    const key = process.platform === "win32" ? dir.toLowerCase() : dir;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(dir);
  }
  return out;
}

/** Prepend extra dirs to a PATH string (deduped, extras first). */
export function mergePathDirs(existing: string | undefined, extraDirs: string[]): string {
  const sep = delimiter;
  const parts = [...extraDirs, ...(existing ?? "").split(sep).filter(Boolean)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = process.platform === "win32" ? part.toLowerCase() : part;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out.join(sep);
}

/**
 * Return a copy of env with PATH (and Windows Path) augmented.
 * `extraBinDirs` are prepended first (e.g. bundled Node/Python).
 */
export function augmentEnvPath(
  env: NodeJS.ProcessEnv = process.env,
  extraBinDirs: string[] = [],
): NodeJS.ProcessEnv {
  const home = env.HOME || env.USERPROFILE || homedir();
  const existing = env.PATH || env.Path || "";
  // Bundled runtimes first, then well-known user bins, then existing PATH.
  const merged = mergePathDirs(existing, [...extraBinDirs, ...commonUserBinDirs(home)]);
  const next: NodeJS.ProcessEnv = { ...env, PATH: merged };
  if (process.platform === "win32") next.Path = merged;
  if (!next.HOME && home) next.HOME = home;
  if (process.platform === "win32" && !next.USERPROFILE) next.USERPROFILE = home;
  return next;
}

/**
 * Mutate process.env.PATH so main, utilityProcess, and child spawns see user tools.
 * Safe to call multiple times (idempotent merge).
 * @param extraBinDirs optional dirs prepended (bundled Node/Python bins)
 */
export function applyProcessPathAugmentation(extraBinDirs: string[] = []): void {
  const next = augmentEnvPath(process.env, extraBinDirs);
  if (next.PATH) process.env.PATH = next.PATH;
  if (process.platform === "win32" && next.Path) process.env.Path = next.Path;
  if (next.HOME && !process.env.HOME) process.env.HOME = next.HOME;
  if (process.platform === "win32" && next.USERPROFILE && !process.env.USERPROFILE) {
    process.env.USERPROFILE = next.USERPROFILE;
  }
}

/** Absolute candidate paths for a command name under common bin dirs (+ optional env PATH). */
export function candidateCommandPaths(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const home = env.HOME || env.USERPROFILE || homedir();
  const dirs = commonUserBinDirs(home);
  const pathDirs = (env.PATH || env.Path || "").split(delimiter).filter(Boolean);
  const allDirs = uniqueExistingDirs([...dirs, ...pathDirs]);
  const names =
    process.platform === "win32"
      ? [`${command}.cmd`, `${command}.exe`, `${command}.bat`, command]
      : [command];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const dir of allDirs) {
    for (const name of names) {
      const full = join(dir, name);
      const key = process.platform === "win32" ? full.toLowerCase() : full;
      if (seen.has(key) || !existsSync(full)) continue;
      seen.add(key);
      out.push(full);
    }
  }
  return out;
}
