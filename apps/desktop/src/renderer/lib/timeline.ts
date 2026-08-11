import type { HostEvent, SessionHistoryMessage } from "@zeno/contracts";

export type ThreadRunState =
  | "idle"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "aborted"
  | "crashed"
  | "recovering";

export type TimelineItem =
  | {
      id: string;
      kind: "user";
      text: string;
      attachments?: string[];
      timestamp?: string;
      entryId?: string;
    }
  | {
      id: string;
      kind: "assistant";
      text: string;
      timestamp?: string;
      entryId?: string;
    }
  | { id: string; kind: "thinking"; text: string; timestamp?: string }
  | {
      id: string;
      kind: "tool";
      toolCallId?: string;
      toolName: string;
      status: "running" | "completed" | "error";
      args?: unknown;
      output?: string;
      /** Tool result details (e.g. edit `diff` with real file line numbers). */
      details?: unknown;
      /** ISO start (usually tool.started). */
      timestamp?: string;
      /** ISO end when tool.completed was observed. */
      endedAt?: string;
    }
  | {
      id: string;
      kind: "system";
      text: string;
      title?: string;
      tone?: "info" | "error";
      timestamp?: string;
      /** True when projected from extension custom message/entry (generic fallback). */
      extension?: boolean;
    };

/**
 * Live / process-header activity (Codex + pi TUI parity).
 * - thinking / executing / processing / responding while busy
 * - waiting / compacting / summarizing for special phases
 * - processed once the process group is closed
 */
export type ProcessActivityPhase =
  | "thinking"
  | "executing"
  | "processing"
  | "responding"
  | "waiting"
  | "recovering"
  | "compacting"
  | "summarizing"
  | "processed";

export type ProcessActivity = {
  phase: ProcessActivityPhase;
  toolName?: string;
  toolSummary?: string;
};

/** Render blocks: process steps collapse under “已处理” / live activity. */
export type TimelineBlock =
  | { type: "item"; item: TimelineItem }
  | {
      type: "process";
      id: string;
      items: Array<Extract<TimelineItem, { kind: "thinking" | "tool" }>>;
      /** ISO start of the first process step (for live elapsed). */
      startedAt?: string;
      /** ISO end when the group is closed by a following non-process item. */
      endedAt?: string;
      /** Trailing group not yet closed (still the open process under the turn). */
      open?: boolean;
      /** @deprecated Prefer startedAt/endedAt + live formatting. */
      durationLabel?: string;
    };

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function splitAttachedPaths(value: string): { text: string; paths: string[] } {
  const block = /\n*<attached-paths>\s*([\s\S]*?)\s*<\/attached-paths>\s*$/i.exec(value);
  if (!block) return { text: value, paths: [] };
  const paths = [...(block[1] ?? "").matchAll(/<path>([\s\S]*?)<\/path>/gi)]
    .map((match) => decodeXml(match[1] ?? "").trim())
    .filter(Boolean);
  return { text: value.slice(0, block.index).trimEnd(), paths };
}

export function deriveRunState(input: {
  hostStatus: string;
  running: boolean;
  lastFailure?: string | undefined;
}): ThreadRunState {
  const status = input.hostStatus.toLowerCase();
  if (status.includes("exited") || status.includes("crash")) return "crashed";
  if (status.includes("restart") && !status.includes("ready")) return "recovering";
  // Busy flag is authoritative for the foreground session.
  if (input.running) return "running";
  if (input.lastFailure) return "failed";
  if (status.includes("abort")) return "aborted";
  // Host "ready" / "settled" are lifecycle strings, NOT a completed-turn glyph.
  // Completed flash lives in per-session markers only.
  if (status.includes("stopped")) return "idle";
  return "idle";
}

export function historyToTimeline(history: SessionHistoryMessage[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const [index, item] of history.entries()) {
    if (item.role === "user") {
      const content = splitAttachedPaths(item.text);
      items.push({
        id: `history-user-${index}`,
        kind: "user",
        text: content.text,
        ...(content.paths.length > 0 ? { attachments: content.paths } : {}),
        ...(item.entryId ? { entryId: item.entryId } : {}),
        ...(item.timestamp ? { timestamp: item.timestamp } : {}),
      });
      continue;
    }
    if (item.role === "assistant") {
      items.push({
        id: `history-assistant-${index}`,
        kind: "assistant",
        text: item.text,
        ...(item.entryId ? { entryId: item.entryId } : {}),
        ...(item.timestamp ? { timestamp: item.timestamp } : {}),
      });
      continue;
    }
    if (item.role === "thinking") {
      items.push({
        id: `history-thinking-${index}`,
        kind: "thinking",
        text: item.text,
        ...(item.timestamp ? { timestamp: item.timestamp } : {}),
      });
      continue;
    }
    if (item.role === "tool") {
      // Prefer explicit command / args so process rows show "运行 rg …" not bare "bash".
      // Args/command are usually joined from assistant toolCall → toolResult in the runtime.
      const args =
        item.args !== undefined ? item.args : item.command ? { command: item.command } : undefined;
      items.push({
        id: `history-tool-${index}`,
        kind: "tool",
        toolName: item.toolName ?? "tool",
        status: item.isError === true ? "error" : "completed",
        output: item.text,
        ...(args !== undefined ? { args } : {}),
        // edit tool details.diff has real 1-based file line numbers from pi.
        ...(item.details !== undefined ? { details: item.details } : {}),
        ...(item.timestamp ? { timestamp: item.timestamp } : {}),
        ...(item.endedAt ? { endedAt: item.endedAt } : {}),
      });
      continue;
    }
    if (item.role === "shell") {
      const commandPrefix = item.excludeFromContext ? "!!" : "!";
      items.push({
        id: `history-shell-${index}`,
        kind: "system",
        title: `${commandPrefix} ${item.command ?? ""}`.trimEnd(),
        text: shellOutputMarkdown(item.text, item.exitCode ?? 0),
        tone: (item.exitCode ?? 0) === 0 ? "info" : "error",
        ...(item.timestamp ? { timestamp: item.timestamp } : {}),
      });
      continue;
    }
    items.push({
      id: `history-system-${index}`,
      kind: "system",
      text: item.text,
      ...(item.title ? { title: item.title } : {}),
      ...(item.timestamp ? { timestamp: item.timestamp } : {}),
    });
  }
  return items;
}

export function projectEventsToTimeline(
  events: HostEvent[],
  prompts: string[],
  options?: {
    /**
     * When true, ignore message/thinking deltas — liveStream owns streamed text
     * so ring-buffer drops cannot shrink the reply.
     */
    skipTextDeltas?: boolean;
  },
): TimelineItem[] {
  const skipTextDeltas = options?.skipTextDeltas === true;
  const items: TimelineItem[] = [];
  let assistantBuffer = "";
  let thinkingBuffer = "";
  let assistantId = 0;
  let thinkingId = 0;
  let promptIndex = 0;
  const tools = new Map<string, Extract<TimelineItem, { kind: "tool" }>>();
  const now = () => new Date().toISOString();

  const flushAssistant = () => {
    if (!assistantBuffer) return;
    items.push({
      id: `assistant-${assistantId++}`,
      kind: "assistant",
      text: assistantBuffer,
      timestamp: now(),
    });
    assistantBuffer = "";
  };

  const flushThinking = () => {
    if (!thinkingBuffer) return;
    items.push({
      id: `thinking-${thinkingId++}`,
      kind: "thinking",
      text: thinkingBuffer,
      timestamp: now(),
    });
    thinkingBuffer = "";
  };

  const flushMessage = () => {
    flushThinking();
    flushAssistant();
  };

  for (const event of events) {
    if (event.type === "runtime.event") {
      const { event: runtimeEvent } = event;
      if (runtimeEvent.type === "agent.started") {
        flushMessage();
      } else if (runtimeEvent.type === "user.message") {
        flushMessage();
        const source = splitAttachedPaths(runtimeEvent.content);
        const prompt = prompts[promptIndex++] ?? source.text;
        if (prompt || source.paths.length > 0) {
          items.push({
            id: `user-${promptIndex}`,
            kind: "user",
            text: prompt,
            ...(source.paths.length > 0 ? { attachments: source.paths } : {}),
            timestamp: now(),
          });
        }
      } else if (runtimeEvent.type === "thinking.delta") {
        if (skipTextDeltas) continue;
        flushAssistant();
        thinkingBuffer += runtimeEvent.delta;
      } else if (runtimeEvent.type === "message.delta") {
        if (skipTextDeltas) continue;
        flushThinking();
        assistantBuffer += runtimeEvent.delta;
      } else if (runtimeEvent.type === "message.completed") {
        flushMessage();
      } else if (runtimeEvent.type === "message.failed") {
        flushMessage();
        items.push({
          id: `system-fail-${items.length}`,
          kind: "system",
          text: runtimeEvent.message,
          title:
            runtimeEvent.reason === "aborted"
              ? "Response stopped"
              : runtimeEvent.reason === "pending"
                ? "Response pending"
                : runtimeEvent.reason === "deferred"
                  ? "Response deferred"
                  : "Response failed",
          tone:
            runtimeEvent.reason === "pending" || runtimeEvent.reason === "deferred"
              ? "info"
              : "error",
          timestamp: now(),
        });
      } else if (runtimeEvent.type === "retry.started") {
        flushMessage();
        items.push({
          id: `retry-start-${items.length}`,
          kind: "system",
          title: "Retry",
          text: `Retry ${runtimeEvent.attempt}/${runtimeEvent.maxAttempts} in ${runtimeEvent.delayMs}ms — ${runtimeEvent.errorMessage}`,
          tone: "info",
          timestamp: now(),
        });
      } else if (runtimeEvent.type === "retry.ended") {
        flushMessage();
        if (!runtimeEvent.success) {
          items.push({
            id: `retry-end-${items.length}`,
            kind: "system",
            title: "Retry",
            text: runtimeEvent.finalError ?? `Retry failed after ${runtimeEvent.attempt} attempts`,
            tone: "error",
            timestamp: now(),
          });
        }
      } else if (runtimeEvent.type === "tool.started") {
        flushMessage();
        const tool: Extract<TimelineItem, { kind: "tool" }> = {
          id: `tool-start-${runtimeEvent.toolCallId}`,
          kind: "tool",
          toolCallId: runtimeEvent.toolCallId,
          toolName: runtimeEvent.toolName,
          status: "running",
          args: runtimeEvent.args,
          timestamp: now(),
        };
        tools.set(runtimeEvent.toolCallId, tool);
        items.push(tool);
      } else if (runtimeEvent.type === "tool.completed") {
        flushMessage();
        const endTs = now();
        const tool = tools.get(runtimeEvent.toolCallId);
        if (tool) {
          tool.status = runtimeEvent.isError ? "error" : "completed";
          tool.output = runtimeEvent.output || (runtimeEvent.isError ? "Tool failed" : "Done");
          tool.endedAt = endTs;
          if (runtimeEvent.details !== undefined) tool.details = runtimeEvent.details;
        } else {
          items.push({
            id: `tool-end-${runtimeEvent.toolCallId}`,
            kind: "tool",
            toolCallId: runtimeEvent.toolCallId,
            toolName: runtimeEvent.toolName,
            status: runtimeEvent.isError ? "error" : "completed",
            output: runtimeEvent.output || (runtimeEvent.isError ? "Tool failed" : "Done"),
            ...(runtimeEvent.details !== undefined ? { details: runtimeEvent.details } : {}),
            timestamp: endTs,
            endedAt: endTs,
          });
        }
      } else if (runtimeEvent.type === "shell.completed") {
        flushMessage();
        const commandPrefix = runtimeEvent.excludeFromContext ? "!!" : "!";
        items.push({
          id: `shell-${items.length}`,
          kind: "system",
          title: `${commandPrefix} ${runtimeEvent.command}`,
          text: shellOutputMarkdown(runtimeEvent.output, runtimeEvent.exitCode),
          tone: runtimeEvent.exitCode === 0 ? "info" : "error",
          timestamp: now(),
        });
      } else if (runtimeEvent.type === "compaction.started") {
        flushMessage();
        items.push({
          id: `compaction-start-${items.length}`,
          kind: "system",
          title: "Compaction",
          text: `Compaction started (${runtimeEvent.reason})`,
          tone: "info",
          timestamp: now(),
        });
      } else if (runtimeEvent.type === "compaction.completed") {
        flushMessage();
        items.push({
          id: `compaction-end-${items.length}`,
          kind: "system",
          title: "Compaction",
          text:
            runtimeEvent.errorMessage ??
            (runtimeEvent.aborted ? "Compaction aborted" : "Compaction completed"),
          tone: runtimeEvent.errorMessage || runtimeEvent.aborted ? "error" : "info",
          timestamp: now(),
        });
      } else if (runtimeEvent.type === "custom.message") {
        flushMessage();
        items.push({
          id: `custom-${items.length}`,
          kind: "system",
          title: runtimeEvent.customType,
          text: runtimeEvent.content || summarizeData(runtimeEvent.details),
          tone: "info",
          timestamp: now(),
          extension: true,
        });
      } else if (runtimeEvent.type === "custom.entry") {
        flushMessage();
        items.push({
          id: `custom-entry-${items.length}`,
          kind: "system",
          title: runtimeEvent.customType,
          text: summarizeData(runtimeEvent.data),
          tone: "info",
          timestamp: now(),
          extension: true,
        });
      }
    } else if (event.type === "host.crashed") {
      flushMessage();
      items.push({
        id: `crash-${items.length}`,
        kind: "system",
        text: event.message,
        title: "Agent Host crashed",
        tone: "error",
        timestamp: now(),
      });
    } else if (event.type === "host.restarted") {
      flushMessage();
      items.push({
        id: `restart-${items.length}`,
        kind: "system",
        text: "Agent Host restarted",
        tone: "info",
        timestamp: now(),
      });
    }
  }

  flushMessage();
  return items;
}

function shellOutputMarkdown(output: string, exitCode: number): string {
  const body = output || `(exit ${exitCode})`;
  return `\`\`\`text\n${body.trimEnd()}\n\`\`\``;
}

type ProcessStepItem = Extract<TimelineItem, { kind: "thinking" | "tool" }>;

/**
 * One user turn → at most one process block (“已处理”).
 *
 * Multi-step agent loops (thinking → tools → mid assistant → tools → final)
 * used to flush a process on every assistant and produced multiple headers.
 * Now the whole turn shares a single process; intermediate assistant text is
 * folded in as narrative steps; only the last assistant stays as the final reply.
 */
export function buildTimelineBlocks(items: TimelineItem[]): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];
  /** Non-user items since the last user message. */
  let turn: TimelineItem[] = [];

  const pushProcess = (steps: ProcessStepItem[], open: boolean, endTs: string | undefined) => {
    if (steps.length === 0) return;
    const startedAt = steps[0]?.timestamp;
    const lastStep = steps[steps.length - 1]?.timestamp;
    const endedAt = open ? undefined : (endTs ?? lastStep);
    let durationLabel: string | undefined;
    if (!open && startedAt && endedAt) {
      const ms = Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime());
      durationLabel = formatDurationMs(ms);
    }
    blocks.push({
      type: "process",
      id: `process-${steps[0]!.id}`,
      items: steps,
      ...(startedAt ? { startedAt } : {}),
      ...(!open && endedAt ? { endedAt } : {}),
      ...(open ? { open: true } : {}),
      ...(durationLabel ? { durationLabel } : {}),
    });
  };

  const flushTurn = (open: boolean) => {
    if (turn.length === 0) return;

    let lastAssistantIdx = -1;
    for (let i = turn.length - 1; i >= 0; i--) {
      if (turn[i]?.kind === "assistant") {
        lastAssistantIdx = i;
        break;
      }
    }

    const steps: ProcessStepItem[] = [];
    const emitSystem = (item: TimelineItem) => {
      if (item.kind === "system") blocks.push({ type: "item", item });
    };

    if (lastAssistantIdx >= 0 && !open) {
      // Closed turn: one process for everything before the final assistant.
      for (let i = 0; i < lastAssistantIdx; i++) {
        const it = turn[i]!;
        if (it.kind === "thinking" || it.kind === "tool") {
          steps.push(it);
        } else if (it.kind === "assistant") {
          // Intermediate model text inside the process body (Codex-style narrative).
          steps.push({
            id: `${it.id}:narrative`,
            kind: "thinking",
            text: it.text,
            ...(it.timestamp ? { timestamp: it.timestamp } : {}),
          });
        } else {
          emitSystem(it);
        }
      }
      const finalAssistant = turn[lastAssistantIdx]!;
      pushProcess(
        steps,
        false,
        finalAssistant.kind === "assistant" ? finalAssistant.timestamp : undefined,
      );
      blocks.push({ type: "item", item: finalAssistant });
      for (let i = lastAssistantIdx + 1; i < turn.length; i++) {
        const it = turn[i]!;
        if (it.kind === "thinking" || it.kind === "tool") {
          // Rare trailing steps after final text — still one process already closed;
          // append as open process only if needed (keep single closed process + items).
          blocks.push({ type: "item", item: it });
        } else {
          blocks.push({ type: "item", item: it });
        }
      }
    } else {
      // Open / in-progress: one open process through the last tool/thinking;
      // trailing assistant text stays outside so the final reply can stream.
      let lastStepIdx = -1;
      for (let i = 0; i < turn.length; i++) {
        const k = turn[i]?.kind;
        if (k === "thinking" || k === "tool") lastStepIdx = i;
      }
      if (lastStepIdx < 0) {
        for (const it of turn) blocks.push({ type: "item", item: it });
      } else {
        for (let i = 0; i <= lastStepIdx; i++) {
          const it = turn[i]!;
          if (it.kind === "thinking" || it.kind === "tool") {
            steps.push(it);
          } else if (it.kind === "assistant") {
            steps.push({
              id: `${it.id}:narrative`,
              kind: "thinking",
              text: it.text,
              ...(it.timestamp ? { timestamp: it.timestamp } : {}),
            });
          } else {
            emitSystem(it);
          }
        }
        pushProcess(steps, true, undefined);
        for (let i = lastStepIdx + 1; i < turn.length; i++) {
          blocks.push({ type: "item", item: turn[i]! });
        }
      }
    }

    turn = [];
  };

  for (const item of items) {
    if (item.kind === "user") {
      flushTurn(false);
      blocks.push({ type: "item", item });
      continue;
    }
    turn.push(item);
  }
  // Last turn is open only while still on tools/thinking (no final assistant yet).
  const last = turn[turn.length - 1];
  flushTurn(Boolean(last && last.kind !== "assistant"));
  return blocks;
}

/** Activity for a process group header (thinking / tool / done). */
export function deriveProcessActivity(
  items: Array<Extract<TimelineItem, { kind: "thinking" | "tool" }>>,
  options: { open?: boolean; running?: boolean; waiting?: boolean } = {},
): ProcessActivity {
  if (options.waiting) return { phase: "waiting" };
  if (!options.open || !options.running) return { phase: "processed" };

  const runningTool = [...items]
    .reverse()
    .find((item): item is Extract<TimelineItem, { kind: "tool" }> => {
      return item.kind === "tool" && item.status === "running";
    });
  if (runningTool) {
    return {
      phase: "executing",
      toolName: runningTool.toolName,
      ...(toolSummaryLine(runningTool.args)
        ? { toolSummary: toolSummaryLine(runningTool.args) }
        : {}),
    };
  }

  const last = items[items.length - 1];
  if (last?.kind === "thinking") return { phase: "thinking" };
  return { phase: "processing" };
}

/**
 * Trailing live status when the agent is busy but the open process block
 * does not already cover the phase (e.g. pure thinking still buffered,
 * assistant streaming, compaction, or just-started turn).
 */
export function deriveLiveActivity(input: {
  items: TimelineItem[];
  events: HostEvent[];
  running: boolean;
  waiting?: boolean;
}): (ProcessActivity & { startedAt?: string }) | null {
  if (!input.running && !input.waiting) return null;

  const withStart = (
    activity: ProcessActivity,
    startedAt: string | undefined,
  ): ProcessActivity & { startedAt?: string } =>
    startedAt ? { ...activity, startedAt } : activity;

  const startedAt = currentSegmentStartedAt(input.items);

  if (input.waiting) {
    return withStart({ phase: "waiting" }, startedAt);
  }

  const fromEvents = phaseFromRecentEvents(input.events);
  if (fromEvents) {
    return withStart(fromEvents, startedAt);
  }

  const last = input.items[input.items.length - 1];
  if (last?.kind === "thinking") return withStart({ phase: "thinking" }, startedAt);
  if (last?.kind === "tool" && last.status === "running") {
    const summary = toolSummaryLine(last.args);
    return withStart(
      {
        phase: "executing",
        toolName: last.toolName,
        ...(summary ? { toolSummary: summary } : {}),
      },
      startedAt,
    );
  }
  if (last?.kind === "assistant") {
    // Responding: clock from current open process segment, else this assistant bubble.
    return withStart({ phase: "responding" }, startedAt ?? last.timestamp);
  }
  if (last?.kind === "system" && last.title === "Compaction" && /started/i.test(last.text)) {
    return withStart({ phase: "compacting" }, last.timestamp ?? startedAt);
  }

  return withStart({ phase: "processing" }, startedAt);
}

/**
 * True when an open process block (or a dedicated system row) already paints the live phase.
 * Avoids double markers (e.g. Compaction started system + trailing compacting status).
 * Responding is folded into the open process header via `resolveProcessActivity`.
 */
export function processBlockCoversLiveActivity(
  blocks: TimelineBlock[],
  activity: ProcessActivity | null,
): boolean {
  if (!activity || activity.phase === "processed") return false;

  // Compaction started is already a system Marker (shimmer); skip trailing live status.
  if (activity.phase === "compacting") {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (!b || b.type !== "item") continue;
      const it = b.item;
      if (it.kind === "system" && it.title === "Compaction" && /started/i.test(it.text)) {
        return true;
      }
      break;
    }
    return false;
  }

  const last = blocks[blocks.length - 1];
  if (!last || last.type !== "process" || !last.open) return false;
  // Waiting / summarizing stay as trailing markers (not process-header phases).
  // Recovering is folded into the open process header via livePhase.
  if (activity.phase === "waiting" || activity.phase === "summarizing") {
    return false;
  }
  return true;
}

/**
 * When assistant text is streaming, the process group is still open (assistant not
 * flushed yet). Prefer the live event phase for the process header so we don't
 * keep saying "Thinking" while tokens are already arriving.
 */
export function resolveProcessActivity(
  items: Array<Extract<TimelineItem, { kind: "thinking" | "tool" }>>,
  options: {
    open?: boolean;
    running?: boolean;
    waiting?: boolean;
    livePhase?: ProcessActivityPhase;
  } = {},
): ProcessActivity {
  const base = deriveProcessActivity(items, {
    ...(options.open !== undefined ? { open: options.open } : {}),
    ...(options.running !== undefined ? { running: options.running } : {}),
    ...(options.waiting !== undefined ? { waiting: options.waiting } : {}),
  });
  if (!options.open || !options.running) return base;
  if (
    options.livePhase === "responding" ||
    options.livePhase === "compacting" ||
    options.livePhase === "waiting" ||
    options.livePhase === "recovering" ||
    options.livePhase === "summarizing"
  ) {
    return { phase: options.livePhase };
  }
  return base;
}

/**
 * Start of the *current* open process segment (first trailing thinking/tool),
 * not an earlier turn's user message.
 */
function currentSegmentStartedAt(items: TimelineItem[]): string | undefined {
  let first: string | undefined;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (!item) continue;
    if (item.kind === "thinking" || item.kind === "tool") {
      first = item.timestamp ?? first;
      continue;
    }
    // Hit user / assistant / system — stop; segment boundary.
    break;
  }
  return first;
}

function phaseFromRecentEvents(events: HostEvent[]): ProcessActivity | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const host = events[i];
    if (!host || host.type !== "runtime.event") continue;
    const event = host.event;
    switch (event.type) {
      case "agent.settled":
        return null;
      case "retry.started":
        return { phase: "recovering" };
      case "retry.ended":
        // Failed final retry settles the turn; success continues the agent loop.
        return event.success ? { phase: "processing" } : null;
      case "message.failed":
        // Keep the turn live — auto-retry may follow. Terminal settle is owned by
        // agent.settled / retry.ended, not by the intermediate model error.
        return { phase: "processing" };
      case "compaction.started":
        return { phase: "compacting" };
      case "compaction.completed":
        return { phase: "processing" };
      case "tool.started":
        return {
          phase: "executing",
          toolName: event.toolName,
          ...(toolSummaryLine(event.args) ? { toolSummary: toolSummaryLine(event.args) } : {}),
        };
      case "tool.completed":
        return { phase: "processing" };
      case "thinking.delta":
        return { phase: "thinking" };
      case "message.delta":
        return { phase: "responding" };
      case "message.completed":
        return event.reason === "toolUse" ? { phase: "processing" } : { phase: "responding" };
      case "agent.started":
        return { phase: "processing" };
      default:
        break;
    }
  }
  return null;
}

function toolSummaryLine(value: unknown): string {
  if (typeof value === "string") return value.split("\n", 1)[0]?.trim() ?? "";
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const row = value as Record<string, unknown>;
  for (const key of ["command", "path", "file_path", "query", "url", "description"]) {
    if (typeof row[key] === "string" && row[key].trim()) return row[key].trim();
  }
  return "";
}

export function formatMessageTime(iso: string | undefined, locale: "zh" | "en"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    const tag = locale === "zh" ? "zh-CN" : "en-US";
    // Format parts separately so zh keeps a space: "周四 10:32" (not "周四10:32").
    const weekday = d.toLocaleDateString(tag, { weekday: "short" });
    const time = d.toLocaleTimeString(tag, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${weekday} ${time}`;
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

/**
 * Human duration for process headers.
 * Spaces between number and unit (and between unit pairs) in both locales:
 * - zh: "1 秒" / "1 分 30 秒" / "1 时 5 分" / "1 天 2 时"
 * - en: "1 s" / "1 m 30 s" / "1 h 5 m" / "1 d 2 h"
 */
export function formatDurationMs(ms: number, locale: "zh" | "en" = "en"): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3_600);
  const minutes = Math.floor((totalSec % 3_600) / 60);
  const seconds = totalSec % 60;

  if (locale === "zh") {
    if (days > 0) return hours > 0 ? `${days} 天 ${hours} 时` : `${days} 天`;
    if (hours > 0) return minutes > 0 ? `${hours} 时 ${minutes} 分` : `${hours} 时`;
    if (minutes > 0) return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`;
    return `${seconds} 秒`;
  }

  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} m` : `${hours} h`;
  if (minutes > 0) return seconds > 0 ? `${minutes} m ${seconds} s` : `${minutes} m`;
  return `${seconds} s`;
}

/** Elapsed between ISO timestamps (or now when `endedAt` is omitted). */
export function elapsedDurationLabel(
  startedAt: string | undefined,
  endedAt: string | undefined,
  nowMs: number = Date.now(),
  locale: "zh" | "en" = "en",
): string | undefined {
  if (!startedAt) return undefined;
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return undefined;
  const end = endedAt ? new Date(endedAt).getTime() : nowMs;
  if (Number.isNaN(end)) return undefined;
  return formatDurationMs(Math.max(0, end - start), locale);
}

/**
 * Single tool duration from real message timestamps only:
 * - completed/error: requires both `timestamp` (start) and `endedAt` (end)
 * - running: `timestamp` → nowMs (live elapsed; end not yet known)
 * Missing either bound (except live running) → undefined (never invent times).
 */
export function toolDurationMs(
  item: {
    timestamp?: string | undefined;
    endedAt?: string | undefined;
    status?: string | undefined;
  },
  nowMs: number = Date.now(),
): number | undefined {
  if (!item.timestamp) return undefined;
  const start = new Date(item.timestamp).getTime();
  if (Number.isNaN(start)) return undefined;
  let end: number;
  if (item.endedAt) {
    end = new Date(item.endedAt).getTime();
  } else if (item.status === "running") {
    end = nowMs;
  } else {
    // Completed/error without a recorded end — do not fall back to "now".
    return undefined;
  }
  if (Number.isNaN(end)) return undefined;
  return Math.max(0, end - start);
}

type TimedToolLike = {
  timestamp?: string | undefined;
  endedAt?: string | undefined;
  status?: string | undefined;
};

/**
 * Naive sum of each member's span. Prefer {@link groupDurationMs} for UI groups
 * (parallel tools share one start and must not be counted n times).
 */
export function sumToolDurationsMs(
  items: TimedToolLike[],
  nowMs: number = Date.now(),
): number | undefined {
  let sum = 0;
  let any = false;
  for (const item of items) {
    const ms = toolDurationMs(item, nowMs);
    if (ms === undefined) continue;
    sum += ms;
    any = true;
  }
  return any ? sum : undefined;
}

/**
 * Group duration from real timestamps only.
 *
 * Parallel tools often share one assistant `timestamp` (one model step emitted many
 * toolCalls). Counting each full span invents n× wall time. Instead:
 * - cluster by identical start timestamp
 * - each cluster contributes one wall span: max(end) − start
 * - sequential tools (distinct starts) each form their own cluster
 */
export function groupDurationMs(
  items: TimedToolLike[],
  nowMs: number = Date.now(),
): number | undefined {
  const clusters = new Map<string, TimedToolLike[]>();
  for (const item of items) {
    if (!item.timestamp) continue;
    const list = clusters.get(item.timestamp) ?? [];
    list.push(item);
    clusters.set(item.timestamp, list);
  }
  if (clusters.size === 0) return undefined;

  let sum = 0;
  let any = false;
  for (const [startIso, members] of clusters) {
    const start = new Date(startIso).getTime();
    if (Number.isNaN(start)) continue;
    let maxEnd: number | undefined;
    for (const m of members) {
      let end: number | undefined;
      if (m.endedAt) {
        const t = new Date(m.endedAt).getTime();
        if (!Number.isNaN(t)) end = t;
      } else if (m.status === "running") {
        end = nowMs;
      }
      if (end === undefined) continue;
      maxEnd = maxEnd === undefined ? end : Math.max(maxEnd, end);
    }
    if (maxEnd === undefined) continue;
    sum += Math.max(0, maxEnd - start);
    any = true;
  }
  return any ? sum : undefined;
}

/**
 * True when this tool's start is not shared with another sibling.
 * Parallel batches share one start — those rows must not each claim a solo duration.
 */
export function hasIndependentToolDuration(
  item: TimedToolLike,
  siblings: TimedToolLike[],
): boolean {
  if (!item.timestamp) return false;
  if (siblings.length <= 1) return true;
  const sameStart = siblings.filter((s) => s.timestamp === item.timestamp);
  return sameStart.length <= 1;
}

function summarizeData(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unserializable value]";
  }
}
