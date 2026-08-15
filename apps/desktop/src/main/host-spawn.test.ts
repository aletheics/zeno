import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { unwrapRemoteIpcError } from "../shared/ipc-error.ts";
import {
  formatHostExitError,
  resolveAgentHostEntry,
  sanitizeUtilityProcessEnv,
} from "./host-spawn.ts";

describe("host-spawn", () => {
  it("resolves an on-disk agent-host entry next to main", () => {
    const root = mkdtempSync(join(tmpdir(), "zeno-host-spawn-"));
    const mainDir = join(root, "dist", "main");
    const hostDir = join(root, "dist", "agent-host");
    mkdirSync(mainDir, { recursive: true });
    mkdirSync(hostDir, { recursive: true });
    writeFileSync(join(hostDir, "agent-host.mjs"), "// host\n");
    expect(resolveAgentHostEntry(mainDir)).toBe(join(hostDir, "agent-host.mjs"));
  });

  it("prefers the unpacked asar copy when both exist", () => {
    const root = mkdtempSync(join(tmpdir(), "zeno-host-asar-"));
    const packedMain = join(root, "app.asar", "dist", "main");
    const packedHost = join(root, "app.asar", "dist", "agent-host");
    const unpackedHost = join(root, "app.asar.unpacked", "dist", "agent-host");
    mkdirSync(packedMain, { recursive: true });
    mkdirSync(packedHost, { recursive: true });
    mkdirSync(unpackedHost, { recursive: true });
    writeFileSync(join(packedHost, "agent-host.mjs"), "// packed\n");
    writeFileSync(join(unpackedHost, "agent-host.mjs"), "// unpacked\n");
    expect(resolveAgentHostEntry(packedMain)).toBe(join(unpackedHost, "agent-host.mjs"));
  });

  it("throws a rebuild hint when the entry is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "zeno-host-missing-"));
    expect(() => resolveAgentHostEntry(join(root, "dist", "main"))).toThrow(
      /Rebuild the desktop app/,
    );
  });

  it("strips ELECTRON_RUN_AS_NODE from the utility-process env", () => {
    expect(
      sanitizeUtilityProcessEnv({
        PATH: "/usr/bin",
        ELECTRON_RUN_AS_NODE: "1",
      }),
    ).toEqual({ PATH: "/usr/bin" });
  });

  it("includes stderr in the exit error", () => {
    const error = formatHostExitError(1, "Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'x'\n");
    expect(error.message).toBe(
      "Agent Host exited with code 1: Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'x'",
    );
  });

  it("unwraps Electron's remote method prefix", () => {
    expect(
      unwrapRemoteIpcError(
        "Error invoking remote method 'zeno:host:start': Error: Agent Host exited with code 1",
      ),
    ).toBe("Agent Host exited with code 1");
  });
});
