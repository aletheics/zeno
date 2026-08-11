/**
 * Bundled / managed Node.js + Python.
 *
 * - Packaged: compressed archives under Resources/runtimes/archives → first
 *   launch extracts into userData/runtimes (WorkBuddy-style).
 * - Dev: expanded apps/desktop/runtimes/current after fetch-runtimes.
 *
 * Default: enabled. When on, bin dirs + isolation env are applied so terminal
 * mode and agent tools do not depend on a system install.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { augmentEnvPath } from "./shell-path.ts";

export type BundledRuntimePrefs = {
  /** Prefer bundled Node for PATH + pi TUI spawn. Default true. */
  useBundledNode: boolean;
  /** Prefer bundled Python on PATH. Default true. */
  useBundledPython: boolean;
};

export type BundledRuntimeManifest = {
  node?: string;
  python?: string;
  pythonReleaseTag?: string;
  platform?: string;
  arch?: string;
  key?: string;
  pruned?: boolean;
};

export type BundledRuntimeRoots = {
  /** …/runtimes */
  root: string;
  nodeRoot: string;
  pythonRoot: string;
  manifestPath: string;
};

export type BundledRuntimeStatus = {
  prefs: BundledRuntimePrefs;
  available: boolean;
  root?: string;
  /** userData | vendor-expanded | none */
  source?: string;
  npmPrefix?: string;
  pythonVenv?: string;
  node?: {
    version?: string;
    path?: string;
    enabled: boolean;
  };
  python?: {
    version?: string;
    path?: string;
    enabled: boolean;
  };
  manifest?: BundledRuntimeManifest;
};

const DEFAULT_PREFS: BundledRuntimePrefs = {
  useBundledNode: true,
  useBundledPython: true,
};

/** Normalize partial prefs; missing keys default to ON. */
export function normalizeBundledRuntimePrefs(raw: unknown): BundledRuntimePrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_PREFS };
  }
  const o = raw as Record<string, unknown>;
  return {
    useBundledNode: o.useBundledNode === undefined ? true : Boolean(o.useBundledNode),
    useBundledPython: o.useBundledPython === undefined ? true : Boolean(o.useBundledPython),
  };
}

/**
 * Candidate roots for bundled runtimes (first existing wins).
 * Packaged: process.resourcesPath/runtimes
 * Dev: apps/desktop/runtimes/current (after fetch)
 */
export function resolveBundledRuntimeRoots(options: {
  resourcesPath?: string;
  isPackaged?: boolean;
  /** Override for tests. */
  explicitRoot?: string;
  /** Dev monorepo: directory of this module file or desktop package. */
  mainModuleUrl?: string;
}): BundledRuntimeRoots | undefined {
  if (options.explicitRoot?.trim()) {
    return rootsFromRuntimeRoot(options.explicitRoot.trim());
  }

  const candidates: string[] = [];
  if (options.resourcesPath?.trim()) {
    candidates.push(join(options.resourcesPath.trim(), "runtimes"));
  }
  // Dev / unpackaged: apps/desktop/runtimes/current next to package.
  if (options.mainModuleUrl) {
    try {
      const mainDir = dirname(fileURLToPath(options.mainModuleUrl));
      // dist/main → apps/desktop
      candidates.push(join(mainDir, "..", "..", "runtimes", "current"));
      candidates.push(join(mainDir, "..", "runtimes", "current"));
    } catch {
      // ignore
    }
  }
  // CWD fallback when running tests from apps/desktop
  candidates.push(join(process.cwd(), "runtimes", "current"));
  candidates.push(join(process.cwd(), "apps", "desktop", "runtimes", "current"));

  for (const root of candidates) {
    const hit = rootsFromRuntimeRoot(root);
    if (hit) return hit;
  }
  return undefined;
}

/** Build roots if node/ and/or python/ exist under root. */
export function rootsFromRuntimeRoot(root: string): BundledRuntimeRoots | undefined {
  if (!root || !existsSync(root)) return undefined;
  const nodeRoot = join(root, "node");
  const pythonRoot = join(root, "python");
  // Accept either runtime present (partial installs still useful).
  if (!existsSync(nodeRoot) && !existsSync(pythonRoot)) return undefined;
  return {
    root,
    nodeRoot,
    pythonRoot,
    manifestPath: join(root, "manifest.json"),
  };
}

export function readBundledRuntimeManifest(
  roots: BundledRuntimeRoots | undefined,
): BundledRuntimeManifest | undefined {
  if (!roots) return undefined;
  try {
    if (!existsSync(roots.manifestPath)) return undefined;
    const parsed: unknown = JSON.parse(readFileSync(roots.manifestPath, "utf8"));
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed as BundledRuntimeManifest;
  } catch {
    return undefined;
  }
}

export function getBundledNodeExecutable(nodeRoot: string | undefined): string | undefined {
  if (!nodeRoot || !existsSync(nodeRoot)) return undefined;
  const candidates =
    process.platform === "win32"
      ? [
          join(nodeRoot, "node.exe"),
          join(nodeRoot, "bin", "node.exe"),
          join(nodeRoot, "bin", "node"),
        ]
      : [join(nodeRoot, "bin", "node"), join(nodeRoot, "node")];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return undefined;
}

export function getBundledPythonExecutable(pythonRoot: string | undefined): string | undefined {
  if (!pythonRoot || !existsSync(pythonRoot)) return undefined;
  const candidates =
    process.platform === "win32"
      ? [
          join(pythonRoot, "python.exe"),
          join(pythonRoot, "bin", "python.exe"),
          join(pythonRoot, "python", "python.exe"),
        ]
      : [
          join(pythonRoot, "bin", "python3"),
          join(pythonRoot, "bin", "python"),
          join(pythonRoot, "python3"),
          join(pythonRoot, "python"),
        ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return undefined;
}

/** Bin directories to prepend when the corresponding runtime is enabled and present. */
export function bundledBinDirs(
  roots: BundledRuntimeRoots | undefined,
  prefs: BundledRuntimePrefs,
): string[] {
  if (!roots) return [];
  const dirs: string[] = [];
  if (prefs.useBundledNode) {
    const nodeBin = getBundledNodeExecutable(roots.nodeRoot);
    if (nodeBin) dirs.push(dirname(nodeBin));
  }
  if (prefs.useBundledPython) {
    const pyBin = getBundledPythonExecutable(roots.pythonRoot);
    if (pyBin) dirs.push(dirname(pyBin));
  }
  // Dedupe while preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of dirs) {
    const key = process.platform === "win32" ? d.toLowerCase() : d;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

export function buildBundledRuntimeStatus(options: {
  roots: BundledRuntimeRoots | undefined;
  prefs: BundledRuntimePrefs;
}): BundledRuntimeStatus {
  const { roots, prefs } = options;
  const manifest = readBundledRuntimeManifest(roots);
  const nodePath = getBundledNodeExecutable(roots?.nodeRoot);
  const pythonPath = getBundledPythonExecutable(roots?.pythonRoot);
  return {
    prefs,
    available: Boolean(nodePath || pythonPath),
    ...(roots ? { root: roots.root } : {}),
    node: {
      enabled: prefs.useBundledNode,
      ...(manifest?.node ? { version: manifest.node } : {}),
      ...(nodePath ? { path: nodePath } : {}),
    },
    python: {
      enabled: prefs.useBundledPython,
      ...(manifest?.python ? { version: manifest.python } : {}),
      ...(pythonPath ? { path: pythonPath } : {}),
    },
    ...(manifest ? { manifest } : {}),
  };
}

// ── Process-wide active config (main sets once; PATH / PTY read) ─────────────

let activeRoots: BundledRuntimeRoots | undefined;
let activePrefs: BundledRuntimePrefs = { ...DEFAULT_PREFS };
/** Full isolation layout (always kept once provisioned); prefs gate what is *active*. */
let activeIsolation: {
  npmPrefix?: string;
  pythonVenv?: string;
  source?: string;
} = {};
/**
 * PATH snapshot before any managed prepend. Toggle OFF rebuilds from this so
 * previously injected userData/runtimes bins do not stick around.
 */
let managedPathBase: string | undefined;

const ISOLATION_ENV_KEYS = [
  "NODE_BINARY",
  "NPM_CONFIG_PREFIX",
  "npm_config_prefix",
  "VIRTUAL_ENV",
  "PIP_DISABLE_PIP_VERSION_CHECK",
] as const;

/** Configure which bundled runtimes are active for PATH + TUI spawn. */
export function configureBundledRuntimes(options: {
  roots?: BundledRuntimeRoots | undefined;
  prefs?: BundledRuntimePrefs;
  isolation?: {
    npmPrefix?: string;
    pythonVenv?: string;
    source?: string;
    /** @deprecated ignored — bins derived from prefs + prefix/venv paths */
    binDirs?: string[];
    /** @deprecated ignored — env derived from prefs + prefix/venv paths */
    env?: Record<string, string>;
  };
}): void {
  // Allow explicit `roots: undefined` to clear (tests / disable).
  if ("roots" in options) activeRoots = options.roots;
  if (options.prefs) activePrefs = normalizeBundledRuntimePrefs(options.prefs);
  if (options.isolation) {
    activeIsolation = {
      ...(options.isolation.npmPrefix ? { npmPrefix: options.isolation.npmPrefix } : {}),
      ...(options.isolation.pythonVenv ? { pythonVenv: options.isolation.pythonVenv } : {}),
      ...(options.isolation.source ? { source: options.isolation.source } : {}),
    };
  } else if ("roots" in options && options.roots === undefined) {
    activeIsolation = {};
  }
}

export function getActiveBundledRuntimePrefs(): BundledRuntimePrefs {
  return { ...activePrefs };
}

export function getActiveBundledRuntimeRoots(): BundledRuntimeRoots | undefined {
  return activeRoots;
}

/** npm-prefix / venv bin dirs that are active under current prefs. */
export function isolationBinDirsForPrefs(
  isolation: { npmPrefix?: string; pythonVenv?: string },
  prefs: BundledRuntimePrefs,
): string[] {
  const dirs: string[] = [];
  if (prefs.useBundledNode && isolation.npmPrefix) {
    const npmBin =
      process.platform === "win32" ? isolation.npmPrefix : join(isolation.npmPrefix, "bin");
    if (existsSync(npmBin)) dirs.push(npmBin);
  }
  if (prefs.useBundledPython && isolation.pythonVenv) {
    const venvBin =
      process.platform === "win32"
        ? join(isolation.pythonVenv, "Scripts")
        : join(isolation.pythonVenv, "bin");
    if (existsSync(venvBin)) dirs.push(venvBin);
  }
  return dirs;
}

/** Isolation env gated by prefs (empty when both runtimes off). */
export function isolationEnvForPrefs(
  isolation: { npmPrefix?: string; pythonVenv?: string },
  prefs: BundledRuntimePrefs,
): Record<string, string> {
  const env: Record<string, string> = {};
  if (prefs.useBundledNode && isolation.npmPrefix) {
    env.NPM_CONFIG_PREFIX = isolation.npmPrefix;
    env.npm_config_prefix = isolation.npmPrefix;
  }
  if (prefs.useBundledPython && isolation.pythonVenv) {
    const venvPy =
      getBundledPythonExecutable(isolation.pythonVenv) ||
      (existsSync(join(isolation.pythonVenv, "bin", "python3"))
        ? join(isolation.pythonVenv, "bin", "python3")
        : existsSync(join(isolation.pythonVenv, "Scripts", "python.exe"))
          ? join(isolation.pythonVenv, "Scripts", "python.exe")
          : undefined);
    if (venvPy) {
      env.VIRTUAL_ENV = isolation.pythonVenv;
      env.PIP_DISABLE_PIP_VERSION_CHECK = "1";
    }
  }
  return env;
}

/** Bin dirs for currently enabled bundled runtimes (may be empty). */
export function getActiveBundledBinDirs(): string[] {
  const runtimeBins = bundledBinDirs(activeRoots, activePrefs);
  const isolationBins = isolationBinDirsForPrefs(activeIsolation, activePrefs);
  // Isolation bins (npm-prefix, venv) first so pip/npm install into managed trees.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of [...isolationBins, ...runtimeBins]) {
    const key = process.platform === "win32" ? d.toLowerCase() : d;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/** Absolute path to bundled node when enabled and present. */
export function getActiveBundledNodeExecutable(): string | undefined {
  if (!activePrefs.useBundledNode) return undefined;
  return getBundledNodeExecutable(activeRoots?.nodeRoot);
}

/** Isolation env (NPM_CONFIG_PREFIX, VIRTUAL_ENV, …) for *enabled* runtimes only. */
export function getActiveRuntimeIsolationEnv(): Record<string, string> {
  return isolationEnvForPrefs(activeIsolation, activePrefs);
}

export function getActiveBundledRuntimeStatus(): BundledRuntimeStatus {
  const base = buildBundledRuntimeStatus({ roots: activeRoots, prefs: activePrefs });
  return {
    ...base,
    ...(activeIsolation.source ? { source: activeIsolation.source } : {}),
    // Surface paths even when disabled so Settings can still show where they live.
    ...(activeIsolation.npmPrefix ? { npmPrefix: activeIsolation.npmPrefix } : {}),
    ...(activeIsolation.pythonVenv ? { pythonVenv: activeIsolation.pythonVenv } : {}),
  };
}

/**
 * Capture PATH before the first managed prepend (call once at bootstrap).
 * Later toggles rebuild PATH from this base so OFF fully drops managed bins.
 */
export function captureManagedPathBase(fromEnv: NodeJS.ProcessEnv = process.env): void {
  if (managedPathBase !== undefined) return;
  managedPathBase = fromEnv.PATH || fromEnv.Path || "";
}

/** Test helper: reset path base (and optionally set one). */
export function resetManagedPathBaseForTests(base?: string): void {
  managedPathBase = base;
}

export function getManagedPathBase(): string | undefined {
  return managedPathBase;
}

/**
 * Apply current prefs to `process.env`:
 * - rebuild PATH from pre-managed base + active managed bins (toggle OFF drops them)
 * - clear then set isolation keys / NODE_BINARY only for enabled runtimes
 *
 * Call on bootstrap and every settings toggle.
 */
export function applyManagedRuntimeToProcessEnv(env: NodeJS.ProcessEnv = process.env): void {
  captureManagedPathBase(env);

  // 1) Strip prior isolation / node keys so OFF leaves a clean host env.
  for (const key of ISOLATION_ENV_KEYS) {
    delete env[key];
  }

  // 2) Rebuild PATH from baseline + currently active managed bins only.
  const baseEnv: NodeJS.ProcessEnv = { ...env, PATH: managedPathBase ?? "" };
  if (process.platform === "win32") baseEnv.Path = managedPathBase ?? "";
  const next = augmentEnvPath(baseEnv, getActiveBundledBinDirs());
  if (next.PATH) env.PATH = next.PATH;
  if (process.platform === "win32" && next.Path) env.Path = next.Path;
  if (next.HOME && !env.HOME) env.HOME = next.HOME;
  if (process.platform === "win32" && next.USERPROFILE && !env.USERPROFILE) {
    env.USERPROFILE = next.USERPROFILE;
  }

  // 3) Isolation env for enabled prefs only.
  for (const [key, value] of Object.entries(getActiveRuntimeIsolationEnv())) {
    env[key] = value;
  }

  // 4) NODE_BINARY only when Node is enabled.
  const node = getActiveBundledNodeExecutable();
  if (node) env.NODE_BINARY = node;
}
