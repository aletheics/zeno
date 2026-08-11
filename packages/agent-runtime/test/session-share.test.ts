import { describe, expect, it, vi } from "vite-plus/test";
import { resolveGitHubCliCommand } from "../src/index.ts";

describe("GitHub CLI resolution", () => {
  it("uses Apple Silicon Homebrew gh in a minimal macOS GUI environment", () => {
    const exists = vi.fn((path: string) => path === "/opt/homebrew/bin/gh");

    expect(resolveGitHubCliCommand("darwin", exists)).toBe("/opt/homebrew/bin/gh");
  });

  it("falls back to the Intel Homebrew location on macOS", () => {
    const exists = vi.fn((path: string) => path === "/usr/local/bin/gh");

    expect(resolveGitHubCliCommand("darwin", exists)).toBe("/usr/local/bin/gh");
  });

  it("uses PATH lookup when no known absolute path is available", () => {
    expect(resolveGitHubCliCommand("darwin", () => false)).toBe("gh");
    expect(resolveGitHubCliCommand("linux", () => true)).toBe("gh");
  });
});
