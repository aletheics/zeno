/**
 * WorkBuddy-style managed runtimes:
 * - Ship compressed archives in app Resources/runtimes/archives
 * - First launch extract into userData/runtimes/{version}/
 * - Isolate npm prefix + Python venv so agent packages never touch the host
 *
 * Dev: expanded apps/desktop/runtimes/current/{node,python} is used when present
 * (no extract) so `pnpm runtimes:fetch` stays zero-friction.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type BundledRuntimeManifest,
  type BundledRuntimeRoots,
  getBundledNodeExecutable,
  getBundledPythonExecutable,
  rootsFromRuntimeRoot,
} from "./bundled-runtimes.ts";

export type VendorRuntimeLayout = {
  /** Resources/runtimes or apps/desktop/runtimes/current */
  vendorRoot: string;
  /** Expanded node/python ready to use (dev). */
  expanded?: BundledRuntimeRoots;
  /** Packaged archives to extract into userData. */
  archives?: {
    node?: string;
    python?: string;
    manifest: BundledRuntimeManifest;
  };
};

export type ProvisionedRuntimeLayout = {
  roots: BundledRuntimeRoots;
  /** Absolute npm prefix for agent/global-style installs. */
  npmPrefix: string;
  /** Absolute Python venv root (bin/python inside). */
  pythonVenv: string;
  /** True when roots came from userData extract (not dev expanded tree). */
  provisioned: boolean;
  source: "userData" | "vendor-expanded";
};

export type ProvisionStamp = {
  node?: string;
  python?: string;
  pythonReleaseTag?: string;
  key?: string;
  provisionedAt: string;
};

const STAMP_NAME = ".provisioned.json";

/**
 * Locate vendor runtimes: packaged archives and/or expanded dev tree.
 */
export function resolveVendorRuntimeLayout(options: {
  resourcesPath?: string;
  mainModuleUrl?: string;
  /** Test override. */
  explicitVendorRoot?: string;
}): VendorRuntimeLayout | undefined {
  const candidates: string[] = [];
  if (options.explicitVendorRoot?.trim()) {
    candidates.push(options.explicitVendorRoot.trim());
  }
  if (options.resourcesPath?.trim()) {
    candidates.push(join(options.resourcesPath.trim(), "runtimes"));
  }
  if (options.mainModuleUrl) {
    try {
      const mainDir = dirname(fileURLToPath(options.mainModuleUrl));
      candidates.push(join(mainDir, "..", "..", "runtimes", "current"));
      candidates.push(join(mainDir, "..", "runtimes", "current"));
    } catch {
      // ignore
    }
  }
  candidates.push(join(process.cwd(), "runtimes", "current"));
  candidates.push(join(process.cwd(), "apps", "desktop", "runtimes", "current"));

  for (const vendorRoot of candidates) {
    if (!vendorRoot || !existsSync(vendorRoot)) continue;
    const expanded = rootsFromRuntimeRoot(vendorRoot);
    const archivesDir = join(vendorRoot, "archives");
    const manifestPath = join(vendorRoot, "manifest.json");
    const nodeArchive = join(archivesDir, "node.tar.gz");
    const pythonArchive = join(archivesDir, "python.tar.gz");
    const hasArchives =
      existsSync(archivesDir) && (existsSync(nodeArchive) || existsSync(pythonArchive));
    const manifest = readManifestFile(manifestPath);

    if (!expanded && !hasArchives) continue;

    return {
      vendorRoot,
      ...(expanded ? { expanded } : {}),
      ...(hasArchives
        ? {
            archives: {
              ...(existsSync(nodeArchive) ? { node: nodeArchive } : {}),
              ...(existsSync(pythonArchive) ? { python: pythonArchive } : {}),
              manifest: manifest ?? {},
            },
          }
        : {}),
    };
  }
  return undefined;
}

function readManifestFile(path: string): BundledRuntimeManifest | undefined {
  try {
    if (!existsSync(path)) return undefined;
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed as BundledRuntimeManifest;
  } catch {
    return undefined;
  }
}

export function userRuntimesRoot(userDataPath: string): string {
  return join(userDataPath, "runtimes");
}

export function provisionStampPath(userDataPath: string): string {
  return join(userRuntimesRoot(userDataPath), STAMP_NAME);
}

export function npmPrefixDir(userDataPath: string): string {
  return join(userRuntimesRoot(userDataPath), "npm-prefix");
}

export function pythonVenvDir(userDataPath: string): string {
  return join(userRuntimesRoot(userDataPath), "python-venv");
}

/**
 * Whether userData extract matches vendor versions and binaries still exist.
 */
export function isProvisionStampCurrent(
  stamp: ProvisionStamp | undefined,
  vendor: VendorRuntimeLayout,
  userRoot: string,
): boolean {
  if (!stamp) return false;
  const roots = rootsFromRuntimeRoot(userRoot);
  if (!roots) return false;
  const manifest =
    vendor.archives?.manifest ??
    (vendor.expanded ? readManifestFile(vendor.expanded.manifestPath) : undefined);
  const expectedNode = manifest?.node;
  const expectedPython = manifest?.python;
  if (expectedNode && stamp.node !== expectedNode) return false;
  if (expectedPython && stamp.python !== expectedPython) return false;
  const nodeOk = !expectedNode || Boolean(getBundledNodeExecutable(roots.nodeRoot));
  const pyOk = !expectedPython || Boolean(getBundledPythonExecutable(roots.pythonRoot));
  return nodeOk && pyOk;
}

export function readProvisionStamp(userDataPath: string): ProvisionStamp | undefined {
  try {
    const path = provisionStampPath(userDataPath);
    if (!existsSync(path)) return undefined;
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed as ProvisionStamp;
  } catch {
    return undefined;
  }
}

/**
 * Git's GNU `tar` treats `C:\` as a remote host. Prefer Windows bsdtar,
 * which accepts native drive-letter paths.
 */
export function resolveTarBinary(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (platform !== "win32") return "tar";
  const root = env.SystemRoot || env.SYSTEMROOT || "C:\\Windows";
  const systemTar = join(root, "System32", "tar.exe");
  if (existsSync(systemTar)) return systemTar;
  return "tar";
}

function runTar(args: string[]): void {
  execFileSync(resolveTarBinary(), args, { stdio: "ignore" });
}

/**
 * Extract tar.gz archives into destRoot (creates destRoot/node, destRoot/python).
 * Uses system `tar` (macOS/Linux/modern Windows).
 */
export function extractRuntimeArchives(
  archives: { node?: string; python?: string },
  destRoot: string,
): void {
  mkdirSync(destRoot, { recursive: true });
  if (archives.node) {
    const nodeDest = join(destRoot, "node");
    rmSync(nodeDest, { recursive: true, force: true });
    runTar(["-xzf", archives.node, "-C", destRoot]);
  }
  if (archives.python) {
    const pyDest = join(destRoot, "python");
    rmSync(pyDest, { recursive: true, force: true });
    runTar(["-xzf", archives.python, "-C", destRoot]);
  }
}

/**
 * Create npm prefix dir + Python venv (best-effort; never throws to caller of bootstrap).
 */
export function ensureIsolationDirs(options: {
  userDataPath: string;
  pythonBinary?: string | undefined;
}): { npmPrefix: string; pythonVenv: string } {
  const npmPrefix = npmPrefixDir(options.userDataPath);
  const pythonVenv = pythonVenvDir(options.userDataPath);
  mkdirSync(join(npmPrefix, "bin"), { recursive: true });
  mkdirSync(join(npmPrefix, "lib"), { recursive: true });

  // venv layout: venv/bin/python3 — same shape as a python install root.
  const venvHasPython =
    existsSync(join(pythonVenv, "bin", "python3")) ||
    existsSync(join(pythonVenv, "bin", "python")) ||
    existsSync(join(pythonVenv, "Scripts", "python.exe")) ||
    existsSync(join(pythonVenv, "Scripts", "python3.exe"));

  const pyBin = options.pythonBinary;
  if (!venvHasPython && pyBin && existsSync(pyBin)) {
    try {
      rmSync(pythonVenv, { recursive: true, force: true });
      execFileSync(pyBin, ["-m", "venv", pythonVenv], {
        stdio: "ignore",
        timeout: 120_000,
      });
    } catch (error) {
      console.warn("[zeno] python venv create failed:", error);
    }
  }

  return { npmPrefix, pythonVenv };
}

function isolationDirsForPythonRoot(
  userDataPath: string,
  skipVenv: boolean | undefined,
  pythonRoot: string,
): { npmPrefix: string; pythonVenv: string } {
  if (skipVenv) {
    return ensureIsolationDirs({ userDataPath });
  }
  const pythonBinary = getBundledPythonExecutable(pythonRoot);
  if (pythonBinary) {
    return ensureIsolationDirs({ userDataPath, pythonBinary });
  }
  return ensureIsolationDirs({ userDataPath });
}

/**
 * Env vars that keep npm/pip installs inside userData isolation trees.
 */
export function buildRuntimeIsolationEnv(layout: ProvisionedRuntimeLayout): Record<string, string> {
  const env: Record<string, string> = {};
  env.NPM_CONFIG_PREFIX = layout.npmPrefix;
  env.npm_config_prefix = layout.npmPrefix;
  // Prefer venv when present
  const venvPy =
    getBundledPythonExecutable(layout.pythonVenv) ||
    (existsSync(join(layout.pythonVenv, "bin", "python3"))
      ? join(layout.pythonVenv, "bin", "python3")
      : existsSync(join(layout.pythonVenv, "Scripts", "python.exe"))
        ? join(layout.pythonVenv, "Scripts", "python.exe")
        : undefined);
  if (venvPy) {
    env.VIRTUAL_ENV = layout.pythonVenv;
    env.PIP_DISABLE_PIP_VERSION_CHECK = "1";
  }
  return env;
}

/** Extra PATH dirs for isolation (npm-prefix bin, venv bin) — before interpreter bins. */
export function isolationBinDirs(layout: ProvisionedRuntimeLayout): string[] {
  const dirs: string[] = [];
  const npmBin = join(layout.npmPrefix, process.platform === "win32" ? "" : "bin");
  const npmBinWin = join(layout.npmPrefix);
  if (process.platform === "win32") {
    if (existsSync(npmBinWin)) dirs.push(npmBinWin);
  } else if (existsSync(npmBin)) {
    dirs.push(npmBin);
  }
  const venvBin =
    process.platform === "win32"
      ? join(layout.pythonVenv, "Scripts")
      : join(layout.pythonVenv, "bin");
  if (existsSync(venvBin)) dirs.push(venvBin);
  return dirs;
}

/**
 * Resolve active runtime roots: prefer provisioned userData; else extract archives;
 * else use expanded vendor (dev).
 */
export function ensureProvisionedRuntimes(options: {
  userDataPath: string;
  resourcesPath?: string;
  mainModuleUrl?: string;
  explicitVendorRoot?: string;
  /** Skip venv creation (tests). */
  skipVenv?: boolean;
}): ProvisionedRuntimeLayout | undefined {
  const vendorOpts: {
    resourcesPath?: string;
    mainModuleUrl?: string;
    explicitVendorRoot?: string;
  } = {};
  if (options.resourcesPath) vendorOpts.resourcesPath = options.resourcesPath;
  if (options.mainModuleUrl) vendorOpts.mainModuleUrl = options.mainModuleUrl;
  if (options.explicitVendorRoot) vendorOpts.explicitVendorRoot = options.explicitVendorRoot;
  const vendor = resolveVendorRuntimeLayout(vendorOpts);
  if (!vendor) return undefined;

  const userRoot = userRuntimesRoot(options.userDataPath);
  const stamp = readProvisionStamp(options.userDataPath);

  // Fast path: already provisioned at matching versions
  if (vendor.archives && isProvisionStampCurrent(stamp, vendor, userRoot)) {
    const roots = rootsFromRuntimeRoot(userRoot);
    if (roots) {
      const iso = isolationDirsForPythonRoot(
        options.userDataPath,
        options.skipVenv,
        roots.pythonRoot,
      );
      return {
        roots,
        npmPrefix: iso.npmPrefix,
        pythonVenv: iso.pythonVenv,
        provisioned: true,
        source: "userData",
      };
    }
  }

  // Packaged: extract archives into userData
  if (vendor.archives && (vendor.archives.node || vendor.archives.python)) {
    try {
      mkdirSync(userRoot, { recursive: true });
      extractRuntimeArchives(
        {
          ...(vendor.archives.node ? { node: vendor.archives.node } : {}),
          ...(vendor.archives.python ? { python: vendor.archives.python } : {}),
        },
        userRoot,
      );
      // Copy vendor manifest into user tree for status UI
      const manSrc = join(vendor.vendorRoot, "manifest.json");
      if (existsSync(manSrc)) {
        writeFileSync(join(userRoot, "manifest.json"), readFileSync(manSrc));
      } else if (vendor.archives.manifest) {
        writeFileSync(
          join(userRoot, "manifest.json"),
          `${JSON.stringify(vendor.archives.manifest, null, 2)}\n`,
        );
      }

      const roots = rootsFromRuntimeRoot(userRoot);
      if (!roots) {
        console.warn("[zeno] runtime extract finished but binaries missing");
      } else {
        const iso = isolationDirsForPythonRoot(
          options.userDataPath,
          options.skipVenv,
          roots.pythonRoot,
        );
        const nextStamp: ProvisionStamp = {
          provisionedAt: new Date().toISOString(),
          ...(vendor.archives.manifest.node ? { node: vendor.archives.manifest.node } : {}),
          ...(vendor.archives.manifest.python ? { python: vendor.archives.manifest.python } : {}),
          ...(vendor.archives.manifest.pythonReleaseTag
            ? { pythonReleaseTag: vendor.archives.manifest.pythonReleaseTag }
            : {}),
          ...(vendor.archives.manifest.key ? { key: vendor.archives.manifest.key } : {}),
        };
        writeFileSync(
          provisionStampPath(options.userDataPath),
          `${JSON.stringify(nextStamp, null, 2)}\n`,
        );
        console.log("[zeno] provisioned managed runtimes into", userRoot);
        return {
          roots,
          npmPrefix: iso.npmPrefix,
          pythonVenv: iso.pythonVenv,
          provisioned: true,
          source: "userData",
        };
      }
    } catch (error) {
      console.warn("[zeno] runtime archive extract failed:", error);
      // fall through to expanded vendor
    }
  }

  // Dev / fallback: use expanded vendor tree in-place
  if (vendor.expanded) {
    const iso = isolationDirsForPythonRoot(
      options.userDataPath,
      options.skipVenv,
      vendor.expanded.pythonRoot,
    );
    return {
      roots: vendor.expanded,
      npmPrefix: iso.npmPrefix,
      pythonVenv: iso.pythonVenv,
      provisioned: false,
      source: "vendor-expanded",
    };
  }

  return undefined;
}

/** List archive files under a vendor root (for diagnostics/tests). */
export function listVendorArchiveNames(vendorRoot: string): string[] {
  const dir = join(vendorRoot, "archives");
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir).filter((n) => n.endsWith(".tar.gz") || n.endsWith(".zip"));
  } catch {
    return [];
  }
}
