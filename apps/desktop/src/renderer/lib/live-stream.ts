/**
 * Append-only live timeline for the open session (post-history content).
 *
 * Guarantees for streamed thinking/assistant text:
 * 1. Tokens only grow (never shrink or replace with a shorter prefix)
 * 2. Each host sequence is applied at most once (dedupe)
 * 3. Cleared only on session switch / stop / crash
 */
import type { RuntimeEvent, SessionHistoryMessage } from "@zeno/contracts";
import type { TimelineItem } from "./timeline.ts";
import { splitAttachedPaths } from "./timeline.ts";

/** How many host sequences to remember for dedupe (well above one long turn). */
const SEEN_SEQUENCE_CAP = 4_000;

export type LiveStreamState = {
  items: TimelineItem[];
  seq: number;
  promptIndex: number;
  /** Host event sequences already folded into this log. */
  seenSequences: number[];
};

export function emptyLiveStream(): LiveStreamState {
  return { items: [], seq: 0, promptIndex: 0, seenSequences: [] };
}

export function resetLiveStream(): LiveStreamState {
  return emptyLiveStream();
}

/**
 * True when `historyText` already contains everything `liveText` holds — i.e. the
 * history is equal to or a strict prefix-superset of the live text. The reverse
 * (live text is a prefix-superset of history) means history is stale and the live
 * stream still carries extra tokens that must be preserved; that is NOT "covered".
 */
function historyCoversText(historyText: string, liveText: string): boolean {
  if (!liveText) return Boolean(historyText);
  return liveText === historyText || historyText.startsWith(liveText);
}

function historyCoversLiveItem(history: SessionHistoryMessage[], item: TimelineItem): boolean {
  if (item.kind === "user" || item.kind === "assistant" || item.kind === "thinking") {
    return history.some((row) => row.role === item.kind && historyCoversText(row.text, item.text));
  }
  if (item.kind === "tool") {
    if (item.status === "running") return false;
    return history.some((row) => {
      if (row.role !== "tool") return false;
      if (item.toolName && row.toolName && item.toolName === row.toolName) return true;
      return Boolean(item.toolCallId && row.text.includes(item.toolCallId));
    });
  }
  if (item.kind === "system") {
    return history.some((row) => row.role === "system" && row.text === item.text);
  }
  return false;
}

/**
 * After promote, session.current history already has flushed/in-memory entries.
 * Keep only live items the history does not yet cover (open tools, extra tokens).
 */
export function liveStreamNotCoveredByHistory(
  stream: LiveStreamState,
  history: SessionHistoryMessage[],
): LiveStreamState {
  if (stream.items.length === 0 || history.length === 0) return stream;
  return { ...stream, items: stream.items.filter((item) => !historyCoversLiveItem(history, item)) };
}

/**
 * Grow text without ever shrinking.
 * - incremental chunk → append
 * - cumulative snapshot (delta starts with prev) → take delta
 * - exact redelivery of the same chunk → keep prev
 * - overlapping redelivery (e.g. "Hello wor" + "world") → merge without duplicating
 */
export function appendMonotonicText(prev: string, delta: string): string {
  if (!delta) return prev;
  if (!prev) return delta;
  if (delta === prev) return prev;
  // Cumulative full text so far (some providers re-send the whole buffer).
  if (delta.startsWith(prev) && delta.length >= prev.length) return delta;
  // Exact chunk redelivery.
  if (prev.endsWith(delta)) return prev;
  // Overlapping redelivery: require ≥2 chars so normal "Hel"+"lo" still appends.
  const maxOverlap = Math.min(prev.length, delta.length - 1, 64);
  for (let n = maxOverlap; n >= 2; n--) {
    if (prev.endsWith(delta.slice(0, n))) {
      return prev + delta.slice(n);
    }
  }
  return prev + delta;
}

function nextId(state: LiveStreamState, prefix: string): { id: string; seq: number } {
  const seq = state.seq + 1;
  return { id: `live-${prefix}-${seq}`, seq };
}

function nowIso(): string {
  return new Date().toISOString();
}

function rememberSequence(state: LiveStreamState, sequence: number | undefined): number[] {
  if (sequence === undefined) return state.seenSequences;
  if (state.seenSequences.includes(sequence)) return state.seenSequences;
  const next = [...state.seenSequences, sequence];
  return next.length > SEEN_SEQUENCE_CAP ? next.slice(next.length - SEEN_SEQUENCE_CAP) : next;
}

function shellOutputMarkdown(output: string, exitCode: number): string {
  const body = output || `(exit ${exitCode})`;
  return `\`\`\`text\n${body.trimEnd()}\n\`\`\``;
}

/** Stable union of attachment paths (optimistic + host echo). */
function mergeAttachmentPaths(existing: string[] | undefined, incoming: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const path of [...(existing ?? []), ...incoming]) {
    const key = path.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export type ApplyLiveStreamOptions = {
  /** Host runtime.event sequence — used for at-most-once apply. */
  sequence?: number;
  /**
   * Local optimistic preview of a just-typed message (not a host echo). It shows
   * the exact input text and must NOT advance promptIndex, otherwise the matching
   * host echo reads `prompts[promptIndex]` past the sentPrompts entry and falls
   * back to the expanded text (e.g. a full `<skill>` block).
   */
  optimistic?: boolean;
};

/**
 * Apply one runtime event. Text deltas only grow the open buffer item.
 * Passing `sequence` makes redelivery a no-op.
 */
export function applyRuntimeEventToLiveStream(
  state: LiveStreamState,
  event: RuntimeEvent,
  prompts: string[],
  options?: ApplyLiveStreamOptions,
): LiveStreamState {
  const sequence = options?.sequence;
  const optimistic = options?.optimistic === true;
  if (sequence !== undefined && state.seenSequences.includes(sequence)) {
    return state;
  }

  const mark = (next: LiveStreamState): LiveStreamState => ({
    ...next,
    seenSequences: rememberSequence(next, sequence),
  });

  switch (event.type) {
    case "thinking.delta": {
      if (!event.delta) return mark(state);
      const items = state.items.slice();
      const last = items[items.length - 1];
      if (last?.kind === "thinking") {
        const text = appendMonotonicText(last.text, event.delta);
        if (text === last.text) return mark(state);
        // Keep original timestamp = when this thinking segment started.
        items[items.length - 1] = { ...last, text };
        return mark({ ...state, items });
      }
      const { id, seq } = nextId(state, "thinking");
      items.push({ id, kind: "thinking", text: event.delta, timestamp: nowIso() });
      return mark({ ...state, items, seq });
    }
    case "message.delta": {
      if (!event.delta) return mark(state);
      const items = state.items.slice();
      const last = items[items.length - 1];
      if (last?.kind === "assistant") {
        const text = appendMonotonicText(last.text, event.delta);
        if (text === last.text) return mark(state);
        items[items.length - 1] = { ...last, text };
        return mark({ ...state, items });
      }
      const { id, seq } = nextId(state, "assistant");
      items.push({ id, kind: "assistant", text: event.delta, timestamp: nowIso() });
      return mark({ ...state, items, seq });
    }
    case "user.message": {
      const source = splitAttachedPaths(event.content);
      // Optimistic previews advance nothing: the paired host echo is what consumes
      // the next sentPrompts entry and replaces any expanded slash/skill/template
      // content with the original typed text.
      const promptIndex = optimistic ? state.promptIndex : state.promptIndex + 1;
      const prompt = optimistic ? source.text : (prompts[promptIndex - 1] ?? source.text);
      if (!prompt && source.paths.length === 0) {
        return mark({ ...state, promptIndex });
      }
      // Optimistic send may already have appended this user row (same display text).
      // Merge attachment paths from host echo so chips aren't dropped on dedupe.
      const last = state.items[state.items.length - 1];
      if (last?.kind === "user" && last.text === prompt) {
        if (source.paths.length === 0) {
          return mark({ ...state, promptIndex });
        }
        const merged = mergeAttachmentPaths(last.attachments, source.paths);
        const same =
          merged.length === (last.attachments?.length ?? 0) &&
          merged.every((path, index) => last.attachments?.[index] === path);
        if (same) return mark({ ...state, promptIndex });
        const items = state.items.slice();
        items[items.length - 1] = { ...last, attachments: merged };
        return mark({ ...state, items, promptIndex });
      }
      const { id, seq } = nextId(state, "user");
      const item: Extract<TimelineItem, { kind: "user" }> = {
        id,
        kind: "user",
        text: prompt,
        timestamp: nowIso(),
        ...(source.paths.length > 0 ? { attachments: source.paths } : {}),
      };
      return mark({
        ...state,
        items: [...state.items, item],
        seq,
        promptIndex,
      });
    }
    case "tool.started": {
      const { id, seq } = nextId(state, "tool");
      const item: Extract<TimelineItem, { kind: "tool" }> = {
        id,
        kind: "tool",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        status: "running",
        args: event.args,
        timestamp: nowIso(),
      };
      return mark({ ...state, items: [...state.items, item], seq });
    }
    case "tool.completed": {
      const items = state.items.slice();
      let found = false;
      for (let i = items.length - 1; i >= 0; i--) {
        const row = items[i];
        if (row?.kind === "tool" && row.toolCallId === event.toolCallId) {
          items[i] = {
            ...row,
            status: event.isError ? "error" : "completed",
            output: event.output || (event.isError ? "Tool failed" : "Done"),
            toolName: event.toolName || row.toolName,
            ...(event.details !== undefined ? { details: event.details } : {}),
          };
          found = true;
          break;
        }
      }
      if (found) return mark({ ...state, items });
      const { id, seq } = nextId(state, "tool");
      items.push({
        id,
        kind: "tool",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        status: event.isError ? "error" : "completed",
        output: event.output || (event.isError ? "Tool failed" : "Done"),
        ...(event.details !== undefined ? { details: event.details } : {}),
        timestamp: nowIso(),
      });
      return mark({ ...state, items, seq });
    }
    case "message.failed": {
      const { id, seq } = nextId(state, "system");
      const title =
        event.reason === "aborted"
          ? "Response stopped"
          : event.reason === "pending"
            ? "Response pending"
            : event.reason === "deferred"
              ? "Response deferred"
              : "Response failed";
      const tone = event.reason === "pending" || event.reason === "deferred" ? "info" : "error";
      return mark({
        ...state,
        seq,
        items: [
          ...state.items,
          {
            id,
            kind: "system",
            text: event.message,
            title,
            tone,
            timestamp: nowIso(),
          },
        ],
      });
    }
    case "retry.started": {
      const { id, seq } = nextId(state, "retry");
      return mark({
        ...state,
        seq,
        items: [
          ...state.items,
          {
            id,
            kind: "system",
            title: "Retry",
            text: `Retry ${event.attempt}/${event.maxAttempts} in ${event.delayMs}ms — ${event.errorMessage}`,
            tone: "info",
            timestamp: nowIso(),
          },
        ],
      });
    }
    case "retry.ended": {
      if (event.success) return mark(state);
      const { id, seq } = nextId(state, "retry");
      return mark({
        ...state,
        seq,
        items: [
          ...state.items,
          {
            id,
            kind: "system",
            title: "Retry",
            text: event.finalError ?? `Retry failed after ${event.attempt} attempts`,
            tone: "error",
            timestamp: nowIso(),
          },
        ],
      });
    }
    case "shell.completed": {
      const { id, seq } = nextId(state, "shell");
      const commandPrefix = event.excludeFromContext ? "!!" : "!";
      return mark({
        ...state,
        seq,
        items: [
          ...state.items,
          {
            id,
            kind: "system",
            title: `${commandPrefix} ${event.command}`,
            text: shellOutputMarkdown(event.output, event.exitCode),
            tone: event.exitCode === 0 ? "info" : "error",
            timestamp: nowIso(),
          },
        ],
      });
    }
    case "compaction.started": {
      const { id, seq } = nextId(state, "compaction");
      return mark({
        ...state,
        seq,
        items: [
          ...state.items,
          {
            id,
            kind: "system",
            title: "Compaction",
            text: `Compaction started (${event.reason})`,
            tone: "info",
            timestamp: nowIso(),
          },
        ],
      });
    }
    case "compaction.completed": {
      const { id, seq } = nextId(state, "compaction");
      return mark({
        ...state,
        seq,
        items: [
          ...state.items,
          {
            id,
            kind: "system",
            title: "Compaction",
            text:
              event.errorMessage ?? (event.aborted ? "Compaction aborted" : "Compaction completed"),
            tone: event.errorMessage || event.aborted ? "error" : "info",
            timestamp: nowIso(),
          },
        ],
      });
    }
    case "custom.message": {
      const { id, seq } = nextId(state, "custom");
      return mark({
        ...state,
        seq,
        items: [
          ...state.items,
          {
            id,
            kind: "system",
            title: event.customType,
            text: event.content,
            tone: "info",
            timestamp: nowIso(),
            extension: true,
          },
        ],
      });
    }
    case "custom.entry": {
      const { id, seq } = nextId(state, "custom");
      let text = "";
      try {
        text = event.data === undefined ? "" : JSON.stringify(event.data, null, 2);
      } catch {
        text = "[unserializable value]";
      }
      // Prefer fenced JSON so the shared Markdown renderer formats entry payloads.
      if (text && !text.startsWith("```")) {
        text = `\`\`\`json\n${text}\n\`\`\``;
      }
      return mark({
        ...state,
        seq,
        items: [
          ...state.items,
          {
            id,
            kind: "system",
            title: event.customType,
            text,
            tone: "info",
            timestamp: nowIso(),
            extension: true,
          },
        ],
      });
    }
    // agent.started / agent.settled / message.completed / queue.updated — still mark sequence
    default:
      return mark(state);
  }
}

/**
 * Remove a just-queued / reclassified optimistic user row from the live stream.
 *
 * Queued steer/follow-up must not appear as delivered user bubbles. When a normal
 * send hits "already processing" and is re-routed to the steer queue, drop the
 * optimistic row so mid-stream assistant deltas are not split around a ghost user.
 * Matches the most recent user row with the same display text.
 */
export function retractOptimisticUserMessage(
  state: LiveStreamState,
  displayText: string,
): LiveStreamState {
  const target = displayText.trim();
  if (!target) return state;
  for (let i = state.items.length - 1; i >= 0; i--) {
    const item = state.items[i];
    if (item?.kind !== "user") continue;
    if (item.text !== target) continue;
    return {
      ...state,
      items: state.items.slice(0, i).concat(state.items.slice(i + 1)),
    };
  }
  return state;
}

/** True if no assistant/thinking text field shrank vs previous state. */
export function assertLiveStreamTextMonotonic(
  prev: LiveStreamState,
  next: LiveStreamState,
): boolean {
  const prevTexts = new Map<string, string>();
  for (const item of prev.items) {
    if (item.kind === "assistant" || item.kind === "thinking") {
      prevTexts.set(item.id, item.text);
    }
  }
  for (const item of next.items) {
    if (item.kind !== "assistant" && item.kind !== "thinking") continue;
    const before = prevTexts.get(item.id);
    if (before !== undefined && item.text.length < before.length) return false;
    if (before !== undefined && !item.text.startsWith(before) && !before.startsWith(item.text)) {
      // Allow cumulative replace only when new text extends old (startsWith handled above).
      // Non-extension shrink/replace is a failure.
      if (!item.text.startsWith(before)) return false;
    }
  }
  return true;
}
