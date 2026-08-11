import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { configureBundledRuntimes, resolveBundledRuntimeRoots } from "./bundled-runtimes.ts";
import { buildPiTuiEnv, defaultPiAgentDir, PI_CODING_AGENT_DIR_ENV } from "./pi-tui-env.ts";

afterEach(() => {
  configureBundledRuntimes({
    roots: undefined,
    prefs: { useBundledNode: true, useBundledPython: true },
  });
});

describe("pi-tui-env", () => {
  it("pins PI_CODING_AGENT_DIR so managed fd/rg share one bin dir", () => {
    const env = buildPiTuiEnv({
      USERPROFILE: "C:\\Users\\test",
      HOME: "C:\\Users\\test",
      PATH: "C:\\Windows\\System32",
    });
    const agentDir = env[PI_CODING_AGENT_DIR_ENV];
    expect(agentDir).toBeDefined();
    expect(agentDir).toBe(defaultPiAgentDir({ USERPROFILE: "C:\\Users\\test" }));
    expect(String(agentDir).replace(/\\/g, "/")).toMatch(/\.pi\/agent$/);
    const path = env.Path || env.PATH || "";
    expect(path.toLowerCase().replace(/\\/g, "/")).toContain(".pi/agent/bin");
    expect(env.PI_HARDWARE_CURSOR).toBe("1");
  });

  it("respects an existing PI_CODING_AGENT_DIR", () => {
    const env = buildPiTuiEnv({
      [PI_CODING_AGENT_DIR_ENV]: "D:/custom/agent",
      PATH: "/usr/bin",
      HOME: "/home/u",
    });
    expect(String(env[PI_CODING_AGENT_DIR_ENV] ?? "").replace(/\\/g, "/")).toBe("D:/custom/agent");
  });

  it("augments GUI-minimal PATH so node/pi bins remain reachable", () => {
    const env = buildPiTuiEnv({
      HOME: process.env.HOME || process.env.USERPROFILE || "/tmp",
      PATH: "/usr/bin:/bin",
    });
    const path = env.PATH || "";
    // Original entries preserved
    expect(path.includes("/usr/bin")).toBe(true);
    // Managed bin always first-ish
    expect(path.replace(/\\/g, "/")).toMatch(/\.pi\/agent\/bin/);
  });

  it("sets NODE_BINARY and prepends bundled node bin when runtimes are active", () => {
    const root = mkdtempSync(join(tmpdir(), "zeno-tui-bundled-"));
    const nodeBinDir = join(root, "node", "bin");
    mkdirSync(nodeBinDir, { recursive: true });
    const nodePath = join(nodeBinDir, process.platform === "win32" ? "node.exe" : "node");
    writeFileSync(nodePath, "#!/bin/sh\n", { mode: 0o755 });
    writeFileSync(join(root, "manifest.json"), JSON.stringify({ node: "22.19.0" }));

    configureBundledRuntimes({
      roots: resolveBundledRuntimeRoots({ explicitRoot: root }),
      prefs: { useBundledNode: true, useBundledPython: false },
    });

    const env = buildPiTuiEnv({
      HOME: process.env.HOME || tmpdir(),
      PATH: "/usr/bin:/bin",
    });
    expect(env.NODE_BINARY).toBe(nodePath);
    const path = env.PATH || env.Path || "";
    expect(path.includes(nodeBinDir)).toBe(true);
    // Managed agent bin still present
    expect(path.replace(/\\/g, "/")).toMatch(/\.pi\/agent\/bin/);
  });

  it("does not set NODE_BINARY when bundled node is disabled", () => {
    const root = mkdtempSync(join(tmpdir(), "zeno-tui-bundled-off-"));
    const nodeBinDir = join(root, "node", "bin");
    mkdirSync(nodeBinDir, { recursive: true });
    writeFileSync(join(nodeBinDir, "node"), "#!/bin/sh\n", { mode: 0o755 });

    configureBundledRuntimes({
      roots: resolveBundledRuntimeRoots({ explicitRoot: root }),
      prefs: { useBundledNode: false, useBundledPython: false },
    });

    const env = buildPiTuiEnv({
      HOME: process.env.HOME || tmpdir(),
      PATH: "/usr/bin",
    });
    expect(env.NODE_BINARY).toBeUndefined();
  });
});
