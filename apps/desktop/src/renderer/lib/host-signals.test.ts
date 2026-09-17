import { describe, expect, it } from "vite-plus/test";
import {
  errorMessageOrFallback,
  hostPillState,
  isAbortRecycleError,
  isAlreadyProcessingError,
  unknownErrorMessage,
} from "./host-signals.ts";

/* These predicates decide whether an error is shown or swallowed, and they match on
 * wording produced by the main process. The strings below are quoted from their
 * producers so that changing a producer fails here rather than silently turning an
 * expected condition into an error modal. */

describe("unknownErrorMessage", () => {
  it("reads a message out of an Error, a bare string, or nothing", () => {
    expect(unknownErrorMessage(new Error("boom"))).toBe("boom");
    expect(unknownErrorMessage("boom")).toBe("boom");
    expect(unknownErrorMessage(undefined)).toBe("");
    expect(unknownErrorMessage({ message: "boom" })).toBe("");
  });
});

describe("errorMessageOrFallback", () => {
  it("prefers a non-blank Error message", () => {
    expect(errorMessageOrFallback(new Error("boom"), "fallback")).toBe("boom");
    expect(errorMessageOrFallback(new Error("  boom  "), "fallback")).toBe("  boom  ");
  });

  it("falls back when the Error carries no usable message", () => {
    expect(errorMessageOrFallback(new Error("   "), "fallback")).toBe("fallback");
    expect(errorMessageOrFallback(new Error(""), "fallback")).toBe("fallback");
  });

  it("ignores a thrown string rather than using it as the message", () => {
    // Not the same as `unknownErrorMessage(error) || fallback`, which would return "boom".
    // Callers are catch blocks around IPC, where only an Error counts as a message.
    expect(errorMessageOrFallback("boom", "fallback")).toBe("fallback");
    expect(errorMessageOrFallback(undefined, "fallback")).toBe("fallback");
    expect(errorMessageOrFallback(null, "fallback")).toBe("fallback");
    expect(errorMessageOrFallback({ message: "boom" }, "fallback")).toBe("fallback");
  });
});

describe("isAlreadyProcessingError", () => {
  it("recognises the mid-turn rejection", () => {
    // main/index.ts:2366 — "Agent is already processing"; the host was still busy while
    // the UI believed it was idle.
    expect(isAlreadyProcessingError(new Error("Agent is already processing"))).toBe(true);
    expect(isAlreadyProcessingError(new Error("agent is ALREADY PROCESSING a turn"))).toBe(true);
  });

  it("does not swallow unrelated failures", () => {
    expect(isAlreadyProcessingError(new Error("network unreachable"))).toBe(false);
    expect(isAlreadyProcessingError(undefined)).toBe(false);
  });
});

describe("isAbortRecycleError", () => {
  it("recognises a host recycled after an abort timeout", () => {
    // main/index.ts:3205 — `new Error("Agent Host recycled after abort timeout")`.
    expect(isAbortRecycleError(new Error("Agent Host recycled after abort timeout"))).toBe(true);
  });

  it("recognises an abort that timed out, which the producer assembles at runtime", () => {
    // main/index.ts:4425 — `new Error(`Agent Host timed out handling ${command.type}`)`,
    // where command.type is "agent.abort" (contracts, agent-host). The literal string
    // appears nowhere in the source, so grepping for it finds nothing.
    expect(isAbortRecycleError(new Error("Agent Host timed out handling agent.abort"))).toBe(true);
  });

  it("does not swallow a timeout for some other command", () => {
    // The regex is anchored to agent.abort specifically — a timed-out prompt is real.
    expect(isAbortRecycleError(new Error("Agent Host timed out handling agent.prompt"))).toBe(
      false,
    );
  });

  it("does not swallow unrelated failures", () => {
    expect(isAbortRecycleError(new Error("network unreachable"))).toBe(false);
    expect(isAbortRecycleError(undefined)).toBe(false);
  });
});

describe("hostPillState", () => {
  it("reports running regardless of the status text", () => {
    expect(hostPillState("Agent Host is stopped", true)).toBe("running");
    expect(hostPillState("failed", true)).toBe("running");
  });

  it("reads ready / error / idle out of the status text", () => {
    for (const s of ["ready", "settled", "restarted", "Agent Host is READY"]) {
      expect(hostPillState(s, false), s).toBe("ready");
    }
    for (const s of ["exited", "failed", "crashed"]) {
      expect(hostPillState(s, false), s).toBe("error");
    }
    expect(hostPillState("Agent Host is stopped", false)).toBe("idle");
    expect(hostPillState("", false)).toBe("idle");
  });
});
