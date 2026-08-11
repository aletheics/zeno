import { describe, expect, it } from "vite-plus/test";
import { projectTrustPromptKey, shouldPromptProjectTrust } from "./project-trust-prompt.ts";

const askTrust = {
  required: true,
  trusted: false,
  savedDecision: null as boolean | null,
  fallback: "ask" as const,
};

describe("shouldPromptProjectTrust", () => {
  it("prompts in chat mode for gated ask with no saved decision", () => {
    expect(
      shouldPromptProjectTrust({
        contentMode: "chat",
        cwd: "/work/proj",
        trust: askTrust,
        projectTrusted: false,
        dismissedKeys: new Set(),
      }),
    ).toBe(true);
  });

  it("does not prompt in terminal mode", () => {
    expect(
      shouldPromptProjectTrust({
        contentMode: "terminal",
        cwd: "/work/proj",
        trust: askTrust,
        projectTrusted: false,
        dismissedKeys: new Set(),
      }),
    ).toBe(false);
  });

  it("does not prompt when always/never or already decided", () => {
    expect(
      shouldPromptProjectTrust({
        contentMode: "chat",
        cwd: "/work/proj",
        trust: { ...askTrust, fallback: "never" },
        projectTrusted: false,
        dismissedKeys: new Set(),
      }),
    ).toBe(false);
    expect(
      shouldPromptProjectTrust({
        contentMode: "chat",
        cwd: "/work/proj",
        trust: { ...askTrust, savedDecision: false },
        projectTrusted: false,
        dismissedKeys: new Set(),
      }),
    ).toBe(false);
    // Missing savedDecision (IPC/partial) still counts as undecided.
    expect(
      shouldPromptProjectTrust({
        contentMode: "chat",
        cwd: "/work/proj",
        trust: {
          required: true,
          trusted: false,
          savedDecision: undefined as unknown as null,
          fallback: "ask",
        },
        projectTrusted: false,
        dismissedKeys: new Set(),
      }),
    ).toBe(true);
    expect(
      shouldPromptProjectTrust({
        contentMode: "chat",
        cwd: "/work/proj",
        trust: { ...askTrust, required: false },
        projectTrusted: true,
        dismissedKeys: new Set(),
      }),
    ).toBe(false);
  });

  it("respects in-session dismiss keys", () => {
    const key = projectTrustPromptKey("/work/proj");
    expect(
      shouldPromptProjectTrust({
        contentMode: "chat",
        cwd: "/work/proj",
        trust: askTrust,
        projectTrusted: false,
        dismissedKeys: new Set([key]),
      }),
    ).toBe(false);
  });
});
