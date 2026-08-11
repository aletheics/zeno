import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  findAppBundleInDir,
  installMacUpdateFromZip,
  isAppBundlePath,
  resolveMacAppBundlePath,
} from "./mac-install-update.ts";

describe("resolveMacAppBundlePath", () => {
  it("walks up from Contents/MacOS/executable", () => {
    expect(resolveMacAppBundlePath("/Applications/Zeno.app/Contents/MacOS/Zeno")).toBe(
      "/Applications/Zeno.app",
    );
  });
});

describe("findAppBundleInDir", () => {
  it("finds a root-level .app", () => {
    const dir = mkdtempSync(join(tmpdir(), "zeno-find-app-"));
    try {
      const app = join(dir, "Zeno.app");
      mkdirSync(join(app, "Contents"), { recursive: true });
      expect(isAppBundlePath(app)).toBe(true);
      expect(findAppBundleInDir(dir)).toBe(app);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("finds a nested .app one level down", () => {
    const dir = mkdtempSync(join(tmpdir(), "zeno-find-app-nested-"));
    try {
      const wrap = join(dir, "wrap");
      const app = join(wrap, "Zeno.app");
      mkdirSync(join(app, "Contents"), { recursive: true });
      expect(findAppBundleInDir(dir)).toBe(app);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("installMacUpdateFromZip", () => {
  it("swaps the app bundle via ditto extract + rename", async () => {
    const root = mkdtempSync(join(tmpdir(), "zeno-mac-install-"));
    try {
      const zipPath = join(root, "update.zip");
      writeFileSync(zipPath, "fake-zip");

      const currentApp = join(root, "Zeno.app");
      mkdirSync(join(currentApp, "Contents", "MacOS"), { recursive: true });
      writeFileSync(join(currentApp, "Contents", "MacOS", "Zeno"), "old");

      const extractStaging = join(root, "extract-staging");
      mkdirSync(extractStaging, { recursive: true });

      const commands: Array<{ cmd: string; args: string[] }> = [];
      await installMacUpdateFromZip({
        zipPath,
        appBundlePath: currentApp,
        run: async (cmd, args) => {
          commands.push({ cmd, args });
          if (cmd === "ditto") {
            // ditto -x -k zip extractDir — simulate extract of new app into extractDir
            const dest = args[3]!;
            const newApp = join(dest, "Zeno.app");
            mkdirSync(join(newApp, "Contents", "MacOS"), { recursive: true });
            writeFileSync(join(newApp, "Contents", "MacOS", "Zeno"), "new");
            return;
          }
        },
      });

      expect(commands.some((c) => c.cmd === "ditto")).toBe(true);
      expect(commands.some((c) => c.cmd === "xattr" && c.args.includes("-cr"))).toBe(true);
      expect(existsSync(join(currentApp, "Contents", "MacOS", "Zeno"))).toBe(true);
      expect(readFileSync(join(currentApp, "Contents", "MacOS", "Zeno"), "utf8")).toBe("new");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects missing zip", async () => {
    await expect(
      installMacUpdateFromZip({
        zipPath: "/tmp/zeno-missing-update.zip",
        appBundlePath: "/Applications/Zeno.app",
        run: async () => undefined,
      }),
    ).rejects.toThrow(/not found/i);
  });
});
