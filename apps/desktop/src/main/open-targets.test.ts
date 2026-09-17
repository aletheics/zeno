import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/* Real temp directories rather than a mocked `node:fs`: the module's whole job is
 * filesystem probing, so faking the filesystem would test the fake. `homedir`/`tmpdir`
 * are redirected into the fixture root instead, which is all the redirection needed. */

const h = vi.hoisted(() => ({
  home: "",
  tmp: "",
  /** `"cmd arg0"` pairs that should resolve, e.g. `"which code"`. */
  resolvable: new Set<string>(),
  /**
   * stdout for a resolvable command. Windows discovery reads `where.exe` output as a list
   * of paths and keeps the first that exists, so success alone is not enough there.
   */
  stdout: new Map<string, string>(),
  /** Same keys, but failing on the first call so a fallback path can be exercised. */
  failOnce: new Set<string>(),
  /** Absolute paths whose icon lookup should fail. */
  iconFails: new Set<string>(),
  /** Every spawn, with argv and the `cwd` option kept apart — see the openInApp tests. */
  calls: [] as Array<{ cmd: string; args: string[]; cwd: string | undefined }>,
}));

vi.mock("node:os", () => ({ homedir: () => h.home, tmpdir: () => h.tmp }));

vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const run = async (cmd: string, args: string[] = [], opts?: { cwd?: string }) => {
    h.calls.push({ cmd, args, cwd: opts?.cwd });
    const key = `${cmd} ${args[0] ?? ""}`.trim();
    if (h.failOnce.has(key)) {
      h.failOnce.delete(key);
      throw new Error(`${cmd} failed once`);
    }
    if (h.resolvable.has(key)) return { stdout: h.stdout.get(key) ?? "", stderr: "" };
    throw new Error(`${cmd} not found`);
  };
  // open-targets.ts builds its promisified form via `promisify(execFile)`, which resolves
  // through this symbol. Without it the promise resolves to a bare string and the module's
  // `const { stdout } = await …` destructuring silently yields undefined.
  const execFile = (() => {
    throw new Error("callback form unused");
  }) as unknown as Record<PropertyKey, unknown> & ((...a: unknown[]) => void);
  execFile[promisify.custom] = (cmd: string, args: string[], opts?: { cwd?: string }) =>
    run(cmd, args, opts);
  return { execFile };
});

vi.mock("electron", () => {
  // Shaped like a real NativeImage: `nativeImageToPngDataUrl` calls `isEmpty()` *outside*
  // its try/catch, so a partial stub would throw and look like a legitimate icon failure.
  const makeImage = () => {
    const img: Record<string, unknown> = {
      isEmpty: () => false,
      getSize: () => ({ width: 64, height: 64 }),
      toPNG: () => Buffer.alloc(200),
      toDataURL: () => "",
    };
    img.resize = () => makeImage();
    return img;
  };
  return {
    app: {
      getFileIcon: async (filePath: string) => {
        if (h.iconFails.has(filePath)) throw new Error("no icon");
        return makeImage();
      },
    },
    nativeImage: { createFromPath: () => makeImage() },
  };
});

import { listOpenTargets, openInApp } from "./open-targets.ts";

let root = "";

function setPlatform(platform: string): void {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
}

/** Create a fake macOS .app bundle that `resolveMacAppPath` will discover. */
function makeApp(name: string): string {
  const appPath = join(root, "Applications", `${name}.app`);
  mkdirSync(appPath, { recursive: true });
  return appPath;
}

beforeEach(() => {
  root = mkdtempSync(join(process.env.TEMP ?? "/tmp", "zeno-open-targets-"));
  h.home = root;
  h.tmp = join(root, "tmp");
  mkdirSync(h.tmp, { recursive: true });
  h.resolvable.clear();
  h.stdout.clear();
  h.failOnce.clear();
  h.iconFails.clear();
  h.calls.length = 0;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("listOpenTargets", () => {
  it("advertises only the apps that actually resolve, plus the platform file browser", async () => {
    setPlatform("linux");
    h.resolvable.add("which code");
    h.resolvable.add("which gnome-terminal");

    const ids = (await listOpenTargets("/work")).map((a) => a.id);

    // Always offered, no probing needed.
    expect(ids[0]).toBe("files");
    expect(ids).toContain("vscode");
    expect(ids).toContain("gnome-terminal");
    // Not installed → absent, never advertised as a dead entry.
    expect(ids).not.toContain("cursor");
    expect(ids).not.toContain("konsole");
  });

  it("falls back to known install paths on Windows when `where.exe` misses", async () => {
    setPlatform("win32");
    // `where.exe` resolves nothing; only Cursor exists at one of its extraPaths.
    const cursorExe = join(h.home, "AppData", "Local", "Programs", "cursor", "Cursor.exe");
    mkdirSync(join(h.home, "AppData", "Local", "Programs", "cursor"), { recursive: true });
    writeFileSync(cursorExe, "");

    const apps = await listOpenTargets("/work");

    expect(apps[0]?.id).toBe("explorer");
    // The resolved absolute path is used as the target so opening works off-PATH.
    expect(apps.find((a) => a.id === "cursor")?.target).toBe(cursorExe);
    // Nothing else resolved → only the two rows.
    expect(apps.map((a) => a.id)).toEqual(["explorer", "cursor"]);
  });

  it("keeps a row when its icon fails, and does not blank the other rows' icons", async () => {
    setPlatform("darwin");
    makeApp("Cursor");
    const vscode = makeApp("Visual Studio Code");
    // Only VS Code's icon lookup fails; the row must survive without an icon.
    h.iconFails.add(vscode);

    const byId = new Map((await listOpenTargets("/work")).map((a) => [a.id, a]));

    expect(byId.has("vscode")).toBe(true);
    expect(byId.get("vscode")?.iconDataUrl).toBeUndefined();
    expect(byId.get("cursor")?.iconDataUrl).toContain("data:image/png;base64,");
  });

  it("omits a macOS app whose bundle is not installed", async () => {
    setPlatform("darwin");
    makeApp("Cursor");

    // Finder is absent from the fixture root too, so Cursor is the only row.
    expect((await listOpenTargets("/work")).map((a) => a.id)).toEqual(["cursor"]);
  });

  it("never lists the same app twice", async () => {
    setPlatform("linux");
    h.resolvable.add("which code");

    const ids = (await listOpenTargets("/work")).map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("openInApp", () => {
  /** Spawns that are actually the requested launch (not discovery probes). */
  const launches = (cmd: string) => h.calls.filter((c) => c.cmd === cmd);

  it("rejects an unknown app id without spawning anything", async () => {
    setPlatform("darwin");
    h.resolvable.add("which x"); // keep the probe from masking the assertion
    await expect(openInApp("not-installed", "/work")).rejects.toThrow();
    expect(h.calls.filter((c) => c.cmd === "open")).toHaveLength(0);
  });

  it("opens the folder itself for a finder-kind app on each platform", async () => {
    for (const [platform, appId, cmd] of [
      ["darwin", "finder", "open"],
      ["win32", "explorer", "explorer"],
      ["linux", "files", "xdg-open"],
    ] as const) {
      setPlatform(platform);
      h.calls.length = 0;
      // Finder is only offered when its bundle resolves.
      if (platform === "darwin") makeApp("Finder");
      h.resolvable.add(`${cmd} /work`);
      await openInApp(appId, "/work");
      // Path is an argv element, never interpolated into a shell string.
      expect(launches(cmd)[0]?.args).toEqual(["/work"]);
    }
  });

  it("never concatenates the path into a shell command string", async () => {
    setPlatform("win32");
    for (const exe of ["wt", "cmd", "powershell"]) {
      const exePath = join(root, "bin", `${exe}.exe`);
      mkdirSync(join(root, "bin"), { recursive: true });
      writeFileSync(exePath, "");
      const key = `where.exe ${exe}`;
      h.resolvable.add(key);
      h.stdout.set(
        key,
        `${exePath}
`,
      );
      h.resolvable.add(exe === "wt" ? "wt -d" : exe === "cmd" ? "cmd /c" : "powershell -NoExit");
    }
    // Every character that would matter if the path were ever interpolated into a string.
    const hostile = '/work; calc & `id` $(whoami) "x"';

    for (const [appId, cmd] of [
      ["wt", "wt"],
      ["cmd", "cmd"],
      ["powershell", "powershell"],
    ] as const) {
      h.calls.length = 0;
      await openInApp(appId, hostile);
      const call = launches(cmd)[0];

      // The path may only ever be its own argv element or the cwd option — never a
      // substring of a longer element, which is what string-building a command looks like.
      expect(call?.args.some((a) => a !== hostile && a.includes(hostile))).toBe(false);
      const asArgv = call?.args.includes(hostile) ?? false;
      if (appId === "wt") {
        // `wt -d <path>`: the path is argv[1].
        expect(asArgv).toBe(true);
      } else {
        // `cmd` / `powershell`: the path travels in the cwd option, absent from argv.
        expect(call?.cwd).toBe(hostile);
        expect(asArgv).toBe(false);
      }
    }
  });

  it("escapes the path inside the AppleScript instead of interpolating it raw", async () => {
    setPlatform("darwin");
    makeApp("Terminal");
    h.resolvable.add("osascript -e");
    const hostile = '/tmp/He said "hi"; rm -rf /';

    await openInApp("terminal", hostile);

    const script = launches("osascript")[0]?.args[1] ?? "";
    // The raw path cannot appear verbatim once its quotes are escaped...
    expect(script).not.toContain(hostile);
    expect(script).toContain('\\"');
    // ...and it is handed to AppleScript's own shell-safe quoting.
    expect(script).toContain("quoted form of");
  });

  it("retries a Linux terminal without --working-directory when the first form fails", async () => {
    setPlatform("linux");
    h.resolvable.add("which gnome-terminal");
    // First form fails; the plain-cwd retry must be what actually succeeds.
    h.failOnce.add("gnome-terminal --working-directory");
    h.resolvable.add("gnome-terminal /work");

    await openInApp("gnome-terminal", "/work");

    const attempts = launches("gnome-terminal").map((c) => c.args);
    expect(attempts[0]).toEqual(["--working-directory", "/work"]);
    expect(attempts[1]).toEqual(["/work"]);
  });
});
