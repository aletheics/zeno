import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  augmentEnvPath,
  candidateCommandPaths,
  commonUserBinDirs,
  mergePathDirs,
} from "./shell-path.ts";

describe("shell-path", () => {
  it("mergePathDirs prepends extras and dedupes", () => {
    const sep = process.platform === "win32" ? ";" : ":";
    const merged = mergePathDirs(`/usr/bin${sep}/bin`, ["/opt/homebrew/bin", "/usr/bin"]);
    const parts = merged.split(sep);
    expect(parts[0]).toBe("/opt/homebrew/bin");
    expect(parts.filter((p) => p === "/usr/bin")).toHaveLength(1);
  });

  it("augmentEnvPath keeps existing PATH entries and sets PATH", () => {
    const env = augmentEnvPath({
      HOME: process.env.HOME || process.env.USERPROFILE || tmpdir(),
      PATH: "/usr/bin:/bin",
    });
    expect(env.PATH).toBeTruthy();
    expect(env.PATH).toContain("/usr/bin");
    expect(env.PATH).toContain("/bin");
  });

  it("augmentEnvPath prepends extraBinDirs (bundled runtimes) before user bins", () => {
    const sep = process.platform === "win32" ? ";" : ":";
    const bundled = join(tmpdir(), "pix-bundled-bin-xyz");
    mkdirSync(bundled, { recursive: true });
    const env = augmentEnvPath(
      {
        HOME: process.env.HOME || process.env.USERPROFILE || tmpdir(),
        PATH: `/usr/bin${sep}/bin`,
      },
      [bundled],
    );
    const parts = (env.PATH || "").split(sep);
    expect(parts[0]).toBe(bundled);
    expect(env.PATH).toContain("/usr/bin");
  });

  it("candidateCommandPaths finds binaries under a home bin dir", () => {
    const root = mkdtempSync(join(tmpdir(), "pix-shell-path-"));
    const bin = join(root, ".local", "bin");
    mkdirSync(bin, { recursive: true });
    const piPath = join(bin, "pi");
    writeFileSync(piPath, "#!/bin/sh\necho ok\n", { mode: 0o755 });

    const found = candidateCommandPaths("pi", {
      HOME: root,
      PATH: "/usr/bin",
    });
    expect(found.some((p) => p === piPath || p.endsWith(`${join(".local", "bin", "pi")}`))).toBe(
      true,
    );
  });

  it("commonUserBinDirs only returns existing directories", () => {
    const dirs = commonUserBinDirs(join(tmpdir(), "pix-missing-home-dir-xyz"));
    for (const dir of dirs) {
      // System paths like /usr/local/bin may exist; user-home ones for missing home must not.
      expect(dir.includes("pix-missing-home-dir-xyz")).toBe(false);
    }
  });
});
