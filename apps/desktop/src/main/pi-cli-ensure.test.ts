import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { detectPiCli, isProjectLocalPiPath, shouldAutoInstallPiCli } from "./pi-cli-ensure.ts";

describe("shouldAutoInstallPiCli", () => {
  it("defaults to off (builtin SDK; no auto global install)", () => {
    expect(
      shouldAutoInstallPiCli({
        PATH: "/usr/bin",
      }),
    ).toBe(false);
  });

  it("stays off for isolated / fixture / explicit skip", () => {
    expect(shouldAutoInstallPiCli({ PIX_ISOLATED: "1" })).toBe(false);
    expect(shouldAutoInstallPiCli({ PIX_SKIP_PI_INSTALL: "1" })).toBe(false);
    expect(shouldAutoInstallPiCli({ PIX_WORKSPACE: "D:/tmp/fixture" })).toBe(false);
    expect(
      shouldAutoInstallPiCli({
        PI_CODING_AGENT_DIR: "D:/tmp/agent",
        PIX_ENABLE_TEST_COMMANDS: "1",
      }),
    ).toBe(false);
  });

  it("only enables when PIX_FORCE_PI_INSTALL is set", () => {
    expect(shouldAutoInstallPiCli({ PIX_FORCE_PI_INSTALL: "1" })).toBe(true);
    expect(shouldAutoInstallPiCli({ PIX_FORCE_PI_INSTALL: "true" })).toBe(true);
  });

  it("FORCE does not override explicit skip", () => {
    expect(
      shouldAutoInstallPiCli({
        PIX_FORCE_PI_INSTALL: "1",
        PIX_SKIP_PI_INSTALL: "1",
      }),
    ).toBe(false);
  });
});

describe("isProjectLocalPiPath", () => {
  it("rejects monorepo node_modules/.bin and .pnpm package paths", () => {
    expect(
      isProjectLocalPiPath("/Users/c/Documents/github/pix/apps/desktop/node_modules/.bin/pi"),
    ).toBe(true);
    expect(
      isProjectLocalPiPath(
        "/Users/c/Documents/github/pix/node_modules/.pnpm/@earendil-works+pi-coding-agent@0.80.10/node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
      ),
    ).toBe(true);
  });

  it("accepts npm global / user global layouts", () => {
    expect(
      isProjectLocalPiPath(
        "/Users/c/.vite-plus/js_runtime/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
      ),
    ).toBe(false);
    expect(isProjectLocalPiPath("/Users/c/.vite-plus/bin/pi")).toBe(false);
    expect(isProjectLocalPiPath("/opt/homebrew/bin/pi")).toBe(false);
    expect(
      isProjectLocalPiPath(
        "C:/Users/c/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
      ),
    ).toBe(false);
  });
});

describe("detectPiCli", () => {
  it("finds pi under ~/.vite-plus/bin even when PATH is GUI-minimal", async () => {
    const root = mkdtempSync(join(tmpdir(), "pix-detect-pi-"));
    const bin = join(root, ".vite-plus", "bin");
    mkdirSync(bin, { recursive: true });
    const piPath = join(bin, "pi");
    // Minimal executable; --version may fail — path detection must still succeed.
    writeFileSync(piPath, "#!/bin/sh\nexit 1\n", { mode: 0o755 });

    const found = await detectPiCli({
      HOME: root,
      PATH: "/usr/bin:/bin",
    });
    expect(found.path).toBe(piPath);
  });

  it("finds pi under /opt/homebrew-style path via candidate scan when present", async () => {
    // Use a fake home with .local/bin (always scannable); avoid depending on real /opt/homebrew.
    const root = mkdtempSync(join(tmpdir(), "pix-detect-local-"));
    const bin = join(root, ".local", "bin");
    mkdirSync(bin, { recursive: true });
    const piPath = join(bin, "pi");
    writeFileSync(piPath, "#!/bin/sh\necho 1.2.3\n", { mode: 0o755 });

    const found = await detectPiCli({
      HOME: root,
      // No pi on PATH — must use known dirs.
      PATH: "/usr/bin:/bin",
    });
    expect(found.path).toBe(piPath);
  });

  it("ignores project node_modules/.bin even when first on PATH", async () => {
    const root = mkdtempSync(join(tmpdir(), "pix-detect-proj-"));
    const projBin = join(root, "apps", "desktop", "node_modules", ".bin");
    mkdirSync(projBin, { recursive: true });
    const localPi = join(projBin, "pi");
    writeFileSync(localPi, "#!/bin/sh\necho local\n", { mode: 0o755 });

    const found = await detectPiCli({
      HOME: join(root, "home-empty"),
      PATH: `${projBin}:/usr/bin:/bin`,
    });
    expect(found.path).toBeUndefined();
  });
});
