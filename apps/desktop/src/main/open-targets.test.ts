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
  /** Absolute paths whose icon lookup should fail. */
  iconFails: new Set<string>(),
}));

vi.mock("node:os", () => ({ homedir: () => h.home, tmpdir: () => h.tmp }));

vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const run = async (cmd: string, args: string[] = []) => {
    if (h.resolvable.has(`${cmd} ${args[0] ?? ""}`.trim())) return { stdout: "", stderr: "" };
    throw new Error(`${cmd} not found`);
  };
  // open-targets.ts builds its promisified form via `promisify(execFile)`, which resolves
  // through this symbol. Without it the promise resolves to a bare string and the module's
  // `const { stdout } = await …` destructuring silently yields undefined.
  const execFile = (() => {
    throw new Error("callback form unused");
  }) as unknown as Record<PropertyKey, unknown> & ((...a: unknown[]) => void);
  execFile[promisify.custom] = (cmd: string, args: string[]) => run(cmd, args);
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

import { listOpenTargets } from "./open-targets.ts";

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
  h.iconFails.clear();
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
