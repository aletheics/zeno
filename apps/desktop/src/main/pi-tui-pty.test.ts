import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import { planPiTuiLaunch } from "./pi-tui-session.ts";
import { configureBundledRuntimes, resolveBundledRuntimeRoots } from "./bundled-runtimes.ts";
import {
  isInsideAsarArchive,
  MAX_PARKED_PTYS,
  PiTuiPtyController,
  resolvePiPtyLaunch,
  toSpawnableFilesystemPath,
  type PtyHandle,
  type PtySpawnFn,
} from "./pi-tui-pty.ts";

type SpawnRecord = {
  file: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
};

function fakeSpawn(
  tracker: {
    spawns: SpawnRecord[];
    writes: string[];
    kills: number;
  },
  hooks?: {
    onSpawn?: (handle: PtyHandle & { emitData: (data: string) => void }) => void;
  },
): PtySpawnFn {
  return (file, args, options) => {
    tracker.spawns.push({ file, args, cwd: options.cwd, env: options.env });
    let dataListener: ((data: string) => void) | undefined;
    const handle: PtyHandle & { emitData: (data: string) => void } = {
      write: (data) => {
        tracker.writes.push(data);
      },
      resize: () => undefined,
      kill: () => {
        tracker.kills += 1;
      },
      onData: (listener) => {
        dataListener = listener;
      },
      onExit: () => undefined,
      emitData: (data) => {
        dataListener?.(data);
      },
    };
    hooks?.onSpawn?.(handle);
    return handle;
  };
}

describe("PiTuiPtyController", () => {
  it("resumes the same session without a second spawn", async () => {
    const tracker = { spawns: [] as SpawnRecord[], writes: [] as string[], kills: 0 };
    const controller = new PiTuiPtyController(fakeSpawn(tracker), async () => "pi");
    const plan = planPiTuiLaunch({ sessionFile: "/s.jsonl", cwd: "/cwd" });

    await controller.open(plan, { onData: () => undefined, onExit: () => undefined });
    expect(tracker.spawns).toHaveLength(1);
    controller.suspend();
    const second = await controller.open(plan, {
      onData: () => undefined,
      onExit: () => undefined,
    });
    expect(second.resumed).toBe(true);
    expect(tracker.kills).toBe(0);
    expect(tracker.spawns).toHaveLength(1);
  });

  it("serializes concurrent opens so hops do not interleave", async () => {
    const tracker = { spawns: [] as SpawnRecord[], writes: [] as string[], kills: 0 };
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((r) => {
      releaseFirst = r;
    });
    let resolveCalls = 0;
    const controller = new PiTuiPtyController(fakeSpawn(tracker), async () => {
      resolveCalls += 1;
      if (resolveCalls === 1) await firstGate;
      return "pi";
    });
    const planA = planPiTuiLaunch({ sessionFile: "/work/a.jsonl", cwd: "/work" });
    const planB = planPiTuiLaunch({ sessionFile: "/work/b.jsonl", cwd: "/work" });

    const openA = controller.open(planA, { onData: () => undefined, onExit: () => undefined });
    // Queue B while A is still resolving pi — must not run until A finishes.
    const openB = controller.open(planB, { onData: () => undefined, onExit: () => undefined });
    expect(tracker.spawns).toHaveLength(0);
    releaseFirst();
    const a = await openA;
    expect(a.sessionFile).toBe("/work/a.jsonl");
    const b = await openB;
    expect(b.sessionFile).toBe("/work/b.jsonl");
    expect(tracker.spawns).toHaveLength(2);
    expect(controller.sessionFile()).toBe("/work/b.jsonl");
    expect(controller.status().parkedSessionFiles).toEqual(["/work/a.jsonl"]);
  });

  it("parks the previous session and promotes it on hop back", async () => {
    const tracker = { spawns: [] as SpawnRecord[], writes: [] as string[], kills: 0 };
    const handles: Array<PtyHandle & { emitData: (data: string) => void }> = [];
    const controller = new PiTuiPtyController(
      fakeSpawn(tracker, {
        onSpawn: (h) => {
          handles.push(h);
        },
      }),
      async () => "/usr/bin/pi",
    );
    const planA = planPiTuiLaunch({
      sessionFile: "/work/a.jsonl",
      cwd: "/work",
      cols: 80,
      rows: 24,
    });
    const planB = planPiTuiLaunch({
      sessionFile: "/work/b.jsonl",
      cwd: "/work",
      cols: 80,
      rows: 24,
    });
    const received: string[] = [];

    await controller.open(planA, {
      onData: (d) => {
        received.push(`A:${d}`);
      },
      onExit: () => undefined,
    });
    expect(tracker.spawns).toHaveLength(1);

    await controller.open(planB, {
      onData: (d) => {
        received.push(`B:${d}`);
      },
      onExit: () => undefined,
    });
    // A parked (not killed), B spawned
    expect(tracker.spawns).toHaveLength(2);
    expect(tracker.kills).toBe(0);
    expect(controller.status()).toEqual({
      live: { sessionFile: "/work/b.jsonl", suspended: false },
      parkedSessionFiles: ["/work/a.jsonl"],
    });

    handles[0]?.emitData("from-parked-A");
    handles[1]?.emitData("from-live-B");
    expect(received).toEqual(["B:from-live-B"]);

    // Hop back to A — promote park, no third spawn
    await controller.open(planA, {
      onData: (d) => {
        received.push(`A2:${d}`);
      },
      onExit: () => undefined,
    });
    expect(tracker.spawns).toHaveLength(2);
    handles[0]?.emitData("from-promoted-A");
    expect(received).toContain("A2:from-promoted-A");
  });

  it("disposes one parked session without disturbing the live session", async () => {
    const tracker = { spawns: [] as SpawnRecord[], writes: [] as string[], kills: 0 };
    const controller = new PiTuiPtyController(fakeSpawn(tracker), async () => "pi");
    const planA = planPiTuiLaunch({ sessionFile: "/a.jsonl", cwd: "/cwd" });
    const planB = planPiTuiLaunch({ sessionFile: "/b.jsonl", cwd: "/cwd" });

    await controller.open(planA, { onData: () => undefined, onExit: () => undefined });
    await controller.open(planB, { onData: () => undefined, onExit: () => undefined });

    expect(controller.disposeSession("/a.jsonl")).toBe(true);
    expect(controller.sessionFile()).toBe("/b.jsonl");
    expect(controller.isOpen()).toBe(true);
    expect(controller.status().parkedSessionFiles).toEqual([]);
    expect(tracker.kills).toBe(1);
  });

  it("bounds the warm session park and evicts the oldest process", async () => {
    const tracker = { spawns: [] as SpawnRecord[], writes: [] as string[], kills: 0 };
    const controller = new PiTuiPtyController(fakeSpawn(tracker), async () => "pi");

    for (let i = 0; i < MAX_PARKED_PTYS + 2; i += 1) {
      await controller.open(planPiTuiLaunch({ sessionFile: `/s-${i}.jsonl`, cwd: "/cwd" }), {
        onData: () => undefined,
        onExit: () => undefined,
      });
    }

    expect(controller.status().parkedSessionFiles).toHaveLength(MAX_PARKED_PTYS);
    expect(controller.status().parkedSessionFiles).not.toContain("/s-0.jsonl");
    expect(controller.sessionFile()).toBe(`/s-${MAX_PARKED_PTYS + 1}.jsonl`);
    expect(tracker.kills).toBe(1);
  });

  it("write requires an active (non-suspended) PTY", async () => {
    const tracker = { spawns: [] as SpawnRecord[], writes: [] as string[], kills: 0 };
    const controller = new PiTuiPtyController(fakeSpawn(tracker), async () => "pi");
    expect(() => controller.write("x")).toThrow(/not open/i);
    const plan = planPiTuiLaunch({ sessionFile: "/s.jsonl", cwd: "/cwd" });
    await controller.open(plan, { onData: () => undefined, onExit: () => undefined });
    controller.write("hello");
    expect(tracker.writes).toEqual(["hello"]);
    controller.suspend();
    expect(() => controller.write("x")).toThrow(/not open/i);
  });

  it("fails open when pi path cannot be resolved", async () => {
    const resolve = vi.fn(async () => "");
    const controller = new PiTuiPtyController(
      fakeSpawn({ spawns: [], writes: [], kills: 0 }),
      resolve,
    );
    const plan = planPiTuiLaunch({ sessionFile: "/s.jsonl", cwd: "/cwd" });
    await expect(
      controller.open(plan, { onData: () => undefined, onExit: () => undefined }),
    ).rejects.toThrow(/pi executable/i);
  });

  it("spawns pi via node when the CLI is a node shebang script", async () => {
    const tracker = { spawns: [] as SpawnRecord[], writes: [] as string[], kills: 0 };
    const root = mkdtempSync(join(tmpdir(), "zeno-pty-launch-"));
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    const piPath = join(bin, "pi");
    writeFileSync(piPath, "#!/usr/bin/env node\nconsole.log(1)\n", { mode: 0o755 });

    const controller = new PiTuiPtyController(fakeSpawn(tracker), async () => piPath);
    const plan = planPiTuiLaunch({ sessionFile: join(root, "s.jsonl"), cwd: root });
    await controller.open(plan, { onData: () => undefined, onExit: () => undefined });
    expect(tracker.spawns).toHaveLength(1);
    // Real node from the machine (or PATH) should wrap the shebang script.
    expect(tracker.spawns[0]?.file.toLowerCase()).toMatch(/node(\.exe)?$/);
    // macOS realpath may prefix /private — compare resolved tails.
    expect(tracker.spawns[0]?.args[0]?.endsWith("/bin/pi")).toBe(true);
    expect(tracker.spawns[0]?.args.slice(1)).toEqual(["--session", join(root, "s.jsonl")]);
  });
});

describe("resolvePiPtyLaunch", () => {
  it("uses node to run a shebang or .js CLI when node is available", () => {
    const root = mkdtempSync(join(tmpdir(), "zeno-pty-resolve-"));
    const script = join(root, "cli.js");
    writeFileSync(script, "#!/usr/bin/env node\n", { mode: 0o755 });

    const launch = resolvePiPtyLaunch(script, ["--session", "/s.jsonl"], {
      PATH: process.env.PATH || "/usr/bin:/bin",
      HOME: root,
    });
    // On developer machines node is present; argv0 is the script path.
    expect(launch.file.toLowerCase()).toMatch(/node(\.exe)?$/);
    expect(launch.args[0]?.endsWith("cli.js")).toBe(true);
    expect(launch.args.slice(1)).toEqual(["--session", "/s.jsonl"]);
    expect(launch.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });

  it("honors NODE_BINARY override", () => {
    const root = mkdtempSync(join(tmpdir(), "zeno-pty-resolve-nodebin-"));
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    const nodePath = join(bin, "custom-node");
    const script = join(bin, "cli.js");
    writeFileSync(nodePath, "#!/bin/sh\n", { mode: 0o755 });
    writeFileSync(script, "export default 1\n", { mode: 0o644 });

    const launch = resolvePiPtyLaunch(script, ["--version"], {
      PATH: "/usr/bin",
      HOME: root,
      NODE_BINARY: nodePath,
    });
    expect(launch.file).toBe(nodePath);
    expect(launch.args[0]?.endsWith("cli.js")).toBe(true);
    expect(launch.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });

  it("runs asar-packaged CLI via Electron-as-Node, not system node", () => {
    // Last-resort fallback when userData extract is missing. Isolated asar path
    // so a real /Applications/Zeno.app install cannot rewrite it to unpacked.
    const asarCli = join(
      tmpdir(),
      "zeno-no-such-app.app",
      "Contents",
      "Resources",
      "app.asar",
      "node_modules",
      "@earendil-works",
      "pi-coding-agent",
      "dist",
      "cli.js",
    );
    const systemNode = join(tmpdir(), "fake-system-node");
    writeFileSync(systemNode, "#!/bin/sh\n", { mode: 0o755 });

    const prevElectron = process.versions.electron;
    const prevExec = process.execPath;
    // Vitest is plain Node — simulate packaged Electron main.
    Object.defineProperty(process.versions, "electron", {
      value: "39.0.0",
      configurable: true,
    });
    // process.execPath is read-only on some runtimes; spy via defineProperty when possible.
    const electronBin = join(tmpdir(), "Zeno");
    writeFileSync(electronBin, "#!/bin/sh\n", { mode: 0o755 });
    try {
      Object.defineProperty(process, "execPath", {
        value: electronBin,
        configurable: true,
      });
    } catch {
      // If execPath cannot be redefined, skip the electron path assertion body.
    }

    try {
      const launch = resolvePiPtyLaunch(asarCli, ["--session", "/s.jsonl"], {
        PATH: dirname(systemNode),
        HOME: tmpdir(),
        NODE_BINARY: systemNode,
      });
      // Must not hand an asar path to system node (Cannot find module).
      expect(launch.file).not.toBe(systemNode);
      if (process.execPath === electronBin) {
        expect(launch.file).toBe(electronBin);
        expect(launch.env.ELECTRON_RUN_AS_NODE).toBe("1");
      }
      expect(launch.args[0]).toBe(asarCli);
      expect(launch.args.slice(1)).toEqual(["--session", "/s.jsonl"]);
    } finally {
      if (prevElectron === undefined) {
        delete (process.versions as { electron?: string }).electron;
      } else {
        Object.defineProperty(process.versions, "electron", {
          value: prevElectron,
          configurable: true,
        });
      }
      try {
        Object.defineProperty(process, "execPath", {
          value: prevExec,
          configurable: true,
        });
      } catch {
        // ignore
      }
    }
  });

  it("does not treat app.asar.unpacked paths as asar archives", () => {
    expect(
      isInsideAsarArchive(
        "/App/Contents/Resources/app.asar/node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
      ),
    ).toBe(true);
    expect(
      isInsideAsarArchive(
        "/App/Contents/Resources/app.asar.unpacked/node_modules/node-pty/lib/index.js",
      ),
    ).toBe(false);
  });

  it("prefers configured bundled node over PATH without ELECTRON_RUN_AS_NODE", () => {
    const root = mkdtempSync(join(tmpdir(), "zeno-pty-bundled-"));
    const nodeBinDir = join(root, "node", "bin");
    mkdirSync(nodeBinDir, { recursive: true });
    const bundledNode = join(nodeBinDir, "node");
    writeFileSync(bundledNode, "#!/bin/sh\n", { mode: 0o755 });
    writeFileSync(join(root, "manifest.json"), JSON.stringify({ node: "22.19.0" }));
    const script = join(root, "cli.js");
    writeFileSync(script, "export {}\n", { mode: 0o644 });

    const roots = resolveBundledRuntimeRoots({ explicitRoot: root });
    configureBundledRuntimes({
      roots,
      prefs: { useBundledNode: true, useBundledPython: false },
    });
    try {
      const launch = resolvePiPtyLaunch(script, ["--version"], {
        PATH: "/usr/bin",
        HOME: root,
      });
      expect(launch.file).toBe(bundledNode);
      expect(launch.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    } finally {
      configureBundledRuntimes({
        roots: undefined,
        prefs: { useBundledNode: true, useBundledPython: true },
      });
    }
  });

  it("rewrites asar paths to asar.unpacked when the real file exists", () => {
    const root = mkdtempSync(join(tmpdir(), "zeno-pty-unpacked-"));
    const asarCli = join(root, "app.asar", "node_modules", "pkg", "cli.js");
    const unpackedCli = join(root, "app.asar.unpacked", "node_modules", "pkg", "cli.js");
    mkdirSync(dirname(unpackedCli), { recursive: true });
    mkdirSync(dirname(asarCli), { recursive: true });
    writeFileSync(unpackedCli, "export {}\n", { mode: 0o644 });
    // Virtual asar path may not exist on disk outside Electron — only unpacked does.
    expect(toSpawnableFilesystemPath(asarCli)).toBe(unpackedCli);
    expect(toSpawnableFilesystemPath(unpackedCli)).toBe(unpackedCli);

    // Prefer system node on the unpacked real path (no ELECTRON_RUN_AS_NODE / Dock bounce).
    const systemNode = join(root, "node");
    writeFileSync(systemNode, "#!/bin/sh\n", { mode: 0o755 });
    const launch = resolvePiPtyLaunch(asarCli, ["--session", "/s.jsonl"], {
      PATH: root,
      HOME: root,
      NODE_BINARY: systemNode,
    });
    expect(launch.file).toBe(systemNode);
    expect(launch.args[0]).toBe(unpackedCli);
    expect(launch.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });
});
