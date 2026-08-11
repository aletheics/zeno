/**
 * Desktop pi SDK management: resolve builtin vs global @earendil-works/pi-coding-agent,
 * list ~/.pi/agent config files, and produce spawn env for Agent Host / TUI.
 */
import type {
  PiConfigFileInfo,
  PiSdkActivity,
  PiSdkCandidate,
  PiSdkSource,
  PiSdkStatus,
} from "@zeno/contracts";
import { existsSync, realpathSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { detectPiCli, isProjectLocalPiPath } from "./pi-cli-ensure.ts";
import { augmentEnvPath } from "./shell-path.ts";

const execFileAsync = promisify(execFile);

export const PI_SDK_PACKAGE = "@earendil-works/pi-coding-agent";
export const ZENO_PI_SDK_SOURCE_ENV = "ZENO_PI_SDK_SOURCE";
export const ZENO_PI_SDK_ROOT_ENV = "ZENO_PI_SDK_ROOT";

export type PiSdkPrefs = {
  source: PiSdkSource;
};

export type ResolvedPiSdk = {
  source: PiSdkSource;
  available: boolean;
  version?: string;
  packageRoot?: string;
  cliPath?: string;
  error?: string;
};

const CONFIG_SPECS: Array<{
  id: string;
  rel: string;
  kind: "file" | "directory";
  openable: boolean;
}> = [
  { id: "settings", rel: "settings.json", kind: "file", openable: true },
  { id: "models", rel: "models.json", kind: "file", openable: true },
  { id: "auth", rel: "auth.json", kind: "file", openable: false },
  { id: "trust", rel: "trust.json", kind: "file", openable: true },
  { id: "sessions", rel: "sessions", kind: "directory", openable: true },
  { id: "mcp", rel: "mcp.json", kind: "file", openable: true },
  { id: "bin", rel: "bin", kind: "directory", openable: true },
];

export function normalizePiSdkSource(value: unknown): PiSdkSource {
  return value === "global" ? "global" : "builtin";
}

export function normalizePiSdkPrefs(raw: unknown): PiSdkPrefs {
  if (raw && typeof raw === "object" && "source" in raw) {
    return { source: normalizePiSdkSource((raw as { source: unknown }).source) };
  }
  return { source: "builtin" };
}

function readPackageMeta(packageRoot: string): { version?: string; cliPath?: string } {
  const pkgPath = join(packageRoot, "package.json");
  if (!existsSync(pkgPath)) return {};
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      name?: string;
      version?: string;
      bin?: string | Record<string, string>;
    };
    if (pkg.name && pkg.name !== PI_SDK_PACKAGE) return {};
    let cliRel: string | undefined;
    if (typeof pkg.bin === "string") cliRel = pkg.bin;
    else if (pkg.bin && typeof pkg.bin === "object") {
      cliRel = pkg.bin.pi ?? Object.values(pkg.bin)[0];
    }
    const cliPath = cliRel ? join(packageRoot, cliRel) : join(packageRoot, "dist", "cli.js");
    return {
      ...(pkg.version ? { version: pkg.version } : {}),
      ...(existsSync(cliPath) ? { cliPath } : {}),
    };
  } catch {
    return {};
  }
}

function realPathIfExists(path: string): string | undefined {
  try {
    if (!existsSync(path)) return undefined;
    return realpathSync(path);
  } catch {
    return existsSync(path) ? path : undefined;
  }
}

/**
 * Walk up from a resolved module file until package.json name matches.
 */
export function packageRootFromEntry(entryPath: string): string | undefined {
  let dir = dirname(entryPath);
  for (let i = 0; i < 8; i++) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
        if (pkg.name === PI_SDK_PACKAGE) return realPathIfExists(dir) ?? dir;
      } catch {
        // continue
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** Candidate directories that may contain the builtin package (dev + packaged). */
export function builtinPackageSearchRoots(options: {
  mainModuleUrl?: string;
  appPath?: string;
  resourcesPath?: string;
}): string[] {
  const roots: string[] = [];
  if (options.mainModuleUrl) {
    try {
      const mainDir = dirname(fileURLToPath(options.mainModuleUrl));
      // dist/main → apps/desktop
      roots.push(join(mainDir, "..", "..", "node_modules", PI_SDK_PACKAGE));
      roots.push(join(mainDir, "..", "node_modules", PI_SDK_PACKAGE));
    } catch {
      // ignore
    }
  }
  if (options.appPath) {
    roots.push(join(options.appPath, "node_modules", PI_SDK_PACKAGE));
  }
  if (options.resourcesPath) {
    roots.push(
      join(options.resourcesPath, "app.asar.unpacked", "node_modules", PI_SDK_PACKAGE),
      join(options.resourcesPath, "node_modules", PI_SDK_PACKAGE),
    );
  }
  return roots;
}

export function resolveBuiltinSdk(options: {
  mainModuleUrl?: string;
  appPath?: string;
  resourcesPath?: string;
  /** Inject createRequire base (tests). */
  requireFrom?: string;
}): ResolvedPiSdk {
  const seen = new Set<string>();
  for (const candidate of builtinPackageSearchRoots(options)) {
    const root = realPathIfExists(candidate);
    if (!root || seen.has(root)) continue;
    seen.add(root);
    const meta = readPackageMeta(root);
    if (meta.version || meta.cliPath) {
      return {
        source: "builtin",
        available: true,
        packageRoot: root,
        ...meta,
      };
    }
  }

  // createRequire from desktop package.json / main
  const bases = [
    options.requireFrom,
    options.appPath ? join(options.appPath, "package.json") : undefined,
    options.mainModuleUrl
      ? (() => {
          try {
            return fileURLToPath(options.mainModuleUrl);
          } catch {
            return undefined;
          }
        })()
      : undefined,
  ].filter((v): v is string => Boolean(v));

  for (const base of bases) {
    try {
      const nodeRequire = createRequire(base);
      // Resolve package entry via export "."; fall back to walking node_modules.
      let entry: string | undefined;
      try {
        entry = nodeRequire.resolve(PI_SDK_PACKAGE);
      } catch {
        try {
          entry = nodeRequire.resolve(`${PI_SDK_PACKAGE}/dist/index.js`);
        } catch {
          entry = undefined;
        }
      }
      if (entry) {
        const root = packageRootFromEntry(entry);
        if (root) {
          const meta = readPackageMeta(root);
          return {
            source: "builtin",
            available: true,
            packageRoot: root,
            ...meta,
          };
        }
      }
    } catch {
      // try next base
    }
  }

  return {
    source: "builtin",
    available: false,
    error: "Bundled pi SDK package was not found",
  };
}

async function npmGlobalRoot(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const resolvedEnv = augmentEnvPath(env);
  try {
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const { stdout } = await execFileAsync(npmCmd, ["root", "-g"], {
      env: resolvedEnv,
      windowsHide: true,
      cwd: process.platform === "win32" ? resolvedEnv.TEMP || resolvedEnv.TMP || homedir() : "/tmp",
      timeout: 12_000,
      maxBuffer: 1024 * 1024,
    });
    const root = stdout.trim().split(/\r?\n/)[0]?.trim();
    return root || undefined;
  } catch {
    return undefined;
  }
}

/**
 * If `pi` is a shim under …/bin/pi, package often lives at …/lib/node_modules/@scope/pkg
 * or next to the shim for some install layouts.
 */
export function packageRootFromCliPath(cliPath: string): string | undefined {
  const real = realPathIfExists(cliPath) ?? cliPath;
  // …/node_modules/@earendil-works/pi-coding-agent/dist/cli.js
  const fromEntry = packageRootFromEntry(real);
  if (fromEntry) return fromEntry;

  const binDir = dirname(real);
  // …/bin → parent/lib/node_modules/@scope/pkg  (unix npm)
  const unixCandidate = join(binDir, "..", "lib", "node_modules", PI_SDK_PACKAGE);
  if (existsSync(join(unixCandidate, "package.json"))) {
    return realPathIfExists(unixCandidate) ?? unixCandidate;
  }
  // Windows: %AppData%/npm/node_modules/@scope/pkg  with pi.cmd in %AppData%/npm
  const winCandidate = join(binDir, "node_modules", PI_SDK_PACKAGE);
  if (existsSync(join(winCandidate, "package.json"))) {
    return realPathIfExists(winCandidate) ?? winCandidate;
  }
  return undefined;
}

export async function resolveGlobalSdk(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResolvedPiSdk> {
  const resolvedEnv = augmentEnvPath(env);

  // 1) True `npm install -g` package under npm root -g.
  const npmRoot = await npmGlobalRoot(resolvedEnv);
  if (npmRoot) {
    const root = realPathIfExists(join(npmRoot, PI_SDK_PACKAGE));
    if (root && !isProjectLocalPiPath(root)) {
      const meta = readPackageMeta(root);
      // Prefer CLI next to the global package, not a monorepo .bin on PATH.
      const cliFromPkg =
        meta.cliPath && !isProjectLocalPiPath(meta.cliPath) ? meta.cliPath : undefined;
      const detected = await detectPiCli(resolvedEnv);
      const cliPath =
        cliFromPkg ??
        (detected.path && !isProjectLocalPiPath(detected.path) ? detected.path : undefined);
      return {
        source: "global",
        available: true,
        packageRoot: root,
        ...meta,
        ...(cliPath ? { cliPath } : {}),
        ...(detected.version && !meta.version ? { version: detected.version } : {}),
      };
    }
  }

  // 2) User-global CLI only (detectPiCli already rejects project node_modules).
  const detected = await detectPiCli(resolvedEnv);
  if (detected.path && !isProjectLocalPiPath(detected.path)) {
    const root = packageRootFromCliPath(detected.path);
    if (root && !isProjectLocalPiPath(root)) {
      const meta = readPackageMeta(root);
      return {
        source: "global",
        available: true,
        packageRoot: root,
        cliPath: detected.path,
        ...meta,
        ...(detected.version && !meta.version ? { version: detected.version } : {}),
      };
    }
    // Shim without resolvable package still counts as global CLI present.
    return {
      source: "global",
      available: true,
      cliPath: detected.path,
      ...(detected.version ? { version: detected.version } : {}),
    };
  }

  return {
    source: "global",
    available: false,
    error: "Not installed — click Install",
  };
}

export function toCandidate(resolved: ResolvedPiSdk): PiSdkCandidate {
  return {
    source: resolved.source,
    available: resolved.available,
    ...(resolved.version ? { version: resolved.version } : {}),
    ...(resolved.packageRoot ? { packageRoot: resolved.packageRoot } : {}),
    ...(resolved.cliPath ? { cliPath: resolved.cliPath } : {}),
    ...(resolved.error ? { error: resolved.error } : {}),
  };
}

export function defaultAgentDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PI_CODING_AGENT_DIR?.trim();
  if (override) return override;
  return join(env.HOME || env.USERPROFILE || homedir(), ".pi", "agent");
}

export function listPiConfigFiles(agentDir: string): PiConfigFileInfo[] {
  return CONFIG_SPECS.map((spec) => {
    const path = join(agentDir, spec.rel);
    const exists = existsSync(path);
    const info: PiConfigFileInfo = {
      id: spec.id,
      path,
      kind: spec.kind,
      exists,
      openable: spec.openable,
    };
    if (exists) {
      try {
        const st = statSync(path);
        info.sizeBytes = st.size;
        info.mtimeMs = st.mtimeMs;
      } catch {
        // ignore stat failures
      }
    }
    return info;
  });
}

export function buildPiSdkActivity(input: {
  agentBusy: boolean;
  parkedBusyCount: number;
  terminalLive: boolean;
}): PiSdkActivity {
  const parkedBusyCount = Math.max(0, Math.floor(input.parkedBusyCount));
  const agentBusy = Boolean(input.agentBusy);
  const terminalLive = Boolean(input.terminalLive);
  return {
    agentBusy,
    parkedBusyCount,
    terminalLive,
    busy: agentBusy || parkedBusyCount > 0 || terminalLive,
  };
}

/** Stable error prefix so renderer can branch without parsing free text. */
export const PI_SDK_BUSY_ERROR_PREFIX = "PI_SDK_BUSY:";

export function formatPiSdkBusyError(activity: PiSdkActivity): string {
  const parts: string[] = [];
  if (activity.agentBusy) parts.push("agent");
  if (activity.parkedBusyCount > 0) parts.push(`parked:${activity.parkedBusyCount}`);
  if (activity.terminalLive) parts.push("terminal");
  return `${PI_SDK_BUSY_ERROR_PREFIX}${parts.join(",") || "busy"}`;
}

/** Compare dotted semver-ish versions; true when `latest` is strictly newer than `current`. */
export function isSemverNewer(latest: string, current: string): boolean {
  const parse = (v: string): number[] => {
    const core = v.trim().replace(/^v/i, "").split("-")[0] ?? "";
    return core.split(".").map((p) => {
      const n = Number.parseInt(p, 10);
      return Number.isFinite(n) ? n : 0;
    });
  };
  const a = parse(latest);
  const b = parse(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

const LATEST_CACHE_TTL_MS = 15 * 60 * 1000;
let latestVersionCache: { version: string; at: number } | { error: string; at: number } | undefined;

export type LatestPiSdkVersionResult = {
  version?: string;
  error?: string;
  checkedAt: string;
  fromCache: boolean;
};

/**
 * Fetch latest `@earendil-works/pi-coding-agent` from the npm registry.
 * Cached briefly so Settings refresh is snappy.
 */
export async function fetchLatestPiSdkVersion(
  options: { force?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<LatestPiSdkVersionResult> {
  const now = Date.now();
  if (!options.force && latestVersionCache && now - latestVersionCache.at < LATEST_CACHE_TTL_MS) {
    if ("version" in latestVersionCache) {
      return {
        version: latestVersionCache.version,
        checkedAt: new Date(latestVersionCache.at).toISOString(),
        fromCache: true,
      };
    }
    return {
      error: latestVersionCache.error,
      checkedAt: new Date(latestVersionCache.at).toISOString(),
      fromCache: true,
    };
  }

  const checkedAt = new Date().toISOString();
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== "function") {
    const error = "fetch is unavailable";
    latestVersionCache = { error, at: now };
    return { error, checkedAt, fromCache: false };
  }

  try {
    const url = `https://registry.npmjs.org/${encodeURIComponent(PI_SDK_PACKAGE)}/latest`;
    const res = await fetchFn(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const error = `npm registry HTTP ${res.status}`;
      latestVersionCache = { error, at: now };
      return { error, checkedAt, fromCache: false };
    }
    const body = (await res.json()) as { version?: unknown };
    const version = typeof body.version === "string" ? body.version.trim() : "";
    if (!version) {
      const error = "npm registry returned no version";
      latestVersionCache = { error, at: now };
      return { error, checkedAt, fromCache: false };
    }
    latestVersionCache = { version, at: now };
    return { version, checkedAt, fromCache: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    latestVersionCache = { error: message, at: now };
    return { error: message, checkedAt, fromCache: false };
  }
}

/** Test helper: clear latest-version cache. */
export function clearLatestPiSdkVersionCache(): void {
  latestVersionCache = undefined;
}

export function buildPiSdkStatus(input: {
  preference: PiSdkPrefs;
  appliedSource: PiSdkSource;
  builtin: ResolvedPiSdk;
  global: ResolvedPiSdk;
  agentDir: string;
  activity?: PiSdkActivity;
  latestVersion?: string;
  latestCheckedAt?: string;
  latestError?: string;
}): PiSdkStatus {
  const { preference, appliedSource, builtin, global, agentDir } = input;
  // If user prefers global but it's missing, still report preference as global
  // with needsRestart false; UI disables switch until available.
  const effectiveSource: PiSdkSource =
    preference.source === "global" && global.available ? "global" : "builtin";
  const effective = effectiveSource === "global" ? global : builtin.available ? builtin : global;
  const activity =
    input.activity ??
    buildPiSdkActivity({ agentBusy: false, parkedBusyCount: 0, terminalLive: false });

  const latest = input.latestVersion?.trim();
  const globalUpdateAvailable = Boolean(
    latest && global.available && global.version && isSemverNewer(latest, global.version),
  );
  const builtinBehindLatest = Boolean(
    latest && builtin.available && builtin.version && isSemverNewer(latest, builtin.version),
  );

  return {
    activeSource: preference.source,
    appliedSource,
    needsRestart:
      preference.source !== appliedSource && (preference.source !== "global" || global.available),
    ...(effective.version ? { activeVersion: effective.version } : {}),
    candidates: [toCandidate(builtin), toCandidate(global)],
    agentDir,
    activity,
    ...(latest ? { latestVersion: latest } : {}),
    ...(input.latestCheckedAt ? { latestCheckedAt: input.latestCheckedAt } : {}),
    ...(input.latestError ? { latestError: input.latestError } : {}),
    ...(globalUpdateAvailable ? { globalUpdateAvailable: true } : {}),
    ...(builtinBehindLatest ? { builtinBehindLatest: true } : {}),
  };
}

/** Env vars injected into Agent Host / child processes for SDK selection. */
export function piSdkSpawnEnv(
  preference: PiSdkPrefs,
  builtin: ResolvedPiSdk,
  global: ResolvedPiSdk,
): Record<string, string> {
  const useGlobal = preference.source === "global" && global.available && global.packageRoot;
  if (useGlobal && global.packageRoot) {
    return {
      [ZENO_PI_SDK_SOURCE_ENV]: "global",
      [ZENO_PI_SDK_ROOT_ENV]: global.packageRoot,
    };
  }
  const out: Record<string, string> = {
    [ZENO_PI_SDK_SOURCE_ENV]: "builtin",
  };
  if (builtin.packageRoot) out[ZENO_PI_SDK_ROOT_ENV] = builtin.packageRoot;
  return out;
}

/**
 * Resolve which CLI path the terminal / ensurePi path should use.
 */
export async function resolveActiveCliPath(
  preference: PiSdkPrefs,
  options: {
    builtin: ResolvedPiSdk;
    env?: NodeJS.ProcessEnv;
  },
): Promise<{ path?: string; source: PiSdkSource; version?: string; error?: string }> {
  if (preference.source === "global") {
    const global = await resolveGlobalSdk(options.env);
    if (global.cliPath) {
      return {
        path: global.cliPath,
        source: "global",
        ...(global.version ? { version: global.version } : {}),
      };
    }
    return {
      source: "global",
      error: global.error ?? "Global pi CLI not found",
    };
  }
  if (options.builtin.cliPath) {
    return {
      path: options.builtin.cliPath,
      source: "builtin",
      ...(options.builtin.version ? { version: options.builtin.version } : {}),
    };
  }
  return {
    source: "builtin",
    error: options.builtin.error ?? "Builtin pi CLI entry not found",
  };
}
