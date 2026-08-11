/**
 * Desktop slash-command catalog + routing helpers for pi parity surfaces.
 * Pure functions only — no agent-runtime / Node imports (safe for renderer).
 */
import type { BuiltinSlashCommand, HostSnapshot, SlashCommandSummary } from "@zeno/contracts";
import { t, type Locale, type MessageKey } from "./i18n.ts";

export type UnifiedSlashItem = {
  name: string;
  description: string;
  source: string;
  argumentHint?: string;
  upcoming?: boolean;
};

const BUILTIN_DESC_KEYS: Record<string, MessageKey> = {
  new: "slash.builtin.new",
  model: "slash.builtin.model",
  settings: "slash.builtin.settings",
  session: "slash.builtin.session",
  name: "slash.builtin.name",
  tree: "slash.builtin.tree",
  fork: "slash.builtin.fork",
  clone: "slash.builtin.clone",
  compact: "slash.builtin.compact",
  export: "slash.builtin.export",
  import: "slash.builtin.import",
  share: "slash.builtin.share",
  copy: "slash.builtin.copy",
  reload: "slash.builtin.reload",
  hotkeys: "slash.builtin.hotkeys",
};

export function listDesktopBuiltinSlashCommands(locale: Locale = "zh"): BuiltinSlashCommand[] {
  const tr = (key: MessageKey) => t(locale, key);
  return [
    { name: "new", description: tr("slash.builtin.new"), source: "builtin" },
    { name: "model", description: tr("slash.builtin.model"), source: "builtin" },
    { name: "settings", description: tr("slash.builtin.settings"), source: "builtin" },
    { name: "session", description: tr("slash.builtin.session"), source: "builtin" },
    {
      name: "name",
      description: tr("slash.builtin.name"),
      source: "builtin",
      argumentHint: "<name>",
    },
    { name: "tree", description: tr("slash.builtin.tree"), source: "builtin" },
    { name: "fork", description: tr("slash.builtin.fork"), source: "builtin" },
    { name: "clone", description: tr("slash.builtin.clone"), source: "builtin" },
    {
      name: "compact",
      description: tr("slash.builtin.compact"),
      source: "builtin",
      argumentHint: "[instructions]",
    },
    {
      name: "export",
      description: tr("slash.builtin.export"),
      source: "builtin",
      argumentHint: "[html|jsonl]",
    },
    {
      name: "import",
      description: tr("slash.builtin.import"),
      source: "builtin",
      argumentHint: "<file>",
    },
    {
      name: "share",
      description: tr("slash.builtin.share"),
      source: "builtin",
    },
    { name: "copy", description: tr("slash.builtin.copy"), source: "builtin" },
    { name: "reload", description: tr("slash.builtin.reload"), source: "builtin" },
    { name: "hotkeys", description: tr("slash.builtin.hotkeys"), source: "builtin" },
  ];
}

function localizeBuiltinDescription(locale: Locale, name: string, fallback: string): string {
  const key = BUILTIN_DESC_KEYS[name];
  return key ? t(locale, key) : fallback;
}

export function buildUnifiedSlashCatalog(
  snapshot: HostSnapshot | undefined,
  locale: Locale = "zh",
): UnifiedSlashItem[] {
  const runtime = snapshot?.slashCommands ?? [];
  const builtins = listDesktopBuiltinSlashCommands(locale);
  const names = new Set(runtime.map((item) => item.name));
  const merged: UnifiedSlashItem[] = runtime.map((item) => ({
    name: item.name,
    description: item.description,
    source: item.source,
    ...(item.argumentHint ? { argumentHint: item.argumentHint } : {}),
  }));
  for (const builtin of builtins) {
    if (names.has(builtin.name)) continue;
    merged.push({
      name: builtin.name,
      description: localizeBuiltinDescription(locale, builtin.name, builtin.description),
      source: builtin.source,
      ...(builtin.argumentHint ? { argumentHint: builtin.argumentHint } : {}),
      ...(builtin.upcoming ? { upcoming: true } : {}),
    });
  }
  // Prefer localized builtin descriptions even when snapshot already listed them.
  return merged
    .map((item) => {
      if (item.source === "builtin") {
        return {
          ...item,
          description: localizeBuiltinDescription(locale, item.name, item.description),
        };
      }
      return item;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function filterUnifiedSlash(
  items: UnifiedSlashItem[],
  query: string,
  limit = 24,
): UnifiedSlashItem[] {
  const needle = query.trim().toLocaleLowerCase();
  return items
    .filter((item) => {
      if (!needle) return true;
      return (
        item.name.toLocaleLowerCase().includes(needle) ||
        item.description.toLocaleLowerCase().includes(needle)
      );
    })
    .sort((a, b) => {
      const aPrefix = a.name.toLocaleLowerCase().startsWith(needle) ? 0 : 1;
      const bPrefix = b.name.toLocaleLowerCase().startsWith(needle) ? 0 : 1;
      return aPrefix - bPrefix || a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

export function parseSlashLine(value: string): { name: string; args: string } | undefined {
  const match = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(value.trim());
  if (!match) return undefined;
  return { name: match[1] ?? "", args: (match[2] ?? "").trim() };
}

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

export type BuiltinSlashAction =
  | { type: "new" }
  | { type: "model" }
  | { type: "settings" }
  | { type: "session" }
  | { type: "name"; name: string }
  | { type: "tree" }
  | { type: "fork" }
  | { type: "clone" }
  | { type: "compact"; instructions?: string }
  | { type: "export"; format: "html" | "jsonl" }
  | { type: "import"; path?: string }
  | { type: "copy" }
  | { type: "share" }
  | { type: "reload" }
  | { type: "hotkeys" }
  | { type: "upcoming"; name: string }
  | { type: "runtime"; command: string; args: string }
  | { type: "unknown"; name: string };

export function resolveBuiltinSlash(
  name: string,
  args: string,
  source?: string,
): BuiltinSlashAction {
  if (source && source !== "builtin") return { type: "runtime", command: name, args };
  switch (name) {
    case "new":
      return { type: "new" };
    case "model":
    case "models":
      return { type: "model" };
    case "settings":
      return { type: "settings" };
    case "session":
      return { type: "session" };
    case "name":
      return { type: "name", name: args };
    case "tree":
      return { type: "tree" };
    case "fork":
      return { type: "fork" };
    case "clone":
      return { type: "clone" };
    case "compact":
      return args ? { type: "compact", instructions: args } : { type: "compact" };
    case "export": {
      const format = args.trim().toLowerCase() === "html" ? "html" : "jsonl";
      return { type: "export", format };
    }
    case "import":
      return args ? { type: "import", path: stripMatchingQuotes(args) } : { type: "import" };
    case "copy":
      return { type: "copy" };
    case "share":
      return { type: "share" };
    case "reload":
      return { type: "reload" };
    case "hotkeys":
    case "keybindings":
      return { type: "hotkeys" };
    default:
      return { type: "runtime", command: name, args };
  }
}

function stripMatchingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function slashToPromptText(item: SlashCommandSummary | UnifiedSlashItem, args = ""): string {
  const body = args.trim();
  return body ? `/${item.name} ${body}` : `/${item.name}`;
}
