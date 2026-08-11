/**
 * Fixture data for the view-mode session-content demo.
 *
 * Rules:
 * - Only TimelineItem shapes the product actually builds (history / live-stream / projectEvents).
 * - Tool args/output/details match pi tool payloads (edit details.diff, write args-only, etc.).
 * - Assistant rich markdown mirrors packages/test-utils fake-openai-server (same e2e fixture).
 * - No decorative “phase galleries” or system lines the product never emits.
 *
 * Path: TimelineItem[] → buildTimelineBlocks → TimelineProcessBlock / TimelineRow /
 * TimelineLiveStatus (same as main.tsx chat timeline).
 */
import { IPC_PROTOCOL_VERSION, type HostEvent, type QueuedMessages } from "@zeno/contracts";
import { SUPPORTED_ATTACHMENT_EXTENSIONS } from "./lib/composer-suggestions.ts";
import type { TimelineItem } from "./lib/timeline.ts";

const iso = (sec: number) => new Date(Date.UTC(2026, 6, 27, 10, 0, sec)).toISOString();

/** Workspace for file-link / media path resolution (demo stub + product workspacePath). */
export const DEMO_WORKSPACE = "/work/pix-demo-project";

/** Every recognized extension plus folder and unknown-file fallbacks. */
export const DEMO_USER_ATTACHMENT_PATHS = [
  `${DEMO_WORKSPACE}/samples/folder`,
  ...SUPPORTED_ATTACHMENT_EXTENSIONS.map(
    (extension) => `${DEMO_WORKSPACE}/samples/sample.${extension}`,
  ),
  `${DEMO_WORKSPACE}/samples/unknown.bin`,
];

/**
 * Same kitchen-sink reply the fake OpenAI server returns for
 * “Render the rich content fixture.” (packages/test-utils).
 * Paths rewritten to DEMO_WORKSPACE so MarkdownContent file/media links resolve.
 */
/**
 * Kitchen-sink assistant body matching packages/test-utils fake-openai rich fixture shape.
 * File/media links are **workspace-relative** (product agent style); callers pass
 * `workspacePath={DEMO_WORKSPACE}` so MarkdownContent resolves them like the real session.
 */
export function richAssistantMarkdown(_workspace = DEMO_WORKSPACE): string {
  void _workspace;
  return [
    "## Rich content",
    "",
    "- [x] Completed task",
    "- [ ] Pending task",
    "",
    "~~Removed text~~",
    "",
    "| Type | Status |",
    "| --- | --- |",
    "| Markdown | Ready |",
    "",
    "Inline math: $E = mc^2$",
    "",
    "$$",
    "E = mc^2",
    "$$",
    "",
    "```javascript",
    "const answer = 42;",
    "```",
    "",
    "```diff",
    "@@ -128,1 +128,1 @@",
    "-const sessionRenderer = createRenderer({ preserveVisibleLineNumbers: false, stickyGutter: false, horizontalOverflow: 'hidden' });",
    "+const sessionRenderer = createRenderer({ preserveVisibleLineNumbers: true, stickyGutter: true, horizontalOverflow: 'auto' });",
    "```",
    "",
    "```mermaid",
    "graph TD",
    "  A --> B",
    "```",
    "",
    "See the fixture file[^1] and the external docs[^docs].",
    "",
    // Relative paths + #L/#C — same shape as product agent replies / e2e rich fixture
    // (workspacePath resolves them; labels render as workspace-relative source chips).
    "[fixture.txt](fixture.txt#L1C1)",
    "[External docs](https://example.com/docs)",
    "",
    "![Preview image](photo.png)",
    "![Demo video](demo.mp4)",
    "",
    "[^1]: Primary source for the fixture path.",
    "[^docs]: https://example.com/docs",
    "",
    '<div data-unsafe-html="true">Unsafe HTML</div>',
    '<iframe src="https://example.com"></iframe>',
    "<style>body { display: none; }</style>",
    "<script>window.__pixUnsafeScript = true;</script>",
  ].join("\n");
}

/**
 * One product-shaped snapshot for the demo page.
 * `running` / `waiting` / `events` feed the same deriveLiveActivity path as main.tsx.
 */
export type DemoScenario = {
  id: string;
  title: string;
  description: string;
  items: TimelineItem[];
  /** Session busy — same flag main.tsx passes into deriveLiveActivity / process blocks. */
  running?: boolean;
  /** Waiting for user input (steering / confirm). */
  waiting?: boolean;
  /** Optional recent host events (e.g. compaction.started) for deriveLiveActivity. */
  events?: HostEvent[];
  /**
   * Mid-turn queue (steer / follow-up). Rendered with product ComposerQueueCard —
   * never as timeline user rows until host delivery.
   */
  queuedMessages?: QueuedMessages;
  /** Abort left the queue paused — show banner + Continue (same as product). */
  queuePaused?: boolean;
};

/** User attachment coverage: every supported extension goes through the product timeline row. */
export function scenarioUserAttachments(): DemoScenario {
  return {
    id: "user-attachments",
    title: "用户消息 · 全格式附件",
    description: `覆盖 ${SUPPORTED_ATTACHMENT_EXTENSIONS.length} 种已识别扩展名，以及文件夹和未知格式回退。附件组右对齐并位于消息上方；图片只显示预览。`,
    items: [
      {
        id: "u-attachments",
        kind: "user",
        text: "请检查这些附件并按类型整理。",
        attachments: DEMO_USER_ATTACHMENT_PATHS,
        timestamp: iso(0),
        entryId: "e-u-attachments",
      },
      {
        id: "asst-attachments",
        kind: "assistant",
        text: "已收到全部附件。",
        timestamp: iso(1),
        entryId: "e-asst-attachments",
      },
    ],
  };
}

/** Closed turn: process → final assistant (rich fixture) — history-like, not running. */
export function scenarioCompletedTurn(): DemoScenario {
  const appPath = `${DEMO_WORKSPACE}/src/app.ts`;
  const notesPath = `${DEMO_WORKSPACE}/notes.md`;
  const notesBody = "# notes\n\nDemo write body.\n";

  return {
    id: "completed",
    title: "已完成一轮",
    description:
      "与产品一致：user → process（thinking / tools / 中间叙述）→ 最终 assistant。running=false，process 头为「已处理」且默认折叠（仅手动展开）。",
    items: [
      {
        id: "u1",
        kind: "user",
        text: "Render the rich content fixture.\n\nPlease inspect the workspace and summarize.",
        attachments: [`${DEMO_WORKSPACE}/fixture.txt`, `${DEMO_WORKSPACE}/photo.png`],
        timestamp: iso(0),
        entryId: "e-u1",
      },
      {
        id: "th1",
        kind: "thinking",
        text: "List files, read the fixture, then answer with the rich content body.",
        timestamp: iso(1),
      },
      {
        id: "tool-ls",
        kind: "tool",
        toolCallId: "c-ls",
        toolName: "bash",
        status: "completed",
        args: { command: "ls -la src" },
        output: "total 12\ndrwxr-xr-x  app.ts\ndrwxr-xr-x  lib/\n-rw-r--r--  README.md",
        timestamp: iso(2),
        endedAt: iso(3),
      },
      {
        id: "tool-read",
        kind: "tool",
        toolCallId: "c-read",
        toolName: "read",
        status: "completed",
        args: { path: appPath },
        output: "export function main() {\n  return 42;\n}\n",
        timestamp: iso(3),
        endedAt: iso(4),
      },
      {
        id: "tool-edit",
        kind: "tool",
        toolCallId: "c-edit",
        toolName: "edit",
        status: "completed",
        args: {
          path: appPath,
          edits: [
            {
              oldText: "export function main() {\n  return 42;\n}\n",
              newText: "export function main() {\n  return 43;\n}\n",
            },
          ],
        },
        // pi edit tool details.diff (generateDiffString) — whole-file 1-based lines
        details: {
          diff: [" 1 export function main() {", "-2   return 42;", "+2   return 43;", " 3 }"].join(
            "\n",
          ),
          firstChangedLine: 2,
        },
        output: `Successfully replaced 1 block(s) in ${appPath}.`,
        timestamp: iso(5),
        endedAt: iso(6),
      },
      {
        id: "tool-write",
        kind: "tool",
        toolCallId: "c-write",
        toolName: "write",
        status: "completed",
        args: { path: notesPath, content: notesBody },
        // write tool has no details.diff — UI builds display diff from args
        output: `Successfully wrote ${notesBody.length} bytes to ${notesPath}`,
        timestamp: iso(6),
        endedAt: iso(7),
      },
      {
        id: "tool-fail",
        kind: "tool",
        toolCallId: "c-fail",
        toolName: "bash",
        status: "error",
        args: { command: "cat /missing/file" },
        output: "cat: /missing/file: No such file or directory",
        timestamp: iso(7),
        endedAt: iso(8),
      },
      {
        id: "asst-mid",
        kind: "assistant",
        text: "Tools finished; composing the summary.",
        timestamp: iso(8),
        entryId: "e-mid",
      },
      {
        id: "th2",
        kind: "thinking",
        text: "Emit the rich content fixture as the final reply.",
        timestamp: iso(9),
      },
      {
        id: "asst-final",
        kind: "assistant",
        text: richAssistantMarkdown(),
        timestamp: iso(12),
        entryId: "e-final",
      },
    ],
  };
}

/** Open process: running tool — process header shows executing (no trailing live status). */
export function scenarioLiveExecuting(): DemoScenario {
  return {
    id: "live-executing",
    title: "进行中 · 执行工具",
    description:
      "running=true，末条 tool status=running → deriveLiveActivity phase=executing，由 open process 头部展示。",
    running: true,
    items: [
      {
        id: "u-exec",
        kind: "user",
        text: "Run the tests and fix failures.",
        timestamp: iso(20),
        entryId: "e-u-exec",
      },
      {
        id: "th-exec",
        kind: "thinking",
        text: "Run the unit suite first.",
        timestamp: iso(21),
      },
      {
        id: "tool-run",
        kind: "tool",
        toolCallId: "c-run",
        toolName: "bash",
        status: "running",
        args: { command: "pnpm test" },
        timestamp: iso(22),
      },
    ],
  };
}

/**
 * Open process after tools; trailing assistant stream → responding on process header
 * (processBlockCoversLiveActivity suppresses trailing TimelineLiveStatus).
 */
export function scenarioLiveResponding(): DemoScenario {
  return {
    id: "live-responding",
    title: "进行中 · 正在回复",
    description:
      "running=true，末条 assistant 流式正文 → deriveLiveActivity phase=responding，挂在 open process 头部。",
    running: true,
    items: [
      {
        id: "u-resp",
        kind: "user",
        text: "Summarize the plan.",
        timestamp: iso(30),
        entryId: "e-u-resp",
      },
      {
        id: "th-resp",
        kind: "thinking",
        text: "Read README, then answer.",
        timestamp: iso(31),
      },
      {
        id: "tool-resp",
        kind: "tool",
        toolCallId: "c-resp-read",
        toolName: "read",
        status: "completed",
        args: { path: `${DEMO_WORKSPACE}/README.md` },
        output: "# Demo\n\nFixture read for the responding phase.\n",
        timestamp: iso(32),
        endedAt: iso(33),
      },
      {
        id: "asst-stream",
        kind: "assistant",
        text: "Here is a short plan based on the README…",
        timestamp: iso(34),
        entryId: "e-asst-stream",
      },
    ],
  };
}

/**
 * Compaction in flight: system row from compaction.started + trailing live status
 * (compacting is never folded into the process header).
 */
export function scenarioCompacting(): DemoScenario {
  return {
    id: "compacting",
    title: "进行中 · 压缩上下文",
    description:
      "running + compaction.started → TimelineLiveStatus「正在压缩上下文」（Marker shimmer）；与 system 投影一致。",
    running: true,
    events: [
      {
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "runtime.event",
        runtimeId: "demo",
        sequence: 1,
        event: { type: "compaction.started", reason: "threshold" },
      },
    ],
    items: [
      {
        id: "u-compact",
        kind: "user",
        text: "Continue after a long history.",
        timestamp: iso(40),
        entryId: "e-u-compact",
      },
      {
        id: "th-compact",
        kind: "thinking",
        text: "Context is nearly full.",
        timestamp: iso(41),
      },
      {
        id: "sys-compact-start",
        kind: "system",
        title: "Compaction",
        text: "Compaction started (threshold)",
        tone: "info",
        timestamp: iso(44),
      },
    ],
  };
}

/** Compaction finished in history (no live status). */
export function scenarioCompactionDone(): DemoScenario {
  return {
    id: "compaction-done",
    title: "历史 · 压缩完成",
    description:
      "历史压缩完成：Marker variant=separator「上下文已压缩」；running=false，无 live status。",
    items: [
      {
        id: "u-cd",
        kind: "user",
        text: "Keep going.",
        timestamp: iso(50),
        entryId: "e-u-cd",
      },
      {
        id: "sys-cs",
        kind: "system",
        title: "Compaction",
        text: "Compaction started (threshold)",
        tone: "info",
        timestamp: iso(51),
      },
      {
        id: "sys-ce",
        kind: "system",
        title: "Compaction",
        text: "Compaction completed",
        tone: "info",
        timestamp: iso(55),
      },
      {
        id: "asst-cd",
        kind: "assistant",
        text: "Context compacted. Continuing from the summary.",
        timestamp: iso(56),
        entryId: "e-asst-cd",
      },
    ],
  };
}

/** Waiting for user input — trailing TimelineLiveStatus only. */
export function scenarioWaiting(): DemoScenario {
  return {
    id: "waiting",
    title: "等待输入",
    description:
      "waiting=true → deriveLiveActivity phase=waiting；无 open process，时间线末尾 TimelineLiveStatus。",
    waiting: true,
    items: [
      {
        id: "u-wait",
        kind: "user",
        text: "Please confirm before applying the patch.",
        timestamp: iso(60),
        entryId: "e-u-wait",
      },
      {
        id: "asst-wait",
        kind: "assistant",
        text: "I can apply the change once you confirm. Reply **yes** to continue.",
        timestamp: iso(61),
        entryId: "e-asst-wait",
      },
    ],
  };
}

/**
 * Live turn with steer queue — product ComposerQueueCard (per-row list, all items).
 * Queued text must not appear as timeline user rows (chat-view queue contract).
 */
export function scenarioLiveQueue(): DemoScenario {
  return {
    id: "live-queue",
    title: "进行中 · 消息队列",
    description:
      "running=true + Pi 原生队列。仅提供整队「清空」；排队消息在 Pi 投递前不进入时间线 user 行。",
    running: true,
    queuedMessages: {
      steering: ["4", "5", "6"],
      followUp: [],
    },
    items: [
      {
        id: "u-queue",
        kind: "user",
        text: "Refactor the queue path and keep the timeline clean.",
        timestamp: iso(70),
        entryId: "e-u-queue",
      },
      {
        id: "th-queue",
        kind: "thinking",
        text: "Stream a short plan while steer messages sit in the queue card only.",
        timestamp: iso(71),
      },
      {
        id: "tool-queue",
        kind: "tool",
        toolCallId: "c-queue-read",
        toolName: "read",
        status: "completed",
        args: { path: `${DEMO_WORKSPACE}/src/renderer/main.tsx` },
        output: "async function sendPrompt(...) { /* queue path */ }\n",
        timestamp: iso(72),
        endedAt: iso(73),
      },
      {
        id: "asst-queue-stream",
        kind: "assistant",
        text: "I am adjusting the queue path so mid-turn messages stay off the timeline until delivery…",
        timestamp: iso(74),
        entryId: "e-asst-queue",
      },
    ],
  };
}

/**
 * Aborted mid-turn with remaining queue — paused banner + Continue (reference UI).
 */
export function scenarioPausedQueue(): DemoScenario {
  return {
    id: "paused-queue",
    title: "中断 · 队列已暂停",
    description:
      "用户中断后队列暂停：横幅「由于你中断了当前响应，队列已暂停」+「继续」；剩余引导行仍可删除。",
    running: false,
    queuePaused: true,
    queuedMessages: {
      steering: ["5", "6"],
      followUp: [],
    },
    items: [
      {
        id: "u-paused",
        kind: "user",
        text: "Keep refining the queue chrome until it matches the product strip.",
        timestamp: iso(80),
        entryId: "e-u-paused",
      },
      {
        id: "asst-paused",
        kind: "assistant",
        text: "Working on the queue card layout — interrupted before finish.",
        timestamp: iso(81),
        entryId: "e-asst-paused",
      },
    ],
  };
}

export function allDemoScenarios(): DemoScenario[] {
  return [
    scenarioCompletedTurn(),
    scenarioUserAttachments(),
    scenarioLiveExecuting(),
    scenarioLiveResponding(),
    scenarioLiveQueue(),
    scenarioPausedQueue(),
    scenarioCompacting(),
    scenarioCompactionDone(),
    scenarioWaiting(),
  ];
}
