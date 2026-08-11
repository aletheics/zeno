import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  applyManagedRuntimeToProcessEnv,
  buildBundledRuntimeStatus,
  bundledBinDirs,
  configureBundledRuntimes,
  getActiveBundledBinDirs,
  getActiveBundledNodeExecutable,
  getActiveBundledRuntimePrefs,
  getActiveBundledRuntimeStatus,
  getActiveRuntimeIsolationEnv,
  getBundledNodeExecutable,
  getBundledPythonExecutable,
  isolationEnvForPrefs,
  normalizeBundledRuntimePrefs,
  resetManagedPathBaseForTests,
  resolveBundledRuntimeRoots,
} from "./bundled-runtimes.ts";

afterEach(() => {
  // Reset process-wide active config between tests.
  configureBundledRuntimes({
    roots: undefined,
    prefs: { useBundledNode: true, useBundledPython: true },
  });
  resetManagedPathBaseForTests(undefined);
});

function makeRuntimeTree(): {
  root: string;
  nodePath: string;
  pyPath: string;
  nodeBinDir: string;
  pyBinDir: string;
} {
  const root = mkdtempSync(join(tmpdir(), "pix-bundled-rt-"));
  const nodeBinDir = join(root, "node", "bin");
  const pyBinDir = join(root, "python", "bin");
  mkdirSync(nodeBinDir, { recursive: true });
  mkdirSync(pyBinDir, { recursive: true });
  const nodePath = join(nodeBinDir, process.platform === "win32" ? "node.exe" : "node");
  const pyPath = join(pyBinDir, process.platform === "win32" ? "python.exe" : "python3");
  writeFileSync(nodePath, "#!/bin/sh\n", { mode: 0o755 });
  writeFileSync(pyPath, "#!/bin/sh\n", { mode: 0o755 });
  writeFileSync(
    join(root, "manifest.json"),
    JSON.stringify({ node: "22.19.0", python: "3.12.13", platform: "test", arch: "x64" }),
  );
  return { root, nodePath, pyPath, nodeBinDir, pyBinDir };
}

describe("normalizeBundledRuntimePrefs", () => {
  it("defaults both to true when missing", () => {
    expect(normalizeBundledRuntimePrefs(undefined)).toEqual({
      useBundledNode: true,
      useBundledPython: true,
    });
    expect(normalizeBundledRuntimePrefs({})).toEqual({
      useBundledNode: true,
      useBundledPython: true,
    });
    expect(normalizeBundledRuntimePrefs(null)).toEqual({
      useBundledNode: true,
      useBundledPython: true,
    });
  });

  it("honors explicit false", () => {
    expect(normalizeBundledRuntimePrefs({ useBundledNode: false, useBundledPython: true })).toEqual(
      { useBundledNode: false, useBundledPython: true },
    );
    expect(
      normalizeBundledRuntimePrefs({ useBundledNode: false, useBundledPython: false }),
    ).toEqual({ useBundledNode: false, useBundledPython: false });
  });
});

describe("bundled runtime path helpers", () => {
  it("finds node/python binaries and bin dirs by prefs", () => {
    const { root, nodePath, pyPath, nodeBinDir, pyBinDir } = makeRuntimeTree();

    const roots = resolveBundledRuntimeRoots({ explicitRoot: root });
    expect(roots?.root).toBe(root);
    expect(getBundledNodeExecutable(roots?.nodeRoot)).toBe(nodePath);
    expect(getBundledPythonExecutable(roots?.pythonRoot)).toBe(pyPath);

    expect(bundledBinDirs(roots, { useBundledNode: true, useBundledPython: true })).toEqual([
      nodeBinDir,
      pyBinDir,
    ]);
    expect(bundledBinDirs(roots, { useBundledNode: false, useBundledPython: true })).toEqual([
      pyBinDir,
    ]);
    expect(bundledBinDirs(roots, { useBundledNode: false, useBundledPython: false })).toEqual([]);

    const status = buildBundledRuntimeStatus({
      roots,
      prefs: { useBundledNode: true, useBundledPython: true },
    });
    expect(status.available).toBe(true);
    expect(status.node?.version).toBe("22.19.0");
    expect(status.node?.path).toBe(nodePath);
    expect(status.python?.path).toBe(pyPath);
    expect(status.node?.enabled).toBe(true);
    expect(status.python?.enabled).toBe(true);
  });

  it("returns undefined roots when neither node nor python dir exists", () => {
    const root = mkdtempSync(join(tmpdir(), "pix-bundled-empty-"));
    expect(resolveBundledRuntimeRoots({ explicitRoot: root })).toBeUndefined();
  });

  it("accepts node-only layout", () => {
    const root = mkdtempSync(join(tmpdir(), "pix-bundled-node-only-"));
    const nodeBinDir = join(root, "node", "bin");
    mkdirSync(nodeBinDir, { recursive: true });
    const nodePath = join(nodeBinDir, process.platform === "win32" ? "node.exe" : "node");
    writeFileSync(nodePath, "#!/bin/sh\n", { mode: 0o755 });

    const roots = resolveBundledRuntimeRoots({ explicitRoot: root });
    expect(roots).toBeDefined();
    expect(getBundledNodeExecutable(roots?.nodeRoot)).toBe(nodePath);
    expect(getBundledPythonExecutable(roots?.pythonRoot)).toBeUndefined();
    expect(bundledBinDirs(roots, { useBundledNode: true, useBundledPython: true })).toEqual([
      nodeBinDir,
    ]);
  });
});

describe("configureBundledRuntimes process-wide active config", () => {
  it("exposes active bin dirs and node when enabled", () => {
    const { root, nodePath, nodeBinDir, pyBinDir } = makeRuntimeTree();
    const roots = resolveBundledRuntimeRoots({ explicitRoot: root });
    configureBundledRuntimes({
      roots,
      prefs: { useBundledNode: true, useBundledPython: true },
    });

    expect(getActiveBundledRuntimePrefs()).toEqual({
      useBundledNode: true,
      useBundledPython: true,
    });
    expect(getActiveBundledNodeExecutable()).toBe(nodePath);
    expect(getActiveBundledBinDirs()).toEqual([nodeBinDir, pyBinDir]);

    const status = getActiveBundledRuntimeStatus();
    expect(status.available).toBe(true);
    expect(status.node?.path).toBe(nodePath);
  });

  it("hides node executable when useBundledNode is false", () => {
    const { root, pyBinDir } = makeRuntimeTree();
    const roots = resolveBundledRuntimeRoots({ explicitRoot: root });
    configureBundledRuntimes({
      roots,
      prefs: { useBundledNode: false, useBundledPython: true },
    });

    expect(getActiveBundledNodeExecutable()).toBeUndefined();
    expect(getActiveBundledBinDirs()).toEqual([pyBinDir]);
    expect(getActiveBundledRuntimeStatus().node?.enabled).toBe(false);
  });

  it("clears roots when configure passes roots: undefined", () => {
    const { root } = makeRuntimeTree();
    configureBundledRuntimes({
      roots: resolveBundledRuntimeRoots({ explicitRoot: root }),
      prefs: { useBundledNode: true, useBundledPython: true },
    });
    expect(getActiveBundledBinDirs().length).toBeGreaterThan(0);

    configureBundledRuntimes({ roots: undefined });
    expect(getActiveBundledBinDirs()).toEqual([]);
    expect(getActiveBundledNodeExecutable()).toBeUndefined();
  });
});

describe("prefs gate isolation env and process apply", () => {
  it("isolationEnvForPrefs only includes keys for enabled runtimes", () => {
    const isolation = {
      npmPrefix: "/tmp/pix-npm-prefix",
      pythonVenv: "/tmp/pix-py-venv",
    };
    expect(
      isolationEnvForPrefs(isolation, { useBundledNode: true, useBundledPython: false }),
    ).toEqual({
      NPM_CONFIG_PREFIX: "/tmp/pix-npm-prefix",
      npm_config_prefix: "/tmp/pix-npm-prefix",
    });
    expect(
      isolationEnvForPrefs(isolation, { useBundledNode: false, useBundledPython: false }),
    ).toEqual({});
  });

  it("applyManagedRuntimeToProcessEnv clears isolation when both off", () => {
    const { root, nodePath, nodeBinDir } = makeRuntimeTree();
    const npmPrefix = join(root, "npm-prefix");
    const pythonVenv = join(root, "python-venv");
    mkdirSync(join(npmPrefix, "bin"), { recursive: true });
    mkdirSync(join(pythonVenv, "bin"), { recursive: true });
    writeFileSync(join(pythonVenv, "bin", "python3"), "#!/bin/sh\n", { mode: 0o755 });

    resetManagedPathBaseForTests("/usr/bin:/bin");
    configureBundledRuntimes({
      roots: resolveBundledRuntimeRoots({ explicitRoot: root }),
      prefs: { useBundledNode: true, useBundledPython: true },
      isolation: { npmPrefix, pythonVenv, source: "userData" },
    });

    const env: NodeJS.ProcessEnv = {
      PATH: "/usr/bin:/bin",
      HOME: process.env.HOME || tmpdir(),
    };
    applyManagedRuntimeToProcessEnv(env);
    expect(env.NODE_BINARY).toBe(nodePath);
    expect(env.NPM_CONFIG_PREFIX).toBe(npmPrefix);
    expect(env.VIRTUAL_ENV).toBe(pythonVenv);
    expect(env.PATH).toContain(nodeBinDir);
    expect(env.PATH).toContain(join(npmPrefix, "bin"));

    // Toggle both OFF — rebuild from base, strip isolation.
    configureBundledRuntimes({
      prefs: { useBundledNode: false, useBundledPython: false },
    });
    applyManagedRuntimeToProcessEnv(env);
    expect(env.NODE_BINARY).toBeUndefined();
    expect(env.NPM_CONFIG_PREFIX).toBeUndefined();
    expect(env.VIRTUAL_ENV).toBeUndefined();
    expect(env.PATH).not.toContain(nodeBinDir);
    expect(env.PATH).not.toContain(join(npmPrefix, "bin"));
    expect(env.PATH).toContain("/usr/bin");
    expect(getActiveRuntimeIsolationEnv()).toEqual({});
  });
});
