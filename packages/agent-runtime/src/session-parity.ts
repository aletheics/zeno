/**
 * Pure projections and catalogs for pi session/settings parity surfaces.
 * Tree filtering/display mirrors pi TUI TreeList (default hides bookkeeping).
 */
import type {
  BuiltinSlashCommand,
  SessionTreeNodeView,
  SessionTreeView,
  TreeFilterMode,
} from "@zeno/contracts";

export interface TreeEntryLike {
  id: string;
  parentId?: string | null;
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: unknown;
    stopReason?: string;
  };
  summary?: string;
  label?: string;
  customType?: string;
}

export interface TreeNodeLike {
  entry: TreeEntryLike;
  children: TreeNodeLike[];
  label?: string;
}

type FlatNode = {
  entry: TreeEntryLike;
  label?: string;
  childrenIds: string[];
};

function extractText(content: unknown): string {
  if (typeof content === "string") return content.replace(/[\n\t]+/g, " ").trim();
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push(part);
      continue;
    }
    if (!part || typeof part !== "object") continue;
    const record = part as { type?: unknown; text?: unknown; name?: unknown };
    if (record.type === "text" && typeof record.text === "string") {
      parts.push(record.text);
    }
  }
  return parts
    .join(" ")
    .replace(/[\n\t]+/g, " ")
    .trim();
}

function hasTextContent(content: unknown): boolean {
  return extractText(content).length > 0;
}

function hasOnlyToolCalls(content: unknown): boolean {
  if (!Array.isArray(content) || content.length === 0) return false;
  let sawTool = false;
  for (const part of content) {
    if (!part || typeof part !== "object") return false;
    const record = part as { type?: unknown };
    if (record.type === "toolCall" || record.type === "tool_use") {
      sawTool = true;
      continue;
    }
    if (record.type === "text") {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) return false;
      continue;
    }
    return false;
  }
  return sawTool;
}

function firstToolName(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const record = part as { type?: unknown; name?: unknown };
    if (
      (record.type === "toolCall" || record.type === "tool_use" || record.type === "toolResult") &&
      typeof record.name === "string"
    ) {
      return record.name;
    }
  }
  return undefined;
}

function roleKindFromEntry(entry: TreeEntryLike): SessionTreeNodeView["roleKind"] {
  const type = entry.type ?? (entry.message ? "message" : "other");
  if (type === "compaction") return "compaction";
  if (type === "branch_summary") return "branch_summary";
  if (type === "message" || entry.message) {
    const role = entry.message?.role;
    if (role === "user") return "user";
    if (role === "assistant") return "assistant";
    if (role === "toolResult" || role === "tool") return "tool";
    if (role === "system") return "system";
  }
  if (type === "custom_message") return "system";
  return "other";
}

function previewFromEntry(entry: TreeEntryLike, roleKind: SessionTreeNodeView["roleKind"]): string {
  // Keep enough text for hover tooltips; UI truncates with CSS ellipsis.
  const max = 4000;
  if (typeof entry.summary === "string" && entry.summary.trim()) {
    return entry.summary
      .replace(/[\n\t]+/g, " ")
      .trim()
      .slice(0, max);
  }
  const content = entry.message?.content;
  const text = extractText(content);
  if (text) return text.slice(0, max);
  if (roleKind === "tool") {
    const name = firstToolName(content) ?? "tool";
    return name;
  }
  if (roleKind === "assistant" && hasOnlyToolCalls(content)) {
    const name = firstToolName(content);
    return name ? `tool → ${name}` : "tools";
  }
  if (roleKind === "compaction") return "compaction";
  if (roleKind === "branch_summary") return "branch summary";
  return entry.type ?? entry.id.slice(0, 8);
}

function isSettingsEntry(entry: TreeEntryLike): boolean {
  const type = entry.type;
  return (
    type === "label" ||
    type === "custom" ||
    type === "model_change" ||
    type === "thinking_level_change" ||
    type === "session_info"
  );
}

function passesFilter(
  entry: TreeEntryLike,
  label: string | undefined,
  filterMode: TreeFilterMode,
  leafId?: string,
): boolean {
  const isCurrentLeaf = entry.id === leafId;
  // Hide tool-only assistant messages (except current leaf) — matches pi TreeList.
  if (
    (entry.type === "message" || entry.message) &&
    entry.message?.role === "assistant" &&
    !isCurrentLeaf
  ) {
    const content = entry.message?.content;
    const stop = entry.message?.stopReason;
    const isErrorOrAborted = Boolean(stop) && stop !== "stop" && stop !== "toolUse";
    if (!hasTextContent(content) && !isErrorOrAborted) {
      return false;
    }
  }

  switch (filterMode) {
    case "user-only":
      return entry.type === "message" || entry.message ? entry.message?.role === "user" : false;
    case "no-tools":
      if (isSettingsEntry(entry)) return false;
      if (
        (entry.type === "message" || entry.message) &&
        (entry.message?.role === "toolResult" || entry.message?.role === "tool")
      ) {
        return false;
      }
      return true;
    case "labeled-only":
      return label !== undefined && label.length > 0;
    case "all":
      return true;
    default:
      // default: hide bookkeeping/settings entries
      return !isSettingsEntry(entry);
  }
}

function flattenTree(roots: TreeNodeLike[]): FlatNode[] {
  const result: FlatNode[] = [];
  const walk = (node: TreeNodeLike) => {
    const children = node.children ?? [];
    result.push({
      entry: node.entry,
      ...(node.label ? { label: node.label } : {}),
      childrenIds: children.map((child) => child.entry.id),
    });
    for (const child of children) walk(child);
  };
  for (const root of roots) walk(root);
  return result;
}

/**
 * Flatten + filter pi SessionManager.getTree() into UI-friendly rows.
 * Depth/connectors are recomputed on the *visible* tree (like pi TUI).
 */
export function projectSessionTree(options: {
  sessionId: string;
  sessionFile?: string;
  leafId?: string;
  filterMode: TreeFilterMode;
  roots: TreeNodeLike[];
}): SessionTreeView {
  const flat = flattenTree(options.roots);
  const byId = new Map(flat.map((node) => [node.entry.id, node]));

  // Filter like pi TUI TreeList.applyFilter
  const visible = flat.filter((node) =>
    passesFilter(node.entry, node.label ?? node.entry.label, options.filterMode, options.leafId),
  );
  const visibleIds = new Set(visible.map((node) => node.entry.id));

  // Active path leaf → root
  const activePath = new Set<string>();
  if (options.leafId) {
    let current: string | undefined = options.leafId;
    while (current) {
      activePath.add(current);
      const node = byId.get(current);
      current = node?.entry.parentId ?? undefined;
    }
  }

  // Visible parent = nearest ancestor still visible
  function visibleParentId(entryId: string): string | undefined {
    let current = byId.get(entryId)?.entry.parentId ?? undefined;
    while (current) {
      if (visibleIds.has(current)) return current;
      current = byId.get(current)?.entry.parentId ?? undefined;
    }
    return undefined;
  }

  // Visible children grouped by visible parent
  const childrenByParent = new Map<string | undefined, FlatNode[]>();
  for (const node of visible) {
    const parent = visibleParentId(node.entry.id);
    const list = childrenByParent.get(parent) ?? [];
    list.push(node);
    childrenByParent.set(parent, list);
  }

  function depthOf(entryId: string): number {
    let depth = 0;
    let current = visibleParentId(entryId);
    while (current) {
      depth += 1;
      current = visibleParentId(current);
    }
    return depth;
  }

  const nodes: SessionTreeNodeView[] = [];
  // DFS over visible tree (roots first, then children)
  function emit(node: FlatNode): void {
    const parentId = visibleParentId(node.entry.id);
    const siblings = childrenByParent.get(parentId) ?? [];
    const index = siblings.findIndex((item) => item.entry.id === node.entry.id);
    const isLast = index === siblings.length - 1;
    const kids = childrenByParent.get(node.entry.id) ?? [];
    const roleKind = roleKindFromEntry(node.entry);
    const role = roleKind;
    const view: SessionTreeNodeView = {
      id: node.entry.id,
      role,
      roleKind,
      preview: previewFromEntry(node.entry, roleKind),
      depth: depthOf(node.entry.id),
      leaf: kids.length === 0,
      active: options.leafId === node.entry.id,
      onActivePath: activePath.has(node.entry.id),
      isBranchPoint: kids.length > 1,
      connector: parentId ? (isLast ? "last" : "mid") : "none",
    };
    if (parentId) view.parentId = parentId;
    const label = node.label ?? node.entry.label;
    if (label) view.label = label;
    if (node.entry.timestamp) view.timestamp = node.entry.timestamp;
    nodes.push(view);
    for (const child of kids) emit(child);
  }

  for (const root of childrenByParent.get(undefined) ?? []) emit(root);

  const tree: SessionTreeView = {
    sessionId: options.sessionId,
    filterMode: options.filterMode,
    nodes,
  };
  if (options.sessionFile) tree.sessionFile = options.sessionFile;
  if (options.leafId) tree.leafId = options.leafId;
  return tree;
}

/** Built-in slash commands exposed on the desktop host (pi usage subset). */
export function listBuiltinSlashCommands(): BuiltinSlashCommand[] {
  return [
    { name: "new", description: "Start a new session", source: "builtin" },
    { name: "model", description: "Open model settings", source: "builtin" },
    { name: "settings", description: "Open settings", source: "builtin" },
    { name: "session", description: "Show session info (path / tokens / cost)", source: "builtin" },
    {
      name: "name",
      description: "Set pi session display name",
      source: "builtin",
      argumentHint: "<name>",
    },
    { name: "tree", description: "Navigate session tree", source: "builtin" },
    { name: "fork", description: "Fork current session into a new file", source: "builtin" },
    {
      name: "clone",
      description: "Clone active branch into a new session file",
      source: "builtin",
    },
    {
      name: "compact",
      description: "Compact context",
      source: "builtin",
      argumentHint: "[instructions]",
    },
    {
      name: "export",
      description: "Export session (html or jsonl)",
      source: "builtin",
      argumentHint: "[html|jsonl]",
    },
    {
      name: "import",
      description: "Import session from JSONL",
      source: "builtin",
      argumentHint: "<file>",
    },
    {
      name: "share",
      description: "Share session as secret GitHub gist (requires gh auth)",
      source: "builtin",
    },
    { name: "copy", description: "Copy last assistant reply", source: "builtin" },
    { name: "reload", description: "Reload extensions and resources", source: "builtin" },
    { name: "hotkeys", description: "Open keyboard shortcuts", source: "builtin" },
  ];
}

/**
 * Merge snapshot slash commands (extension/skill/prompt) with built-ins.
 * Built-in names lose when an extension already registered the same name.
 */
export function mergeSlashCatalog(
  runtimeCommands: Array<{
    name: string;
    description: string;
    source: string;
    argumentHint?: string;
  }>,
  builtins: BuiltinSlashCommand[] = listBuiltinSlashCommands(),
): Array<{
  name: string;
  description: string;
  source: string;
  argumentHint?: string;
  upcoming?: boolean;
}> {
  const names = new Set(runtimeCommands.map((item) => item.name));
  const merged = runtimeCommands.map((item) => ({ ...item }));
  for (const builtin of builtins) {
    if (names.has(builtin.name)) continue;
    const row: {
      name: string;
      description: string;
      source: string;
      argumentHint?: string;
      upcoming?: boolean;
    } = {
      name: builtin.name,
      description: builtin.description,
      source: builtin.source,
    };
    if (builtin.argumentHint) row.argumentHint = builtin.argumentHint;
    if (builtin.upcoming) row.upcoming = true;
    merged.push(row);
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

/** Detect pi-style shell injection prefixes. */
export function parseShellInjection(input: string): {
  kind: "none" | "shell" | "hidden-shell";
  command: string;
} {
  const trimmed = input.trimEnd();
  if (trimmed.startsWith("!!")) {
    return { kind: "hidden-shell", command: trimmed.slice(2).trimStart() };
  }
  if (trimmed.startsWith("!") && !trimmed.startsWith("!=")) {
    return { kind: "shell", command: trimmed.slice(1).trimStart() };
  }
  return { kind: "none", command: input };
}
