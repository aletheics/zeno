import { mkdirSync, mkdtempSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  buildPiSdkActivity,
  buildPiSdkStatus,
  clearLatestPiSdkVersionCache,
  fetchLatestPiSdkVersion,
  formatPiSdkBusyError,
  isSemverNewer,
  listPiConfigFiles,
  normalizePiSdkPrefs,
  normalizePiSdkSource,
  packageRootFromEntry,
  piSdkSpawnEnv,
  PI_SDK_BUSY_ERROR_PREFIX,
  resolveBuiltinSdk,
} from "./pi-sdk.ts";

// re-export helper for package meta via public resolveBuiltin on fixture
function writeFakePackage(root: string, version: string): void {
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "@earendil-works/pi-coding-agent",
      version,
      bin: { pi: "dist/cli.js" },
    }),
  );
  writeFileSync(join(root, "dist", "cli.js"), "#!/usr/bin/env node\nconsole.log('pi')\n");
  writeFileSync(join(root, "dist", "index.js"), "export {}\n");
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("normalizePiSdk", () => {
  it("defaults to builtin", () => {
    expect(normalizePiSdkSource("nope")).toBe("builtin");
    expect(normalizePiSdkPrefs(undefined)).toEqual({ source: "builtin" });
    expect(normalizePiSdkPrefs({ source: "global" })).toEqual({ source: "global" });
  });
});

describe("packageRootFromEntry", () => {
  it("walks up to package root", () => {
    const root = mkdtempSync(join(tmpdir(), "pix-pi-sdk-"));
    tempDirs.push(root);
    writeFakePackage(root, "1.2.3");
    expect(packageRootFromEntry(join(root, "dist", "cli.js"))).toBe(realpathSync(root));
  });
});

describe("resolveBuiltinSdk", () => {
  it("finds package under search roots", () => {
    const app = mkdtempSync(join(tmpdir(), "pix-pi-app-"));
    tempDirs.push(app);
    const pkg = join(app, "node_modules", "@earendil-works", "pi-coding-agent");
    writeFakePackage(pkg, "9.9.9");
    const resolved = resolveBuiltinSdk({ appPath: app });
    expect(resolved.available).toBe(true);
    expect(resolved.version).toBe("9.9.9");
    expect(resolved.cliPath).toContain("cli.js");
    expect(resolved.packageRoot).toContain("pi-coding-agent");
  });
});

describe("listPiConfigFiles", () => {
  it("reports existence and auth not openable", () => {
    const agentDir = mkdtempSync(join(tmpdir(), "pix-agent-"));
    tempDirs.push(agentDir);
    writeFileSync(join(agentDir, "settings.json"), "{}\n");
    writeFileSync(join(agentDir, "auth.json"), '{"x":1}\n');
    mkdirSync(join(agentDir, "sessions"));
    const list = listPiConfigFiles(agentDir);
    const settings = list.find((f) => f.id === "settings");
    const auth = list.find((f) => f.id === "auth");
    const sessions = list.find((f) => f.id === "sessions");
    expect(settings?.exists).toBe(true);
    expect(settings?.openable).toBe(true);
    expect(auth?.exists).toBe(true);
    expect(auth?.openable).toBe(false);
    expect(sessions?.kind).toBe("directory");
    expect(sessions?.exists).toBe(true);
  });
});

describe("buildPiSdkStatus / spawn env", () => {
  it("marks needsRestart when preference differs from applied", () => {
    const builtin = {
      source: "builtin" as const,
      available: true,
      version: "0.80.10",
      packageRoot: "/app/node_modules/@earendil-works/pi-coding-agent",
      cliPath: "/app/node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
    };
    const global = {
      source: "global" as const,
      available: true,
      version: "0.81.0",
      packageRoot: "/usr/lib/node_modules/@earendil-works/pi-coding-agent",
      cliPath: "/usr/bin/pi",
    };
    const status = buildPiSdkStatus({
      preference: { source: "global" },
      appliedSource: "builtin",
      builtin,
      global,
      agentDir: "/home/u/.pi/agent",
      activity: buildPiSdkActivity({
        agentBusy: true,
        parkedBusyCount: 1,
        terminalLive: false,
      }),
    });
    expect(status.activeSource).toBe("global");
    expect(status.appliedSource).toBe("builtin");
    expect(status.needsRestart).toBe(true);
    expect(status.candidates).toHaveLength(2);
    expect(status.activity.busy).toBe(true);
    expect(status.activity.agentBusy).toBe(true);
    expect(status.activity.parkedBusyCount).toBe(1);

    const env = piSdkSpawnEnv({ source: "global" }, builtin, global);
    expect(env.PIX_PI_SDK_SOURCE).toBe("global");
    expect(env.PIX_PI_SDK_ROOT).toBe(global.packageRoot);
  });

  it("falls back to builtin spawn env when global missing", () => {
    const builtin = {
      source: "builtin" as const,
      available: true,
      version: "0.80.10",
      packageRoot: "/builtin",
    };
    const global = {
      source: "global" as const,
      available: false,
      error: "missing",
    };
    const env = piSdkSpawnEnv({ source: "global" }, builtin, global);
    expect(env.PIX_PI_SDK_SOURCE).toBe("builtin");
    expect(env.PIX_PI_SDK_ROOT).toBe("/builtin");
  });

  it("formats busy error prefix for UI branching", () => {
    const activity = buildPiSdkActivity({
      agentBusy: true,
      parkedBusyCount: 2,
      terminalLive: true,
    });
    const msg = formatPiSdkBusyError(activity);
    expect(msg.startsWith(PI_SDK_BUSY_ERROR_PREFIX)).toBe(true);
    expect(msg).toContain("agent");
    expect(msg).toContain("parked:2");
    expect(msg).toContain("terminal");
  });

  it("marks global update when latest is newer", () => {
    const status = buildPiSdkStatus({
      preference: { source: "global" },
      appliedSource: "global",
      builtin: {
        source: "builtin",
        available: true,
        version: "0.80.10",
        packageRoot: "/builtin",
      },
      global: {
        source: "global",
        available: true,
        version: "0.81.0",
        packageRoot: "/global",
        cliPath: "/global/bin/pi",
      },
      agentDir: "/home/u/.pi/agent",
      latestVersion: "0.82.1",
      latestCheckedAt: "2026-07-27T00:00:00.000Z",
    });
    expect(status.globalUpdateAvailable).toBe(true);
    expect(status.builtinBehindLatest).toBe(true);
    expect(status.latestVersion).toBe("0.82.1");
  });
});

describe("isSemverNewer", () => {
  it("compares dotted versions", () => {
    expect(isSemverNewer("0.82.1", "0.80.10")).toBe(true);
    expect(isSemverNewer("0.80.10", "0.82.1")).toBe(false);
    expect(isSemverNewer("0.82.1", "0.82.1")).toBe(false);
    expect(isSemverNewer("1.0.0", "0.99.9")).toBe(true);
  });
});

describe("fetchLatestPiSdkVersion", () => {
  afterEach(() => {
    clearLatestPiSdkVersionCache();
  });

  it("parses npm registry latest payload", async () => {
    const fetchImpl = async () =>
      ({
        ok: true,
        json: async () => ({ version: "0.82.1" }),
      }) as Response;
    const first = await fetchLatestPiSdkVersion({ force: true, fetchImpl });
    expect(first.version).toBe("0.82.1");
    expect(first.fromCache).toBe(false);
    const second = await fetchLatestPiSdkVersion({ fetchImpl });
    expect(second.version).toBe("0.82.1");
    expect(second.fromCache).toBe(true);
  });
});
