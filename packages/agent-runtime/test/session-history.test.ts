import { describe, expect, it } from "vite-plus/test";
import { projectHistoryFromSessionManager, projectSessionHistory } from "../src/index.ts";

describe("session history projection", () => {
  it("preserves ordered thinking and assistant text blocks", () => {
    expect(
      projectSessionHistory(
        [
          {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "Inspect context" },
              { type: "text", text: "Here is the result" },
            ],
          },
        ],
        ["entry-1"],
      ),
    ).toEqual([
      { role: "thinking", text: "Inspect context", entryId: "entry-1" },
      { role: "assistant", text: "Here is the result", entryId: "entry-1" },
    ]);
  });

  it("projects persisted shell executions with command metadata", () => {
    expect(
      projectSessionHistory(
        [
          {
            role: "bashExecution",
            command: "printf hello",
            output: "hello",
            exitCode: 0,
            excludeFromContext: true,
          },
        ],
        ["entry-shell"],
      ),
    ).toEqual([
      {
        role: "shell",
        text: "hello",
        command: "printf hello",
        exitCode: 0,
        excludeFromContext: true,
        entryId: "entry-shell",
      },
    ]);
  });

  it("projects tool results with args/command when present", () => {
    expect(
      projectSessionHistory(
        [
          {
            role: "toolResult",
            toolName: "bash",
            content: "ok",
            args: { command: "rg -n foo" },
          },
        ],
        ["entry-tool"],
      ),
    ).toEqual([
      {
        role: "tool",
        text: "ok",
        toolName: "bash",
        isError: false,
        args: { command: "rg -n foo" },
        command: "rg -n foo",
        entryId: "entry-tool",
      },
    ]);
  });

  it("preserves edit tool details.diff with real file line numbers", () => {
    const details = {
      diff: " 41 return 42;\n+42 return 43;",
      patch: "--- a/x\n+++ b/x\n@@ -41,1 +41,1 @@\n-return 42;\n+return 43;\n",
      firstChangedLine: 42,
    };
    expect(
      projectSessionHistory(
        [
          {
            role: "toolResult",
            toolName: "edit",
            content: "Successfully replaced 1 block(s) in x.ts.",
            args: {
              path: "x.ts",
              edits: [{ oldText: "return 42;", newText: "return 43;" }],
            },
            details,
          },
        ],
        ["entry-edit"],
      ),
    ).toEqual([
      {
        role: "tool",
        text: "Successfully replaced 1 block(s) in x.ts.",
        toolName: "edit",
        isError: false,
        args: {
          path: "x.ts",
          edits: [{ oldText: "return 42;", newText: "return 43;" }],
        },
        details,
        entryId: "entry-edit",
      },
    ]);
  });

  it("pairs assistant toolCall args onto later toolResult by toolCallId (pi session shape)", () => {
    const history = projectHistoryFromSessionManager({
      getEntries: () => [
        {
          type: "message",
          id: "a1",
          timestamp: "2026-01-01T00:00:00.000Z",
          message: {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                id: "call-1",
                name: "bash",
                arguments: { command: "pwd; git status" },
              },
              {
                type: "toolCall",
                id: "call-2",
                name: "read",
                arguments: { path: "C:\\\\state.json", offset: 1, limit: 200 },
              },
            ],
          },
        },
        {
          type: "message",
          id: "t1",
          timestamp: "2026-01-01T00:00:23.000Z",
          message: {
            role: "toolResult",
            toolCallId: "call-1",
            toolName: "bash",
            content: [{ type: "text", text: "/tmp\nok" }],
            isError: false,
          },
        },
        {
          type: "message",
          id: "t2",
          timestamp: "2026-01-01T00:00:24.000Z",
          message: {
            role: "toolResult",
            toolCallId: "call-2",
            toolName: "read",
            content: [{ type: "text", text: '{ "version": 1 }' }],
            isError: false,
          },
        },
      ],
    });
    const tools = history.filter((h) => h.role === "tool");
    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({
      role: "tool",
      toolName: "bash",
      command: "pwd; git status",
      args: { command: "pwd; git status" },
      text: "/tmp\nok",
      timestamp: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:23.000Z",
    });
    expect(tools[1]).toMatchObject({
      role: "tool",
      toolName: "read",
      args: { path: "C:\\\\state.json", offset: 1, limit: 200 },
      text: '{ "version": 1 }',
      timestamp: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:24.000Z",
    });
  });

  it("projects compaction entries instead of dropping them", () => {
    expect(
      projectHistoryFromSessionManager({
        getEntries: () => [
          {
            type: "compaction",
            id: "compact-1",
            timestamp: "2026-01-01T00:00:00.000Z",
            summary: "Earlier work summary",
          },
        ],
      }),
    ).toEqual([
      {
        role: "system",
        title: "Compaction",
        text: "Earlier work summary",
        entryId: "compact-1",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("prefers getBranch so abandoned siblings are not shown after navigateTree", () => {
    const allEntries = [
      {
        type: "message",
        id: "u1",
        message: { role: "user", content: "first" },
      },
      {
        type: "message",
        id: "a1",
        message: { role: "assistant", content: [{ type: "text", text: "reply" }] },
      },
      {
        type: "message",
        id: "u2",
        message: { role: "user", content: "second branch" },
      },
    ];
    expect(
      projectHistoryFromSessionManager({
        getEntries: () => allEntries,
        // Active path rewound to first user only (sibling branch hidden).
        getBranch: () => [allEntries[0]!],
      }),
    ).toEqual([{ role: "user", text: "first", entryId: "u1" }]);
  });
});
