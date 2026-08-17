import { describe, expect, it } from "vite-plus/test";
import {
  appendMonotonicText,
  applyRuntimeEventToLiveStream,
  assertLiveStreamTextMonotonic,
  emptyLiveStream,
  liveStreamNotCoveredByHistory,
  retractOptimisticUserMessage,
} from "./live-stream.ts";

describe("appendMonotonicText", () => {
  it("appends incremental chunks", () => {
    expect(appendMonotonicText("", "Hel")).toBe("Hel");
    expect(appendMonotonicText("Hel", "lo")).toBe("Hello");
    expect(appendMonotonicText("Hello", "!")).toBe("Hello!");
  });

  it("accepts cumulative full-text snapshots without shrinking", () => {
    expect(appendMonotonicText("Hel", "Hello")).toBe("Hello");
    expect(appendMonotonicText("Hello", "Hello")).toBe("Hello");
  });

  it("ignores exact chunk redelivery", () => {
    expect(appendMonotonicText("Hello", "lo")).toBe("Hello");
    expect(appendMonotonicText("Hello world", "world")).toBe("Hello world");
  });

  it("repairs partial overlap without losing prefix", () => {
    expect(appendMonotonicText("Hello wor", "world!")).toBe("Hello world!");
  });

  it("never returns a shorter string than prev when delta is non-empty prefix-lossy", () => {
    const prev = "The quick brown fox";
    // A totally new delta still appends (we never replace with shorter).
    const next = appendMonotonicText(prev, " jumps");
    expect(next.length).toBeGreaterThanOrEqual(prev.length);
    expect(next.startsWith(prev) || next === prev).toBe(true);
  });
});

describe("live stream (append-only)", () => {
  it("only grows assistant text under many deltas", () => {
    let state = emptyLiveStream();
    for (let i = 0; i < 300; i++) {
      state = applyRuntimeEventToLiveStream(state, { type: "message.delta", delta: `t${i} ` }, [], {
        sequence: i + 1,
      });
    }
    const assistant = state.items.find((item) => item.kind === "assistant");
    expect(assistant?.kind === "assistant" && assistant.text.startsWith("t0 ")).toBe(true);
    expect(assistant?.kind === "assistant" && assistant.text.includes("t299 ")).toBe(true);
    expect(
      assistant?.kind === "assistant" && assistant.text.split(/\s+/).filter(Boolean),
    ).toHaveLength(300);
  });

  it("dedupes by host sequence so redelivery does not double-append", () => {
    let state = emptyLiveStream();
    state = applyRuntimeEventToLiveStream(state, { type: "message.delta", delta: "Hello" }, [], {
      sequence: 10,
    });
    state = applyRuntimeEventToLiveStream(state, { type: "message.delta", delta: "Hello" }, [], {
      sequence: 10,
    });
    state = applyRuntimeEventToLiveStream(state, { type: "message.delta", delta: " world" }, [], {
      sequence: 11,
    });
    const assistant = state.items.find((item) => item.kind === "assistant");
    expect(assistant?.kind === "assistant" && assistant.text).toBe("Hello world");
  });

  it("keeps event order: thinking → assistant → tool → assistant", () => {
    let state = emptyLiveStream();
    state = applyRuntimeEventToLiveStream(state, { type: "thinking.delta", delta: "plan" }, [], {
      sequence: 1,
    });
    state = applyRuntimeEventToLiveStream(state, { type: "message.delta", delta: "Hi" }, [], {
      sequence: 2,
    });
    state = applyRuntimeEventToLiveStream(
      state,
      { type: "tool.started", toolCallId: "1", toolName: "bash", args: { command: "ls" } },
      [],
      { sequence: 3 },
    );
    state = applyRuntimeEventToLiveStream(
      state,
      {
        type: "tool.completed",
        toolCallId: "1",
        toolName: "bash",
        output: "ok",
        isError: false,
      },
      [],
      { sequence: 4 },
    );
    state = applyRuntimeEventToLiveStream(state, { type: "message.delta", delta: "Done" }, [], {
      sequence: 5,
    });

    expect(state.items.map((item) => item.kind)).toEqual([
      "thinking",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(state.items[1]).toMatchObject({ kind: "assistant", text: "Hi" });
    expect(state.items[3]).toMatchObject({ kind: "assistant", text: "Done" });
    expect(state.items[2]).toMatchObject({ kind: "tool", status: "completed" });
  });

  it("never shortens an existing assistant buffer across a long stream", () => {
    let state = emptyLiveStream();
    let prev = state;
    for (let i = 0; i < 200; i++) {
      state = applyRuntimeEventToLiveStream(state, { type: "message.delta", delta: `x${i}` }, [], {
        sequence: i + 1,
      });
      expect(assertLiveStreamTextMonotonic(prev, state)).toBe(true);
      prev = state;
    }
    const assistant = state.items.find((item) => item.kind === "assistant");
    expect(assistant?.kind === "assistant" && assistant.text.startsWith("x0")).toBe(true);
    expect(assistant?.kind === "assistant" && assistant.text.includes("x199")).toBe(true);
  });

  it("handles cumulative provider snapshots without eating the head", () => {
    let state = emptyLiveStream();
    state = applyRuntimeEventToLiveStream(state, { type: "message.delta", delta: "The" }, [], {
      sequence: 1,
    });
    state = applyRuntimeEventToLiveStream(state, { type: "message.delta", delta: "The cat" }, [], {
      sequence: 2,
    });
    state = applyRuntimeEventToLiveStream(
      state,
      { type: "message.delta", delta: "The cat sat" },
      [],
      { sequence: 3 },
    );
    const assistant = state.items.find((item) => item.kind === "assistant");
    expect(assistant?.kind === "assistant" && assistant.text).toBe("The cat sat");
  });

  it("keeps attachment chips on optimistic user rows and merges host echo paths", () => {
    let state = emptyLiveStream();
    const prompts = ["Inspect these"];
    // Optimistic (or full) payload with attached-paths — same shape as sendPrompt.
    state = applyRuntimeEventToLiveStream(
      state,
      {
        type: "user.message",
        content:
          "Inspect these\n\n<attached-paths>\n  <path>/tmp/a.png</path>\n  <path>/tmp/note.md</path>\n</attached-paths>",
      },
      prompts,
      { sequence: 1 },
    );
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({
      kind: "user",
      text: "Inspect these",
      attachments: ["/tmp/a.png", "/tmp/note.md"],
    });

    // Host re-echo with same text + paths must not drop chips or double the row.
    state = applyRuntimeEventToLiveStream(
      state,
      {
        type: "user.message",
        content:
          "Inspect these\n\n<attached-paths>\n  <path>/tmp/a.png</path>\n  <path>/tmp/note.md</path>\n  <path>/tmp/extra.txt</path>\n</attached-paths>",
      },
      prompts,
      { sequence: 2 },
    );
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({
      kind: "user",
      text: "Inspect these",
      attachments: ["/tmp/a.png", "/tmp/note.md", "/tmp/extra.txt"],
    });
  });

  it("fills attachments when optimistic row had text only", () => {
    let state = emptyLiveStream();
    const prompts = ["Look"];
    state = applyRuntimeEventToLiveStream(
      state,
      { type: "user.message", content: "Look" },
      prompts,
      { sequence: 1 },
    );
    expect(state.items[0]).toMatchObject({ kind: "user", text: "Look" });
    expect(
      state.items[0]?.kind === "user" ? state.items[0].attachments : undefined,
    ).toBeUndefined();

    state = applyRuntimeEventToLiveStream(
      state,
      {
        type: "user.message",
        content: "Look\n\n<attached-paths>\n  <path>/tmp/photo.webp</path>\n</attached-paths>",
      },
      prompts,
      { sequence: 2 },
    );
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({
      kind: "user",
      text: "Look",
      attachments: ["/tmp/photo.webp"],
    });
  });

  it("retracts a ghost user row so queued steer does not split the assistant", () => {
    let state = emptyLiveStream();
    state = applyRuntimeEventToLiveStream(
      state,
      { type: "user.message", content: "first" },
      ["first"],
      { sequence: 1 },
    );
    state = applyRuntimeEventToLiveStream(
      state,
      { type: "message.delta", delta: "Working on it" },
      ["first"],
      { sequence: 2 },
    );
    // Bug path: optimistic user for a mid-turn queue lands between assistant chunks.
    state = applyRuntimeEventToLiveStream(
      state,
      { type: "user.message", content: "steer please" },
      ["first", "steer please"],
      { sequence: 3, optimistic: true },
    );
    expect(state.items.map((item) => item.kind)).toEqual(["user", "assistant", "user"]);
    expect(state.promptIndex).toBe(1);

    state = retractOptimisticUserMessage(state, "steer please");
    expect(state.items.map((item) => item.kind)).toEqual(["user", "assistant"]);
    expect(state.promptIndex).toBe(1);

    // Further assistant deltas rejoin the open bubble instead of starting a new one.
    state = applyRuntimeEventToLiveStream(state, { type: "message.delta", delta: "…" }, ["first"], {
      sequence: 4,
    });
    expect(state.items.map((item) => item.kind)).toEqual(["user", "assistant"]);
    expect(state.items[1]).toMatchObject({ kind: "assistant", text: "Working on it…" });
  });

  it("replaces an expanded slash/skill host echo with the optimistic original text", () => {
    let state = emptyLiveStream();
    const prompts = ["/skill:officecli"];
    // Optimistic preview shows the exact typed command.
    state = applyRuntimeEventToLiveStream(
      state,
      { type: "user.message", content: "/skill:officecli" },
      prompts,
      { optimistic: true },
    );
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ kind: "user", text: "/skill:officecli" });
    expect(state.promptIndex).toBe(0);

    // Host echoes the EXPANDED <skill> block — must dedupe against the original
    // and never surface a second bubble carrying the full skill body.
    state = applyRuntimeEventToLiveStream(
      state,
      {
        type: "user.message",
        content:
          '<skill name="officecli" location="/x/officecli">\nReferences are relative to baseDir.\n\nYou can do X.\n</skill>',
      },
      prompts,
      { sequence: 1 },
    );
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ kind: "user", text: "/skill:officecli" });
    expect(state.promptIndex).toBe(1);
  });

  it("ignores retract when the display text is not present", () => {
    let state = emptyLiveStream();
    state = applyRuntimeEventToLiveStream(
      state,
      { type: "user.message", content: "keep me" },
      ["keep me"],
      { sequence: 1 },
    );
    const next = retractOptimisticUserMessage(state, "missing");
    expect(next).toEqual(state);
  });
});

describe("liveStreamNotCoveredByHistory", () => {
  it("drops user/assistant rows already present in history and keeps open tools", () => {
    let state = emptyLiveStream();
    state = applyRuntimeEventToLiveStream(state, { type: "user.message", content: "hi" }, ["hi"], {
      sequence: 1,
    });
    state = applyRuntimeEventToLiveStream(state, { type: "message.delta", delta: "hello" }, [], {
      sequence: 2,
    });
    state = applyRuntimeEventToLiveStream(
      state,
      { type: "tool.started", toolCallId: "t1", toolName: "bash", args: {} },
      [],
      { sequence: 3 },
    );
    const next = liveStreamNotCoveredByHistory(state, [
      { role: "user", text: "hi" },
      { role: "assistant", text: "hello" },
    ]);
    expect(next.items.some((item) => item.kind === "user" || item.kind === "assistant")).toBe(
      false,
    );
    expect(next.items.some((item) => item.kind === "tool" && item.status === "running")).toBe(true);
  });
});
