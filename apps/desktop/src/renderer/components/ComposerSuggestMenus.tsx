/**
 * Helpers behind the composer’s `/` and `@` suggestion panels.
 *
 * Grouping slash commands by source, choosing a package/extension icon, trimming a provider
 * description to fit a menu row, and the shared overflow measurement every panel uses. These
 * are free functions and one hook — none of them touch composer state — which is why they could
 * move out of `Composer.tsx` to pay the file-budget ratchet. A move, not a rewrite.
 */
import type { PackageSummary, SlashCommandSummary } from "@zeno/contracts";
import {
  Boxes,
  Cat,
  ClipboardCopy,
  Copy,
  Cpu,
  Download,
  GitFork,
  Info,
  Keyboard,
  LogIn,
  MessageSquareText,
  Minimize2,
  Network,
  PlusCircle,
  Puzzle,
  RefreshCw,
  Settings,
  Share2,
  Slash,
  Tag,
  Upload,
  Wand2,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { MessageKey } from "../lib/i18n.ts";

const ICON_SM = { className: "size-4 shrink-0", strokeWidth: 1.75 } as const;

/** Collapse a command description to a short single-line "what it does" for the menu. */
export function slashDescriptionForMenu(description: string): string {
  const collapsed = description.replace(/\s+/g, " ").trim();
  if (collapsed.length <= 48) return collapsed;
  const cut = collapsed.slice(0, 48);
  const lastSpace = cut.lastIndexOf(" ");
  const end = lastSpace > 24 ? lastSpace : 48;
  return `${collapsed.slice(0, end)}…`;
}

/** Icons for `/` catalog — source groups + well-known builtin command names. */
export function commandSourceIcon(command: SlashCommandSummary) {
  if (command.source === "skill" || command.name.startsWith("skill:")) {
    return <Wand2 {...ICON_SM} />;
  }
  if (command.source === "prompt") {
    return <MessageSquareText {...ICON_SM} />;
  }
  if (command.source === "extension") {
    return <Puzzle {...ICON_SM} />;
  }
  // builtin (and legacy names mapped as builtin)
  switch (command.name) {
    case "new":
      return <PlusCircle {...ICON_SM} />;
    case "model":
    case "models":
      return <Cpu {...ICON_SM} />;
    case "settings":
      return <Settings {...ICON_SM} />;
    case "session":
      return <Info {...ICON_SM} />;
    case "name":
      return <Tag {...ICON_SM} />;
    case "tree":
      return <Network {...ICON_SM} />;
    case "fork":
      return <GitFork {...ICON_SM} />;
    case "clone":
      return <Copy {...ICON_SM} />;
    case "compact":
      return <Minimize2 {...ICON_SM} />;
    case "export":
      return <Download {...ICON_SM} />;
    case "import":
      return <Upload {...ICON_SM} />;
    case "share":
      return <Share2 {...ICON_SM} />;
    case "copy":
      return <ClipboardCopy {...ICON_SM} />;
    case "reload":
      return <RefreshCw {...ICON_SM} />;
    case "hotkeys":
    case "keybindings":
      return <Keyboard {...ICON_SM} />;
    case "login":
      return <LogIn {...ICON_SM} />;
    case "mcp":
      return <Boxes {...ICON_SM} />;
    case "pet":
      return <Cat {...ICON_SM} />;
    default:
      return <Slash {...ICON_SM} />;
  }
}

/** `/` menu groups: builtins act locally; extension/prompt/skill route to the AI. */
type SlashGroupId = "builtin" | "extension" | "prompt" | "skill";

const SLASH_GROUP_ORDER: SlashGroupId[] = ["builtin", "extension", "prompt", "skill"];

export const SLASH_GROUP_LABEL_KEY: Record<SlashGroupId, MessageKey> = {
  builtin: "composer.slash.group.builtin",
  extension: "composer.slash.group.extension",
  prompt: "composer.slash.group.prompt",
  skill: "composer.slash.group.skill",
};

function slashGroupId(command: SlashCommandSummary): SlashGroupId {
  if (command.source === "skill" || command.name.startsWith("skill:")) return "skill";
  if (command.source === "extension") return "extension";
  if (command.source === "prompt") return "prompt";
  return "builtin";
}

export function groupSlashCommands(commands: SlashCommandSummary[]): Array<{
  id: SlashGroupId;
  items: Array<{ command: SlashCommandSummary; flatIndex: number }>;
}> {
  const buckets: Record<SlashGroupId, SlashCommandSummary[]> = {
    builtin: [],
    extension: [],
    prompt: [],
    skill: [],
  };
  for (const command of commands) {
    buckets[slashGroupId(command)].push(command);
  }
  let flatIndex = 0;
  // Only show groups that still have matches after filtering.
  const groups: Array<{
    id: SlashGroupId;
    items: Array<{ command: SlashCommandSummary; flatIndex: number }>;
  }> = [];
  for (const id of SLASH_GROUP_ORDER) {
    const list = buckets[id];
    if (list.length === 0) continue;
    groups.push({
      id,
      items: list.map((command) => {
        const row = { command, flatIndex };
        flatIndex += 1;
        return row;
      }),
    });
  }
  return groups;
}

export function filterPackages(
  packages: PackageSummary[],
  query: string,
  limit = 24,
): PackageSummary[] {
  const needle = query.trim().toLocaleLowerCase();
  const list = packages.filter((pkg) => {
    if (!needle) return true;
    return (
      pkg.source.toLocaleLowerCase().includes(needle) ||
      pkg.kind.toLocaleLowerCase().includes(needle) ||
      pkg.scope.toLocaleLowerCase().includes(needle)
    );
  });
  return list
    .slice()
    .sort((a, b) => a.source.localeCompare(b.source))
    .slice(0, limit);
}

/** Track whether a suggest list overflows so we only reserve fade padding when needed. */
export function useSuggestOverflow(open: boolean, deps: unknown[]) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!open || !el) {
      setOverflows(false);
      return;
    }
    const measure = () => {
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : undefined;
    ro?.observe(el);
    // Children size changes (filter results) also need remeasure.
    for (const child of el.children) {
      if (child instanceof HTMLElement) ro?.observe(child);
    }
    return () => ro?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are intentional content keys
  }, [open, ...deps]);

  return { scrollRef, overflows };
}
