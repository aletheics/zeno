import type { HostEvent, RuntimeEvent } from "@zeno/contracts";
import { IPC_PROTOCOL_VERSION } from "@zeno/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  buildTimelineBlocks,
  deriveLiveActivity,
  deriveProcessActivity,
  elapsedDurationLabel,
  formatDurationMs,
  historyToTimeline,
  processBlockCoversLiveActivity,
  projectEventsToTimeline,
  splitAttachedPaths,
  groupDurationMs,
  hasIndependentToolDuration,
  sumToolDurationsMs,
  toolDurationMs,
} from "./timeline.ts";

function runtimeEvent(sequence: number, event: RuntimeEvent): HostEvent {
  return {
    protocolVersion: IPC_PROTOCOL_VERSION,
    type: "runtime.event",
    runtimeId: "runtime-1",
    sequence,
    event,
  };
}

describe("runtime timeline", () => {
  it("renders each delivered queued user message in processing order", () => {
    const timeline = projectEventsToTimeline(
      [
        runtimeEvent(1, { type: "agent.started" }),
        runtimeEvent(2, { type: "user.message", content: "expanded first" }),
        runtimeEvent(3, { type: "message.delta", delta: "working" }),
        runtimeEvent(4, { type: "user.message", content: "expanded queued" }),
      ],
      ["first", "queued"],
    );

    expect(
      timeline.map((item) => ({
        id: item.id,
        kind: item.kind,
        text: "text" in item ? item.text : "",
      })),
    ).toEqual([
      { id: "user-1", kind: "user", text: "first" },
      { id: "assistant-0", kind: "assistant", text: "working" },
      { id: "user-2", kind: "user", text: "queued" },
    ]);
  });

  it("keeps thinking separate and merges tool start and completion into one card", () => {
    const content =
      "Inspect\n\n<attached-paths>\n  <path>/tmp/a&amp;b.pdf</path>\n</attached-paths>";
    const timeline = projectEventsToTimeline(
      [
        runtimeEvent(1, { type: "user.message", content }),
        runtimeEvent(2, { type: "thinking.delta", delta: "Check the inputs" }),
        runtimeEvent(3, { type: "message.delta", delta: "I will inspect it." }),
        runtimeEvent(4, {
          type: "tool.started",
          toolCallId: "tool-1",
          toolName: "read",
          args: { path: "/tmp/a&b.pdf" },
        }),
        runtimeEvent(5, {
          type: "tool.completed",
          toolCallId: "tool-1",
          toolName: "read",
          output: "done",
          isError: false,
        }),
      ],
      ["Inspect"],
    );

    expect(timeline.map((item) => item.kind)).toEqual(["user", "thinking", "assistant", "tool"]);
    expect(timeline[0]).toMatchObject({
      kind: "user",
      text: "Inspect",
      attachments: ["/tmp/a&b.pdf"],
    });
    expect(timeline[3]).toMatchObject({
      kind: "tool",
      toolName: "read",
      status: "completed",
      output: "done",
    });
  });

  it("projects persisted thinking and extracts attached path metadata", () => {
    expect(
      historyToTimeline([
        { role: "thinking", text: "Reasoning" },
        {
          role: "user",
          text: "Open this\n\n<attached-paths><path>/tmp/demo.py</path></attached-paths>",
        },
      ]),
    ).toEqual([
      { id: "history-thinking-0", kind: "thinking", text: "Reasoning" },
      {
        id: "history-user-1",
        kind: "user",
        text: "Open this",
        attachments: ["/tmp/demo.py"],
      },
    ]);
    expect(splitAttachedPaths("plain text")).toEqual({ text: "plain text", paths: [] });
  });

  it("forwards edit tool details.diff so UI can show real file line numbers", () => {
    const details = {
      diff: " 41 return 42;\n+42 return 43;",
      firstChangedLine: 42,
    };
    expect(
      historyToTimeline([
        {
          role: "tool",
          text: "Successfully replaced 1 block(s) in app.ts.",
          toolName: "edit",
          args: {
            path: "app.ts",
            edits: [{ oldText: "return 42;", newText: "return 43;" }],
          },
          details,
        },
      ])[0],
    ).toMatchObject({
      kind: "tool",
      toolName: "edit",
      status: "completed",
      details,
    });
  });

  it("shows shell output from live and persisted sessions", () => {
    expect(
      historyToTimeline([
        {
          role: "shell",
          text: "hello",
          command: "printf hello",
          exitCode: 0,
          excludeFromContext: true,
        },
      ])[0],
    ).toMatchObject({ kind: "system", title: "!! printf hello", text: "```text\nhello\n```" });

    expect(
      projectEventsToTimeline(
        [
          runtimeEvent(1, {
            type: "shell.completed",
            command: "false",
            output: "failed",
            exitCode: 1,
            excludeFromContext: false,
          }),
        ],
        [],
      )[0],
    ).toMatchObject({ kind: "system", title: "! false", tone: "error" });
  });

  it("shows compaction lifecycle events", () => {
    const projected = projectEventsToTimeline(
      [
        runtimeEvent(1, { type: "compaction.started", reason: "manual" }),
        runtimeEvent(2, {
          type: "compaction.completed",
          reason: "manual",
          aborted: false,
        }),
      ],
      [],
    );
    expect(projected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Compaction", text: "Compaction started (manual)" }),
        expect.objectContaining({ title: "Compaction", text: "Compaction completed" }),
      ]),
    );
  });

  it("groups thinking/tools into a process block before assistant", () => {
    const blocks = buildTimelineBlocks([
      { id: "u1", kind: "user", text: "hi", timestamp: "2026-01-01T00:00:00.000Z" },
      { id: "t1", kind: "thinking", text: "plan", timestamp: "2026-01-01T00:00:01.000Z" },
      {
        id: "tool1",
        kind: "tool",
        toolName: "bash",
        status: "completed",
        output: "ok",
        timestamp: "2026-01-01T00:00:05.000Z",
      },
      { id: "a1", kind: "assistant", text: "done", timestamp: "2026-01-01T00:00:45.000Z" },
    ]);
    expect(blocks.map((b) => b.type)).toEqual(["item", "process", "item"]);
    expect(blocks[1]).toMatchObject({
      type: "process",
      startedAt: "2026-01-01T00:00:01.000Z",
      endedAt: "2026-01-01T00:00:45.000Z",
    });
    if (blocks[1]?.type === "process") {
      expect(blocks[1].items).toHaveLength(2);
      expect(blocks[1].open).toBeUndefined();
      expect(blocks[1].durationLabel).toBe("44 s");
    }
  });

  it("keeps a single process for multi-step tool loops in one reply", () => {
    const blocks = buildTimelineBlocks([
      { id: "u1", kind: "user", text: "hi", timestamp: "2026-01-01T00:00:00.000Z" },
      { id: "t1", kind: "thinking", text: "plan", timestamp: "2026-01-01T00:00:01.000Z" },
      {
        id: "tool1",
        kind: "tool",
        toolName: "bash",
        status: "completed",
        timestamp: "2026-01-01T00:00:02.000Z",
      },
      { id: "a-mid", kind: "assistant", text: "mid", timestamp: "2026-01-01T00:00:03.000Z" },
      {
        id: "tool2",
        kind: "tool",
        toolName: "read",
        status: "completed",
        timestamp: "2026-01-01T00:00:04.000Z",
      },
      { id: "a-final", kind: "assistant", text: "done", timestamp: "2026-01-01T00:00:20.000Z" },
    ]);
    const processes = blocks.filter((b) => b.type === "process");
    expect(processes).toHaveLength(1);
    expect(blocks.map((b) => b.type)).toEqual(["item", "process", "item"]);
    if (processes[0]?.type === "process") {
      // thinking + tool + mid assistant(as narrative) + tool
      expect(processes[0].items).toHaveLength(4);
      expect(processes[0].items.map((i) => i.kind)).toEqual([
        "thinking",
        "tool",
        "thinking",
        "tool",
      ]);
      expect(processes[0].startedAt).toBe("2026-01-01T00:00:01.000Z");
      expect(processes[0].endedAt).toBe("2026-01-01T00:00:20.000Z");
    }
    expect(blocks[2]).toMatchObject({ type: "item", item: { id: "a-final", kind: "assistant" } });
  });

  it("does not span duration across earlier turns", () => {
    const blocks = buildTimelineBlocks([
      { id: "u0", kind: "user", text: "old", timestamp: "2026-01-01T00:00:00.000Z" },
      { id: "t0", kind: "thinking", text: "old plan", timestamp: "2026-01-01T00:00:01.000Z" },
      { id: "a0", kind: "assistant", text: "old done", timestamp: "2026-01-01T00:00:10.000Z" },
      { id: "u1", kind: "user", text: "new", timestamp: "2026-01-01T01:00:00.000Z" },
      { id: "t1", kind: "thinking", text: "new plan", timestamp: "2026-01-01T01:00:02.000Z" },
      { id: "a1", kind: "assistant", text: "new done", timestamp: "2026-01-01T01:00:12.000Z" },
    ]);
    const processes = blocks.filter((b) => b.type === "process");
    expect(processes).toHaveLength(2);
    expect(processes[0]).toMatchObject({
      startedAt: "2026-01-01T00:00:01.000Z",
      endedAt: "2026-01-01T00:00:10.000Z",
      durationLabel: "9 s",
    });
    expect(processes[1]).toMatchObject({
      startedAt: "2026-01-01T01:00:02.000Z",
      endedAt: "2026-01-01T01:00:12.000Z",
      durationLabel: "10 s",
    });
  });

  it("marks trailing process groups as open without endedAt", () => {
    const blocks = buildTimelineBlocks([
      { id: "u1", kind: "user", text: "hi", timestamp: "2026-01-01T00:00:00.000Z" },
      { id: "t1", kind: "thinking", text: "plan", timestamp: "2026-01-01T00:00:01.000Z" },
      {
        id: "tool1",
        kind: "tool",
        toolName: "bash",
        status: "running",
        timestamp: "2026-01-01T00:00:02.000Z",
      },
    ]);
    expect(blocks.map((b) => b.type)).toEqual(["item", "process"]);
    expect(blocks[1]).toMatchObject({
      type: "process",
      open: true,
      startedAt: "2026-01-01T00:00:01.000Z",
    });
    if (blocks[1]?.type === "process") {
      expect(blocks[1].endedAt).toBeUndefined();
    }
  });
});

describe("process activity", () => {
  it("derives thinking / executing / processed phases", () => {
    expect(
      deriveProcessActivity([{ id: "t", kind: "thinking", text: "x" }], {
        open: true,
        running: true,
      }),
    ).toEqual({ phase: "thinking" });

    expect(
      deriveProcessActivity(
        [
          { id: "t", kind: "thinking", text: "x" },
          {
            id: "tool",
            kind: "tool",
            toolName: "bash",
            status: "running",
            args: { command: "ls" },
          },
        ],
        { open: true, running: true },
      ),
    ).toEqual({ phase: "executing", toolName: "bash", toolSummary: "ls" });

    expect(
      deriveProcessActivity([{ id: "t", kind: "thinking", text: "x" }], {
        open: false,
        running: false,
      }),
    ).toEqual({ phase: "processed" });
  });

  it("formats live elapsed duration from start to now (s/m/h/d)", () => {
    expect(formatDurationMs(0)).toBe("0 s");
    expect(formatDurationMs(1500)).toBe("1 s");
    expect(formatDurationMs(65_000)).toBe("1 m 5 s");
    expect(formatDurationMs(3_600_000)).toBe("1 h");
    expect(formatDurationMs(90_000_000)).toBe("1 d 1 h");
    expect(formatDurationMs(90_000, "en")).toBe("1 m 30 s");
    expect(formatDurationMs(65_000, "zh")).toBe("1 分 5 秒");
    expect(formatDurationMs(3_600_000, "zh")).toBe("1 时");
    expect(formatDurationMs(90_000_000, "zh")).toBe("1 天 1 时");
    expect(formatDurationMs(12_000, "zh")).toBe("12 秒");
    expect(formatDurationMs(90_000, "zh")).toBe("1 分 30 秒");
    expect(
      elapsedDurationLabel(
        "2026-01-01T00:00:00.000Z",
        undefined,
        Date.parse("2026-01-01T00:00:12.000Z"),
        "en",
      ),
    ).toBe("12 s");
    expect(
      elapsedDurationLabel(
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:01:00.000Z",
        Date.parse("2026-01-01T00:99:00.000Z"),
        "zh",
      ),
    ).toBe("1 分");
  });

  it("measures tool duration only from real start/end timestamps", () => {
    expect(
      toolDurationMs({
        timestamp: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:00:10.000Z",
      }),
    ).toBe(10_000);
    // Completed without endedAt — never invent end = now
    expect(
      toolDurationMs({
        timestamp: "2026-01-01T00:00:00.000Z",
        status: "completed",
      }),
    ).toBeUndefined();
    // Running may use now for live elapsed
    expect(
      toolDurationMs(
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          status: "running",
        },
        Date.parse("2026-01-01T00:00:05.000Z"),
      ),
    ).toBe(5_000);
    // Naive sum counts parallel spans n times
    expect(
      sumToolDurationsMs([
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:10.000Z",
        },
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:12.000Z",
        },
      ]),
    ).toBe(22_000);
    // Group clusters parallel tools by shared start → one wall span (12s, not 22s)
    expect(
      groupDurationMs([
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:10.000Z",
        },
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:12.000Z",
        },
      ]),
    ).toBe(12_000);
    // Sequential distinct starts still sum
    expect(
      groupDurationMs([
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:10.000Z",
        },
        {
          timestamp: "2026-01-01T00:00:10.000Z",
          endedAt: "2026-01-01T00:00:15.000Z",
        },
      ]),
    ).toBe(15_000);
    expect(
      hasIndependentToolDuration(
        { timestamp: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:10.000Z" },
        [
          { timestamp: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:10.000Z" },
          { timestamp: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:12.000Z" },
        ],
      ),
    ).toBe(false);
    expect(
      hasIndependentToolDuration(
        { timestamp: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:10.000Z" },
        [
          { timestamp: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:10.000Z" },
          { timestamp: "2026-01-01T00:00:10.000Z", endedAt: "2026-01-01T00:00:15.000Z" },
        ],
      ),
    ).toBe(true);
  });

  it("derives live activity from recent runtime events", () => {
    const items = [
      {
        id: "u1",
        kind: "user" as const,
        text: "hi",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ];
    expect(
      deriveLiveActivity({
        items: [
          ...items,
          { id: "th", kind: "thinking", text: "...", timestamp: "2026-01-01T00:00:03.000Z" },
        ],
        events: [runtimeEvent(1, { type: "thinking.delta", delta: "..." })],
        running: true,
      }),
    ).toMatchObject({ phase: "thinking", startedAt: "2026-01-01T00:00:03.000Z" });

    expect(
      deriveLiveActivity({
        items,
        events: [
          runtimeEvent(1, {
            type: "tool.started",
            toolCallId: "1",
            toolName: "read",
            args: { path: "a.ts" },
          }),
        ],
        running: true,
      }),
    ).toMatchObject({
      phase: "executing",
      toolName: "read",
      toolSummary: "a.ts",
    });

    expect(
      deriveLiveActivity({
        items,
        events: [runtimeEvent(1, { type: "message.delta", delta: "hi" })],
        running: true,
      }),
    ).toMatchObject({ phase: "responding" });

    expect(
      deriveLiveActivity({
        items,
        events: [runtimeEvent(1, { type: "compaction.started", reason: "threshold" })],
        running: true,
      }),
    ).toMatchObject({ phase: "compacting" });

    // Model error keeps the turn live; auto-retry surfaces as recovering.
    expect(
      deriveLiveActivity({
        items,
        events: [
          runtimeEvent(1, {
            type: "message.failed",
            reason: "error",
            message: "rate limited",
          }),
        ],
        running: true,
      }),
    ).toMatchObject({ phase: "processing" });

    expect(
      deriveLiveActivity({
        items,
        events: [
          runtimeEvent(1, {
            type: "message.failed",
            reason: "error",
            message: "rate limited",
          }),
          runtimeEvent(2, {
            type: "retry.started",
            attempt: 1,
            maxAttempts: 3,
            delayMs: 100,
            errorMessage: "rate limited",
          }),
        ],
        running: true,
      }),
    ).toMatchObject({ phase: "recovering" });
  });

  it("hides trailing live status when open process already covers it", () => {
    const blocks = buildTimelineBlocks([
      { id: "u1", kind: "user", text: "hi" },
      { id: "t1", kind: "thinking", text: "plan" },
    ]);
    expect(processBlockCoversLiveActivity(blocks, { phase: "thinking" })).toBe(true);
    // Responding is shown on the open process header (via livePhase).
    expect(processBlockCoversLiveActivity(blocks, { phase: "responding" })).toBe(true);
    expect(processBlockCoversLiveActivity(blocks, { phase: "compacting" })).toBe(false);
  });

  it("hides trailing compacting status when a Compaction started system row is last", () => {
    const blocks = buildTimelineBlocks([
      { id: "u1", kind: "user", text: "hi" },
      {
        id: "sys",
        kind: "system",
        title: "Compaction",
        text: "Compaction started (threshold)",
        tone: "info",
      },
    ]);
    expect(processBlockCoversLiveActivity(blocks, { phase: "compacting" })).toBe(true);
  });
});
