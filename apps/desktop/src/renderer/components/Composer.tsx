/**
 * Conversation composer:
 * - Project picker above the card (icon + name)
 * - Textarea
 * - Bottom-left: attach +, access permission
 * - Bottom-right: context usage, model menu (thinking / model / speed), send icon
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type {
  GitBranchInfo,
  GitContextInfo,
  PackageSummary,
  QueuedMessages,
  SlashCommandSummary,
} from "@zeno/contracts";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Copy,
  Cpu,
  Download,
  File,
  Folder,
  FolderGit2,
  FolderOpen,
  Gauge,
  GitBranch,
  GitFork,
  Info,
  Keyboard,
  LogIn,
  MessageSquareText,
  Minimize2,
  Monitor,
  Network,
  Package,
  Plus,
  PlusCircle,
  Puzzle,
  RefreshCw,
  Search,
  Settings,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Slash,
  Sparkles,
  Square,
  Tag,
  Upload,
  Wand2,
} from "lucide-react";
import {
  anchorFromElement,
  anchorFromEvent,
  FloatingMenu,
  type AnchorRect,
} from "./FloatingMenu.tsx";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ComposerAttachmentList } from "./ComposerAttachmentList.tsx";
import { ComposerQueueCard } from "./ComposerQueueCard.tsx";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog.tsx";
import { t, thinkingLevelLabel, type Locale } from "../lib/i18n.ts";
import { modelSupportsServiceTier, type ServiceTierId } from "../lib/service-tier.ts";
import { modelSupportsThinking } from "../lib/thinking-levels.ts";
import { groupModelsByProvider } from "../lib/model-groups.ts";
import {
  addResourceQuery,
  applyPathTokenCompletion,
  filterSlashCommands,
  pathTokenBeforeCursor,
  slashCommandQuery,
} from "../lib/composer-suggestions.ts";
import { composerHighlightClass, tokenizeComposerHighlight } from "../lib/composer-highlight.ts";
import { isImeCompositionEvent } from "../lib/composer-keyboard.ts";
import type { AccessMode, AccessVisibility } from "../lib/settings-prefs.ts";
import { visibleAccessModes } from "../lib/settings-prefs.ts";
import { cn } from "../lib/utils.ts";
import { workspaceLabel } from "../lib/workspace.ts";
import { useShellStore } from "../store/shell-store.ts";

export type { AccessMode, AccessVisibility };
/** @deprecated Use ServiceTierId — legacy Zeno labels mapped to OpenAI service_tier. */
export type SpeedMode = ServiceTierId;

export interface ComposerModelOption {
  provider: string;
  id: string;
  name: string;
  /** Aligns with model settings: "custom" vs built-in catalog providers. */
  source?: string;
}

export interface ComposerProps {
  locale: Locale;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: (event?: FormEvent) => void;
  onAbort: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  running: boolean;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  workspacePath: string | undefined;
  recentWorkspaces: string[];
  onOpenProject: (path: string) => void;
  onAddProject: () => void;
  accessMode: AccessMode;
  onAccessMode: (mode: AccessMode) => void;
  /** Which permission options appear in the menu (from General settings). */
  accessVisibility: AccessVisibility;
  modelOptions: ComposerModelOption[];
  modelValue: string;
  onModelChange: (provider: string, id: string) => void;
  thinkingLevel: string;
  thinkingLevels: string[];
  onThinkingChange: (level: string) => void;
  /** OpenAI service_tier when model supports it; empty serviceTiers = unsupported. */
  serviceTier: ServiceTierId;
  serviceTiers: ServiceTierId[];
  onServiceTierChange: (tier: ServiceTierId) => void;
  contextPercent: number | undefined;
  contextTokens: number | undefined;
  /** When false, hide context usage chip on the composer. */
  showContextUsage?: boolean;
  projectTrusted: boolean | undefined;
  runState: string;
  piThemeLabel: string;
  /** Absolute file or directory paths passed to pi as readable context. */
  attachments: string[];
  onPickAttachments: (mode?: "files" | "folders") => Promise<void>;
  onRemoveAttachment: (path: string) => void;
  /** Add paths chosen from `@` file suggestions. */
  onAddAttachments?: (paths: string[]) => void;
  slashCommands: SlashCommandSummary[];
  /** Installed packages shown under `@` → 插件. */
  packages?: PackageSummary[];
  queuedMessages: QueuedMessages;
  onClearQueue: () => void;
  /** Abort left pending queue items — show paused banner + Continue. */
  /** 引导：send this queued item immediately. */
  /** … → 编辑：load into composer and drop from queue. */
  /**
   * Project / local / branch bar that protrudes above the input.
   * Hidden once the session already has conversation content.
   */
  showProjectBar?: boolean;
}

type MenuKind = "project" | "local" | "branch" | "access" | "model" | "attach" | null;

function normalizeCwdKey(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function isValidBranchName(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (n.includes("..") || n.startsWith("-") || n.endsWith(".lock")) return false;
  if (/[\s~^:?*[\\]/.test(n)) return false;
  return true;
}

function MenuRow(props: {
  icon?: ReactNode;
  label: string;
  description?: string;
  active?: boolean;
  muted?: boolean;
  /** Emphasize label (e.g. warning / danger) */
  emphasize?: "danger" | "none";
  onClick: () => void;
  testId?: string;
}) {
  const danger = props.emphasize === "danger";
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={props.testId}
      className={cn(
        "flex w-full cursor-pointer items-start gap-2 px-2.5 py-2 text-left transition-colors",
        props.muted
          ? "text-[var(--muted-foreground)] hover:bg-[var(--hover-fill)]"
          : "text-[var(--popover-foreground,var(--foreground))] hover:bg-[var(--hover-fill)]",
        danger && "hover:bg-red-500/10",
        props.active && !danger && "bg-[var(--accent)]",
        props.active && danger && "bg-red-500/10",
      )}
      onClick={props.onClick}
    >
      {props.icon ? (
        <span
          className={cn(
            "mt-0.5 inline-flex size-4 shrink-0",
            danger ? "text-red-500 opacity-100" : "opacity-70",
          )}
        >
          {props.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[13px] font-medium leading-snug",
            danger && "text-red-500",
          )}
        >
          {props.label}
        </span>
        {props.description ? (
          <span
            className={cn(
              "mt-0.5 block text-[11px] leading-snug",
              danger ? "text-red-500/75" : "text-[var(--text-subtle)]",
            )}
          >
            {props.description}
          </span>
        ) : null}
      </span>
      {props.active ? (
        <span className={cn("mt-0.5 text-[11px]", danger ? "text-red-500" : "text-[#0a84ff]")}>
          ✓
        </span>
      ) : null}
    </button>
  );
}

/** Full-access caution: orange-red (not pale system orange, not pure error red). */
const ACCESS_FULL_ORANGE = "text-[#ff5c1a]";
const ACCESS_FULL_ORANGE_MUTED = "text-[#ff5c1a]/90";
const ACCESS_FULL_ORANGE_HOVER = "hover:bg-[#ff5c1a]/12";

/**
 * Access-control option — same hover/active fill + radius as session rows
 * (`--hover-fill`, rounded-md). Full access keeps orange caution text.
 */
function AccessOption(props: {
  icon: ReactNode;
  label: string;
  description: string;
  active?: boolean;
  /** Full-access caution (orange), not destructive red. */
  caution?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={props.testId}
      className={cn(
        "flex w-full cursor-pointer items-start gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left transition-colors",
        // Match session list: transparent default, hover-fill on hover/active.
        props.active ? "bg-[var(--hover-fill)]" : "bg-transparent hover:bg-[var(--hover-fill)]",
        props.caution && !props.active && ACCESS_FULL_ORANGE_HOVER,
      )}
      onClick={props.onClick}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex size-4 shrink-0",
          props.caution ? ACCESS_FULL_ORANGE : "text-[var(--muted-foreground)]",
        )}
      >
        {props.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[13px] font-medium leading-snug",
            props.caution ? ACCESS_FULL_ORANGE : "text-[var(--foreground)]",
          )}
        >
          {props.label}
        </span>
        <span
          className={cn(
            "mt-0.5 block text-[11px] leading-snug",
            props.caution ? ACCESS_FULL_ORANGE_MUTED : "text-[var(--text-subtle)]",
          )}
        >
          {props.description}
        </span>
      </span>
      {props.active ? (
        <span
          className={cn(
            "mt-0.5 shrink-0 text-[11px] font-medium",
            props.caution ? ACCESS_FULL_ORANGE : "text-[var(--foreground)]",
          )}
        >
          ✓
        </span>
      ) : null}
    </button>
  );
}

/**
 * Hover-only row → right flyout.
 * Open/close timers are owned by the parent so sibling rows can switch without flicker.
 */
function FlyoutRow(props: {
  icon?: ReactNode;
  label: string;
  /** Current selection shown immediately left of the › arrow. */
  valueLabel?: string;
  open: boolean;
  /** Open this flyout immediately (cancels any pending close). */
  onHoverOpen: () => void;
  /** Schedule close after a short delay (cancelled if another flyout opens). */
  onHoverLeave: () => void;
  children: ReactNode;
  testId?: string;
  flyoutTestId?: string;
  minWidth?: number;
  /** When true, row is visible but does not open a flyout. */
  disabled?: boolean;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const disabled = props.disabled === true;

  useEffect(() => {
    if (!props.open || disabled) return;
    setAnchor(anchorFromElement(rowRef.current));
  }, [props.open, disabled]);

  function show() {
    if (disabled) return;
    setAnchor(anchorFromElement(rowRef.current));
    props.onHoverOpen();
  }

  return (
    <>
      <div
        ref={rowRef}
        role="menuitem"
        aria-disabled={disabled || undefined}
        data-testid={props.testId}
        data-disabled={disabled ? "true" : undefined}
        className={cn(
          "flex w-full cursor-default items-center gap-2 px-2.5 py-2 text-left text-[13px] transition-colors",
          "text-[var(--popover-foreground,var(--foreground))]",
          disabled ? "opacity-50" : "hover:bg-[var(--hover-fill)]",
          !disabled && props.open && "bg-[var(--accent)]",
        )}
        onMouseEnter={show}
        onMouseLeave={disabled ? undefined : props.onHoverLeave}
      >
        {props.icon ? (
          <span className="inline-flex size-4 shrink-0 opacity-70">{props.icon}</span>
        ) : null}
        <span className="min-w-0 flex-1 truncate font-medium leading-snug">{props.label}</span>
        {props.valueLabel ? (
          <span className="max-w-[6.5rem] shrink-0 truncate text-[12px] text-[var(--text-subtle)]">
            {props.valueLabel}
          </span>
        ) : null}
        {!disabled ? (
          <ChevronRight className="size-3.5 shrink-0 opacity-50" strokeWidth={2} />
        ) : null}
      </div>
      {!disabled ? (
        <FloatingMenu
          open={props.open && Boolean(anchor)}
          anchor={anchor}
          onClose={props.onHoverLeave}
          placement="right"
          zIndex={10_050}
          closeOnOutside={false}
          minWidth={props.minWidth ?? 180}
          className="py-1"
          {...(props.flyoutTestId ? { testId: props.flyoutTestId } : {})}
        >
          <div onMouseEnter={props.onHoverOpen} onMouseLeave={props.onHoverLeave}>
            {props.children}
          </div>
        </FloatingMenu>
      ) : null}
    </>
  );
}

function accessIcon(mode: AccessMode, className = "size-3.5") {
  if (mode === "full") return <ShieldAlert className={className} strokeWidth={1.75} />;
  if (mode === "autoReview") return <ShieldCheck className={className} strokeWidth={1.75} />;
  return <Shield className={className} strokeWidth={1.75} />;
}

function accessLabel(locale: Locale, mode: AccessMode): string {
  if (mode === "full") return t(locale, "composer.access.full");
  if (mode === "autoReview") return t(locale, "composer.access.autoReview");
  return t(locale, "composer.access.default");
}

function accessDesc(locale: Locale, mode: AccessMode): string {
  if (mode === "full") return t(locale, "composer.access.fullDesc");
  if (mode === "autoReview") return t(locale, "composer.access.autoReviewDesc");
  return t(locale, "composer.access.defaultDesc");
}

function formatContext(percent: number | undefined, tokens: number | undefined): string {
  if (percent != null && Number.isFinite(percent)) return `${Math.round(percent)}%`;
  if (tokens != null && Number.isFinite(tokens) && tokens > 0) {
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(tokens >= 10_000 ? 0 : 1)}k`;
    return `${tokens}`;
  }
  // No live usage yet — show empty capacity, never a dash.
  return "0%";
}

function ContextUsageIndicator(props: {
  label: string;
  percent: number | undefined;
  tokens: number | undefined;
}) {
  const rawPercent = props.percent;
  const hasPercent = rawPercent != null && Number.isFinite(rawPercent);
  const value = hasPercent ? Math.min(100, Math.max(0, Math.round(rawPercent))) : 0;
  const detail = formatContext(props.percent, props.tokens);
  const accessibleLabel = `${props.label}: ${detail}`;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground"
            data-testid="usage-chip"
            data-context-percent={value}
            role="meter"
            aria-label={accessibleLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            {...(hasPercent ? { "aria-valuenow": value } : {})}
          >
            <svg className="size-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle
                cx="10"
                cy="10"
                r="7"
                stroke="currentColor"
                strokeWidth="2.25"
                opacity="0.2"
              />
              {value > 0 ? (
                <circle
                  cx="10"
                  cy="10"
                  r="7"
                  pathLength="100"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeDasharray="100"
                  strokeDashoffset={100 - value}
                  transform="rotate(-90 10 10)"
                />
              ) : null}
            </svg>
            <span className="sr-only">{detail}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{accessibleLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const ICON_SM = { className: "size-4 shrink-0", strokeWidth: 1.75 } as const;

/** Icons for `/` catalog — source groups + well-known builtin command names. */
function commandSourceIcon(command: SlashCommandSummary) {
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
    default:
      return <Slash {...ICON_SM} />;
  }
}

/** `/` menu: 命令 (builtins/prompts/extensions) + 技能 (skills). */
type SlashGroupId = "command" | "skill";

const SLASH_GROUP_ORDER: SlashGroupId[] = ["command", "skill"];

function slashGroupId(command: SlashCommandSummary): SlashGroupId {
  if (command.source === "skill" || command.name.startsWith("skill:")) return "skill";
  return "command";
}

function groupSlashCommands(commands: SlashCommandSummary[]): Array<{
  id: SlashGroupId;
  items: Array<{ command: SlashCommandSummary; flatIndex: number }>;
}> {
  const buckets: Record<SlashGroupId, SlashCommandSummary[]> = {
    command: [],
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

function filterPackages(packages: PackageSummary[], query: string, limit = 24): PackageSummary[] {
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
function useSuggestOverflow(open: boolean, deps: unknown[]) {
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

/** Composer prompt: fixed base of 2 lines, grow to 12, then scroll. */
const COMPOSER_PROMPT_MIN_LINES = 2;
const COMPOSER_PROMPT_MAX_LINES = 12;

function fitComposerPromptHeight(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  const styles = window.getComputedStyle(el);
  const fontSize = Number.parseFloat(styles.fontSize) || 14;
  let lineHeight = Number.parseFloat(styles.lineHeight);
  // `normal` / non-px line-heights must not collapse min height below two real text rows.
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
    lineHeight = fontSize * 1.5;
  }
  const padY =
    (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
  // +2px subpixel buffer so the 2nd visual line does not immediately force a resize.
  const minH = Math.ceil(lineHeight * COMPOSER_PROMPT_MIN_LINES + padY + 2);
  const maxH = Math.ceil(lineHeight * COMPOSER_PROMPT_MAX_LINES + padY + 2);

  // Measure natural content height without fighting max-height.
  el.style.height = "0px";
  el.style.overflowY = "hidden";
  // scrollHeight with height 0 gives content size including padding.
  const contentH = el.scrollHeight;
  const next = Math.min(Math.max(contentH, minH), maxH);
  el.style.height = `${next}px`;
  const overflows = contentH > maxH + 1;
  el.style.overflowY = overflows ? "auto" : "hidden";
  el.dataset.overflow = overflows ? "true" : "false";
}

export function Composer(props: ComposerProps) {
  const tr = (key: Parameters<typeof t>[1], vars?: Record<string, string>) =>
    t(props.locale, key, vars);
  const [menu, setMenu] = useState<MenuKind>(null);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [projectQuery, setProjectQuery] = useState("");
  const [branchQuery, setBranchQuery] = useState("");
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [gitBusy, setGitBusy] = useState(false);
  /** Hover tip for local-menu options (description bubble outside the menu). */
  const [localTip, setLocalTip] = useState<{ text: string; x: number; y: number } | null>(null);
  /** Create-worktree dialog (same as project ⋯ menu). */
  const [worktreeDialogOpen, setWorktreeDialogOpen] = useState(false);
  const showAppError = useShellStore((s) => s.showAppError);
  /** Mirror layer under the transparent textarea for skill / link / @path highlights. */
  const promptHighlightRef = useRef<HTMLDivElement | null>(null);
  /** Which model-submenu flyout is open: thinking | speed */
  const [modelFlyout, setModelFlyout] = useState<"thinking" | "speed" | null>(null);
  const modelFlyoutCloseTimer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** Main input card only — slash/@ menus overlay this, ignoring project-bar protrusion height. */
  const composerCardRef = useRef<HTMLFormElement | null>(null);
  const [suggestionAnchor, setSuggestionAnchor] = useState<AnchorRect | null>(null);
  /** -1 = no highlighted option (no default selected background). */
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const workspace = workspaceLabel(props.workspacePath);
  const [gitContext, setGitContext] = useState<GitContextInfo>({});

  async function refreshGitContext(cwd = props.workspacePath) {
    if (!cwd) {
      setGitContext({});
      return;
    }
    try {
      const info = await window.zeno.workspace.getGitContext(cwd);
      setGitContext(info ?? {});
    } catch {
      setGitContext({});
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (!props.workspacePath) {
      setGitContext({});
      return;
    }
    void window.zeno.workspace
      .getGitContext(props.workspacePath)
      .then((info) => {
        if (!cancelled) setGitContext(info ?? {});
      })
      .catch(() => {
        if (!cancelled) setGitContext({});
      });
    return () => {
      cancelled = true;
    };
  }, [props.workspacePath]);

  useEffect(() => {
    if (menu !== "branch" || !props.workspacePath) return;
    let cancelled = false;
    setBranchesLoading(true);

    void window.zeno.workspace
      .listGitBranches(props.workspacePath)
      .then((list) => {
        if (!cancelled) setBranches(list ?? []);
      })
      .catch((error) => {
        if (!cancelled) {
          setBranches([]);
          showAppError(error instanceof Error ? error.message : tr("composer.branch.failed"));
        }
      })
      .finally(() => {
        if (!cancelled) setBranchesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tr is stable per locale
  }, [menu, props.workspacePath, props.locale]);

  function clearModelFlyoutCloseTimer() {
    if (modelFlyoutCloseTimer.current != null) {
      window.clearTimeout(modelFlyoutCloseTimer.current);
      modelFlyoutCloseTimer.current = null;
    }
  }

  function openModelFlyout(kind: "thinking" | "speed") {
    clearModelFlyoutCloseTimer();
    setModelFlyout(kind);
  }

  function scheduleCloseModelFlyout() {
    clearModelFlyoutCloseTimer();
    // Shared delay so moving between sibling rows / into the flyout does not flicker.
    modelFlyoutCloseTimer.current = window.setTimeout(() => {
      modelFlyoutCloseTimer.current = null;
      setModelFlyout(null);
    }, 180);
  }

  useEffect(() => {
    return () => clearModelFlyoutCloseTimer();
  }, []);

  const projectPaths = useMemo(() => {
    const list: string[] = [];
    if (props.workspacePath) list.push(props.workspacePath);
    for (const p of props.recentWorkspaces) list.push(p);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of list) {
      const key = p.replace(/\\/g, "/").replace(/\/+$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out;
  }, [props.workspacePath, props.recentWorkspaces]);

  const filteredProjects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase();
    if (!q) return projectPaths;
    return projectPaths.filter((path) => {
      const label = workspaceLabel(path);
      return (
        label.name.toLowerCase().includes(q) ||
        path.toLowerCase().includes(q) ||
        (label.detail?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [projectPaths, projectQuery]);

  const modelLabel = useMemo(() => {
    if (!props.modelValue) return tr("composer.model.none");
    const [provider, id] = props.modelValue.split("/");
    const found = props.modelOptions.find((m) => m.provider === provider && m.id === id);
    return found?.name || id || tr("composer.model.none");
  }, [props.modelValue, props.modelOptions, props.locale]);

  const modelGroups = useMemo(
    () => groupModelsByProvider(props.modelOptions, tr("models.group.custom")),
    [props.modelOptions, props.locale],
  );
  const thinkingSupported = modelSupportsThinking(props.thinkingLevels);
  const serviceTierSupported = modelSupportsServiceTier(props.serviceTiers);

  function serviceTierLabel(tier: string): string {
    if (tier === "priority") return tr("composer.speed.priority");
    if (tier === "flex") return tr("composer.speed.flex");
    return tr("composer.speed.default");
  }

  const slashQuery = slashCommandQuery(props.prompt);
  const resourceQuery = addResourceQuery(props.prompt);
  const promptHighlightSpans = useMemo(
    () => tokenizeComposerHighlight(props.prompt),
    [props.prompt],
  );

  function syncPromptHighlightScroll(el: HTMLTextAreaElement | null) {
    const mirror = promptHighlightRef.current;
    if (!el || !mirror) return;
    mirror.scrollTop = el.scrollTop;
    mirror.scrollLeft = el.scrollLeft;
  }
  const slashSuggestions = useMemo(
    () => filterSlashCommands(props.slashCommands, slashQuery ?? ""),
    [props.slashCommands, slashQuery],
  );
  const slashGroups = useMemo(() => groupSlashCommands(slashSuggestions), [slashSuggestions]);
  const packageSuggestions = useMemo(
    () => filterPackages(props.packages ?? [], resourceQuery ?? ""),
    [props.packages, resourceQuery],
  );
  const [pathSuggestions, setPathSuggestions] = useState<
    Array<{ path: string; relative: string; kind: "file" | "folder" }>
  >([]);
  // `@` → 添加 (picker + project paths) + 插件 (packages, only if any).
  const slashPanelOpen = menu === null && !suggestionsDismissed && slashQuery !== undefined;
  const resourcePanelOpen =
    menu === "attach" || (menu === null && !suggestionsDismissed && resourceQuery !== undefined);
  /** Flat `@`/attach nav: 0 = files, 1 = folders, then paths, then packages. */
  const resourceItemCount = 2 + pathSuggestions.length + packageSuggestions.length;
  const slashOverflow = useSuggestOverflow(slashPanelOpen, [
    slashQuery,
    slashSuggestions.length,
    props.slashCommands.length,
  ]);
  const resourceOverflow = useSuggestOverflow(resourcePanelOpen, [
    resourceQuery,
    pathSuggestions.length,
    packageSuggestions.length,
    props.packages?.length ?? 0,
  ]);

  useEffect(() => {
    if (!resourcePanelOpen) {
      setPathSuggestions([]);
      return;
    }
    // Menu opened via + button still searches; typed `@q` filters paths.
    const q = resourceQuery ?? "";
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void window.zeno.workspace
        .searchPaths(q, {
          ...(props.workspacePath ? { cwd: props.workspacePath } : {}),
          limit: 24,
        })
        .then((rows) => {
          if (!cancelled) setPathSuggestions(rows);
        })
        .catch(() => {
          if (!cancelled) setPathSuggestions([]);
        });
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [resourcePanelOpen, resourceQuery, props.workspacePath]);

  useEffect(() => {
    if (!slashPanelOpen && !resourcePanelOpen) {
      setSuggestionAnchor(null);
      return;
    }
    // Anchor to the card surface so the menu covers protrusion instead of clearing its full height.
    setSuggestionAnchor(anchorFromElement(composerCardRef.current ?? rootRef.current));
  }, [
    slashPanelOpen,
    resourcePanelOpen,
    props.prompt,
    props.showProjectBar,
    props.attachments.length,
  ]);

  useEffect(() => {
    setSuggestionIndex(-1);
  }, [slashQuery, resourceQuery, menu]);

  function closeMenu() {
    clearModelFlyoutCloseTimer();
    setMenu(null);
    setAnchor(null);
    setProjectQuery("");
    setBranchQuery("");
    setModelFlyout(null);
    setLocalTip(null);
  }

  function openMenu(kind: MenuKind, event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (menu === kind) {
      closeMenu();
      return;
    }
    setMenu(kind);
    setAnchor(
      kind === "attach"
        ? anchorFromElement(composerCardRef.current ?? rootRef.current)
        : anchorFromEvent(event.currentTarget),
    );
  }

  function dismissSuggestions() {
    if (menu === "attach") closeMenu();
    else setSuggestionsDismissed(true);
  }

  function selectCommand(command: SlashCommandSummary) {
    props.onPromptChange(`/${command.name} `);
    setSuggestionsDismissed(true);
    closeMenu();
    requestAnimationFrame(() => props.composerRef.current?.focus());
  }

  async function selectAttachments(mode: "files" | "folders" = "files") {
    if (resourceQuery !== undefined) props.onPromptChange("");
    setSuggestionsDismissed(true);
    closeMenu();
    // Open native dialog after the menu unmounts so Windows doesn't steal focus oddly.
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
    await props.onPickAttachments(mode);
    requestAnimationFrame(() => props.composerRef.current?.focus());
  }

  function handlePromptChange(value: string) {
    setSuggestionsDismissed(false);
    if (slashCommandQuery(value) !== undefined || addResourceQuery(value) !== undefined) {
      closeMenu();
    }
    props.onPromptChange(value);
    // Fit on next paint so the controlled value is already in the DOM.
    requestAnimationFrame(() => fitComposerPromptHeight(props.composerRef.current));
  }

  // Keep height + highlight scroll in sync for external prompt updates (slash insert, clear, etc.).
  useLayoutEffect(() => {
    fitComposerPromptHeight(props.composerRef.current);
    syncPromptHighlightScroll(props.composerRef.current);
  }, [props.prompt, props.composerRef, props.attachments.length]);

  function clearAtTokenFromPrompt() {
    // Drop a trailing `@query` token after picking a resource.
    const next = props.prompt.replace(/@[^\s]*$/, "").trimEnd();
    props.onPromptChange(next ? `${next} ` : "");
  }

  function selectPackage(pkg: PackageSummary) {
    // Insert package source as an @ mention and close the menu.
    props.onPromptChange(`@${pkg.source} `);
    setSuggestionsDismissed(true);
    closeMenu();
    requestAnimationFrame(() => props.composerRef.current?.focus());
  }

  function selectProjectPath(absPath: string) {
    clearAtTokenFromPrompt();
    props.onAddAttachments?.([absPath]);
    setSuggestionsDismissed(true);
    closeMenu();
    requestAnimationFrame(() => props.composerRef.current?.focus());
  }

  function commitResourceIndex(index: number) {
    if (index === 0) {
      void selectAttachments("files");
      return;
    }
    if (index === 1) {
      void selectAttachments("folders");
      return;
    }
    const pathIndex = index - 2;
    if (pathIndex < pathSuggestions.length) {
      const hit = pathSuggestions[pathIndex];
      if (hit) selectProjectPath(hit.path);
      return;
    }
    const pkg = packageSuggestions[pathIndex - pathSuggestions.length];
    if (pkg) selectPackage(pkg);
  }

  async function completePathWithTab(textarea: HTMLTextAreaElement) {
    const cursor = textarea.selectionStart ?? props.prompt.length;
    const token = pathTokenBeforeCursor(props.prompt, cursor);
    if (!token) return false;
    // When @ menu already has path hits, Tab accepts highlighted/first path.
    if (resourcePanelOpen && pathSuggestions.length > 0) {
      // Paths start at flat index 2 (after files + folders pickers).
      const pathStart = 2;
      const index =
        suggestionIndex >= pathStart && suggestionIndex < pathStart + pathSuggestions.length
          ? suggestionIndex
          : pathStart;
      const hit = pathSuggestions[index - pathStart];
      if (hit) {
        if (token.atMention) {
          selectProjectPath(hit.path);
        } else {
          const applied = applyPathTokenCompletion(props.prompt, cursor, hit.relative);
          if (applied) {
            props.onPromptChange(applied.value);
            requestAnimationFrame(() => {
              textarea.setSelectionRange(applied.cursor, applied.cursor);
              textarea.focus();
            });
          }
        }
        return true;
      }
    }
    try {
      const rows = await window.zeno.workspace.searchPaths(token.query, {
        ...(props.workspacePath ? { cwd: props.workspacePath } : {}),
        limit: 8,
      });
      const hit = rows[0];
      if (!hit) return false;
      if (token.atMention) {
        selectProjectPath(hit.path);
        return true;
      }
      const applied = applyPathTokenCompletion(props.prompt, cursor, hit.relative);
      if (!applied) return false;
      props.onPromptChange(applied.value);
      requestAnimationFrame(() => {
        textarea.setSelectionRange(applied.cursor, applied.cursor);
        textarea.focus();
      });
      return true;
    } catch {
      return false;
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isImeCompositionEvent(event.nativeEvent)) return;

    const panel = slashPanelOpen ? "slash" : resourcePanelOpen ? "resource" : undefined;
    if (panel) {
      // `/` → commands+skills; `@` → picker + project paths + packages.
      const itemCount = panel === "slash" ? slashSuggestions.length : resourceItemCount;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (itemCount > 0) {
          const delta = event.key === "ArrowDown" ? 1 : -1;
          setSuggestionIndex((current) => {
            // No selection yet → first Down picks 0, first Up picks last.
            if (current < 0) return event.key === "ArrowDown" ? 0 : itemCount - 1;
            return (current + delta + itemCount) % itemCount;
          });
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        dismissSuggestions();
        return;
      }
      // Tab completes path / accepts first resource suggestion (pi editor parity).
      if (event.key === "Tab" && !event.shiftKey) {
        event.preventDefault();
        if (panel === "resource") {
          if (suggestionIndex >= 0) commitResourceIndex(suggestionIndex);
          else if (pathSuggestions.length > 0)
            commitResourceIndex(2); // first path after pickers
          else void selectAttachments("files");
          return;
        }
        if (panel === "slash" && slashSuggestions.length > 0) {
          const command = slashSuggestions[suggestionIndex >= 0 ? suggestionIndex : 0];
          if (command) selectCommand(command);
          return;
        }
      }
      // Only commit a menu choice when something is highlighted (keyboard or hover).
      if (event.key === "Enter" && !event.shiftKey && itemCount > 0 && suggestionIndex >= 0) {
        event.preventDefault();
        if (panel === "resource") commitResourceIndex(suggestionIndex);
        else {
          const command = slashSuggestions[suggestionIndex];
          if (command) selectCommand(command);
        }
        return;
      }
    } else if (event.key === "Tab" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      // Bare path Tab completion when no slash/@ panel is open.
      const token = pathTokenBeforeCursor(
        props.prompt,
        event.currentTarget.selectionStart ?? props.prompt.length,
      );
      if (token) {
        event.preventDefault();
        void completePathWithTab(event.currentTarget);
        return;
      }
    }
    props.onKeyDown(event);
  }

  async function handleComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const items = event.clipboardData?.items;
    if (!items?.length) return;
    let hasImage = false;
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        hasImage = true;
        break;
      }
    }
    if (!hasImage) return;
    event.preventDefault();
    try {
      // Prefer system clipboard image via main (handles OS paste reliably).
      const saved = await window.zeno.workspace.saveClipboardImage();
      if (saved) {
        props.onAddAttachments?.([saved]);
        return;
      }
      // Fallback: file from clipboard data
      for (const item of items) {
        if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (!file) continue;
        const buffer = new Uint8Array(await file.arrayBuffer());
        const ext = file.type.includes("jpeg") || file.type.includes("jpg") ? "jpg" : "png";
        const path = await window.zeno.workspace.saveClipboardImage({
          bytes: Array.from(buffer),
          ext,
        });
        if (path) props.onAddAttachments?.([path]);
        break;
      }
    } catch {
      // ignore paste failures — user can still attach via picker
    }
  }

  function handleComposerDrop(event: DragEvent<HTMLTextAreaElement>) {
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    event.preventDefault();
    event.stopPropagation();
    const paths: string[] = [];
    for (const file of files) {
      const filePath = window.zeno.workspace.pathForFile(file);
      if (typeof filePath === "string" && filePath) paths.push(filePath);
    }
    if (paths.length) props.onAddAttachments?.(paths);
  }

  const filteredBranches = useMemo(() => {
    // Local branches only — hide origin/* and other remote-tracking refs.
    // Keep names like feature/foo (local with slash); drop remote flag / origin/ prefix.
    const locals = branches.filter((b) => {
      if (b.remote) return false;
      if (/^(origin|upstream)\//.test(b.name)) return false;
      return true;
    });
    const q = branchQuery.trim().toLowerCase();
    if (!q) return locals;
    return locals.filter((b) => b.name.toLowerCase().includes(q));
  }, [branches, branchQuery]);

  const canCreateBranch = useMemo(() => {
    const name = branchQuery.trim();
    if (!isValidBranchName(name)) return false;
    return !branches.some((b) => b.name === name || b.name.endsWith(`/${name}`));
  }, [branchQuery, branches]);

  async function handleCheckoutBranch(name: string) {
    if (!props.workspacePath || gitBusy) return;
    setGitBusy(true);

    try {
      const next = await window.zeno.workspace.checkoutGitBranch(name, props.workspacePath);
      setGitContext(next);
      closeMenu();
    } catch (error) {
      showAppError(error instanceof Error ? error.message : tr("composer.branch.failed"));
    } finally {
      setGitBusy(false);
    }
  }

  async function handleCreateCheckoutBranch() {
    const name = branchQuery.trim();
    if (!props.workspacePath || !isValidBranchName(name) || gitBusy) return;
    setGitBusy(true);

    try {
      const next = await window.zeno.workspace.createGitBranch(name, {
        checkout: true,
        cwd: props.workspacePath,
      });
      setGitContext(next);
      closeMenu();
    } catch (error) {
      showAppError(error instanceof Error ? error.message : tr("composer.branch.failed"));
    } finally {
      setGitBusy(false);
    }
  }

  async function handleSwitchToLocal() {
    if (!props.workspacePath || gitBusy) return;
    const main = gitContext.mainWorktreePath;
    if (gitContext.isMainWorktree !== false) {
      closeMenu();
      return;
    }
    if (!main) {
      showAppError(tr("composer.local.failed"));
      return;
    }
    if (normalizeCwdKey(main) === normalizeCwdKey(props.workspacePath)) {
      closeMenu();
      return;
    }
    setGitBusy(true);

    try {
      closeMenu();
      props.onOpenProject(main);
    } catch (error) {
      showAppError(error instanceof Error ? error.message : tr("composer.local.failed"));
    } finally {
      setGitBusy(false);
    }
  }

  function handleNewWorktree() {
    if (!props.workspacePath || gitBusy) return;
    closeMenu();
    // Same dialog as project ⋯ → create worktree.
    window.setTimeout(() => setWorktreeDialogOpen(true), 0);
  }

  const projectMenuOpen = menu === "project";
  const localMenuOpen = menu === "local";
  const branchMenuOpen = menu === "branch";
  const hasProject = Boolean(props.workspacePath);
  const localLabel =
    gitContext.isMainWorktree === false && gitContext.worktree
      ? gitContext.worktree
      : tr("composer.local.label");

  const showProjectBar = props.showProjectBar !== false;

  return (
    <div
      ref={rootRef}
      // Parent is `.thread-content-column` (same as timeline) — fill it completely.
      className="pointer-events-auto relative w-full min-w-0 max-w-full"
      data-testid="composer-root"
    >
      <ComposerQueueCard
        locale={props.locale}
        queuedMessages={props.queuedMessages}
        onClearQueue={props.onClearQueue}
      />

      {/*
        Protrusion: project / local / branch. Only for empty sessions —
        hide once the thread has conversation content.
      */}
      {showProjectBar ? (
        <div className="relative z-[2] flex w-full justify-center px-[18px]">
          <div className="composer-protrusion" data-testid="composer-project-bar">
            <button
              type="button"
              data-testid="composer-project-picker"
              aria-expanded={projectMenuOpen}
              className="composer-protrusion-chip max-w-[42%]"
              onClick={(e) => openMenu("project", e)}
            >
              <Folder className="size-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
              <span className="min-w-0 truncate" data-testid="workspace-name-chip">
                {hasProject ? workspace.name : tr("composer.project.pick")}
              </span>
            </button>

            {hasProject ? (
              <>
                <button
                  type="button"
                  className="composer-protrusion-chip max-w-[26%]"
                  title={localLabel}
                  data-testid="composer-local"
                  aria-expanded={localMenuOpen}
                  onClick={(e) => openMenu("local", e)}
                >
                  <Monitor className="size-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
                  <span className="min-w-0 truncate">{localLabel}</span>
                  <ChevronDown className="size-3 shrink-0 opacity-60" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="composer-protrusion-chip max-w-[26%]"
                  title={tr("composer.project.branch")}
                  data-testid="composer-git-branch"
                  aria-expanded={branchMenuOpen}
                  onClick={(e) => openMenu("branch", e)}
                >
                  <GitBranch className="size-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
                  <span className="min-w-0 truncate">
                    {gitContext.branch || tr("composer.project.noBranch")}
                  </span>
                  <ChevronDown className="size-3 shrink-0 opacity-60" strokeWidth={2} />
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Full card border; joins the protrusion tab when present. */}
      <form
        ref={composerCardRef}
        className={cn("composer-card", showProjectBar && "composer-card-with-protrusion")}
        onSubmit={(event) => props.onSubmit(event)}
      >
        {props.attachments.length > 0 ? (
          <ComposerAttachmentList
            paths={props.attachments}
            locale={props.locale}
            onRemove={props.onRemoveAttachment}
          />
        ) : null}

        <div className="composer-prompt-field">
          <div
            ref={promptHighlightRef}
            className="composer-prompt-highlight composer-prompt-scroll"
            aria-hidden="true"
            data-testid="prompt-highlight"
          >
            {promptHighlightSpans.map((span, index) => (
              <span key={index} className={composerHighlightClass(span.kind)}>
                {span.text}
              </span>
            ))}
            {/* Trailing newline keeps last empty line height in sync with the textarea. */}
            {"\n"}
          </div>
          <Textarea
            ref={props.composerRef}
            aria-label="Prompt"
            data-testid="prompt-input"
            value={props.prompt}
            onChange={(event) => handlePromptChange(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            onScroll={(event) => syncPromptHighlightScroll(event.currentTarget)}
            onPaste={(event) => {
              void handleComposerPaste(event);
              requestAnimationFrame(() => {
                fitComposerPromptHeight(props.composerRef.current);
                syncPromptHighlightScroll(props.composerRef.current);
              });
            }}
            onDrop={handleComposerDrop}
            onDragOver={(event) => {
              if (event.dataTransfer?.types?.includes("Files")) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }
            }}
            onInput={() => {
              fitComposerPromptHeight(props.composerRef.current);
              syncPromptHighlightScroll(props.composerRef.current);
            }}
            placeholder={tr("composer.placeholder")}
            rows={COMPOSER_PROMPT_MIN_LINES}
            className={cn(
              "composer-prompt-scroll composer-prompt-input resize-none rounded-none border-0 bg-transparent px-3.5 pt-3 pb-1",
              "leading-[1.5] shadow-none",
              "focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0",
              "dark:bg-transparent",
            )}
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
          {/* Left: attach + access */}
          <div className="flex min-w-0 items-center gap-0.5">
            <button
              type="button"
              data-testid="composer-attach"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--hover-fill)] hover:text-[var(--foreground)]"
              title={tr("composer.attach")}
              aria-label={tr("composer.attach")}
              onClick={(e) => openMenu("attach", e)}
            >
              <Plus className="size-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              data-testid="composer-access"
              className={cn(
                "inline-flex h-8 max-w-[11rem] cursor-pointer items-center gap-1 rounded-full px-2",
                "text-[12px] hover:bg-[var(--hover-fill)]",
                props.accessMode === "full"
                  ? "text-[#ff5c1a] hover:bg-[#ff5c1a]/12 hover:text-[#ff4d00]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
              )}
              onClick={(e) => openMenu("access", e)}
            >
              {accessIcon(props.accessMode)}
              <span className="min-w-0 truncate">
                {accessLabel(props.locale, props.accessMode)}
              </span>
            </button>
            {/* legacy probes (hidden) */}
            <span className="hidden" data-testid="trust-chip">
              {props.projectTrusted ? tr("workspace.trusted") : tr("workspace.untrusted")}
            </span>
            <span className="hidden" data-testid="run-state-chip">
              {props.runState}
            </span>
            <span className="hidden" data-testid="pi-theme-label">
              {props.piThemeLabel}
            </span>
          </div>

          {/* Right: context + model + send */}
          <div className="flex shrink-0 items-center gap-1">
            {props.showContextUsage !== false ? (
              <ContextUsageIndicator
                label={tr("composer.context")}
                percent={props.contextPercent}
                tokens={props.contextTokens}
              />
            ) : null}
            <button
              type="button"
              data-testid="model-select-wrap"
              title={
                thinkingSupported
                  ? `${modelLabel} ${thinkingLevelLabel(props.locale, props.thinkingLevel)}`
                  : modelLabel
              }
              className={cn(
                "inline-flex h-8 min-w-0 max-w-[14rem] cursor-pointer items-center gap-2 rounded-full px-2",
                "text-[12px] text-[var(--muted-foreground)] hover:bg-[var(--hover-fill)] hover:text-[var(--foreground)]",
                !props.modelOptions.length && !props.modelValue && "opacity-50",
              )}
              disabled={props.running}
              onClick={(e) => openMenu("model", e)}
            >
              <span className="min-w-0 truncate" data-testid="model-select-label">
                {modelLabel}
              </span>
              {thinkingSupported ? (
                <span className="shrink-0 opacity-70" data-testid="model-thinking-label">
                  {thinkingLevelLabel(props.locale, props.thinkingLevel)}
                </span>
              ) : null}
            </button>
            {/* hidden native selects for e2e/compat */}
            <select
              data-testid="model-select"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              value={props.modelValue}
              disabled={!props.modelValue || props.running}
              onChange={(event) => {
                const [provider, id] = event.target.value.split("/");
                if (provider && id) props.onModelChange(provider, id);
              }}
            >
              {(props.modelOptions.length
                ? props.modelOptions
                : props.modelValue
                  ? [
                      {
                        provider: props.modelValue.split("/")[0]!,
                        id: props.modelValue.split("/")[1]!,
                        name: props.modelValue,
                      },
                    ]
                  : []
              ).map((model) => (
                <option
                  key={`${model.provider}/${model.id}`}
                  value={`${model.provider}/${model.id}`}
                >
                  {model.name || model.id}
                </option>
              ))}
            </select>
            <select
              data-testid="thinking-select"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              value={props.thinkingLevel}
              disabled={props.running}
              onChange={(event) => props.onThinkingChange(event.target.value)}
            >
              {props.thinkingLevels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>

            {props.running ? (
              // During AI reply: send becomes a single stop control (queue still via Enter).
              <Button
                type="button"
                size="icon"
                data-testid="abort-prompt"
                onClick={() => props.onAbort()}
                aria-label={tr("composer.stop")}
                title={tr("composer.stop")}
                className="h-7 w-7 rounded-full border-0 bg-foreground text-background shadow-none hover:bg-foreground/90"
              >
                <Square className="h-2.5 w-2.5 fill-current" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                data-testid="send-prompt"
                disabled={!props.prompt.trim() && props.attachments.length === 0}
                aria-label={tr("composer.start")}
                className="h-7 w-7 rounded-full border-0 bg-foreground text-background shadow-none hover:bg-foreground/90 disabled:opacity-30"
              >
                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.25} />
              </Button>
            )}
          </div>
        </div>
      </form>

      <FloatingMenu
        open={slashPanelOpen && Boolean(suggestionAnchor)}
        anchor={suggestionAnchor}
        onClose={dismissSuggestions}
        placement="top"
        testId="composer-slash-menu"
        minWidth={320}
        matchAnchorWidth
        elevated={false}
        closeOnScroll={!props.running}
        offsetPx={8}
        className="!rounded-[var(--radius-panel)] !border-[var(--border)] !bg-[var(--surface-panel)] !py-0"
      >
        <div
          className="composer-suggest-body"
          data-overflow={slashOverflow.overflows ? "true" : "false"}
        >
          <div ref={slashOverflow.scrollRef} className="composer-suggest-scroll pt-0">
            {slashGroups.length === 0 ? (
              <p className="px-2.5 py-3 text-left text-[13px] text-[var(--text-subtle)]">
                {tr("composer.slash.empty")}
              </p>
            ) : (
              slashGroups.map((group) => (
                <div
                  key={group.id}
                  className="composer-suggest-group"
                  data-testid={`composer-slash-group-${group.id}`}
                >
                  <div className="composer-suggest-group-label">
                    {tr(
                      group.id === "skill"
                        ? "composer.slash.group.skill"
                        : "composer.slash.group.command",
                    )}
                  </div>
                  {group.items.map(({ command, flatIndex }) => (
                    <button
                      key={`${command.source}:${command.name}`}
                      type="button"
                      role="menuitem"
                      data-testid="composer-slash-item"
                      data-active={
                        suggestionIndex >= 0 && flatIndex === suggestionIndex ? "true" : "false"
                      }
                      className="composer-suggest-item"
                      onMouseEnter={() => setSuggestionIndex(flatIndex)}
                      onMouseLeave={() => setSuggestionIndex(-1)}
                      onClick={() => selectCommand(command)}
                    >
                      <span className="inline-flex size-4 shrink-0 text-[var(--muted-foreground)]">
                        {commandSourceIcon(command)}
                      </span>
                      <span className="composer-suggest-item-main">
                        /{command.name}
                        {command.argumentHint ? (
                          <span className="ml-1 font-normal text-[var(--text-subtle)]">
                            {command.argumentHint}
                          </span>
                        ) : null}
                      </span>
                      <span className="composer-suggest-item-desc">{command.description}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
          <div className="composer-suggest-fade" aria-hidden />
        </div>
      </FloatingMenu>

      <FloatingMenu
        open={resourcePanelOpen && Boolean(menu === "attach" ? anchor : suggestionAnchor)}
        anchor={menu === "attach" ? anchor : suggestionAnchor}
        onClose={dismissSuggestions}
        placement="top"
        testId="composer-attach-menu"
        minWidth={320}
        matchAnchorWidth
        elevated={false}
        closeOnScroll={menu === "attach" || !props.running}
        offsetPx={8}
        className="!rounded-[var(--radius-panel)] !border-[var(--border)] !bg-[var(--surface-panel)] !py-0"
      >
        <div
          className="composer-suggest-body"
          data-overflow={resourceOverflow.overflows ? "true" : "false"}
        >
          <div ref={resourceOverflow.scrollRef} className="composer-suggest-scroll pt-0">
            <div className="composer-suggest-group" data-testid="composer-attach-group-add">
              <div className="composer-suggest-group-label">{tr("composer.add.title")}</div>
              {/*
                Split file vs folder pickers: on Windows/Linux Electron cannot combine
                openFile + openDirectory (directory-only dialog was the “can't pick files” bug).
              */}
              <button
                type="button"
                role="menuitem"
                data-testid="composer-attach-files"
                data-active={suggestionIndex === 0 ? "true" : "false"}
                className="composer-suggest-item"
                onMouseEnter={() => setSuggestionIndex(0)}
                onMouseLeave={() => setSuggestionIndex(-1)}
                onClick={() => void selectAttachments("files")}
              >
                <File
                  className="size-4 shrink-0 text-[var(--muted-foreground)]"
                  strokeWidth={1.75}
                />
                <span className="composer-suggest-item-main">{tr("composer.attach.files")}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="composer-attach-folders"
                data-active={suggestionIndex === 1 ? "true" : "false"}
                className="composer-suggest-item"
                onMouseEnter={() => setSuggestionIndex(1)}
                onMouseLeave={() => setSuggestionIndex(-1)}
                onClick={() => void selectAttachments("folders")}
              >
                <FolderOpen
                  className="size-4 shrink-0 text-[var(--muted-foreground)]"
                  strokeWidth={1.75}
                />
                <span className="composer-suggest-item-main">{tr("composer.attach.folders")}</span>
              </button>
              {pathSuggestions.map((item, index) => {
                const flatIndex = index + 2;
                return (
                  <button
                    key={item.path}
                    type="button"
                    role="menuitem"
                    data-testid="composer-attach-path"
                    data-active={suggestionIndex === flatIndex ? "true" : "false"}
                    className="composer-suggest-item"
                    onMouseEnter={() => setSuggestionIndex(flatIndex)}
                    onMouseLeave={() => setSuggestionIndex(-1)}
                    onClick={() => selectProjectPath(item.path)}
                    title={item.path}
                  >
                    {item.kind === "folder" ? (
                      <Folder
                        className="size-4 shrink-0 text-[var(--muted-foreground)]"
                        strokeWidth={1.75}
                      />
                    ) : (
                      <File
                        className="size-4 shrink-0 text-[var(--muted-foreground)]"
                        strokeWidth={1.75}
                      />
                    )}
                    <span className="composer-suggest-item-main">{item.relative}</span>
                  </button>
                );
              })}
            </div>
            {packageSuggestions.length > 0 ? (
              <div className="composer-suggest-group" data-testid="composer-attach-group-plugins">
                <div className="composer-suggest-group-label">{tr("composer.add.plugins")}</div>
                {packageSuggestions.map((pkg, index) => {
                  const flatIndex = 2 + pathSuggestions.length + index;
                  return (
                    <button
                      key={`${pkg.scope}:${pkg.source}`}
                      type="button"
                      role="menuitem"
                      data-testid={`composer-attach-package-${pkg.source}`}
                      data-active={suggestionIndex === flatIndex ? "true" : "false"}
                      className="composer-suggest-item"
                      onMouseEnter={() => setSuggestionIndex(flatIndex)}
                      onMouseLeave={() => setSuggestionIndex(-1)}
                      onClick={() => selectPackage(pkg)}
                    >
                      <Package
                        className="size-4 shrink-0 text-[var(--muted-foreground)]"
                        strokeWidth={1.75}
                      />
                      <span className="composer-suggest-item-main">{pkg.source}</span>
                      <span className="composer-suggest-item-desc">{pkg.scope}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="composer-suggest-fade" aria-hidden />
        </div>
      </FloatingMenu>

      {/* Project menu — simple list, opens upward above the pill (matches reference). */}
      <FloatingMenu
        open={projectMenuOpen && Boolean(anchor)}
        anchor={anchor}
        onClose={closeMenu}
        placement="top"
        testId="composer-project-menu"
        minWidth={260}
        className="!rounded-[var(--radius-panel)] !border-[var(--border)] !bg-[var(--surface-panel)] !py-0 overflow-hidden shadow-[var(--shadow-soft)]"
      >
        <div className="flex items-center gap-2 px-3 py-2.5 text-[var(--muted-foreground)]">
          <Search className="size-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
          <input
            autoFocus
            value={projectQuery}
            onChange={(e) => setProjectQuery(e.target.value)}
            placeholder={tr("composer.project.search")}
            data-testid="composer-project-search"
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[var(--foreground)] outline-none placeholder:text-[var(--text-subtle)]"
          />
        </div>
        <div className="zeno-scroll max-h-[220px] overscroll-contain p-1.5 pt-0.5">
          {filteredProjects.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-[var(--text-subtle)]">
              {tr("composer.project.empty")}
            </p>
          ) : (
            filteredProjects.map((path) => {
              const label = workspaceLabel(path);
              const active =
                props.workspacePath?.replace(/\\/g, "/").replace(/\/+$/, "") ===
                path.replace(/\\/g, "/").replace(/\/+$/, "");
              return (
                <button
                  key={path}
                  type="button"
                  role="menuitem"
                  data-testid="composer-project-item"
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-1.5 text-left text-[13px] text-[var(--foreground)] transition-colors cursor-pointer",
                    "hover:bg-[var(--hover-fill)]",
                    active && "bg-[var(--hover-fill)] font-medium",
                  )}
                  onClick={() => {
                    closeMenu();
                    if (!active) props.onOpenProject(path);
                  }}
                >
                  <Folder className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate">{label.name}</span>
                  {active ? (
                    <Check className="size-3.5 shrink-0 opacity-80" strokeWidth={2} />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
        <div className="border-t border-[var(--border)] p-1.5">
          <button
            type="button"
            role="menuitem"
            data-testid="composer-project-add"
            className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-[13px] text-[var(--foreground)] transition-colors hover:bg-[var(--hover-fill)] cursor-pointer"
            onClick={() => {
              closeMenu();
              props.onAddProject();
            }}
          >
            <Plus className="size-3.5 shrink-0 opacity-80" strokeWidth={2} />
            <span className="min-w-0 flex-1 truncate">{tr("composer.project.add")}</span>
            <ChevronRight className="size-3.5 shrink-0 opacity-45" strokeWidth={2} />
          </button>
        </div>
      </FloatingMenu>

      {/* Local / worktree menu — labels only; descriptions show in a hover bubble */}
      <FloatingMenu
        open={localMenuOpen && Boolean(anchor)}
        anchor={anchor}
        onClose={() => {
          setLocalTip(null);
          closeMenu();
        }}
        placement="top"
        testId="composer-local-menu"
        minWidth={200}
        className="!rounded-[var(--radius-panel)] !border-[var(--border)] !bg-[var(--surface-panel)] !py-0 overflow-hidden shadow-[var(--shadow-soft)]"
      >
        <div className="flex flex-col gap-0.5 p-1.5">
          <button
            type="button"
            role="menuitem"
            data-testid="composer-local-option-local"
            disabled={gitBusy}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
              "hover:bg-[var(--hover-fill)] disabled:opacity-50",
              gitContext.isMainWorktree !== false && "bg-[var(--accent)]/60",
            )}
            onMouseEnter={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setLocalTip({
                text: tr("composer.local.menuLocalHint"),
                x: r.right + 8,
                y: r.top + r.height / 2,
              });
            }}
            onMouseLeave={() => setLocalTip(null)}
            onClick={() => void handleSwitchToLocal()}
          >
            <Monitor className="size-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--foreground)]">
              {tr("composer.local.menuLocal")}
            </span>
            {gitContext.isMainWorktree !== false ? (
              <Check className="size-3.5 shrink-0 text-[var(--foreground)]" strokeWidth={2} />
            ) : null}
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="composer-local-option-worktree"
            disabled={gitBusy}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--hover-fill)] disabled:opacity-50"
            onMouseEnter={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setLocalTip({
                text: tr("composer.local.menuNewWorktreeHint"),
                x: r.right + 8,
                y: r.top + r.height / 2,
              });
            }}
            onMouseLeave={() => setLocalTip(null)}
            onClick={() => handleNewWorktree()}
          >
            <FolderGit2 className="size-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--foreground)]">
              {tr("composer.local.menuNewWorktree")}
            </span>
          </button>
        </div>
      </FloatingMenu>
      {localTip && typeof document !== "undefined"
        ? createPortal(
            <div
              role="tooltip"
              data-testid="composer-local-tip"
              className="surface-panel pointer-events-none fixed z-[12050] max-w-[220px] -translate-y-1/2 px-2.5 py-1.5 text-[11px] leading-snug text-[var(--muted-foreground)] shadow-lg"
              style={{ left: localTip.x, top: localTip.y }}
            >
              {localTip.text}
            </div>,
            document.body,
          )
        : null}

      {/* Branch menu — search + list + create & checkout */}
      <FloatingMenu
        open={branchMenuOpen && Boolean(anchor)}
        anchor={anchor}
        onClose={closeMenu}
        placement="top"
        testId="composer-branch-menu"
        minWidth={280}
        className="!rounded-[var(--radius-panel)] !border-[var(--border)] !bg-[var(--surface-panel)] !py-0 overflow-hidden shadow-[var(--shadow-soft)]"
      >
        <div className="flex items-center gap-2 px-3 py-2.5 text-[var(--muted-foreground)]">
          <Search className="size-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
          <input
            autoFocus
            value={branchQuery}
            onChange={(e) => setBranchQuery(e.target.value)}
            placeholder={tr("composer.branch.search")}
            data-testid="composer-branch-search"
            disabled={gitBusy}
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[var(--foreground)] outline-none placeholder:text-[var(--text-subtle)] disabled:opacity-50"
          />
        </div>
        <div className="zeno-scroll max-h-[260px] overscroll-contain p-1.5 pt-0.5">
          {branchesLoading ? (
            <p className="px-3 py-3 text-[12px] text-[var(--text-subtle)]">
              {tr("composer.branch.loading")}
            </p>
          ) : filteredBranches.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-[var(--text-subtle)]">
              {tr("composer.branch.empty")}
            </p>
          ) : (
            filteredBranches.map((branch) => (
              <button
                key={`${branch.remote ? "r" : "l"}:${branch.name}`}
                type="button"
                role="menuitem"
                data-testid="composer-branch-item"
                disabled={gitBusy}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-1.5 text-left text-[13px] text-[var(--foreground)] transition-colors disabled:opacity-50",
                  "hover:bg-[var(--hover-fill)]",
                  branch.current && "bg-[var(--hover-fill)] font-medium",
                )}
                onClick={() => {
                  if (!branch.current) void handleCheckoutBranch(branch.name);
                  else closeMenu();
                }}
              >
                <GitBranch className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                {branch.current ? (
                  <Check className="size-3.5 shrink-0 opacity-80" strokeWidth={2} />
                ) : null}
              </button>
            ))
          )}
        </div>
        {canCreateBranch ? (
          <div className="border-t border-[var(--border)] p-1.5">
            <button
              type="button"
              role="menuitem"
              data-testid="composer-branch-create"
              disabled={gitBusy}
              className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-[13px] text-[var(--foreground)] transition-colors hover:bg-[var(--hover-fill)] disabled:opacity-50"
              onClick={() => void handleCreateCheckoutBranch()}
            >
              <Plus className="size-3.5 shrink-0 opacity-80" strokeWidth={2} />
              <span className="min-w-0 flex-1 truncate">
                {tr("composer.branch.createCheckout", { name: branchQuery.trim() })}
              </span>
            </button>
          </div>
        ) : null}
      </FloatingMenu>

      {/* Access menu — only options enabled in General → Permissions; open above the chip. */}
      <FloatingMenu
        open={menu === "access" && Boolean(anchor)}
        anchor={anchor}
        onClose={closeMenu}
        placement="top"
        testId="composer-access-menu"
        minWidth={288}
        offsetPx={8}
        className="!py-0"
      >
        <div className="flex flex-col gap-1.5 p-2">
          {visibleAccessModes(props.accessVisibility).map((mode) => (
            <AccessOption
              key={mode}
              icon={accessIcon(mode)}
              label={accessLabel(props.locale, mode)}
              description={accessDesc(props.locale, mode)}
              caution={mode === "full"}
              active={props.accessMode === mode}
              testId={`composer-access-${mode}`}
              onClick={() => {
                props.onAccessMode(mode);
                closeMenu();
              }}
            />
          ))}
        </div>
      </FloatingMenu>

      {/* Model menu: scrollable models + pinned thinking/speed flyouts */}
      <FloatingMenu
        open={menu === "model" && Boolean(anchor)}
        anchor={anchor}
        onClose={closeMenu}
        placement="top"
        testId="composer-model-menu"
        minWidth={220}
        className="flex w-[min(15rem,calc(100vw-2rem))] flex-col !overflow-hidden !py-0"
      >
        <div className="zeno-scroll min-h-0 flex-1 overscroll-contain max-h-[min(320px,calc(100vh-14rem))] py-1">
          {modelGroups.length === 0 ? (
            <p className="px-2.5 py-1.5 text-left text-[13px] text-[var(--text-subtle)]">
              {tr("composer.model.none")}
            </p>
          ) : (
            modelGroups.map((group) => (
              <div
                key={group.key}
                className="composer-model-group"
                data-testid={`composer-model-group-${group.key}`}
              >
                <div className="composer-model-group-label">{group.label}</div>
                {group.models.map((model) => {
                  const value = `${model.provider}/${model.id}`;
                  return (
                    <MenuRow
                      key={value}
                      label={model.name || model.id}
                      active={props.modelValue === value}
                      testId={`composer-model-${model.id}`}
                      onClick={() => {
                        props.onModelChange(model.provider, model.id);
                        closeMenu();
                      }}
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="shrink-0 border-t border-[var(--border)] py-1">
          {/* Thinking levels are model-specific (HostSnapshot.availableThinkingLevels). */}
          <FlyoutRow
            icon={<Sparkles className="size-3.5" strokeWidth={1.75} />}
            label={tr("composer.model.thinking")}
            valueLabel={
              thinkingSupported
                ? thinkingLevelLabel(props.locale, props.thinkingLevel)
                : tr("composer.model.thinkingUnsupported")
            }
            open={modelFlyout === "thinking"}
            onHoverOpen={() => openModelFlyout("thinking")}
            onHoverLeave={scheduleCloseModelFlyout}
            testId="composer-thinking-flyout-trigger"
            flyoutTestId="composer-thinking-flyout"
            minWidth={160}
            disabled={!thinkingSupported}
          >
            {props.thinkingLevels.map((level) => (
              <MenuRow
                key={level}
                label={thinkingLevelLabel(props.locale, level)}
                active={props.thinkingLevel === level}
                testId={`composer-thinking-${level}`}
                onClick={() => {
                  props.onThinkingChange(level);
                  clearModelFlyoutCloseTimer();
                  setModelFlyout(null);
                }}
              />
            ))}
          </FlyoutRow>

          {/* OpenAI-family service_tier only — disabled when host reports no tiers. */}
          <FlyoutRow
            icon={<Gauge className="size-3.5" strokeWidth={1.75} />}
            label={tr("composer.model.speed")}
            valueLabel={
              serviceTierSupported
                ? serviceTierLabel(props.serviceTier)
                : tr("composer.model.speedUnsupported")
            }
            open={modelFlyout === "speed"}
            onHoverOpen={() => openModelFlyout("speed")}
            onHoverLeave={scheduleCloseModelFlyout}
            testId="composer-speed-flyout-trigger"
            flyoutTestId="composer-speed-flyout"
            minWidth={160}
            disabled={!serviceTierSupported}
          >
            {props.serviceTiers.map((tier) => (
              <MenuRow
                key={tier}
                label={serviceTierLabel(tier)}
                active={props.serviceTier === tier}
                testId={`composer-speed-${tier}`}
                onClick={() => {
                  props.onServiceTierChange(tier);
                  clearModelFlyoutCloseTimer();
                  setModelFlyout(null);
                }}
              />
            ))}
          </FlyoutRow>
        </div>
      </FloatingMenu>

      <CreateWorktreeDialog
        open={worktreeDialogOpen && Boolean(props.workspacePath)}
        locale={props.locale}
        projectPath={props.workspacePath ?? ""}
        onCancel={() => setWorktreeDialogOpen(false)}
        onError={(message) => showAppError(message)}
        onConfirm={({ path }) => {
          setWorktreeDialogOpen(false);
          props.onOpenProject(path);
          void refreshGitContext(path);
        }}
      />
    </div>
  );
}
