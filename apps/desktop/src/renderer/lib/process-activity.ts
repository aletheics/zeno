/**
 * Compact process-step presentation (Codex-style activity rows).
 * Pure helpers — safe for unit tests without React.
 */

export type ProcessToolKind = "read" | "run" | "search" | "edit" | "write" | "list" | "generic";

export type ProcessToolView = {
  kind: ProcessToolKind;
  /** Primary path/file when present (shown as a link chip). */
  path?: string;
  /** Command / query / free-form detail. */
  detail: string;
  /** Truncated one-line preview for the row. */
  preview: string;
  /**
   * True when we only have the tool name (e.g. "bash" / "read") — no real path/command.
   * UI should mute or omit this so it is not styled like a real command/path.
   */
  weak?: boolean;
};

/** Bare tool labels that must not be painted as real command/path highlights. */
export function isWeakToolLabel(text: string, toolName: string): boolean {
  const d = text.replace(/\s+/g, " ").trim().toLowerCase();
  const t = toolName.replace(/\s+/g, " ").trim().toLowerCase();
  if (!d) return true;
  if (d === t) return true;
  // Common bare tool ids when args were not projected into the timeline.
  return (
    d === "bash" ||
    d === "shell" ||
    d === "read" ||
    d === "read_file" ||
    d === "write" ||
    d === "write_file" ||
    d === "edit" ||
    d === "grep" ||
    d === "search" ||
    d === "ls" ||
    d === "list" ||
    d === "tool"
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstString(row: Record<string, unknown> | undefined, keys: string[]): string {
  if (!row) return "";
  for (const key of keys) {
    const v = str(row[key]);
    if (v) return v;
  }
  return "";
}

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

/** Row preview: short so many shell lines stay scannable. */
function truncate(text: string, max = 72): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

function joinArgv(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "";
  if (!value.every((item) => typeof item === "string" || typeof item === "number")) return "";
  return value.map(String).join(" ").trim();
}

const COMMAND_KEYS = [
  "command",
  "cmd",
  "script",
  "shell",
  "code",
  "input",
  "commandLine",
  "Command",
  "CommandLine",
  "powershell",
  "expression",
  "Expression",
] as const;

/**
 * Pull a runnable command string from common tool arg shapes
 * (pi bash/shell/powershell, nested input, argv arrays, plain string).
 */
export function extractCommandFromArgs(args: unknown): string {
  if (typeof args === "string") {
    const trimmed = args.trim();
    if (!trimmed) return "";
    // Sometimes args arrive as a JSON string.
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return extractCommandFromArgs(JSON.parse(trimmed) as unknown);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  const row = asRecord(args);
  if (!row) return "";

  const direct = firstString(row, [...COMMAND_KEYS]);
  const argTail = joinArgv(row.argv) || joinArgv(row.args) || joinArgv(row.arguments);
  // powershell + argv: { command: "powershell", args: ["-Command", "Get-ChildItem"] }
  if (direct && argTail && !direct.includes(argTail.slice(0, 12))) {
    return `${direct} ${argTail}`.trim();
  }
  if (direct) return direct;
  if (argTail) return argTail;

  for (const nestKey of ["input", "parameters", "arguments", "params", "options"]) {
    const nested = row[nestKey];
    if (typeof nested === "string" && nested.trim()) {
      // input may be the full script body
      if (nested.trim().length <= 500) return nested.trim();
    }
    const nestRow = asRecord(nested);
    if (!nestRow) continue;
    const nestedCmd = firstString(nestRow, [...COMMAND_KEYS]);
    const nestedArgv =
      joinArgv(nestRow.argv) || joinArgv(nestRow.args) || joinArgv(nestRow.arguments);
    if (nestedCmd && nestedArgv && !nestedCmd.includes(nestedArgv.slice(0, 12))) {
      return `${nestedCmd} ${nestedArgv}`.trim();
    }
    if (nestedCmd) return nestedCmd;
    if (nestedArgv) return nestedArgv;
  }
  return "";
}

/** Best-effort: recover a command from tool output when args were not persisted. */
export function extractCommandFromOutput(output: string | undefined): string {
  if (!output) return "";
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines.slice(0, 6)) {
    const shell = /^[$>]\s+(.+)$/.exec(line);
    if (shell?.[1]) return shell[1].trim();
    const ps = /^(?:PS\s+[^>]*>)\s*(.+)$/i.exec(line);
    if (ps?.[1]) return ps[1].trim();
    const labeled =
      /^(?:command|cmd|ran|running|执行|命令)[:：]\s*(.+)$/i.exec(line) ??
      /^(?:\$)\s*(.+)$/.exec(line);
    if (labeled?.[1]) return labeled[1].trim();
  }
  return "";
}

export function classifyToolName(toolName: string): ProcessToolKind {
  const name = toolName.trim().toLowerCase();
  if (!name) return "generic";
  if (/(^|_)(read|cat|open_file|get_file)(_|$)/.test(name) || name === "read_file") return "read";
  // bash / shell / powershell / pwsh / cmd / terminal …
  if (
    /(^|_)(bash|shell|exec|run|terminal|command|powershell|pwsh|cmd)(_|$)/.test(name) ||
    name === "powershell" ||
    name === "pwsh"
  ) {
    return "run";
  }
  // web_search / WebSearch / codebase_search / grep …
  if (
    /(^|_)(grep|search|rg|find_in|codebase_search|web_search|websearch)(_|$)/.test(name) ||
    name === "web_search" ||
    name === "websearch"
  ) {
    return "search";
  }
  if (/(^|_)(edit|str_replace|search_replace|apply_patch|patch)(_|$)/.test(name)) return "edit";
  if (/(^|_)(write|create_file|write_file)(_|$)/.test(name)) return "write";
  if (/(^|_)(ls|list|glob|find|dir)(_|$)/.test(name)) return "list";
  return "generic";
}

export type ProcessToolViewOptions = {
  /** Tool result text — used when args lack a command (history reload). */
  output?: string;
  /** Explicit command from history projection when available. */
  command?: string;
};

/** Build a compact view model for a tool call row. */
export function processToolView(
  toolName: string,
  args: unknown,
  options?: ProcessToolViewOptions,
): ProcessToolView {
  const kind = classifyToolName(toolName);
  const row = asRecord(args);
  const path = firstString(row, ["path", "file_path", "file", "filename", "target", "glob"]);
  const command =
    str(options?.command) ||
    extractCommandFromArgs(args) ||
    extractCommandFromOutput(options?.output);
  const query = firstString(row, [
    "query",
    "pattern",
    "regex",
    "search",
    "q",
    "text",
    "keywords",
    "prompt",
  ]);
  const description = firstString(row, ["description", "title", "name"]);
  // Avoid using raw "content" as description when it is huge file body for write tools.
  const content = firstString(row, ["content"]);
  const shortContent = content && content.length <= 80 ? content : "";

  if (kind === "run") {
    const detail = command || description || shortContent;
    if (!detail) {
      return { kind, detail: toolName, preview: toolName, weak: true, ...(path ? { path } : {}) };
    }
    return { kind, detail, preview: truncate(detail), ...(path ? { path } : {}) };
  }
  if (kind === "search") {
    const detail = query || description || command;
    if (!detail) {
      return { kind, detail: toolName, preview: toolName, weak: true, ...(path ? { path } : {}) };
    }
    return {
      kind,
      detail,
      preview: truncate(detail),
      ...(path ? { path } : {}),
    };
  }
  if (kind === "read" || kind === "edit" || kind === "write" || kind === "list") {
    if (path) {
      return {
        kind,
        detail: path,
        preview: basename(path),
        path,
      };
    }
    const detail = description || shortContent;
    if (!detail) {
      return { kind, detail: toolName, preview: toolName, weak: true };
    }
    return {
      kind,
      detail,
      preview: truncate(detail),
    };
  }

  const detail =
    command ||
    path ||
    query ||
    description ||
    shortContent ||
    (args !== undefined ? JSON.stringify(args) : "");
  if (!detail) {
    return { kind: "generic", detail: toolName, preview: toolName, weak: true };
  }
  return {
    kind: "generic",
    detail: String(detail),
    preview: truncate(String(detail)),
    ...(path ? { path } : {}),
    ...(isWeakToolLabel(String(detail), toolName) ? { weak: true } : {}),
  };
}

type EditReplacement = { oldText: string; newText: string };

function normalizeEditPair(row: Record<string, unknown>): EditReplacement | undefined {
  const oldText =
    str(row.oldText) ||
    str(row.old_string) ||
    str(row.old_str) ||
    str(row.before) ||
    str(row.original);
  const newText =
    str(row.newText) ||
    str(row.new_string) ||
    str(row.new_str) ||
    str(row.after) ||
    str(row.replacement);
  // Allow empty newText (delete), but oldText must be present for a meaningful edit.
  if (!oldText && !newText) return undefined;
  if (!oldText && newText) return { oldText: "", newText };
  return { oldText, newText: newText || "" };
}

function parseEditsArray(value: unknown): EditReplacement[] {
  let raw: unknown = value;
  if (typeof raw === "string" && raw.trim()) {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const out: EditReplacement[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row) continue;
    const pair = normalizeEditPair(row);
    if (pair) out.push(pair);
  }
  return out;
}

function splitContentLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

/**
 * Pi TUI / edit-diff display format: "+12 content", "- 3 content", " 10 content".
 * Embeds 1-based **file** line numbers after the prefix (must be real offsets, not snippet-local 1..n).
 */
function prefixLinesNumbered(text: string, sign: "+" | "-", startLine: number): string {
  const lines = text ? splitContentLines(text) : [""];
  const end = startLine + Math.max(lines.length, 1) - 1;
  const width = String(Math.max(end, 1)).length;
  return lines
    .map((line, i) => `${sign}${String(startLine + i).padStart(width, " ")} ${line}`)
    .join("\n");
}

/** Plain unified body lines without inventing file line numbers. */
function prefixLinesPlain(text: string, sign: "+" | "-"): string {
  const lines = text ? splitContentLines(text) : [""];
  return lines.map((line) => `${sign}${line}`).join("\n");
}

/**
 * Build a display-oriented diff from edit/write tool args.
 * - write: path + content as all-addition lines with real file line numbers starting at 1
 * - edit (args only): plain +/- body **without** fake 1-based numbers — real offsets only come
 *   from pi `details.diff` / `details.patch` via {@link extractToolDiffDetails}
 */
export function formatEditToolAsDiff(args: unknown, toolName?: string): string | undefined {
  const kind = toolName ? classifyToolName(toolName) : "edit";
  const row = asRecord(args);
  if (!row) return undefined;

  const path = firstString(row, ["path", "file_path", "file", "filename", "target"]) || "file";

  let edits = parseEditsArray(row.edits);
  if (edits.length === 0) {
    const single = normalizeEditPair(row);
    if (single) edits = [single];
  }
  // write (and create_file): full body as additions only
  if (edits.length === 0 && (kind === "write" || kind === "edit")) {
    const content = firstString(row, ["content", "text", "newText", "new_string", "contents"]);
    if (content) {
      // write → all +; bare content on edit without oldText treated the same
      edits = [{ oldText: kind === "write" ? "" : "", newText: content }];
    }
  }
  if (edits.length === 0) return undefined;

  // write with only new content: --- /dev/null style header for clarity
  const isCreateOnly = kind === "write" || edits.every((e) => !e.oldText && Boolean(e.newText));
  const chunks: string[] = isCreateOnly
    ? [`--- /dev/null`, `+++ b/${path}`]
    : [`--- a/${path}`, `+++ b/${path}`];
  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i]!;
    if (isCreateOnly) {
      // New file: line numbers 1..n are real file lines.
      const newCount = edit.newText ? splitContentLines(edit.newText).length : 1;
      chunks.push(`@@ -0,0 +1,${newCount} @@`);
      if (edit.newText) chunks.push(prefixLinesNumbered(edit.newText, "+", 1));
      else chunks.push(prefixLinesNumbered("", "+", 1));
      continue;
    }
    // Edit without details.diff: show the change, but do not invent file offsets.
    // (No @@ tracking header → parser leaves lineNo empty.)
    if (edits.length > 1) {
      chunks.push(`@@ edit ${i + 1}/${edits.length} @@`);
    }
    if (edit.oldText) chunks.push(prefixLinesPlain(edit.oldText, "-"));
    if (edit.newText) chunks.push(prefixLinesPlain(edit.newText, "+"));
    else if (!edit.oldText) chunks.push(prefixLinesPlain("", "+"));
  }
  return chunks.join("\n");
}

/** Pull pi `details.diff` (numbered display) or `details.patch` from tool result details. */
export function extractToolDiffDetails(details: unknown): string | undefined {
  const row = asRecord(details);
  if (!row) return undefined;
  const diff = typeof row.diff === "string" ? row.diff.trim() : "";
  if (diff && looksLikeDiffText(diff)) return row.diff as string;
  const patch = typeof row.patch === "string" ? row.patch.trim() : "";
  if (patch && looksLikeDiffText(patch)) return row.patch as string;
  return undefined;
}

export type DiffDisplayLine = {
  /** add / remove / hunk / meta (file headers); undefined = context. */
  kind?: "add" | "remove" | "hunk" | "meta";
  /** 1-based file line number when known (omitted for headers / ellipsis). */
  lineNo?: number;
  /** Visible text including leading +/-/space marker. */
  text: string;
};

/**
 * Parse unified patches and pi display diffs into rows with real file line numbers.
 * - Pi: `+12 body`, `- 3 body`, ` 10 body`
 * - Unified: `@@ -10,2 +12,3 @@` then `+/-/ ` lines counted from the hunk starts
 */
export function parseDiffDisplayLines(code: string): DiffDisplayLine[] {
  const rawLines = code.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const rows: DiffDisplayLine[] = [];
  let oldLn = 0;
  let newLn = 0;
  let tracking = false;

  for (const line of rawLines) {
    if (
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("---") ||
      line.startsWith("+++")
    ) {
      rows.push({ kind: "meta", text: line || " " });
      continue;
    }

    if (line.startsWith("@@")) {
      const unified = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@/.exec(line);
      if (unified) {
        oldLn = Number(unified[1]);
        newLn = Number(unified[2]);
        tracking = true;
      } else {
        // Bare / edit-label hunk — start content at line 1 until a real header appears.
        oldLn = 1;
        newLn = 1;
        tracking = true;
      }
      rows.push({ kind: "hunk", text: line || " " });
      continue;
    }

    // Pi numbered display: "+12 content" / "- 3 content" / " 10 content" / "     ..."
    const pi = /^([+\- ])(\s*\d*)\s(.*)$/.exec(line);
    if (pi && pi[2] !== undefined && pi[2].trim() !== "") {
      const prefix = pi[1] as "+" | "-" | " ";
      const lineNo = Number(pi[2].trim());
      const body = pi[3] ?? "";
      if (prefix === "+") {
        rows.push({ kind: "add", lineNo, text: `+${body}` });
        newLn = lineNo + 1;
        tracking = true;
      } else if (prefix === "-") {
        rows.push({ kind: "remove", lineNo, text: `-${body}` });
        oldLn = lineNo + 1;
        tracking = true;
      } else {
        // Context or ellipsis row
        if (body.trim() === "...") {
          rows.push({ kind: "meta", text: ` ${body}` });
        } else {
          rows.push({ lineNo, text: body.length ? ` ${body}` : " " });
          oldLn = lineNo + 1;
          newLn = lineNo + 1;
          tracking = true;
        }
      }
      continue;
    }

    // Standard unified body (no embedded numbers)
    if (line.startsWith("+") && !line.startsWith("+++")) {
      const lineNo = tracking ? newLn : undefined;
      if (tracking) newLn += 1;
      rows.push({
        kind: "add",
        ...(lineNo !== undefined ? { lineNo } : {}),
        text: line.length ? line : "+",
      });
      continue;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      const lineNo = tracking ? oldLn : undefined;
      if (tracking) oldLn += 1;
      rows.push({
        kind: "remove",
        ...(lineNo !== undefined ? { lineNo } : {}),
        text: line.length ? line : "-",
      });
      continue;
    }
    if (line.startsWith(" ") || line === "") {
      const lineNo = tracking ? newLn : undefined;
      if (tracking) {
        oldLn += 1;
        newLn += 1;
      }
      rows.push({
        ...(lineNo !== undefined ? { lineNo } : {}),
        text: line.length ? line : " ",
      });
      continue;
    }

    rows.push({ kind: "meta", text: line || " " });
  }

  return rows;
}

/** True when text already looks like a unified / display / pi-numbered diff. */
export function looksLikeDiffText(text: string): boolean {
  const sample = text.trim();
  if (!sample) return false;
  if (/^---\s/m.test(sample) && /^\+\+\+\s/m.test(sample)) return true;
  // Pi display format with embedded line numbers
  if (/^[+\- ]\s*\d+\s/m.test(sample) && /^[+-]/m.test(sample)) {
    const lines = sample.split(/\r?\n/).slice(0, 40);
    let numbered = 0;
    for (const line of lines) {
      if (/^[+\- ]\s*\d+\s/.test(line)) numbered += 1;
    }
    if (numbered >= 1) return true;
  }
  const lines = sample.split(/\r?\n/).slice(0, 40);
  let plus = 0;
  let minus = 0;
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) plus += 1;
    if (line.startsWith("-") && !line.startsWith("---")) minus += 1;
  }
  return plus + minus >= 2 && (plus > 0 || minus > 0);
}

/**
 * Consecutive tools with the same kind collapse into one group (including shell/run).
 * Expand the group to see each step; per-step duration stays on each nested row.
 */
export function groupConsecutiveTools<T extends { kind: "tool"; toolName: string }>(
  items: T[],
): Array<{ type: "single"; item: T } | { type: "group"; kind: ProcessToolKind; items: T[] }> {
  const out: Array<
    { type: "single"; item: T } | { type: "group"; kind: ProcessToolKind; items: T[] }
  > = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i]!;
    const kind = classifyToolName(item.toolName);
    let j = i + 1;
    while (j < items.length && classifyToolName(items[j]!.toolName) === kind) j += 1;
    const slice = items.slice(i, j);
    if (slice.length >= 2) {
      out.push({ type: "group", kind, items: slice });
    } else {
      out.push({ type: "single", item: slice[0]! });
    }
    i = j;
  }
  return out;
}
