/**
 * Host-neutral serializable fallbacks for custom message/entry/tool presentation.
 * Never executes TUI Component factories (message/entry/tool renderers).
 */

export interface GenericCustomMessageView {
  kind: "custom.message";
  customType: string;
  content: string;
  details?: unknown;
  display: true;
}

export interface GenericCustomEntryView {
  kind: "custom.entry";
  customType: string;
  data?: unknown;
}

export interface GenericToolView {
  kind: "tool";
  toolName: string;
  toolCallId?: string;
  args?: unknown;
  content: string;
  details?: unknown;
  isError: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (isRecord(part) && part.type === "text" && typeof part.text === "string") return part.text;
      if (isRecord(part) && part.type === "image") return "[image]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Project a custom message for desktop display.
 * Returns null when `display: false` (must stay hidden).
 * Does not invoke registerMessageRenderer factories.
 */
export function projectCustomMessage(message: {
  role?: string;
  customType?: string;
  content?: unknown;
  display?: boolean;
  details?: unknown;
}): GenericCustomMessageView | null {
  if (message.role !== undefined && message.role !== "custom") return null;
  if (message.display === false) return null;
  if (typeof message.customType !== "string" || message.customType.length === 0) return null;
  const view: GenericCustomMessageView = {
    kind: "custom.message",
    customType: message.customType,
    content: textFromContent(message.content),
    display: true,
  };
  if (message.details !== undefined) view.details = sanitizeSerializable(message.details);
  return view;
}

/**
 * Compact Extension entry placeholder; serializable data only.
 * Does not invoke registerEntryRenderer factories.
 */
export function projectCustomEntry(entry: {
  type?: string;
  customType?: string;
  data?: unknown;
}): GenericCustomEntryView | null {
  if (entry.type !== undefined && entry.type !== "custom") return null;
  if (typeof entry.customType !== "string" || entry.customType.length === 0) return null;
  const view: GenericCustomEntryView = {
    kind: "custom.entry",
    customType: entry.customType,
  };
  if (entry.data !== undefined) view.data = sanitizeSerializable(entry.data);
  return view;
}

/**
 * Generic tool presentation from name/args/content/details/error.
 * Does not invoke renderCall/renderResult factories.
 */
export function projectToolPresentation(input: {
  toolName: string;
  toolCallId?: string;
  args?: unknown;
  content?: unknown;
  details?: unknown;
  isError?: boolean;
}): GenericToolView {
  const view: GenericToolView = {
    kind: "tool",
    toolName: input.toolName,
    content: textFromContent(input.content),
    isError: input.isError === true,
  };
  if (input.toolCallId !== undefined) view.toolCallId = input.toolCallId;
  if (input.args !== undefined) view.args = sanitizeSerializable(input.args);
  if (input.details !== undefined) view.details = sanitizeSerializable(input.details);
  return view;
}

/**
 * Drop functions/symbols so nothing TUI/DOM-related reaches Renderer.
 */
export function sanitizeSerializable(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (t === "function" || t === "symbol" || t === "bigint") return undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeSerializable(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const next = sanitizeSerializable(item, depth + 1);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}
