/**
 * Product / settings left rail.
 * Hierarchy: brand → nav → projects → threads (title+recency) → settings.
 * Full collapse (width 0, no icon rail) + drag resize; expand control stays
 * fixed after macOS traffic lights. Settings mode swaps menu content.
 */
import type { AppUpdateStatus, HostSnapshot, SessionThreadSummary } from "@zeno/contracts";
import {
  Archive,
  ArrowLeft,
  Bell,
  CircleAlert,
  Boxes,
  Download,
  Folder,
  FolderGit2,
  GitBranch,
  Keyboard,
  Network,
  Package,
  Palette,
  PanelLeft,
  PanelLeftClose,
  Loader2,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Shield,
  SlidersHorizontal,
  Sparkles,
  SquarePen,
  Terminal,
  BarChart3,
  Cpu,
} from "lucide-react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  TITLEBAR_CONTROL_SIZE_PX,
  TITLEBAR_HEIGHT_PX,
  isMacDesktopChrome,
  titlebarControlTopPx,
  titlebarLeadingGutterPx,
} from "../lib/desktop-chrome.ts";
import { t, type Locale, type MessageKey } from "../lib/i18n.ts";
import { SHELL_SIDEBAR } from "../lib/layout.ts";
import { clampSidebarWidth, SIDEBAR_COLLAPSED_WIDTH } from "../lib/sidebar-prefs.ts";
import { loadGroupMode, type GroupMode } from "../lib/sidebar-organize.ts";
import { cn } from "../lib/utils.ts";
import type { SessionMarker } from "../lib/session-markers.ts";
import type { SettingsSection, ShellView } from "../store/shell-store.ts";
import type { ThreadRunState } from "../lib/timeline.ts";
import { SettingsSearchField } from "./settings/SettingsPrimitives.tsx";
import { ProjectList } from "./ProjectList.tsx";

export interface AppSidebarProps {
  colorMode: "light" | "dark";
  themePreference?: "light" | "dark" | "system";
  locale: Locale;
  view: ShellView;
  settingsSection: SettingsSection;
  status: string;
  hostPillState: string;
  runState: ThreadRunState;
  running: boolean;
  /** Per-session run markers (sidebar glyphs). */
  sessionMarkers?: Record<string, SessionMarker>;
  /** @deprecated prefer sessionMarkers */
  runningSessions?: Record<string, true>;
  collapsed: boolean;
  widthPx: number;
  /**
   * Native frosted rail (legacy translucent). Mutually exclusive with material glass.
   */
  translucent: boolean;
  /**
   * Material glass from sidebarOpacity / blur. Only when translucent is false.
   */
  glass: boolean;
  snapshot: HostSnapshot | undefined;
  workspacePath: string | undefined;
  selectedProjectPath: string | undefined;
  workspace: { name: string; detail?: string };
  recentWorkspaces: string[];
  threads: SessionThreadSummary[];
  /** Sessions for every project cwd (browse without switching). */
  threadsByCwd: Record<string, SessionThreadSummary[]>;
  threadTitle: string;
  packageCount: number;
  resourceCount: number;
  /**
   * MCP ready/total badge for 插件 (e.g. `0/2` from extension setStatus).
   * When set, replaces packageCount on the packages nav.
   */
  mcpBadge?: string;
  /** Full MCP status for the packages nav tooltip. */
  mcpDetail?: string;
  canFork: boolean;
  onOpenPalette: () => void;
  onToggleTheme: () => void;
  onToggleCollapse: () => void;
  onResizeWidth: (px: number) => void;
  onNewThread: () => void;
  onSelectProject: (path: string | undefined) => void;
  onOpenProjects: () => void;
  onOpenPackages: () => void;
  onOpenResources: () => void;
  onOpenSettings: () => void;
  onBackToApp: () => void;
  onSettingsSection: (section: SettingsSection) => void;
  onOpenWorkspace: () => void;
  onResumeWorkspace: () => void;
  onToggleTrust: () => void;
  onOpenRecent: (path: string) => void;
  onSwitchThread: (path: string, projectCwd?: string) => void;
  onForkThread: () => void;
  onNewThreadForProject: (path: string) => void;
  onRemoveRecent: (path: string) => void;
  onRevealInFolder: (path: string) => void;
  onRefresh: () => void;
  onCrash: () => void;
  onStop: () => void;
}

export function AppSidebar(props: AppSidebarProps) {
  const tr = (key: MessageKey, vars?: Record<string, string>) => t(props.locale, key, vars);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const leadingGutterPx = titlebarLeadingGutterPx(isMacDesktopChrome());
  const [showDeveloperChrome, setShowDeveloperChrome] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void window.pix.app
      .getRuntime()
      .then((runtime) => {
        if (cancelled) return;
        // Packaged installs hide the developer drawer; e2e / local still get it via flag or unpackaged runs.
        setShowDeveloperChrome(!runtime.isPackaged || runtime.enableTestCommands);
      })
      .catch(() => {
        if (!cancelled) setShowDeveloperChrome(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (props.collapsed) return;
      event.preventDefault();
      const startX = event.clientX;
      const startW = props.widthPx;
      dragRef.current = { startX, startW };
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);

      const onMove = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        const next = clampSidebarWidth(
          dragRef.current.startW + (ev.clientX - dragRef.current.startX),
        );
        props.onResizeWidth(next);
      };
      const onUp = (ev: PointerEvent) => {
        dragRef.current = null;
        target.releasePointerCapture(ev.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [props],
  );

  const isSettings = props.view === "settings";
  const railWidth = props.collapsed ? SIDEBAR_COLLAPSED_WIDTH : props.widthPx;

  return (
    <>
      <aside
        className={cn(
          // Overlay rail so frosted glass can expose the native window material behind it.
          // Never allow horizontal scroll; full collapse uses width 0 (not an icon strip).
          "absolute inset-y-0 left-0 z-30 flex h-full min-w-0 flex-col overflow-x-hidden text-[var(--sidebar-foreground)]",
          props.collapsed
            ? "pointer-events-none border-0"
            : cn(
                "border-r",
                props.translucent
                  ? "pix-sidebar-translucent"
                  : props.glass
                    ? "pix-sidebar-glass"
                    : "pix-sidebar-solid",
              ),
        )}
        style={{ width: railWidth }}
        data-testid="sidebar"
        data-collapsed={props.collapsed ? "true" : "false"}
        data-sidebar-translucent={props.translucent ? "true" : "false"}
        data-sidebar-glass={props.glass ? "true" : "false"}
        aria-hidden={props.collapsed ? true : undefined}
      >
        {!props.collapsed ? (
          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden">
            {/* Product: traffic lights + collapse. Settings: gutter only (Codex rail has no collapse). */}
            <TitlebarTrafficRow
              leadingGutterPx={leadingGutterPx}
              showCollapse={!isSettings}
              onToggleCollapse={props.onToggleCollapse}
            />

            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-x-hidden px-2.5 pb-2">
              {isSettings ? (
                <SettingsRail
                  locale={props.locale}
                  section={props.settingsSection}
                  onBack={props.onBackToApp}
                  onSection={props.onSettingsSection}
                />
              ) : (
                <ProductRail {...props} tr={tr} showDeveloperChrome={showDeveloperChrome} />
              )}
            </div>

            {/* Drag resize handle */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-valuenow={props.widthPx}
              aria-valuemin={SHELL_SIDEBAR.minPx}
              aria-valuemax={SHELL_SIDEBAR.maxPx}
              data-testid="sidebar-resize-handle"
              className="absolute top-0 right-0 z-10 h-full w-1 cursor-col-resize bg-transparent hover:bg-[var(--hover-fill)] active:bg-[var(--hover-fill)]"
              onPointerDown={onResizePointerDown}
            />
          </div>
        ) : null}
      </aside>

      {/* Keep status probe available while rail is fully tucked away. */}
      {props.collapsed ? (
        <span className="sr-only" data-testid="host-status" data-state={props.hostPillState}>
          {props.status}
        </span>
      ) : null}

      {/*
        Expand control is portaled to document.body so full-bleed shell-main and
        Electron -webkit-app-region:drag titlebars cannot steal hits. no-drag is required.
      */}
      {props.collapsed && typeof document !== "undefined"
        ? createPortal(
            <button
              type="button"
              data-testid="sidebar-collapse"
              title="Expand sidebar"
              aria-label="Expand sidebar"
              className="sidebar-expand-btn no-drag"
              style={{
                left: leadingGutterPx,
                top: titlebarControlTopPx(),
                width: TITLEBAR_CONTROL_SIZE_PX,
                height: TITLEBAR_CONTROL_SIZE_PX,
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                props.onToggleCollapse();
              }}
              onPointerDown={(event) => {
                // Stop drag-region ancestors / window chrome from claiming the gesture.
                event.stopPropagation();
              }}
            >
              <PanelLeft className="h-4 w-4" strokeWidth={1.75} />
            </button>,
            document.body,
          )
        : null}
    </>
  );
}

function TitlebarTrafficRow(props: {
  leadingGutterPx: number;
  showCollapse?: boolean;
  onToggleCollapse: () => void;
}) {
  const showCollapse = props.showCollapse !== false;
  return (
    <div
      className="sidebar-traffic-row drag-region flex w-full shrink-0 items-center"
      style={{ height: TITLEBAR_HEIGHT_PX }}
      data-testid="sidebar-traffic-row"
    >
      <div
        className="pointer-events-none shrink-0"
        style={{ width: props.leadingGutterPx }}
        aria-hidden
      />
      {showCollapse ? (
        <button
          type="button"
          data-testid="sidebar-collapse"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          className="inline-flex shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--hover-fill)] hover:text-[var(--sidebar-foreground)]"
          style={{
            width: TITLEBAR_CONTROL_SIZE_PX,
            height: TITLEBAR_CONTROL_SIZE_PX,
          }}
          onClick={props.onToggleCollapse}
        >
          <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
}

function ProductRail(
  props: AppSidebarProps & {
    tr: (key: MessageKey, vars?: Record<string, string>) => string;
    showDeveloperChrome: boolean;
  },
) {
  const { tr } = props;
  // List layout hides 置顶/项目 rail groups — surface a full-page 项目 manager instead.
  const [groupMode, setGroupMode] = useState<GroupMode>(loadGroupMode);
  useEffect(() => {
    const sync = () => setGroupMode(loadGroupMode());
    window.addEventListener("pix-sidebar-group-mode", sync);
    return () => window.removeEventListener("pix-sidebar-group-mode", sync);
  }, []);

  return (
    <>
      {/* Brand row: title left-aligned with nav/list rows (same px-2.5 content inset). */}
      <div
        className="mb-1 flex h-10 items-center justify-between gap-2"
        data-testid="sidebar-home-header"
      >
        <button
          type="button"
          data-testid="brand-menu"
          title={tr("app.name")}
          className="flex min-w-0 flex-1 items-center rounded-md px-2.5 py-0.5 text-left transition-colors hover:bg-[var(--hover-fill)]"
          onClick={props.onOpenPalette}
        >
          <span className="truncate text-[18px] leading-none font-semibold tracking-tight text-[var(--sidebar-foreground)]">
            {tr("app.name")}
          </span>
        </button>
        <IconBtn testId="open-palette" title={tr("nav.search")} onClick={props.onOpenPalette}>
          <Search className="h-4 w-4" strokeWidth={1.6} />
        </IconBtn>
        <span className="sr-only">
          <button type="button" data-testid="theme-toggle" onClick={props.onToggleTheme} />
        </span>
      </div>

      {/* Primary action — pure conversation (protrusion shows 选择项目). Project-bound new
          sessions only come from each project row action. */}
      <nav className="mb-2 flex flex-col gap-0" aria-label="Primary">
        <button
          type="button"
          data-testid="start-host"
          title={tr("nav.newThread")}
          className="nav-item nav-item-primary"
          data-target="conversation"
          onClick={() => props.onNewThread()}
        >
          <SquarePen className="size-4 shrink-0 opacity-85" strokeWidth={1.6} />
          <span className="truncate">{tr("nav.newThread")}</span>
        </button>
        {groupMode === "list" ? (
          <NavBtn
            testId="nav-projects"
            active={props.view === "projects"}
            icon={<Folder className="size-4 shrink-0 opacity-70" strokeWidth={1.75} />}
            label={tr("nav.projects")}
            onClick={props.onOpenProjects}
          />
        ) : null}
        <NavBtn
          testId="nav-packages"
          active={props.view === "packages"}
          icon={<Package className="size-4 shrink-0 opacity-70" strokeWidth={1.75} />}
          label={tr("nav.packages")}
          badge={props.mcpBadge ?? String(props.packageCount)}
          title={
            props.mcpDetail ? `${tr("nav.packages")} · ${props.mcpDetail}` : tr("nav.packages")
          }
          onClick={props.onOpenPackages}
        />
        <NavBtn
          testId="nav-resources"
          active={props.view === "resources"}
          icon={<Boxes className="size-4 shrink-0 opacity-70" strokeWidth={1.75} />}
          label={tr("nav.resources")}
          badge={String(props.resourceCount)}
          onClick={props.onOpenResources}
        />
      </nav>

      <ProjectList
        locale={props.locale}
        workspacePath={props.workspacePath}
        selectedProjectPath={props.selectedProjectPath}
        recentWorkspaces={props.recentWorkspaces}
        threads={props.threads}
        threadsByCwd={props.threadsByCwd}
        threadTitle={props.threadTitle}
        runState={props.runState}
        running={props.running}
        {...(props.sessionMarkers ? { sessionMarkers: props.sessionMarkers } : {})}
        {...(props.runningSessions ? { runningSessions: props.runningSessions } : {})}
        onOpenRecent={props.onOpenRecent}
        onSelectProject={props.onSelectProject}
        onNewThread={(path) => {
          if (path) props.onNewThreadForProject(path);
          else props.onNewThread();
        }}
        onSwitchThread={props.onSwitchThread}
        onRemoveRecent={props.onRemoveRecent}
        onRevealInFolder={props.onRevealInFolder}
        onOpenWorkspace={props.onOpenWorkspace}
        onForkThread={props.onForkThread}
      />

      <div className="mt-auto flex min-w-0 flex-col gap-1 border-t border-[var(--sidebar-border)] pt-2">
        <div className="flex min-w-0 items-center gap-0.5" data-testid="nav-settings-row">
          <div className="min-w-0 flex-1">
            <NavBtn
              testId="nav-settings"
              active={props.view === "settings"}
              icon={<SettingsIcon className="size-4 shrink-0 opacity-70" strokeWidth={1.75} />}
              label={tr("nav.settings")}
              onClick={props.onOpenSettings}
            />
          </div>
          <SidebarUpdateButton locale={props.locale} tr={tr} />
        </div>
        {props.showDeveloperChrome ? (
          <details
            className="group rounded-lg border border-transparent open:border-[var(--sidebar-border)] open:bg-[var(--hover-fill)]/40"
            data-testid="developer-details"
          >
            <summary
              className="cursor-pointer list-none px-2.5 py-1.5 text-[11px] font-normal text-[var(--text-subtle)] hover:text-[var(--muted-foreground)] [&::-webkit-details-marker]:hidden"
              data-testid="developer-summary"
            >
              {tr("dev.developer")}
            </summary>
            <div className="space-y-1 px-1.5 pb-2">
              <span
                className={cn(
                  "mb-1 block max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-medium",
                  hostPillClass(props.hostPillState),
                )}
                data-testid="host-status"
                data-state={props.hostPillState}
                title={props.status}
              >
                {props.status}
              </span>
              <div className="flex flex-wrap gap-0.5">
                <QuietBtn
                  testId="workspace-resume"
                  label={tr("workspace.resume")}
                  onClick={props.onResumeWorkspace}
                  disabled={!props.workspacePath}
                />
                <QuietBtn
                  testId="trust-toggle"
                  label={`${tr("workspace.trust")}: ${props.snapshot?.projectTrusted ? tr("workspace.trustYes") : tr("workspace.trustNo")}`}
                  onClick={props.onToggleTrust}
                />
                <QuietBtn
                  testId="fork-thread"
                  label={tr("thread.fork")}
                  onClick={props.onForkThread}
                  disabled={!props.canFork || props.running}
                />
                <QuietBtn
                  testId="refresh-snapshot"
                  label={tr("dev.snapshot")}
                  onClick={props.onRefresh}
                  disabled={!props.snapshot}
                />
                <QuietBtn
                  testId="crash-host"
                  label={tr("dev.crash")}
                  onClick={props.onCrash}
                  disabled={!props.snapshot}
                  danger
                />
                <QuietBtn
                  testId="stop-host"
                  label={tr("dev.stop")}
                  onClick={props.onStop}
                  disabled={!props.snapshot}
                />
              </div>
            </div>
          </details>
        ) : (
          <span className="sr-only" data-testid="host-status" data-state={props.hostPillState}>
            {props.status}
          </span>
        )}
      </div>
    </>
  );
}

function SettingsRail(props: {
  locale: Locale;
  section: SettingsSection;
  onBack: () => void;
  onSection: (section: SettingsSection) => void;
}) {
  const tr = (key: MessageKey) => t(props.locale, key);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const groups: Array<{
    id: string;
    labelKey: MessageKey;
    items: Array<{
      section: SettingsSection;
      testId: string;
      labelKey: MessageKey;
      icon: ReactNode;
    }>;
    /*
     * Settings IA (product-facing):
     *  通用 — shell prefs (look & feel, confirmations, hotkeys)
     *  Pi — SDK runtime + agent settings.json behavior
     *  模型 — providers, catalog, usage
     *  工作区 — Git → environment → terminal → worktree
     *  安全 — bundled runtimes (Node/Python trust boundary)
     *  网络 — connectivity (proxy; lower priority, advanced)
     *  数据 — archives
     */
  }> = [
    {
      id: "general",
      labelKey: "settings.group.general",
      items: [
        {
          section: "general",
          testId: "settings-nav-general",
          labelKey: "section.general",
          icon: <SettingsIcon className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />,
        },
        {
          section: "appearance",
          testId: "settings-nav-appearance",
          labelKey: "section.appearance",
          icon: <Palette className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />,
        },
        {
          section: "behavior",
          testId: "settings-nav-behavior",
          labelKey: "section.behavior",
          icon: <Shield className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />,
        },
        {
          section: "notifications",
          testId: "settings-nav-notifications",
          labelKey: "section.notifications",
          icon: <Bell className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />,
        },
        {
          section: "shortcuts",
          testId: "settings-nav-shortcuts",
          labelKey: "section.shortcuts",
          icon: <Keyboard className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />,
        },
      ],
    },
    {
      id: "pi",
      labelKey: "settings.group.pi",
      items: [
        {
          section: "pi",
          testId: "settings-nav-pi",
          labelKey: "section.pi",
          icon: <Package className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />,
        },
        {
          section: "piSettings",
          testId: "settings-nav-agent",
          labelKey: "section.piSettings",
          icon: <Boxes className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />,
        },
      ],
    },
    {
      id: "models",
      labelKey: "settings.group.models",
      items: [
        {
          section: "models",
          testId: "settings-nav-models",
          labelKey: "section.models",
          icon: <Sparkles className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />,
        },
        {
          section: "usage",
          testId: "settings-nav-usage",
          labelKey: "section.usage",
          icon: <BarChart3 className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />,
        },
      ],
    },
    {
      id: "workspace",
      labelKey: "settings.group.workspace",
      items: [
        {
          section: "git",
          testId: "settings-nav-git",
          labelKey: "section.git",
          icon: <GitBranch className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />,
        },
        {
          section: "environment",
          testId: "settings-nav-environment",
          labelKey: "section.environment",
          icon: <SlidersHorizontal className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />,
        },
        {
          section: "terminal",
          testId: "settings-nav-terminal",
          labelKey: "section.terminal",
          icon: <Terminal className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />,
        },
        {
          section: "worktree",
          testId: "settings-nav-worktree",
          labelKey: "section.worktree",
          icon: <FolderGit2 className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />,
        },
      ],
    },
    {
      id: "security",
      labelKey: "settings.group.security",
      items: [
        {
          section: "runtimes",
          testId: "settings-nav-runtimes",
          labelKey: "section.runtimes",
          icon: <Cpu className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />,
        },
      ],
    },
    {
      id: "network",
      labelKey: "settings.group.network",
      items: [
        {
          section: "proxy",
          testId: "settings-nav-proxy",
          labelKey: "section.proxy",
          icon: <Network className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />,
        },
      ],
    },
    {
      id: "data",
      labelKey: "settings.group.data",
      items: [
        {
          section: "archived",
          testId: "settings-nav-archived",
          labelKey: "section.archived",
          icon: <Archive className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />,
        },
      ],
    },
  ];

  const filtered = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!q) return true;
        const label = tr(item.labelKey).toLowerCase();
        const groupLabel = tr(group.labelKey).toLowerCase();
        return label.includes(q) || groupLabel.includes(q);
      }),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <nav
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-x-hidden"
      data-testid="settings-rail"
      aria-label="Settings"
    >
      {/* Back — Codex: text + left arrow, no heavy button chrome */}
      <button
        type="button"
        data-testid="settings-back"
        className="settings-rail-back"
        onClick={props.onBack}
      >
        <ArrowLeft className="size-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
        <span className="truncate">{tr("nav.backToApp")}</span>
      </button>

      {/* Search — same SettingsSearchField as every settings page */}
      <div className="px-1 pt-1.5 pb-1">
        <SettingsSearchField
          testId="settings-search"
          value={query}
          onChange={setQuery}
          placeholder={tr("settings.search")}
        />
      </div>

      {/* Grouped nav */}
      <div className="pix-scroll min-h-0 min-w-0 flex-1 px-0.5 pb-3">
        {filtered.length === 0 ? (
          <p className="px-2.5 py-2 text-[length:var(--ui-font-size,14px)] text-[var(--text-subtle)]">
            {tr("settings.noMatch")}
          </p>
        ) : (
          filtered.map((group) => (
            <div key={group.id} data-testid={`settings-group-${group.id}`}>
              <p className="settings-rail-group-label">{tr(group.labelKey)}</p>
              <div className="flex flex-col gap-px">
                {group.items.map((item) => (
                  <button
                    key={item.section}
                    type="button"
                    data-testid={item.testId}
                    data-active={props.section === item.section ? "true" : "false"}
                    title={tr(item.labelKey)}
                    className="settings-rail-item"
                    onClick={() => props.onSection(item.section)}
                  >
                    {item.icon}
                    <span className="min-w-0 flex-1 truncate">{tr(item.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </nav>
  );
}

function hostPillClass(state: string): string {
  if (state === "ready" || state === "settled") return "bg-emerald-500/15 text-emerald-500";
  if (state === "running") return "bg-blue-500/15 text-blue-500";
  if (state === "error" || state === "crashed") return "bg-red-500/15 text-red-500";
  return "bg-[var(--accent)] text-[var(--muted-foreground)]";
}

const GITHUB_REPO_URL = "https://github.com/aletheics/zeno";

/** GitHub mark (lucide has no brand icons). */
function GitHubMark(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={props.className}>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  );
}

type SidebarUpdatePhase =
  | "github"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "error";

function sidebarUpdatePhase(status: AppUpdateStatus): SidebarUpdatePhase {
  if (status.state === "error") return "error";
  if (status.state === "installing") return "installing";
  if (status.state === "downloading") return "downloading";
  if (status.state === "downloaded") return "downloaded";
  if (status.state === "available") return "available";
  return "github";
}

function SidebarUpdateProgress(props: { percent: number | undefined }) {
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const indeterminate = props.percent === undefined;
  const progress = props.percent ?? 0;

  return (
    <span className="relative size-5" aria-hidden="true">
      <svg
        viewBox="0 0 20 20"
        className={cn(
          "absolute inset-0 size-5 -rotate-90",
          indeterminate && "motion-safe:animate-spin",
        )}
      >
        <circle
          cx="10"
          cy="10"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="opacity-15"
        />
        <circle
          cx="10"
          cy="10"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeDasharray={
            indeterminate ? `${circumference * 0.22} ${circumference * 0.78}` : circumference
          }
          strokeDashoffset={indeterminate ? 0 : circumference * (1 - progress / 100)}
          className="transition-[stroke-dashoffset] duration-300 ease-out"
        />
      </svg>
      <Download className="absolute inset-0 m-auto size-2.5" strokeWidth={2.1} />
    </span>
  );
}

/**
 * Right of 系统设置: GitHub by default; blue download when an update exists;
 * progress while downloading (locked); restart when ready; installing feedback (locked).
 */
function SidebarUpdateButton(props: {
  locale: Locale;
  tr: (key: MessageKey, vars?: Record<string, string>) => string;
}) {
  const { tr } = props;
  const [status, setStatus] = useState<AppUpdateStatus>({
    state: "idle",
    currentVersion: "",
    canCheck: false,
  });
  const [busy, setBusy] = useState(false);
  const phase = sidebarUpdatePhase(status);
  const percent =
    status.percent !== undefined && Number.isFinite(status.percent)
      ? Math.max(0, Math.min(100, Math.round(status.percent)))
      : undefined;
  /** Download / install in flight — not interactive. */
  const locked = busy || phase === "downloading" || phase === "installing";

  useEffect(() => {
    let cancelled = false;
    void window.pix.app.getUpdateStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    const unsubscribe = window.pix.app.onUpdateStatus((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  async function onClick() {
    if (locked) return;
    if (phase === "github") {
      void window.pix.workspace.openExternal(GITHUB_REPO_URL).catch(() => undefined);
      return;
    }
    if (phase === "available" || phase === "error") {
      setBusy(true);
      try {
        const next =
          phase === "error" && !status.availableVersion
            ? await window.pix.app.checkForUpdates()
            : await window.pix.app.downloadUpdate();
        setStatus(next);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus((prev) => ({ ...prev, state: "error", error: message }));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (phase === "downloaded") {
      setBusy(true);
      // Optimistic UI: main process also broadcasts `installing`.
      setStatus((prev) => ({ ...prev, state: "installing", percent: 100 }));
      try {
        await window.pix.app.quitAndInstall();
        // App should quit/relaunch; keep locked if it does not.
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus((prev) => ({ ...prev, state: "error", error: message }));
        setBusy(false);
      }
    }
  }

  const title =
    phase === "error"
      ? tr("nav.update.error", { error: status.error ?? "Unknown error" })
      : phase === "available"
        ? tr("nav.update.available")
        : phase === "downloading"
          ? percent !== undefined
            ? tr("nav.update.downloadingPct", { percent: String(percent) })
            : tr("nav.update.downloading")
          : phase === "installing"
            ? tr("nav.update.installing")
            : phase === "downloaded"
              ? tr("nav.update.restartInstall")
              : tr("nav.update.github");

  return (
    <button
      type="button"
      data-testid="sidebar-update-btn"
      data-phase={phase}
      data-locked={locked ? "true" : "false"}
      title={title}
      aria-label={title}
      aria-busy={locked}
      aria-disabled={locked}
      disabled={locked}
      className={cn(
        "relative inline-flex size-8 min-w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg transition-[color,background-color,box-shadow,transform,opacity] duration-200",
        locked && "pointer-events-none cursor-not-allowed",
        phase === "error"
          ? "bg-red-500/[0.08] text-red-500 ring-1 ring-inset ring-red-500/15 hover:bg-red-500/15 hover:text-red-600 active:scale-95"
          : phase === "available"
            ? "bg-blue-500/[0.08] text-blue-500 ring-1 ring-inset ring-blue-500/15 hover:bg-blue-500/15 hover:text-blue-600 active:scale-95"
            : phase === "downloading"
              ? "bg-blue-500/[0.08] text-blue-500 ring-1 ring-inset ring-blue-500/15 opacity-90"
              : phase === "installing"
                ? "bg-blue-500 text-white shadow-sm shadow-blue-500/25 opacity-95"
                : phase === "downloaded"
                  ? "bg-blue-500 text-white shadow-sm shadow-blue-500/25 hover:bg-blue-600 hover:text-white active:scale-95"
                  : "cursor-pointer text-[var(--muted-foreground)] hover:bg-[var(--hover-fill)] hover:text-[var(--sidebar-foreground)] active:scale-95",
      )}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (locked) return;
        void onClick();
      }}
    >
      {phase === "github" ? (
        <GitHubMark className="size-4" />
      ) : phase === "error" ? (
        <CircleAlert className="size-4" strokeWidth={1.85} />
      ) : phase === "available" ? (
        <span className="relative inline-flex size-5 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-blue-500/15 motion-safe:animate-pulse" />
          <Download className="relative size-3.5" strokeWidth={2} />
        </span>
      ) : phase === "downloading" ? (
        <SidebarUpdateProgress percent={percent} />
      ) : phase === "installing" ? (
        <span
          className="relative inline-flex size-5 items-center justify-center"
          aria-hidden="true"
        >
          <Loader2 className="size-3.5 motion-safe:animate-spin" strokeWidth={2.1} />
        </span>
      ) : (
        <RefreshCw className="size-3.5" strokeWidth={2} />
      )}
    </button>
  );
}

function IconBtn(props: {
  testId: string;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={props.testId}
      title={props.title}
      aria-label={props.title}
      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--hover-fill)] hover:text-[var(--sidebar-foreground)]"
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function NavBtn(props: {
  testId: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  primary?: boolean;
  badge?: string;
  /** Tooltip; defaults to label. */
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={props.testId}
      data-active={props.active ? "true" : "false"}
      title={props.title ?? props.label}
      className={cn("nav-item", props.primary && "nav-item-primary")}
      onClick={props.onClick}
    >
      {props.icon}
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      {props.badge !== undefined ? (
        <span
          className="ml-auto shrink-0 text-[11px] text-[var(--text-subtle)]"
          data-testid={props.testId === "nav-packages" ? "nav-packages-badge" : undefined}
        >
          {props.badge}
        </span>
      ) : null}
    </button>
  );
}

function QuietBtn(props: {
  testId: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={props.testId}
      disabled={props.disabled}
      className={cn(
        "inline-flex h-6 items-center rounded-md px-2 text-[11px] text-[var(--text-subtle)] disabled:opacity-40",
        props.danger
          ? "hover:bg-red-500/10 hover:text-red-600"
          : "hover:bg-[var(--hover-fill)] hover:text-[var(--sidebar-foreground)]",
      )}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}
