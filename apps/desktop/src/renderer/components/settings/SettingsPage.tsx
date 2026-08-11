/**
 * Codex / ChatGPT–style settings content column.
 * Large left-aligned title · section labels · grouped cards with rows.
 */
import type {
  CustomModelApi,
  DesktopLocalProxyCandidate,
  DesktopProxyChannel,
  DesktopProxyMode,
  DesktopProxyPrefs,
  GitWorktreeInfo,
  HostSnapshot,
  ModelSummary,
  PiSettingsPatch,
  PiSettingsView,
  ProviderAuthSummary,
  ProviderOAuthEvent,
  ProviderOAuthPrompt,
  ProviderOAuthUpdate,
  ProviderUsageSnapshot,
  ThemeLibrarySnapshot,
} from "@zeno/contracts";
import {
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Folder,
  LoaderCircle,
  LogIn,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t, thinkingLevelLabel, type Locale, type MessageKey } from "../../lib/i18n.ts";
import { groupModelsByProvider } from "../../lib/model-groups.ts";
import type { ServiceTierId } from "../../lib/service-tier.ts";
import {
  deleteThreadLocal,
  loadArchivedThreadMeta,
  loadArchivedThreads,
  loadProjectAliases,
  loadThreadAliases,
  projectDisplayName,
  saveArchivedThreadMeta,
  threadDisplayTitle,
  unarchiveThread,
  type ArchivedThreadMeta,
} from "../../lib/project-prefs.ts";
import {
  loadEnvPanelVisibility,
  setEnvPanelSectionVisible,
  type EnvPanelSectionId,
} from "../../lib/env-panel-prefs.ts";
import { requestMacNotificationPermission } from "../../lib/notification-permission.ts";
import {
  loadNotificationPrefs,
  patchNotificationPrefs,
  type NotificationPrefs,
} from "../../lib/notification-prefs.ts";
import {
  comboToDisplayParts,
  eventToCombo,
  formatComboDisplay,
  getEffectiveCombo,
  loadShortcutOverrides,
  resetAllShortcuts,
  setShortcutOverride,
  SHORTCUT_DEFINITIONS,
  type ShortcutId,
  type ShortcutOverrides,
} from "../../lib/shortcuts.ts";
import {
  loadConfirmArchive,
  loadConfirmDelete,
  saveConfirmArchive,
  saveConfirmDelete,
} from "../../lib/behavior-prefs.ts";
import {
  listInstalledTerminalFonts,
  matchTerminalFontChoiceId,
  SYSTEM_TERMINAL_FONT_ID,
  type TerminalFontChoice,
} from "../../lib/terminal-fonts.ts";
import {
  DEFAULT_TERMINAL_PREFS,
  loadTerminalPrefs,
  patchTerminalPrefs,
  resetTerminalPrefs,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_LINE_HEIGHT_OPTIONS,
  type TerminalColorScheme,
  type TerminalCursorStyle,
  type TerminalPrefs,
} from "../../lib/terminal-prefs.ts";
import {
  formatResetCountdown,
  formatUsageUpdatedAt,
  formatWindowDuration,
  remainingPercent,
  usageTone,
} from "../../lib/auth-usage-limits.ts";
// loadConfirmDelete also used by archived list bulk actions
import {
  loadPreventSleep,
  loadSuggestions,
  savePreventSleep,
  saveSuggestions,
  type AccessMode,
  type AccessVisibility,
} from "../../lib/settings-prefs.ts";
import { applyDiscoverResults } from "../../lib/proxy-discover-ui.ts";
import {
  listInstalledCodeFonts,
  listInstalledUiFonts,
  matchAppearanceFontChoiceId,
  SYSTEM_APPEARANCE_FONT_ID,
  type AppearanceFontChoice,
} from "../../lib/appearance-fonts.ts";
import {
  CODE_FONT_SIZE_MAX,
  CODE_FONT_SIZE_MIN,
  DEFAULT_APPEARANCE_PREFS,
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
  loadAppearancePrefs,
  patchAppearancePrefs,
  UI_FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
  type AppearancePrefs,
} from "../../lib/appearance-prefs.ts";
import type { ThemePreference } from "../../lib/theme.ts";
import type { ThemePreview, ThemeSelection } from "../../lib/theme-packs.ts";
import { cn } from "../../lib/utils.ts";
import { isConversationWorkspacePath, workspaceLabel } from "../../lib/workspace.ts";
import { useShellStore, type SettingsSection } from "../../store/shell-store.ts";
import { PiSdkSection } from "./PiSdkSection.tsx";
import { RuntimesSection } from "./RuntimesSection.tsx";
import { ThemeSkinStudio } from "./ThemeSkinStudio.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "../ui/command.tsx";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover.tsx";
import {
  PI_DOCS_SETTINGS_URL,
  PI_DOCS_USAGE_URL,
  SettingsButton,
  SettingsDocsLink,
  SettingsHelpTip,
  SettingsIconButton,
  SettingsInput,
  SettingsPageShell,
  SettingsPillButton,
  SettingsRow,
  SettingsSearchField,
  SettingsSectionBlock,
  SettingsSelect,
  SettingsTextarea,
  SettingsToggle,
} from "./SettingsPrimitives.tsx";

export interface SettingsPageProps {
  snapshot: HostSnapshot | undefined;
  status: string;
  locale: Locale;
  section: SettingsSection;
  colorMode: "light" | "dark";
  themePreference: ThemePreference;
  themeSelection: ThemeSelection;
  themeLibrary: ThemeLibrarySnapshot;
  sidebarTranslucent: boolean;
  sidebarWidthPx: number;
  /** Which composer permission options are shown (independent toggles). */
  accessVisibility: AccessVisibility;
  onAccessVisibility: (visibility: AccessVisibility) => void;
  /** Currently selected permission mode (composer). */
  accessMode: AccessMode;
  onAccessMode: (mode: AccessMode) => void;
  showContextUsage: boolean;
  onShowContextUsage: (value: boolean) => void;
  /** Persisted request priority, applied to supported OpenAI Responses models. */
  serviceTier: ServiceTierId;
  onServiceTierChange: (tier: ServiceTierId) => void;
  onEnsureHost: () => Promise<HostSnapshot>;
  onSnapshot: (snapshot: HostSnapshot) => void;
  onLocale: (locale: Locale) => void;
  onThemePreference: (mode: ThemePreference) => void;
  onThemeSelection: (selection: ThemeSelection) => void;
  onThemeLibrary: (library: ThemeLibrarySnapshot) => void;
  onThemePreview: (preview: ThemePreview | undefined) => void;
  onTranslucent: (value: boolean) => void;
  onSidebarWidth: (px: number) => void;
  onToggleTrust: () => void;
}

const APP_SCALE_MIN = 80;
const APP_SCALE_MAX = 150;
const APP_SCALE_OPTIONS = Array.from(
  { length: (APP_SCALE_MAX - APP_SCALE_MIN) / 10 + 1 },
  (_, index) => APP_SCALE_MIN + index * 10,
);

export function SettingsPage(props: SettingsPageProps) {
  const tr = (key: MessageKey, vars?: Record<string, string>) => t(props.locale, key, vars);

  return (
    <section className="page settings-page" data-testid="settings-page">
      {/* Solid top cap (titlebar-height): keeps scrolled content off the window edge — no divider. */}
      <div
        className="settings-page-top-cap drag-region"
        aria-hidden
        data-testid="settings-top-cap"
      />
      <div className="settings-page-body">
        {props.section === "general" ? (
          <GeneralSection {...props} tr={tr} />
        ) : props.section === "pi" ? (
          <PiSdkSection locale={props.locale} />
        ) : props.section === "appearance" ? (
          <AppearanceSection {...props} tr={tr} />
        ) : props.section === "terminal" ? (
          <TerminalSection {...props} tr={tr} />
        ) : props.section === "runtimes" ? (
          <RuntimesSection locale={props.locale} />
        ) : props.section === "behavior" ? (
          <BehaviorSection {...props} tr={tr} />
        ) : props.section === "environment" ? (
          <EnvironmentSection {...props} tr={tr} />
        ) : props.section === "worktree" ? (
          <WorktreeSection {...props} tr={tr} />
        ) : props.section === "git" ? (
          <GitSection {...props} tr={tr} />
        ) : props.section === "usage" ? (
          <UsageLimitsSection {...props} tr={tr} />
        ) : props.section === "notifications" ? (
          <NotificationsSection {...props} tr={tr} />
        ) : props.section === "shortcuts" ? (
          <ShortcutsSection {...props} tr={tr} />
        ) : props.section === "proxy" ? (
          <ProxySection {...props} tr={tr} />
        ) : props.section === "models" ? (
          <ModelsSection {...props} tr={tr} />
        ) : props.section === "piSettings" ? (
          <PiSettingsSection {...props} tr={tr} />
        ) : (
          <ArchivedSection locale={props.locale} tr={tr} />
        )}
      </div>
    </section>
  );
}

function formatArchivedDate(iso: string | undefined, locale: Locale): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return iso;
  }
}

const DEFAULT_PROXY_CHANNEL: DesktopProxyChannel = { mode: "system" };

function proxyPrefsEqual(a: DesktopProxyPrefs, b: DesktopProxyPrefs): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function ProxySection(
  props: SettingsPageProps & { tr: (key: MessageKey, vars?: Record<string, string>) => string },
) {
  const { tr } = props;
  const [prefs, setPrefs] = useState<DesktopProxyPrefs>({
    ai: { ...DEFAULT_PROXY_CHANNEL },
    app: { ...DEFAULT_PROXY_CHANNEL },
  });
  const [saved, setSaved] = useState<DesktopProxyPrefs>({
    ai: { ...DEFAULT_PROXY_CHANNEL },
    app: { ...DEFAULT_PROXY_CHANNEL },
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [discovering, setDiscovering] = useState<"ai" | "app" | null>(null);
  /** Multi-hit auto-discover results per channel — pick via dropdown. */
  const [discovered, setDiscovered] = useState<{
    ai: DesktopLocalProxyCandidate[];
    app: DesktopLocalProxyCandidate[];
  }>({ ai: [], app: [] });
  const showAppError = useShellStore((s) => s.showAppError);
  const dirty = !proxyPrefsEqual(prefs, saved);

  // Load once on mount. Do NOT depend on `tr` — a new function each render would
  // re-fetch prefs and wipe unsaved local edits (e.g. custom mode + first Discover).
  useEffect(() => {
    let cancelled = false;
    void window.zeno.proxy
      .get()
      .then((value) => {
        if (cancelled) return;
        setPrefs(value);
        setSaved(value);
      })
      .catch((err) => {
        if (!cancelled) {
          showAppError(err instanceof Error ? err.message : tr("proxy.saveFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only load
  }, [showAppError]);

  async function save() {
    if (busy || loading) return;
    setBusy(true);
    try {
      const value = await window.zeno.proxy.set(prefs);
      setPrefs(value);
      setSaved(value);
      useShellStore.getState().setStatus(tr("proxy.saved"));
    } catch (err) {
      showAppError(err instanceof Error ? err.message : tr("proxy.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  function patchChannel(key: "ai" | "app", patch: Partial<DesktopProxyChannel>) {
    setPrefs((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
  }

  function clearDiscovered(key: "ai" | "app") {
    setDiscovered((current) => ({ ...current, [key]: [] }));
  }

  function candidateLabel(c: DesktopLocalProxyCandidate): string {
    const tag = c.source === "env" ? "env" : c.label;
    return `${tag} · ${c.url}`;
  }

  async function discoverLocal(key: "ai" | "app") {
    if (loading || busy || discovering) return;
    setDiscovering(key);
    try {
      const found = await window.zeno.proxy.discoverLocal();
      // Pure helper keeps mode stable (custom must not flip to system on first Discover).
      let nextCandidates: DesktopLocalProxyCandidate[] = [];
      setPrefs((current) => {
        const applied = applyDiscoverResults(current[key], found);
        nextCandidates = applied.candidates;
        return { ...current, [key]: applied.channel };
      });
      setDiscovered((d) => ({ ...d, [key]: nextCandidates }));
      if (found.length === 0) {
        useShellStore.getState().setStatus(tr("proxy.discoverNone"));
      } else if (found.length === 1) {
        useShellStore.getState().setStatus(tr("proxy.discoverFilled", { url: found[0]!.url }));
      } else {
        useShellStore
          .getState()
          .setStatus(tr("proxy.discoverMany", { count: String(found.length) }));
      }
    } catch (err) {
      showAppError(err instanceof Error ? err.message : tr("proxy.discoverFailed"));
    } finally {
      setDiscovering(null);
    }
  }

  function onProxyFieldKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void save();
  }

  const modeOptions = [
    { value: "off", label: tr("proxy.mode.off") },
    { value: "system", label: tr("proxy.mode.system") },
    { value: "custom", label: tr("proxy.mode.custom") },
  ];

  function renderChannel(key: "ai" | "app", titleKey: MessageKey, hintKey: MessageKey) {
    const channel = prefs[key];
    const prefix = key === "ai" ? "proxy-ai" : "proxy-app";
    const custom = channel.mode === "custom";
    const disabled = loading || busy;
    const discoverBusy = discovering === key;
    const candidates = discovered[key];
    const multi = candidates.length > 1;
    const serverUrl = (channel.server ?? "").trim();
    const pickValue = multi ? serverUrl || candidates[0]!.url : "";

    return (
      <SettingsSectionBlock label={tr(titleKey)} testId={`${prefix}-card`}>
        <SettingsRow
          title={tr("proxy.mode")}
          description={tr(hintKey)}
          control={
            <SettingsSelect
              testId={`${prefix}-mode`}
              value={channel.mode}
              disabled={disabled}
              onChange={(v) => {
                const mode = v as DesktopProxyMode;
                patchChannel(key, { mode });
                if (mode !== "custom") clearDiscovered(key);
              }}
              options={modeOptions}
            />
          }
          last={!custom}
        />
        {custom ? (
          <>
            <div className="settings-row !flex-col !items-stretch gap-2.5">
              <div>
                <div className="settings-row-title">{tr("proxy.server")}</div>
                <div className="settings-row-desc">{tr("proxy.serverHint")}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <SettingsInput
                  data-testid={`${prefix}-server`}
                  mono
                  className="min-w-0 flex-1"
                  value={channel.server ?? ""}
                  disabled={disabled || discoverBusy}
                  placeholder={tr("proxy.serverPh")}
                  onChange={(e) => patchChannel(key, { server: e.target.value })}
                  onKeyDown={onProxyFieldKeyDown}
                  autoComplete="off"
                  spellCheck={false}
                />
                <SettingsPillButton
                  label={discoverBusy ? tr("proxy.discovering") : tr("proxy.discover")}
                  testId={`${prefix}-discover`}
                  disabled={disabled || discovering !== null}
                  onClick={() => void discoverLocal(key)}
                />
              </div>
              {multi ? (
                <div className="flex flex-col gap-1.5" data-testid={`${prefix}-discover-pick`}>
                  <div className="settings-row-desc">{tr("proxy.discoverPick")}</div>
                  <SettingsSelect
                    testId={`${prefix}-discover-select`}
                    fullWidth
                    value={pickValue}
                    disabled={disabled || discoverBusy}
                    onChange={(url) => {
                      const hit = candidates.find((c) => c.url === url);
                      if (hit) patchChannel(key, { server: hit.url });
                    }}
                    options={candidates.map((c) => ({
                      value: c.url,
                      label: candidateLabel(c),
                    }))}
                  />
                </div>
              ) : null}
            </div>
            <div className="settings-row settings-row-last !flex-col !items-stretch gap-2.5">
              <div>
                <div className="settings-row-title">{tr("proxy.bypass")}</div>
                <div className="settings-row-desc">{tr("proxy.bypassHint")}</div>
              </div>
              <SettingsInput
                data-testid={`${prefix}-bypass`}
                mono
                value={channel.bypass ?? ""}
                disabled={disabled}
                placeholder={tr("proxy.bypassPh")}
                onChange={(e) => patchChannel(key, { bypass: e.target.value })}
                onKeyDown={onProxyFieldKeyDown}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </>
        ) : null}
      </SettingsSectionBlock>
    );
  }

  return (
    <SettingsPageShell
      title={tr("section.proxy")}
      testId="settings-proxy"
      titleAction={
        <SettingsPillButton
          label={busy ? tr("proxy.saving") : tr("proxy.save")}
          testId="proxy-save"
          disabled={loading || busy || !dirty}
          onClick={() => void save()}
        />
      }
    >
      {renderChannel("ai", "proxy.ai.title", "proxy.ai.hint")}
      {renderChannel("app", "proxy.app.title", "proxy.app.hint")}
    </SettingsPageShell>
  );
}

function normalizeCwdKey(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

type ArchivedSessionRow = {
  id: string;
  title: string;
  cwd: string;
  projectName: string;
  /** Pure conversation home (Zeno/conversations) — not a project group. */
  isConversation: boolean;
  archivedAt?: string;
};

function ArchivedSection(props: {
  locale: Locale;
  tr: (key: MessageKey, vars?: Record<string, string>) => string;
}) {
  const { tr, locale } = props;
  const [sessionIds, setSessionIds] = useState(loadArchivedThreads);
  const [meta, setMeta] = useState(loadArchivedThreadMeta);
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [openGroupMenu, setOpenGroupMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const projectAliases = loadProjectAliases();
  const threadAliases = loadThreadAliases();

  function refresh() {
    setSessionIds(loadArchivedThreads());
    setMeta(loadArchivedThreadMeta());
  }

  useEffect(() => {
    if (!openGroupMenu) return;
    const onDoc = (ev: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) {
        setOpenGroupMenu(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openGroupMenu]);

  const rows: ArchivedSessionRow[] = useMemo(() => {
    return sessionIds.map((id) => {
      const m: ArchivedThreadMeta | undefined = meta[id];
      const cwd = m?.cwd || m?.path || "";
      const isConversation = Boolean(cwd && isConversationWorkspacePath(cwd));
      // Collapse all pure-conversation homes into one logical bucket (not a project).
      const cwdKey = isConversation ? "__conversations__" : cwd ? normalizeCwdKey(cwd) : "__none__";
      const projectName = isConversation
        ? tr("settings.archived.noProject")
        : cwd
          ? projectDisplayName(cwd, projectAliases, workspaceLabel(cwd).name)
          : tr("settings.archived.unknownProject");
      const title = threadDisplayTitle(id, threadAliases, m?.title ?? `Session ${id.slice(0, 8)}`);
      const row: ArchivedSessionRow = {
        id,
        title,
        cwd: cwdKey,
        projectName,
        isConversation,
      };
      if (m?.archivedAt) row.archivedAt = m.archivedAt;
      return row;
    });
  }, [sessionIds, meta, projectAliases, threadAliases, tr]);

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (!map.has(row.cwd)) map.set(row.cwd, row.projectName);
    }
    return [...map.entries()];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (projectFilter !== "all" && row.cwd !== projectFilter) return false;
      if (!q) return true;
      return (
        row.title.toLowerCase().includes(q) ||
        row.projectName.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q)
      );
    });
  }, [rows, query, projectFilter]);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { name: string; items: ArchivedSessionRow[]; isConversation: boolean }
    >();
    for (const row of filtered) {
      const g = map.get(row.cwd) ?? {
        name: row.projectName,
        items: [],
        isConversation: row.isConversation,
      };
      g.items.push(row);
      g.isConversation = g.isConversation || row.isConversation;
      map.set(row.cwd, g);
    }
    // sort items by archivedAt desc within group
    for (const g of map.values()) {
      g.items.sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
    }
    return [...map.entries()];
  }, [filtered]);

  function unarchiveSession(id: string) {
    unarchiveThread(id);
    const m = { ...loadArchivedThreadMeta() };
    delete m[id];
    saveArchivedThreadMeta(m);
    refresh();
  }

  function deleteSession(id: string) {
    const name = rows.find((r) => r.id === id)?.title ?? id.slice(0, 8);
    if (loadConfirmDelete()) {
      const ok = window.confirm(tr("confirm.deleteMessage", { name }));
      if (!ok) return;
    }
    deleteThreadLocal(id);
    unarchiveThread(id);
    const m = { ...loadArchivedThreadMeta() };
    delete m[id];
    saveArchivedThreadMeta(m);
    refresh();
  }

  function deleteAllInProject(cwdKey: string) {
    // Conversation buckets are not projects — bulk "delete all in project" is not offered.
    if (cwdKey === "__conversations__" || rows.some((r) => r.cwd === cwdKey && r.isConversation)) {
      setOpenGroupMenu(null);
      return;
    }
    const name = rows.find((r) => r.cwd === cwdKey)?.projectName ?? cwdKey;
    if (loadConfirmDelete()) {
      const ok = window.confirm(tr("confirm.deleteMessage", { name }));
      if (!ok) return;
    }
    const ids = rows.filter((r) => r.cwd === cwdKey).map((r) => r.id);
    for (const id of ids) {
      deleteThreadLocal(id);
      unarchiveThread(id);
    }
    const m = { ...loadArchivedThreadMeta() };
    for (const id of ids) delete m[id];
    saveArchivedThreadMeta(m);
    setOpenGroupMenu(null);
    refresh();
  }

  function deleteAll() {
    if (loadConfirmDelete()) {
      const ok = window.confirm(
        tr("confirm.deleteMessage", { name: tr("settings.archived.deleteAll") }),
      );
      if (!ok) return;
    }
    for (const id of sessionIds) {
      deleteThreadLocal(id);
      unarchiveThread(id);
    }
    saveArchivedThreadMeta({});
    refresh();
  }

  return (
    <SettingsPageShell
      title={tr("section.archived")}
      testId="settings-archived"
      titleAction={
        sessionIds.length > 0 ? (
          <SettingsButton size="sm" danger testId="archived-delete-all" onClick={deleteAll}>
            <Trash2 className="size-3.5" strokeWidth={1.75} />
            {tr("settings.archived.deleteAll")}
          </SettingsButton>
        ) : null
      }
    >
      {/* Same pattern as models toolbar: search flex-1, trailing controls shrink-0. */}
      <div className="archived-toolbar mb-3 flex items-center gap-2" data-testid="archived-toolbar">
        <SettingsSearchField
          testId="archived-search"
          value={query}
          onChange={setQuery}
          placeholder={tr("settings.archived.search")}
          className="min-w-0 flex-1"
        />
        <div className="archived-toolbar-filters">
          <SettingsSelect
            className="w-auto shrink-0"
            size="md"
            testId="archived-filter-sessions"
            value="all"
            onChange={() => {
              /* reserved: all sessions only for now */
            }}
            options={[{ value: "all", label: tr("settings.archived.filterAll") }]}
          />
          <SettingsSelect
            className="w-auto shrink-0"
            size="md"
            testId="archived-filter-projects"
            value={projectFilter}
            onChange={setProjectFilter}
            options={[
              { value: "all", label: tr("settings.archived.filterAllProjects") },
              ...projectOptions.map(([key, name]) => ({ value: key, label: name })),
            ]}
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <p
          className="m-0 px-1 text-[13px] text-[var(--muted-foreground)]"
          data-testid="archived-empty"
        >
          {tr("settings.archived.empty")}
        </p>
      ) : (
        groups.map(([cwdKey, group]) => (
          <section
            key={cwdKey}
            className="archived-group"
            data-testid="archived-project-group"
            data-conversation={group.isConversation ? "true" : "false"}
          >
            <div className="archived-group-header">
              <div className="archived-group-name">
                <Folder className="size-4 shrink-0 opacity-70" strokeWidth={1.75} />
                <span className="truncate">{group.name}</span>
              </div>
              <div className="archived-group-meta">
                <span>{tr("settings.archived.count", { n: String(group.items.length) })}</span>
                {/* Bulk "delete all in project" only applies to real projects, not 对话. */}
                {!group.isConversation ? (
                  <div
                    className="archived-group-menu"
                    ref={openGroupMenu === cwdKey ? menuRef : null}
                  >
                    <SettingsIconButton
                      testId="archived-project-menu"
                      aria-label="More"
                      size="icon-sm"
                      onClick={() => setOpenGroupMenu((v) => (v === cwdKey ? null : cwdKey))}
                    >
                      <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
                    </SettingsIconButton>
                    {openGroupMenu === cwdKey ? (
                      <div className="archived-group-menu-panel" role="menu">
                        <SettingsButton
                          size="sm"
                          danger
                          testId="archived-project-delete-all"
                          className="h-auto w-full justify-start rounded-none px-3 py-2"
                          onClick={() => deleteAllInProject(cwdKey)}
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.75} />
                          {tr("settings.archived.deleteProjectAll")}
                        </SettingsButton>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="archived-card">
              {group.items.map((item) => (
                <div
                  key={item.id}
                  className="archived-item"
                  data-testid={`archived-session-${item.id}`}
                >
                  <div className="archived-item-copy">
                    <div className="archived-item-title">{item.title}</div>
                    <div className="archived-item-date">
                      {formatArchivedDate(item.archivedAt, locale)}
                    </div>
                  </div>
                  <div className="archived-item-actions">
                    <SettingsIconButton
                      size="icon-sm"
                      danger
                      testId={`archived-session-delete-${item.id}`}
                      title={tr("settings.archived.delete")}
                      aria-label={tr("settings.archived.delete")}
                      onClick={() => deleteSession(item.id)}
                    >
                      <Trash2 className="size-3.5" strokeWidth={1.75} />
                    </SettingsIconButton>
                    <SettingsButton
                      variant="secondary"
                      size="sm"
                      testId={`archived-session-unarchive-${item.id}`}
                      onClick={() => unarchiveSession(item.id)}
                    >
                      {tr("settings.archived.unarchive")}
                    </SettingsButton>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </SettingsPageShell>
  );
}

function ShortcutsSection(
  props: SettingsPageProps & { tr: (key: MessageKey, vars?: Record<string, string>) => string },
) {
  const { tr } = props;
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useState<ShortcutOverrides>(loadShortcutOverrides);
  const [recordingId, setRecordingId] = useState<ShortcutId | null>(null);
  const [conflict, setConflict] = useState<string>();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORTCUT_DEFINITIONS;
    return SHORTCUT_DEFINITIONS.filter((def) => {
      const label = tr(def.labelKey as MessageKey).toLowerCase();
      const combo = formatComboDisplay(getEffectiveCombo(def.id, overrides)).toLowerCase();
      return label.includes(q) || def.id.includes(q) || combo.includes(q);
    });
  }, [query, overrides, tr]);

  useEffect(() => {
    if (!recordingId) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecordingId(null);
        setConflict(undefined);
        return;
      }
      // Backspace / Delete alone → clear binding (no shortcut).
      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        setOverrides(setShortcutOverride(recordingId, ""));
        setRecordingId(null);
        setConflict(undefined);
        return;
      }
      const combo = eventToCombo(event);
      if (!combo) return;
      // Conflict check (skip unbound rows)
      for (const def of SHORTCUT_DEFINITIONS) {
        if (def.id === recordingId) continue;
        const other = getEffectiveCombo(def.id, overrides);
        if (!other) continue;
        if (other === combo) {
          setConflict(tr("shortcuts.conflict", { name: tr(def.labelKey as MessageKey) }));
          return;
        }
      }
      setOverrides(setShortcutOverride(recordingId, combo));
      setRecordingId(null);
      setConflict(undefined);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recordingId, overrides, tr]);

  return (
    <SettingsPageShell
      title={tr("section.shortcuts")}
      testId="settings-shortcuts"
      titleAction={
        <SettingsPillButton
          label={tr("shortcuts.resetAll")}
          testId="shortcuts-reset-all"
          onClick={() => {
            setOverrides(resetAllShortcuts());
            setRecordingId(null);
            setConflict(undefined);
          }}
        />
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <SettingsSearchField
          testId="shortcuts-search"
          value={query}
          onChange={setQuery}
          placeholder={tr("shortcuts.search")}
        />
      </div>
      {conflict ? (
        <p className="mb-2 text-[12px] text-red-400" data-testid="shortcuts-conflict">
          {conflict}
        </p>
      ) : null}
      <SettingsSectionBlock label={tr("section.shortcuts")} testId="settings-shortcuts-list">
        {filtered.length === 0 ? (
          <div className="settings-row settings-row-last">
            <div className="settings-row-desc">{tr("shortcuts.searchEmpty")}</div>
          </div>
        ) : (
          filtered.map((def, index) => {
            const effective = getEffectiveCombo(def.id, overrides);
            const isCustom = Object.prototype.hasOwnProperty.call(overrides, def.id);
            const unbound = isCustom && !effective;
            const recording = recordingId === def.id;
            const keyParts = comboToDisplayParts(effective);
            return (
              <div
                key={def.id}
                className={cn(
                  "settings-row items-center",
                  index === filtered.length - 1 && "settings-row-last",
                )}
                data-testid={`shortcut-row-${def.id}`}
              >
                <div className="settings-row-copy min-w-0 flex-1">
                  <div className="settings-row-title">{tr(def.labelKey as MessageKey)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <SettingsButton
                    type="button"
                    variant="outline"
                    size="sm"
                    testId={`shortcut-bind-${def.id}`}
                    className={cn(
                      "shortcut-bind h-auto min-h-8",
                      recording && "shortcut-bind-recording",
                      !recording && !keyParts.length && "shortcut-bind-empty",
                    )}
                    aria-label={
                      recording
                        ? tr("shortcuts.pressKeys")
                        : effective
                          ? formatComboDisplay(effective)
                          : tr("shortcuts.none")
                    }
                    onClick={() => {
                      setConflict(undefined);
                      setRecordingId(recording ? null : def.id);
                    }}
                  >
                    {recording ? (
                      <>
                        <span className="shortcut-bind-dot" aria-hidden />
                        <span className="shortcut-bind-hint">{tr("shortcuts.pressKeysHint")}</span>
                      </>
                    ) : keyParts.length > 0 ? (
                      keyParts.map((part, i) => (
                        <kbd key={`${def.id}-${part}-${i}`} className="shortcut-key">
                          {part}
                        </kbd>
                      ))
                    ) : (
                      <span className="shortcut-bind-hint">
                        {unbound || isCustom ? tr("shortcuts.none") : tr("shortcuts.clickToBind")}
                      </span>
                    )}
                  </SettingsButton>
                  <SettingsIconButton
                    size="icon-sm"
                    testId={`shortcut-reset-${def.id}`}
                    title={tr("shortcuts.reset")}
                    aria-label={tr("shortcuts.reset")}
                    disabled={!isCustom}
                    onClick={() => {
                      setOverrides(setShortcutOverride(def.id, null));
                      setConflict(undefined);
                      setRecordingId(null);
                    }}
                  >
                    <RotateCcw className="size-3.5" strokeWidth={1.75} />
                  </SettingsIconButton>
                  <SettingsIconButton
                    size="icon-sm"
                    danger
                    testId={`shortcut-clear-${def.id}`}
                    title={tr("shortcuts.clear")}
                    aria-label={tr("shortcuts.clear")}
                    disabled={!effective}
                    onClick={() => {
                      setOverrides(setShortcutOverride(def.id, ""));
                      setConflict(undefined);
                      setRecordingId(null);
                    }}
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.75} />
                  </SettingsIconButton>
                </div>
              </div>
            );
          })
        )}
      </SettingsSectionBlock>
    </SettingsPageShell>
  );
}

function NotificationsSection(
  props: SettingsPageProps & { tr: (key: MessageKey, vars?: Record<string, string>) => string },
) {
  const { tr } = props;
  const showAppError = useShellStore((s) => s.showAppError);
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadNotificationPrefs);
  const [testing, setTesting] = useState(false);

  function update(patch: Partial<NotificationPrefs>) {
    setPrefs(patchNotificationPrefs(patch));
  }

  async function updateEnabled(enabled: boolean) {
    update({ enabled });
    if (enabled && !(await requestMacNotificationPermission())) {
      showAppError(tr("notify.permissionDenied"));
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      if (!(await requestMacNotificationPermission())) {
        showAppError(tr("notify.permissionDenied"));
        return;
      }
      // Test always posts even when focused (diagnostics).
      const ok = await window.zeno.notifications.show({
        title: tr("notify.testTitle"),
        body: tr("notify.testBody"),
        silent: !prefs.sound,
        force: true,
      });
      if (!ok) {
        showAppError(tr("notify.testFailed"));
      }
    } catch (error) {
      showAppError(error instanceof Error ? error.message : tr("notify.testFailed"));
    } finally {
      setTesting(false);
    }
  }

  return (
    <SettingsPageShell title={tr("section.notifications")} testId="settings-notifications">
      <SettingsSectionBlock label={tr("section.notifications")} testId="settings-notify-options">
        <SettingsRow
          title={tr("notify.master")}
          description={tr("notify.masterHint")}
          control={
            <SettingsToggle
              checked={prefs.enabled}
              onChange={(on) => void updateEnabled(on)}
              testId="settings-notify-enabled"
              aria-label={tr("notify.master")}
            />
          }
        />
        <SettingsRow
          title={tr("notify.onComplete")}
          description={tr("notify.onCompleteHint")}
          control={
            <SettingsToggle
              checked={prefs.onComplete}
              onChange={(on) => update({ onComplete: on })}
              testId="settings-notify-complete"
              disabled={!prefs.enabled}
              aria-label={tr("notify.onComplete")}
            />
          }
        />
        <SettingsRow
          title={tr("notify.onError")}
          description={tr("notify.onErrorHint")}
          control={
            <SettingsToggle
              checked={prefs.onError}
              onChange={(on) => update({ onError: on })}
              testId="settings-notify-error"
              disabled={!prefs.enabled}
              aria-label={tr("notify.onError")}
            />
          }
        />
        <SettingsRow
          title={tr("notify.onHostCrash")}
          description={tr("notify.onHostCrashHint")}
          control={
            <SettingsToggle
              checked={prefs.onHostCrash}
              onChange={(on) => update({ onHostCrash: on })}
              testId="settings-notify-crash"
              disabled={!prefs.enabled}
              aria-label={tr("notify.onHostCrash")}
            />
          }
        />
        <SettingsRow
          title={tr("notify.onlyWhenUnfocused")}
          description={tr("notify.onlyWhenUnfocusedHint")}
          control={
            <SettingsToggle
              checked={prefs.onlyWhenUnfocused}
              onChange={(on) => update({ onlyWhenUnfocused: on })}
              testId="settings-notify-unfocused"
              disabled={!prefs.enabled}
              aria-label={tr("notify.onlyWhenUnfocused")}
            />
          }
        />
        <SettingsRow
          title={tr("notify.sound")}
          description={tr("notify.soundHint")}
          control={
            <SettingsToggle
              checked={prefs.sound}
              onChange={(on) => update({ sound: on })}
              testId="settings-notify-sound"
              disabled={!prefs.enabled}
              aria-label={tr("notify.sound")}
            />
          }
          last
        />
      </SettingsSectionBlock>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SettingsPillButton
          label={testing ? "…" : tr("notify.test")}
          testId="settings-notify-test"
          disabled={!prefs.enabled || testing}
          onClick={() => void sendTest()}
        />
        <SettingsPillButton
          label={tr("notify.openSystem")}
          testId="settings-notify-open-system"
          onClick={() => void window.zeno.notifications.openSystemSettings()}
        />
      </div>
    </SettingsPageShell>
  );
}

function EnvironmentSection(
  props: SettingsPageProps & { tr: (key: MessageKey, vars?: Record<string, string>) => string },
) {
  const { tr } = props;
  const [visibility, setVisibility] = useState(loadEnvPanelVisibility);

  function toggle(id: EnvPanelSectionId, on: boolean) {
    const next = setEnvPanelSectionVisible(id, on);
    setVisibility(next);
    window.dispatchEvent(new Event("zeno-env-panel-prefs"));
  }

  const rows: Array<{ id: EnvPanelSectionId; titleKey: MessageKey; descKey: MessageKey }> = [
    { id: "changes", titleKey: "env.section.changes", descKey: "env.section.changesDesc" },
    { id: "cwd", titleKey: "env.section.cwd", descKey: "env.section.cwdDesc" },
    { id: "branch", titleKey: "env.section.branch", descKey: "env.section.branchDesc" },
    {
      id: "gitActions",
      titleKey: "env.section.gitActions",
      descKey: "env.section.gitActionsDesc",
    },
    { id: "openIn", titleKey: "env.section.openIn", descKey: "env.section.openInDesc" },
    {
      id: "localServices",
      titleKey: "env.section.localServices",
      descKey: "env.section.localServicesDesc",
    },
  ];

  return (
    <SettingsPageShell title={tr("section.environment")} testId="settings-environment">
      <SettingsSectionBlock label={tr("env.title")} testId="settings-env-visibility">
        {rows.map((row, index) => (
          <SettingsRow
            key={row.id}
            title={tr(row.titleKey)}
            description={tr(row.descKey)}
            control={
              <SettingsToggle
                checked={visibility[row.id]}
                onChange={(on) => toggle(row.id, on)}
                testId={`settings-env-${row.id}`}
                aria-label={tr(row.titleKey)}
              />
            }
            last={index === rows.length - 1}
          />
        ))}
      </SettingsSectionBlock>
    </SettingsPageShell>
  );
}

type WorktreeDraft = {
  rootConfigured: string;
  autoDelete: boolean;
  autoDeleteLimit: number;
};

function worktreeDraftEqual(a: WorktreeDraft, b: WorktreeDraft): boolean {
  return (
    a.rootConfigured.trim() === b.rootConfigured.trim() &&
    a.autoDelete === b.autoDelete &&
    a.autoDeleteLimit === b.autoDeleteLimit
  );
}

function worktreeFolderName(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts.at(-1) || path;
}

function WorktreeSection(
  props: SettingsPageProps & { tr: (key: MessageKey, vars?: Record<string, string>) => string },
) {
  const { tr } = props;
  const [prefs, setPrefs] = useState<WorktreeDraft>({
    rootConfigured: "",
    autoDelete: true,
    autoDeleteLimit: 10,
  });
  const [saved, setSaved] = useState<WorktreeDraft>({
    rootConfigured: "",
    autoDelete: true,
    autoDeleteLimit: 10,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [linkedWorktrees, setLinkedWorktrees] = useState<GitWorktreeInfo[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const dirty = !worktreeDraftEqual(prefs, saved);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Prefs are global — do not pass cwd so the form does not rebind when the project changes.
    void window.zeno.workspace
      .getWorktreePrefs()
      .then((p) => {
        if (cancelled) return;
        const next: WorktreeDraft = {
          rootConfigured: p.rootConfigured,
          autoDelete: p.autoDelete,
          autoDeleteLimit: p.autoDeleteLimit,
        };
        setPrefs(next);
        setSaved(next);
      })
      .catch(() => {
        /* host may be stopped */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshLinkedWorktrees = useCallback(async () => {
    setListLoading(true);
    try {
      // All Zeno-managed linked worktrees across projects (not only the open cwd).
      const items = await window.zeno.workspace.listManagedWorktrees();
      setLinkedWorktrees(items.filter((w) => !w.main && !w.bare));
    } catch {
      setLinkedWorktrees([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLinkedWorktrees();
  }, [refreshLinkedWorktrees]);

  async function save() {
    if (busy || loading || !dirty) return;
    setBusy(true);
    try {
      const p = await window.zeno.workspace.setWorktreePrefs({
        rootConfigured: prefs.rootConfigured,
        autoDelete: prefs.autoDelete,
        autoDeleteLimit: prefs.autoDeleteLimit,
      });
      const next: WorktreeDraft = {
        rootConfigured: p.rootConfigured,
        autoDelete: p.autoDelete,
        autoDeleteLimit: p.autoDeleteLimit,
      };
      setPrefs(next);
      setSaved(next);
      useShellStore.getState().setStatus(tr("worktree.saved"));
    } catch (error) {
      useShellStore
        .getState()
        .showAppError(error instanceof Error ? error.message : tr("worktree.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  function onFieldKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void save();
  }

  async function deleteWorktree(worktreePath: string) {
    if (deletingPath) return;
    setDeletingPath(worktreePath);
    try {
      await window.zeno.workspace.removeGitWorktree(worktreePath);
      await refreshLinkedWorktrees();
      // Notify shell to drop the path from the project rail (recent / current).
      window.dispatchEvent(
        new CustomEvent("zeno-worktree-removed", { detail: { path: worktreePath } }),
      );
    } catch (error) {
      useShellStore
        .getState()
        .showAppError(error instanceof Error ? error.message : tr("worktree.listDeleteFailed"));
    } finally {
      setDeletingPath(null);
    }
  }

  const disabled = loading || busy;
  const listEmpty = linkedWorktrees.length === 0;
  // Empty: 「尚无工作树」; with items: 「已创建工作树」
  const listLabel = listEmpty ? tr("worktree.listEmptyTitle") : tr("worktree.listTitle");

  return (
    <SettingsPageShell
      title={tr("section.worktree")}
      testId="settings-worktree"
      titleAction={
        <SettingsPillButton
          label={busy ? tr("worktree.saving") : tr("worktree.save")}
          testId="worktree-save"
          disabled={disabled || !dirty}
          onClick={() => void save()}
        />
      }
    >
      {/* Preferences first, then linked-worktree list below. */}
      <SettingsSectionBlock label={tr("worktree.settings")} testId="settings-worktree-options">
        <div className="settings-row settings-row-last !flex-col !items-stretch gap-3">
          <div>
            <div className="settings-row-title">{tr("worktree.root")}</div>
            <div className="settings-row-desc mt-1">{tr("worktree.rootHint")}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <SettingsInput
                data-testid="worktree-root-input"
                mono
                className="min-w-0 flex-1"
                value={prefs.rootConfigured}
                placeholder={tr("worktree.rootPlaceholder")}
                disabled={disabled}
                onChange={(e) =>
                  setPrefs((current) => ({ ...current, rootConfigured: e.target.value }))
                }
                onKeyDown={onFieldKeyDown}
              />
              <SettingsPillButton
                label={tr("worktree.pickRoot")}
                testId="worktree-root-pick"
                disabled={disabled}
                onClick={() => {
                  void window.zeno.workspace.pickFolder().then((folder) => {
                    if (!folder) return;
                    setPrefs((current) => ({ ...current, rootConfigured: folder }));
                  });
                }}
              />
              <SettingsPillButton
                label={tr("worktree.clearRoot")}
                testId="worktree-root-clear"
                disabled={disabled || !prefs.rootConfigured.trim()}
                onClick={() => setPrefs((current) => ({ ...current, rootConfigured: "" }))}
              />
            </div>
          </div>
          <div className="settings-divider flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="settings-row-title">{tr("worktree.autoDelete")}</div>
              <div className="settings-row-desc">{tr("worktree.autoDeleteHint")}</div>
            </div>
            <SettingsToggle
              checked={prefs.autoDelete}
              onChange={(on) => setPrefs((current) => ({ ...current, autoDelete: on }))}
              testId="worktree-auto-delete"
              disabled={disabled}
              aria-label={tr("worktree.autoDelete")}
            />
          </div>
          <div className="settings-divider flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="settings-row-title">{tr("worktree.autoDeleteLimit")}</div>
              <div className="settings-row-desc">{tr("worktree.autoDeleteLimitHint")}</div>
            </div>
            <SettingsInput
              type="number"
              min={1}
              max={100}
              data-testid="worktree-auto-delete-limit"
              className="w-20 text-right"
              value={prefs.autoDeleteLimit}
              disabled={disabled || !prefs.autoDelete}
              onChange={(e) =>
                setPrefs((current) => ({
                  ...current,
                  autoDeleteLimit: Number(e.target.value) || 1,
                }))
              }
              onKeyDown={onFieldKeyDown}
            />
          </div>
        </div>
      </SettingsSectionBlock>

      <section className="settings-section-block" data-testid="settings-worktree-list">
        <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
          <h2 className="settings-section-label m-0 min-w-0 flex-1 truncate">{listLabel}</h2>
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--hover-fill)] hover:text-[var(--foreground)] disabled:opacity-50"
            title={tr("worktree.listRefresh")}
            aria-label={tr("worktree.listRefresh")}
            data-testid="worktree-list-refresh"
            disabled={listLoading}
            onClick={() => void refreshLinkedWorktrees()}
          >
            <RotateCcw
              className={cn("size-3.5", listLoading && "animate-spin")}
              strokeWidth={1.75}
            />
          </button>
        </div>
        {/*
          Always use settings-card (surface-panel) like other preference groups.
          Empty state: hint text only — no extra fill on the paragraph itself.
        */}
        <div className="settings-card">
          {listEmpty ? (
            <div className="settings-row settings-row-last" data-testid="worktree-list-empty">
              <div className="settings-row-desc">{tr("worktree.listEmptyHint")}</div>
            </div>
          ) : (
            <ul className="m-0 list-none p-0" data-testid="worktree-list-items">
              {linkedWorktrees.map((item, index) => {
                const name = worktreeFolderName(item.path);
                const last = index === linkedWorktrees.length - 1;
                const deleting = deletingPath === item.path;
                return (
                  <li
                    key={item.path}
                    className={cn(
                      "settings-row group/wt items-center gap-3",
                      last && "settings-row-last",
                    )}
                    data-testid="worktree-list-item"
                    data-path={item.path}
                  >
                    <div className="settings-row-copy min-w-0 flex-1">
                      <div className="settings-row-title truncate">{name}</div>
                      <div className="settings-row-desc truncate font-mono text-[11px]">
                        {item.path}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg",
                        "text-[var(--muted-foreground)] transition-colors",
                        "hover:bg-red-500/15 hover:text-red-400",
                        "disabled:pointer-events-none disabled:opacity-50",
                      )}
                      title={tr("worktree.listDelete")}
                      aria-label={tr("worktree.listDelete")}
                      data-testid={`worktree-list-delete-${index}`}
                      disabled={deleting || Boolean(deletingPath)}
                      onClick={() => void deleteWorktree(item.path)}
                    >
                      {deleting ? (
                        <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} />
                      ) : (
                        <Trash2 className="size-3.5" strokeWidth={1.75} />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </SettingsPageShell>
  );
}

type GitDraft = {
  branchPrefix: string;
  pullMode: "merge" | "squash";
  forcePush: boolean;
  draftPr: boolean;
  customCommit: string;
  customPr: string;
  modelKey: string;
};

function gitDraftEqual(a: GitDraft, b: GitDraft): boolean {
  return (
    a.branchPrefix === b.branchPrefix &&
    a.pullMode === b.pullMode &&
    a.forcePush === b.forcePush &&
    a.draftPr === b.draftPr &&
    a.customCommit === b.customCommit &&
    a.customPr === b.customPr &&
    a.modelKey === b.modelKey
  );
}

function gitPrefsToDraft(p: {
  branchPrefix: string;
  pullMode: "merge" | "squash";
  forcePush: boolean;
  draftPr: boolean;
  customCommitCommand: string;
  customPrCommand: string;
  modelProvider: string;
  modelId: string;
}): GitDraft {
  return {
    branchPrefix: p.branchPrefix,
    pullMode: p.pullMode,
    forcePush: p.forcePush,
    draftPr: p.draftPr,
    customCommit: p.customCommitCommand,
    customPr: p.customPrCommand,
    modelKey: p.modelProvider && p.modelId ? `${p.modelProvider}/${p.modelId}` : "",
  };
}

function GitSection(
  props: SettingsPageProps & { tr: (key: MessageKey, vars?: Record<string, string>) => string },
) {
  const { tr } = props;
  const [prefs, setPrefs] = useState<GitDraft>({
    branchPrefix: "zeno/",
    pullMode: "merge",
    forcePush: false,
    draftPr: false,
    customCommit: "",
    customPr: "",
    modelKey: "",
  });
  const [saved, setSaved] = useState<GitDraft>({
    branchPrefix: "zeno/",
    pullMode: "merge",
    forcePush: false,
    draftPr: false,
    customCommit: "",
    customPr: "",
    modelKey: "",
  });
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const dirty = !gitDraftEqual(prefs, saved);
  // Parent passes `onEnsureHost={() => ensureHost()}` — new identity every render.
  // Keep a stable ref so this page never re-enters a load loop (status/snapshot flicker).
  const ensureHostRef = useRef(props.onEnsureHost);
  ensureHostRef.current = props.onEnsureHost;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void window.zeno.workspace
      .getGitPrefs()
      .then((p) => {
        if (cancelled) return;
        const next = gitPrefsToDraft(p);
        setPrefs(next);
        setSaved(next);
      })
      .catch(() => {
        /* host may be stopped */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    void (async () => {
      try {
        let list: ModelSummary[] = [];
        try {
          list = await window.zeno.models.list();
        } catch {
          // Host may be cold — start once, then list. Do not put ensureHost in deps.
          await ensureHostRef.current();
          if (cancelled) return;
          list = await window.zeno.models.list();
        }
        if (!cancelled) setModels(list);
      } catch {
        if (!cancelled) setModels([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: re-running on every parent render caused infinite host.start + UI flash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (busy || loading || !dirty) return;
    setBusy(true);
    try {
      let modelProvider = "";
      let modelId = "";
      if (prefs.modelKey) {
        const slash = prefs.modelKey.indexOf("/");
        modelProvider = slash >= 0 ? prefs.modelKey.slice(0, slash) : prefs.modelKey;
        modelId = slash >= 0 ? prefs.modelKey.slice(slash + 1) : "";
      }
      const p = await window.zeno.workspace.setGitPrefs({
        branchPrefix: prefs.branchPrefix,
        pullMode: prefs.pullMode,
        forcePush: prefs.forcePush,
        draftPr: prefs.draftPr,
        customCommitCommand: prefs.customCommit,
        customPrCommand: prefs.customPr,
        modelProvider,
        modelId,
      });
      const next = gitPrefsToDraft(p);
      setPrefs(next);
      setSaved(next);
      useShellStore.getState().setStatus(tr("git.saved"));
    } catch (error) {
      useShellStore
        .getState()
        .showAppError(error instanceof Error ? error.message : tr("git.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  function onFieldKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void save();
  }

  const modelOptions = useMemo(() => {
    const opts = [
      { value: "", label: t(props.locale, "git.modelDefault") },
      ...models.map((m) => ({
        value: `${m.provider}/${m.id}`,
        label: `${m.name || m.id} (${m.provider})`,
      })),
    ];
    // Keep current selection visible even if host list is empty temporarily.
    if (prefs.modelKey && !opts.some((o) => o.value === prefs.modelKey)) {
      opts.push({ value: prefs.modelKey, label: prefs.modelKey });
    }
    return opts;
  }, [models, prefs.modelKey, props.locale]);

  const disabled = loading || busy;

  return (
    <SettingsPageShell
      title={tr("section.git")}
      testId="settings-git"
      titleAction={
        <SettingsPillButton
          label={busy ? tr("git.saving") : tr("git.save")}
          testId="git-save"
          disabled={disabled || !dirty}
          onClick={() => void save()}
        />
      }
    >
      <SettingsSectionBlock label={tr("git.settings")} testId="settings-git-options">
        <div className="settings-row items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="settings-row-title">{tr("git.model")}</div>
            <div className="settings-row-desc">{tr("git.modelHint")}</div>
          </div>
          <SettingsSelect
            testId="git-model"
            value={prefs.modelKey}
            onChange={(v) => setPrefs((current) => ({ ...current, modelKey: v }))}
            options={modelOptions}
            disabled={disabled}
          />
        </div>
        <div className="settings-row !flex-col !items-stretch gap-2.5">
          <div>
            <div className="settings-row-title">{tr("git.branchPrefix")}</div>
            <div className="settings-row-desc">{tr("git.branchPrefixHint")}</div>
          </div>
          <div className="mt-1">
            <SettingsInput
              data-testid="git-branch-prefix"
              mono
              value={prefs.branchPrefix}
              placeholder={tr("git.branchPrefixPlaceholder")}
              disabled={disabled}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              onChange={(e) =>
                setPrefs((current) => ({ ...current, branchPrefix: e.target.value }))
              }
              onKeyDown={onFieldKeyDown}
            />
          </div>
        </div>
        <div className="settings-row items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="settings-row-title">{tr("git.pullMode")}</div>
            <div className="settings-row-desc">{tr("git.pullModeHint")}</div>
          </div>
          <SettingsSelect
            testId="git-pull-mode"
            value={prefs.pullMode}
            onChange={(v) =>
              setPrefs((current) => ({
                ...current,
                pullMode: v === "squash" ? "squash" : "merge",
              }))
            }
            options={[
              { value: "merge", label: tr("git.pullMerge") },
              { value: "squash", label: tr("git.pullSquash") },
            ]}
            disabled={disabled}
          />
        </div>
        <SettingsRow
          title={tr("git.forcePush")}
          description={tr("git.forcePushHint")}
          control={
            <SettingsToggle
              checked={prefs.forcePush}
              onChange={(on) => setPrefs((current) => ({ ...current, forcePush: on }))}
              testId="git-force-push"
              disabled={disabled}
              aria-label={tr("git.forcePush")}
            />
          }
        />
        <SettingsRow
          title={tr("git.draftPr")}
          description={tr("git.draftPrHint")}
          control={
            <SettingsToggle
              checked={prefs.draftPr}
              onChange={(on) => setPrefs((current) => ({ ...current, draftPr: on }))}
              testId="git-draft-pr"
              disabled={disabled}
              aria-label={tr("git.draftPr")}
            />
          }
        />
        <div className="settings-row !flex-col !items-stretch gap-2.5">
          <div>
            <div className="settings-row-title">{tr("git.customCommit")}</div>
            <div className="settings-row-desc">{tr("git.customCommitHint")}</div>
          </div>
          <SettingsTextarea
            data-testid="git-custom-commit"
            value={prefs.customCommit}
            placeholder={tr("git.customCommitPlaceholder")}
            disabled={disabled}
            rows={4}
            onChange={(e) => setPrefs((current) => ({ ...current, customCommit: e.target.value }))}
          />
        </div>
        <div className="settings-row settings-row-last !flex-col !items-stretch gap-2.5">
          <div>
            <div className="settings-row-title">{tr("git.customPr")}</div>
            <div className="settings-row-desc">{tr("git.customPrHint")}</div>
          </div>
          <SettingsTextarea
            data-testid="git-custom-pr"
            value={prefs.customPr}
            placeholder={tr("git.customPrPlaceholder")}
            disabled={disabled}
            rows={4}
            onChange={(e) => setPrefs((current) => ({ ...current, customPr: e.target.value }))}
          />
        </div>
      </SettingsSectionBlock>
    </SettingsPageShell>
  );
}

function BehaviorSection(
  props: SettingsPageProps & { tr: (key: MessageKey, vars?: Record<string, string>) => string },
) {
  const { tr } = props;
  const [confirmDelete, setConfirmDelete] = useState(loadConfirmDelete);
  const [confirmArchive, setConfirmArchive] = useState(loadConfirmArchive);
  return (
    <SettingsPageShell title={tr("section.behavior")} testId="settings-behavior">
      <SettingsSectionBlock label={tr("settings.behavior")} testId="settings-behavior-options">
        <SettingsRow
          title={tr("settings.confirmDelete")}
          description={tr("settings.confirmDeleteHint")}
          control={
            <SettingsToggle
              checked={confirmDelete}
              onChange={(next) => {
                setConfirmDelete(next);
                saveConfirmDelete(next);
              }}
              testId="settings-confirm-delete"
              aria-label={tr("settings.confirmDelete")}
            />
          }
        />
        <SettingsRow
          title={tr("settings.confirmArchive")}
          description={tr("settings.confirmArchiveHint")}
          control={
            <SettingsToggle
              checked={confirmArchive}
              onChange={(next) => {
                setConfirmArchive(next);
                saveConfirmArchive(next);
              }}
              testId="settings-confirm-archive"
              aria-label={tr("settings.confirmArchive")}
            />
          }
          last
        />
      </SettingsSectionBlock>
    </SettingsPageShell>
  );
}

function TerminalSection(
  props: SettingsPageProps & { tr: (key: MessageKey, vars?: Record<string, string>) => string },
) {
  const { tr } = props;
  const [prefs, setPrefs] = useState<TerminalPrefs>(loadTerminalPrefs);
  const [fontChoices, setFontChoices] = useState<TerminalFontChoice[]>(() => [
    {
      id: SYSTEM_TERMINAL_FONT_ID,
      family: DEFAULT_TERMINAL_PREFS.fontFamily,
      label: tr("terminal.font.system"),
    },
  ]);
  const [fontsLoading, setFontsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setFontsLoading(true);
    void listInstalledTerminalFonts(tr("terminal.font.system")).then((list) => {
      if (cancelled) return;
      setFontChoices(list);
      setFontsLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // Re-scan when locale label for "system" changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tr identity is unstable; use locale
  }, [props.locale]);

  function update(patch: Partial<TerminalPrefs>) {
    setPrefs(patchTerminalPrefs(patch));
  }

  const fontChoiceId = matchTerminalFontChoiceId(prefs.fontFamily, fontChoices);
  const fontOptions = fontChoices.map((c) => ({
    value: c.id,
    label: c.id === SYSTEM_TERMINAL_FONT_ID ? tr("terminal.font.system") : c.label,
  }));
  // Keep a stored orphan family visible if it is not in the scanned list.
  if (
    fontChoiceId !== SYSTEM_TERMINAL_FONT_ID &&
    !fontOptions.some((o) => o.value === fontChoiceId)
  ) {
    fontOptions.push({ value: fontChoiceId, label: fontChoiceId });
  }

  return (
    <SettingsPageShell
      title={tr("section.terminal")}
      testId="settings-terminal"
      titleAction={
        <SettingsPillButton
          label={tr("terminal.reset")}
          testId="settings-terminal-reset"
          onClick={() => {
            setPrefs(resetTerminalPrefs());
          }}
        />
      }
    >
      <SettingsSectionBlock label={tr("terminal.group.font")} testId="settings-terminal-font">
        <SettingsRow
          title={tr("terminal.fontFamily")}
          description={
            fontsLoading ? tr("terminal.fontFamilyLoading") : tr("terminal.fontFamilyHint")
          }
          control={
            <SettingsSelect
              value={fontChoiceId}
              onChange={(id) => {
                const choice = fontChoices.find((c) => c.id === id);
                if (choice) {
                  update({ fontFamily: choice.family });
                  return;
                }
                // Orphan id from a previously saved family name.
                if (id && id !== SYSTEM_TERMINAL_FONT_ID) {
                  update({
                    fontFamily: `"${id.replace(/"/g, "")}", ui-monospace, monospace`,
                  });
                }
              }}
              options={fontOptions}
              testId="settings-terminal-font-family"
              size="lg"
              disabled={fontsLoading && fontChoices.length <= 1}
            />
          }
        />
        <SettingsRow
          title={tr("terminal.fontSize")}
          description={tr("terminal.fontSizeHint")}
          control={
            <SettingsSelect
              value={String(prefs.fontSize)}
              onChange={(v) => update({ fontSize: Number(v) })}
              options={Array.from(
                { length: TERMINAL_FONT_SIZE_MAX - TERMINAL_FONT_SIZE_MIN + 1 },
                (_, i) => {
                  const n = TERMINAL_FONT_SIZE_MIN + i;
                  return { value: String(n), label: `${n}px` };
                },
              )}
              testId="settings-terminal-font-size"
              size="sm"
            />
          }
        />
        <SettingsRow
          title={tr("terminal.lineHeight")}
          description={tr("terminal.lineHeightHint")}
          control={
            <SettingsSelect
              value={String(prefs.lineHeight)}
              onChange={(v) => update({ lineHeight: Number(v) })}
              options={TERMINAL_LINE_HEIGHT_OPTIONS.map((n) => ({
                value: String(n),
                label: `${n.toFixed(1)}×`,
              }))}
              testId="settings-terminal-line-height"
              size="sm"
            />
          }
          last
        />
      </SettingsSectionBlock>

      <SettingsSectionBlock label={tr("terminal.group.cursor")} testId="settings-terminal-cursor">
        <SettingsRow
          title={tr("terminal.cursorStyle")}
          description={tr("terminal.cursorStyleHint")}
          control={
            <SettingsSelect
              value={prefs.cursorStyle}
              onChange={(v) => update({ cursorStyle: v as TerminalCursorStyle })}
              options={[
                { value: "block", label: tr("terminal.cursor.block") },
                { value: "underline", label: tr("terminal.cursor.underline") },
                { value: "bar", label: tr("terminal.cursor.bar") },
              ]}
              testId="settings-terminal-cursor-style"
              size="md"
            />
          }
        />
        <SettingsRow
          title={tr("terminal.cursorBlink")}
          description={tr("terminal.cursorBlinkHint")}
          control={
            <SettingsToggle
              checked={prefs.cursorBlink}
              onChange={(on) => update({ cursorBlink: on })}
              testId="settings-terminal-cursor-blink"
              aria-label={tr("terminal.cursorBlink")}
            />
          }
          last
        />
      </SettingsSectionBlock>

      <SettingsSectionBlock label={tr("terminal.group.scroll")} testId="settings-terminal-scroll">
        <SettingsRow
          title={tr("terminal.scrollback")}
          description={tr("terminal.scrollbackHint")}
          control={
            <SettingsSelect
              value={String(prefs.scrollback)}
              onChange={(v) => update({ scrollback: Number(v) })}
              options={[
                { value: "1000", label: "1,000" },
                { value: "5000", label: "5,000" },
                { value: "10000", label: "10,000" },
                { value: "20000", label: "20,000" },
                { value: "50000", label: "50,000" },
                { value: "100000", label: "100,000" },
              ]}
              testId="settings-terminal-scrollback"
              size="md"
            />
          }
        />
        <SettingsRow
          title={tr("terminal.smoothScroll")}
          description={tr("terminal.smoothScrollHint")}
          control={
            <SettingsSelect
              value={String(prefs.smoothScrollMs)}
              onChange={(v) => update({ smoothScrollMs: Number(v) })}
              options={[
                { value: "0", label: tr("terminal.smoothScroll.off") },
                { value: "50", label: "50ms" },
                { value: "100", label: "100ms" },
                { value: "200", label: "200ms" },
                { value: "300", label: "300ms" },
              ]}
              testId="settings-terminal-smooth-scroll"
              size="md"
            />
          }
        />
        <SettingsRow
          title={tr("terminal.scrollOnOutput")}
          description={tr("terminal.scrollOnOutputHint")}
          control={
            <SettingsToggle
              checked={prefs.scrollOnOutput}
              onChange={(on) => update({ scrollOnOutput: on })}
              testId="settings-terminal-scroll-on-output"
              aria-label={tr("terminal.scrollOnOutput")}
            />
          }
          last
        />
      </SettingsSectionBlock>

      <SettingsSectionBlock
        label={tr("terminal.group.selection")}
        testId="settings-terminal-selection"
      >
        <SettingsRow
          title={tr("terminal.copyOnSelect")}
          description={tr("terminal.copyOnSelectHint")}
          control={
            <SettingsToggle
              checked={prefs.copyOnSelect}
              onChange={(on) => update({ copyOnSelect: on })}
              testId="settings-terminal-copy-on-select"
              aria-label={tr("terminal.copyOnSelect")}
            />
          }
          last
        />
      </SettingsSectionBlock>

      <SettingsSectionBlock label={tr("terminal.group.render")} testId="settings-terminal-render">
        <SettingsRow
          title={tr("terminal.colorScheme")}
          description={tr("terminal.colorSchemeHint")}
          control={
            <SettingsSelect
              value={prefs.colorScheme}
              onChange={(v) => update({ colorScheme: v as TerminalColorScheme })}
              options={[
                { value: "match", label: tr("terminal.color.match") },
                { value: "dark", label: tr("terminal.color.dark") },
                { value: "light", label: tr("terminal.color.light") },
              ]}
              testId="settings-terminal-color-scheme"
              size="md"
            />
          }
        />
        <SettingsRow
          title={tr("terminal.convertEol")}
          description={tr("terminal.convertEolHint")}
          control={
            <SettingsToggle
              checked={prefs.convertEol}
              onChange={(on) => update({ convertEol: on })}
              testId="settings-terminal-convert-eol"
              aria-label={tr("terminal.convertEol")}
            />
          }
          last
        />
      </SettingsSectionBlock>
    </SettingsPageShell>
  );
}

const USAGE_LABEL_KEYS: Record<string, MessageKey> = {
  "5h": "usage.metricSession5h",
  Weekly: "usage.metricWeekly",
  Session: "usage.metricSession",
  Sonnet: "usage.metricSonnet",
  Opus: "usage.metricOpus",
  Credits: "usage.metricCredits",
  "Key limit": "usage.metricKeyLimit",
  Chat: "usage.metricChat",
  Completions: "usage.metricCompletions",
  "Web searches": "usage.metricWebSearches",
  Balance: "usage.metricBalance",
  Today: "usage.metricToday",
  "This week": "usage.metricThisWeek",
  "This month": "usage.metricThisMonth",
  "Extra usage": "usage.metricExtraUsage",
};

function usageMetricLabel(
  label: string,
  tr: (key: MessageKey, vars?: Record<string, string>) => string,
): string {
  const key = USAGE_LABEL_KEYS[label];
  return key ? tr(key) : label;
}

function usagePercent(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

function usageProviderDetail(
  provider: ProviderUsageSnapshot,
  tr: (key: MessageKey, vars?: Record<string, string>) => string,
): string | undefined {
  if (provider.status === "needs-auth") return tr("usage.needsAuthHint");
  if (provider.status !== "error") return provider.detail;
  const status = provider.detail?.match(/HTTP (\d{3})/)?.[1];
  return status ? tr("usage.requestFailed", { status }) : tr("usage.endpointUnavailable");
}

function UsageLimitsSection(
  props: SettingsPageProps & { tr: (key: MessageKey, vars?: Record<string, string>) => string },
) {
  const { tr } = props;
  const [usage, setUsage] = useState<ProviderUsageSnapshot[] | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const requestIdRef = useRef(0);

  async function refresh() {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadFailed(false);
    try {
      await props.onEnsureHost();
      const snapshots = await window.zeno.providers.usage();
      if (requestId === requestIdRef.current) setUsage(snapshots);
    } catch {
      if (requestId === requestIdRef.current) {
        setUsage((current) => current ?? []);
        setLoadFailed(true);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    return () => {
      requestIdRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SettingsPageShell
      title={tr("section.usage")}
      testId="settings-usage"
      titleAction={
        <SettingsPillButton
          label={loading ? tr("usage.refreshing") : tr("usage.refresh")}
          testId="usage-refresh"
          disabled={loading}
          onClick={() => void refresh()}
        />
      }
    >
      {usage === undefined ? (
        <div className="usage-loading" data-testid="usage-loading" aria-label={tr("usage.loading")}>
          <span />
          <span />
        </div>
      ) : usage.length === 0 ? (
        <div className="usage-empty" data-testid="usage-empty">
          <div className="usage-empty-title">
            {loadFailed ? tr("usage.loadFailed") : tr("usage.empty")}
          </div>
          <p>{loadFailed ? tr("usage.loadFailedHint") : tr("usage.emptyHint")}</p>
        </div>
      ) : (
        <div className="usage-provider-list" data-testid="usage-limits-list">
          {usage.map((provider) => {
            const updated = formatUsageUpdatedAt(provider.updatedAt, props.locale);
            const providerDetail = usageProviderDetail(provider, tr);
            return (
              <section
                key={provider.provider}
                className="usage-provider-card"
                data-status={provider.status}
                data-testid={`usage-card-${provider.provider}`}
              >
                <header className="usage-provider-header">
                  <div className="usage-provider-identity">
                    <div className="usage-provider-name-row">
                      <h3>{provider.displayName}</h3>
                      {provider.planName ? (
                        <span className="usage-plan-pill">{provider.planName}</span>
                      ) : null}
                    </div>
                    <div className="usage-provider-meta">
                      <span>{provider.provider}</span>
                      {updated ? <span>{tr("usage.updated", { time: updated })}</span> : null}
                    </div>
                  </div>
                  <span className="usage-status-pill" data-status={provider.status}>
                    {provider.status === "ok"
                      ? tr("usage.statusLive")
                      : provider.status === "needs-auth"
                        ? tr("usage.statusNeedsAuth")
                        : tr("usage.statusError")}
                  </span>
                </header>

                {provider.status === "ok" ? (
                  <div className="usage-meter-list">
                    {provider.limits.map((limit, index) => {
                      const remaining = remainingPercent(limit);
                      const tone = usageTone(limit);
                      const cadence =
                        formatResetCountdown(limit.resetsAt, props.locale) ??
                        formatWindowDuration(limit.windowDurationMins, props.locale);
                      return (
                        <div
                          className="usage-meter"
                          data-tone={tone}
                          data-testid={`usage-limit-${provider.provider}-${index}`}
                          key={`${limit.label}-${index}`}
                        >
                          <div className="usage-meter-heading">
                            <span>{usageMetricLabel(limit.label, tr)}</span>
                            <strong>
                              {tr("usage.remaining", {
                                percent: usagePercent(remaining, props.locale),
                              })}
                            </strong>
                          </div>
                          <div
                            className="usage-meter-track"
                            role="progressbar"
                            aria-label={usageMetricLabel(limit.label, tr)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={remaining}
                          >
                            <span style={{ width: `${remaining}%` }} />
                          </div>
                          <div className="usage-meter-footnote">
                            <span>
                              {tr("usage.used", {
                                percent: usagePercent(limit.usedPercent, props.locale),
                              })}
                              {limit.detail ? ` · ${limit.detail}` : ""}
                            </span>
                            {cadence ? <span>{cadence}</span> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {provider.usageLines.length > 0 ? (
                  <dl className="usage-line-grid">
                    {provider.usageLines.map((line, index) => (
                      <div key={`${line.label}-${index}`}>
                        <dt>{usageMetricLabel(line.label, tr)}</dt>
                        <dd>{line.value}</dd>
                        {line.subtitle ? <small>{line.subtitle}</small> : null}
                      </div>
                    ))}
                  </dl>
                ) : null}

                {provider.status === "ok" &&
                provider.limits.length === 0 &&
                provider.usageLines.length === 0 ? (
                  <p className="usage-provider-detail">{tr("usage.noData")}</p>
                ) : providerDetail ? (
                  <p className="usage-provider-detail">{providerDetail}</p>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </SettingsPageShell>
  );
}

function GeneralSection(
  props: SettingsPageProps & { tr: (key: MessageKey, vars?: Record<string, string>) => string },
) {
  const { tr } = props;
  const [preventSleep, setPreventSleep] = useState(loadPreventSleep);
  const [suggestions, setSuggestions] = useState(loadSuggestions);
  const visibility = props.accessVisibility;
  const trusted = Boolean(props.snapshot?.projectTrusted);

  function setVisibility(key: keyof AccessVisibility, on: boolean) {
    props.onAccessVisibility({ ...visibility, [key]: on });
  }

  return (
    <SettingsPageShell title={tr("section.general")} testId="settings-general">
      <SettingsSectionBlock label={tr("settings.permissions")} testId="settings-permissions">
        <SettingsRow
          title={tr("settings.defaultAccess")}
          description={tr("settings.defaultAccessHint")}
          control={
            <SettingsToggle
              checked={visibility.default}
              onChange={(on) => setVisibility("default", on)}
              testId="settings-default-access"
              aria-label={tr("settings.defaultAccess")}
            />
          }
        />
        <SettingsRow
          title={tr("settings.autoReview")}
          description={tr("settings.autoReviewHint")}
          control={
            <SettingsToggle
              checked={visibility.autoReview}
              onChange={(on) => setVisibility("autoReview", on)}
              testId="settings-auto-review"
              aria-label={tr("settings.autoReview")}
            />
          }
        />
        <SettingsRow
          title={tr("settings.fullAccess")}
          description={tr("settings.fullAccessHint")}
          control={
            <SettingsToggle
              checked={visibility.full}
              onChange={(on) => setVisibility("full", on)}
              testId="settings-full-access"
              aria-label={tr("settings.fullAccess")}
            />
          }
          last
        />
      </SettingsSectionBlock>

      <SettingsSectionBlock label={tr("settings.section.general")} testId="settings-general-card">
        <SettingsRow
          title={tr("settings.projectTrusted")}
          description={tr("settings.projectTrustedHint")}
          control={
            <SettingsToggle
              checked={trusted}
              onChange={() => props.onToggleTrust()}
              disabled={!props.snapshot}
              testId="settings-project-trust"
              aria-label={tr("settings.projectTrusted")}
            />
          }
        />
        <SettingsRow
          title={tr("settings.language")}
          description={tr("settings.languageHint")}
          control={
            <SettingsSelect
              testId="appearance-locale"
              value={props.locale}
              onChange={(v) => props.onLocale(v as Locale)}
              options={[
                { value: "zh", label: tr("appearance.languageZh") },
                { value: "en", label: tr("appearance.languageEn") },
              ]}
            />
          }
        />
        <SettingsRow
          title={tr("settings.preventSleep")}
          description={tr("settings.preventSleepHint")}
          control={
            <SettingsToggle
              checked={preventSleep}
              onChange={(next) => {
                setPreventSleep(next);
                savePreventSleep(next);
              }}
              testId="settings-prevent-sleep"
              aria-label={tr("settings.preventSleep")}
            />
          }
        />
        <SettingsRow
          title={tr("settings.suggestions")}
          description={tr("settings.suggestionsHint")}
          control={
            <SettingsToggle
              checked={suggestions}
              onChange={(next) => {
                setSuggestions(next);
                saveSuggestions(next);
              }}
              testId="settings-suggestions"
              aria-label={tr("settings.suggestions")}
            />
          }
          last
        />
      </SettingsSectionBlock>

      <SettingsSectionBlock label={tr("settings.section.editor")} testId="settings-editor">
        <SettingsRow
          title={tr("settings.showContextUsage")}
          description={tr("settings.showContextUsageHint")}
          control={
            <SettingsToggle
              checked={props.showContextUsage}
              onChange={props.onShowContextUsage}
              testId="settings-show-context-usage"
              aria-label={tr("settings.showContextUsage")}
            />
          }
          last
        />
      </SettingsSectionBlock>
    </SettingsPageShell>
  );
}

function AppearanceSection(
  props: SettingsPageProps & { tr: (key: MessageKey, vars?: Record<string, string>) => string },
) {
  const { tr } = props;
  const [prefs, setPrefs] = useState<AppearancePrefs>(loadAppearancePrefs);
  const [appScale, setAppScale] = useState(100);
  const appScaleRequestRef = useRef(0);
  const [uiFontChoices, setUiFontChoices] = useState<AppearanceFontChoice[]>(() => [
    {
      id: SYSTEM_APPEARANCE_FONT_ID,
      family: DEFAULT_UI_FONT_FAMILY,
      label: tr("appearance.font.system"),
    },
  ]);
  const [codeFontChoices, setCodeFontChoices] = useState<AppearanceFontChoice[]>(() => [
    {
      id: SYSTEM_APPEARANCE_FONT_ID,
      family: DEFAULT_CODE_FONT_FAMILY,
      label: tr("appearance.font.system"),
    },
  ]);
  const [uiFontsLoading, setUiFontsLoading] = useState(true);
  const [codeFontsLoading, setCodeFontsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const request = ++appScaleRequestRef.current;
    void window.zeno.appearance
      .getAppScale()
      .then((scale) => {
        if (!cancelled && request === appScaleRequestRef.current) setAppScale(scale);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setUiFontsLoading(true);
    setCodeFontsLoading(true);
    const systemLabel = tr("appearance.font.system");
    void listInstalledUiFonts(systemLabel).then((list) => {
      if (cancelled) return;
      setUiFontChoices(list);
      setUiFontsLoading(false);
    });
    void listInstalledCodeFonts(systemLabel).then((list) => {
      if (cancelled) return;
      setCodeFontChoices(list);
      setCodeFontsLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // Re-scan when locale label for "system" changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tr identity is unstable; use locale
  }, [props.locale]);

  function update(patch: Partial<AppearancePrefs>) {
    setPrefs(patchAppearancePrefs(patch));
  }

  function updateAppScale(value: string) {
    const scale = Number(value);
    if (!Number.isFinite(scale)) return;
    const request = ++appScaleRequestRef.current;
    setAppScale(scale);
    void window.zeno.appearance
      .setAppScale(scale)
      .then((savedScale) => {
        if (request === appScaleRequestRef.current) setAppScale(savedScale);
      })
      .catch(() => undefined);
  }

  const uiFontSizeOptions = Array.from(
    { length: UI_FONT_SIZE_MAX - UI_FONT_SIZE_MIN + 1 },
    (_, i) => {
      const n = UI_FONT_SIZE_MIN + i;
      return { value: String(n), label: `${n}px` };
    },
  );
  const codeFontSizeOptions = Array.from(
    { length: CODE_FONT_SIZE_MAX - CODE_FONT_SIZE_MIN + 1 },
    (_, i) => {
      const n = CODE_FONT_SIZE_MIN + i;
      return { value: String(n), label: `${n}px` };
    },
  );

  const uiFontChoiceId = matchAppearanceFontChoiceId(
    prefs.uiFontFamily,
    uiFontChoices,
    DEFAULT_UI_FONT_FAMILY,
  );
  const uiFontFamilyOptions = uiFontChoices.map((c) => ({
    value: c.id,
    label: c.id === SYSTEM_APPEARANCE_FONT_ID ? tr("appearance.font.system") : c.label,
  }));
  if (
    uiFontChoiceId !== SYSTEM_APPEARANCE_FONT_ID &&
    !uiFontFamilyOptions.some((o) => o.value === uiFontChoiceId)
  ) {
    uiFontFamilyOptions.push({ value: uiFontChoiceId, label: uiFontChoiceId });
  }

  const codeFontChoiceId = matchAppearanceFontChoiceId(
    prefs.codeFontFamily,
    codeFontChoices,
    DEFAULT_CODE_FONT_FAMILY,
  );
  const codeFontFamilyOptions = codeFontChoices.map((c) => ({
    value: c.id,
    label: c.id === SYSTEM_APPEARANCE_FONT_ID ? tr("appearance.font.system") : c.label,
  }));
  if (
    codeFontChoiceId !== SYSTEM_APPEARANCE_FONT_ID &&
    !codeFontFamilyOptions.some((o) => o.value === codeFontChoiceId)
  ) {
    codeFontFamilyOptions.push({ value: codeFontChoiceId, label: codeFontChoiceId });
  }

  return (
    <SettingsPageShell title={tr("section.appearance")} testId="settings-appearance">
      <SettingsSectionBlock label={tr("appearance.theme")}>
        <SettingsRow
          title={tr("appearance.theme")}
          description={tr("settings.themeHint")}
          control={
            <SettingsSelect
              testId="appearance-theme"
              value={props.themePreference}
              onChange={(v) => props.onThemePreference(v as ThemePreference)}
              options={[
                { value: "system", label: tr("appearance.themeSystem") },
                { value: "dark", label: tr("appearance.themeDark") },
                { value: "light", label: tr("appearance.themeLight") },
              ]}
            />
          }
          last
        />
      </SettingsSectionBlock>

      <ThemeSkinStudio
        locale={props.locale}
        colorMode={props.colorMode}
        selection={props.themeSelection}
        library={props.themeLibrary}
        sidebarTranslucent={props.sidebarTranslucent}
        onSelection={props.onThemeSelection}
        onLibrary={props.onThemeLibrary}
        onPreview={props.onThemePreview}
      />

      <SettingsSectionBlock label={tr("appearance.appScaleSection")}>
        <SettingsRow
          title={tr("appearance.appScale")}
          description={tr("appearance.appScaleHint")}
          control={
            <SettingsSelect
              value={String(appScale)}
              onChange={updateAppScale}
              options={APP_SCALE_OPTIONS.map((scale) => ({
                value: String(scale),
                label: `${scale}%`,
              }))}
              testId="appearance-app-scale"
              size="sm"
            />
          }
          last
        />
      </SettingsSectionBlock>

      <SettingsSectionBlock
        label={tr("appearance.typography")}
        testId="settings-appearance-typography"
      >
        <SettingsRow
          title={tr("appearance.uiFontFamily")}
          description={
            uiFontsLoading
              ? tr("appearance.uiFontFamilyLoading")
              : tr("appearance.uiFontFamilyHint")
          }
          control={
            <SettingsSelect
              value={uiFontChoiceId}
              onChange={(id) => {
                const choice = uiFontChoices.find((c) => c.id === id);
                if (choice) {
                  update({ uiFontFamily: choice.family });
                  return;
                }
                if (id && id !== SYSTEM_APPEARANCE_FONT_ID) {
                  update({
                    uiFontFamily: `"${id.replace(/"/g, "")}", system-ui, sans-serif`,
                  });
                } else {
                  update({ uiFontFamily: DEFAULT_APPEARANCE_PREFS.uiFontFamily });
                }
              }}
              options={uiFontFamilyOptions}
              testId="appearance-ui-font-family"
              size="lg"
              disabled={uiFontsLoading && uiFontChoices.length <= 1}
            />
          }
        />
        <SettingsRow
          title={tr("appearance.uiFontSize")}
          description={tr("appearance.uiFontSizeHint")}
          control={
            <SettingsSelect
              value={String(prefs.uiFontSize)}
              onChange={(v) => update({ uiFontSize: Number(v) })}
              options={uiFontSizeOptions}
              testId="appearance-ui-font-size"
              size="sm"
            />
          }
        />
        <SettingsRow
          title={tr("appearance.codeFontFamily")}
          description={
            codeFontsLoading
              ? tr("appearance.codeFontFamilyLoading")
              : tr("appearance.codeFontFamilyHint")
          }
          control={
            <SettingsSelect
              value={codeFontChoiceId}
              onChange={(id) => {
                const choice = codeFontChoices.find((c) => c.id === id);
                if (choice) {
                  update({ codeFontFamily: choice.family });
                  return;
                }
                if (id && id !== SYSTEM_APPEARANCE_FONT_ID) {
                  update({
                    codeFontFamily: `"${id.replace(/"/g, "")}", ui-monospace, monospace`,
                  });
                } else {
                  update({ codeFontFamily: DEFAULT_APPEARANCE_PREFS.codeFontFamily });
                }
              }}
              options={codeFontFamilyOptions}
              testId="appearance-code-font-family"
              size="lg"
              disabled={codeFontsLoading && codeFontChoices.length <= 1}
            />
          }
        />
        <SettingsRow
          title={tr("appearance.codeFontSize")}
          description={tr("appearance.codeFontSizeHint")}
          control={
            <SettingsSelect
              value={String(prefs.codeFontSize)}
              onChange={(v) => update({ codeFontSize: Number(v) })}
              options={codeFontSizeOptions}
              testId="appearance-code-font-size"
              size="sm"
            />
          }
          last
        />
      </SettingsSectionBlock>

      <SettingsSectionBlock label={tr("appearance.sidebarTranslucent")}>
        <SettingsRow
          title={tr("appearance.sidebarTranslucent")}
          description={tr("appearance.sidebarTranslucentHint")}
          control={
            <SettingsToggle
              checked={props.sidebarTranslucent}
              onChange={props.onTranslucent}
              testId="appearance-translucent"
              aria-label={tr("appearance.sidebarTranslucent")}
            />
          }
        />
        <SettingsRow
          title={tr("appearance.sidebarWidth")}
          description={
            <div className="mt-2 flex items-center gap-3">
              <SettingsInput
                type="range"
                min={232}
                max={360}
                step={4}
                data-testid="appearance-sidebar-width"
                className="min-w-0 flex-1"
                value={props.sidebarWidthPx}
                onChange={(e) => props.onSidebarWidth(Number(e.target.value))}
              />
              <span className="shrink-0 tabular-nums text-[12px] text-[var(--muted-foreground)]">
                {props.sidebarWidthPx}px
              </span>
            </div>
          }
          control={<span className="sr-only">{props.sidebarWidthPx}</span>}
          last
        />
      </SettingsSectionBlock>
    </SettingsPageShell>
  );
}

type OAuthPromptUpdate = Extract<ProviderOAuthUpdate, { stage: "prompt" }>;
type OAuthAuthUrlUpdate = Extract<ProviderOAuthUpdate, { stage: "auth_url" }>;
type OAuthDeviceCodeUpdate = Extract<ProviderOAuthUpdate, { stage: "device_code" }>;

interface OAuthDialogState {
  operationId: string;
  provider: string;
  displayName: string;
  prompt?: OAuthPromptUpdate;
  authUrl?: OAuthAuthUrlUpdate;
  deviceCode?: OAuthDeviceCodeUpdate;
  message?: string;
  links?: Array<{ url: string; label?: string }>;
  terminal?: "complete" | "error" | "cancelled";
}

function applyOAuthEvent(state: OAuthDialogState, event: ProviderOAuthEvent): OAuthDialogState {
  if (event.operationId !== state.operationId) return state;
  const { update } = event;
  switch (update.stage) {
    case "prompt": {
      const next = { ...state, prompt: update };
      delete next.message;
      return next;
    }
    case "auth_url":
      return { ...state, authUrl: update };
    case "device_code":
      return { ...state, deviceCode: update };
    case "info":
      return {
        ...state,
        message: update.message,
        ...(update.links ? { links: update.links } : {}),
      };
    case "progress":
      return { ...state, message: update.message };
    case "complete": {
      const next: OAuthDialogState = { ...state, terminal: "complete" };
      delete next.prompt;
      delete next.message;
      return next;
    }
    case "error": {
      const next: OAuthDialogState = { ...state, terminal: "error", message: update.message };
      delete next.prompt;
      return next;
    }
    case "cancelled": {
      const next: OAuthDialogState = { ...state, terminal: "cancelled" };
      delete next.prompt;
      delete next.message;
      return next;
    }
  }
}

type ProviderAuthControls = {
  getProvider: (provider: string) => ProviderAuthSummary | undefined;
  loading: boolean;
  openConfig: (provider: string) => void;
  refresh: () => Promise<void>;
};

function ProviderAuthScope(
  props: SettingsPageProps & {
    tr: (key: MessageKey, vars?: Record<string, string>) => string;
    children: (controls: ProviderAuthControls) => ReactNode;
  },
) {
  const { tr } = props;
  const [providers, setProviders] = useState<ProviderAuthSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [configProvider, setConfigProvider] = useState<ProviderAuthSummary>();
  const [apiKey, setApiKey] = useState("");
  const [oauthDialog, setOAuthDialog] = useState<OAuthDialogState>();
  const [oauthValue, setOAuthValue] = useState("");
  const [oauthBusy, setOAuthBusy] = useState(false);
  const oauthOperationId = useRef<string | undefined>(undefined);
  const openedOAuthUrls = useRef(new Set<string>());
  const showAppError = useShellStore((s) => s.showAppError);

  async function refreshProviders() {
    setLoading(true);
    try {
      await props.onEnsureHost();
      const list = await window.zeno.providers.list();
      setProviders(list);
      for (const row of list) {
        if ("key" in row || "apiKey" in row || "token" in row) {
          throw new Error("Provider projection leaked secrets");
        }
      }
    } catch (error) {
      showAppError(error instanceof Error ? error.message : "Failed to list providers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return window.zeno.providers.onOAuthEvent((event) => {
      if (event.operationId !== oauthOperationId.current) return;
      setOAuthBusy(false);
      setOAuthDialog((current) => (current ? applyOAuthEvent(current, event) : current));
      if (event.update.stage === "prompt") setOAuthValue("");
      const url =
        event.update.stage === "auth_url"
          ? event.update.url
          : event.update.stage === "device_code"
            ? event.update.verificationUri
            : undefined;
      if (url && !openedOAuthUrls.current.has(url)) {
        openedOAuthUrls.current.add(url);
        void window.zeno.workspace.openExternal(url).catch((error: unknown) => {
          showAppError(error instanceof Error ? error.message : "Failed to open OAuth URL");
        });
      }
      if (event.update.stage === "complete") {
        void window.zeno.providers
          .list()
          .then(setProviders)
          .catch((error: unknown) => {
            showAppError(error instanceof Error ? error.message : "Failed to refresh providers");
          });
      }
    });
  }, [showAppError]);

  async function saveApiKey(event: FormEvent) {
    event.preventDefault();
    if (!configProvider || !apiKey.trim()) {
      showAppError(tr("auth.apiKeyRequired"));
      return;
    }
    setLoading(true);
    try {
      const list = await window.zeno.providers.setApiKey(configProvider.provider, apiKey.trim());
      setProviders(list);
      setConfigProvider(list.find((item) => item.provider === configProvider.provider));
      setApiKey("");
    } catch (error) {
      showAppError(error instanceof Error ? error.message : "Failed to save API key");
    } finally {
      setLoading(false);
    }
  }

  function openConfig(providerId: string) {
    const provider = providers.find((item) => item.provider === providerId);
    if (!provider) {
      showAppError(`Provider ${providerId} is unavailable`);
      return;
    }
    setApiKey("");
    setConfigProvider(provider);
  }

  function closeConfig() {
    if (loading) return;
    setApiKey("");
    setConfigProvider(undefined);
  }

  async function clearAuth(provider: string) {
    setLoading(true);
    try {
      const list = await window.zeno.providers.clearAuth(provider);
      setProviders(list);
      setConfigProvider(list.find((item) => item.provider === provider));
    } catch (error) {
      showAppError(error instanceof Error ? error.message : "Failed to clear auth");
    } finally {
      setLoading(false);
    }
  }

  async function startOAuth(provider: ProviderAuthSummary) {
    const operationId = crypto.randomUUID();
    oauthOperationId.current = operationId;
    openedOAuthUrls.current.clear();
    setOAuthValue("");
    setOAuthBusy(true);
    setConfigProvider(undefined);
    setOAuthDialog({
      operationId,
      provider: provider.provider,
      displayName: provider.displayName,
    });
    try {
      await window.zeno.providers.startOAuth(provider.provider, operationId);
    } catch (error) {
      setOAuthBusy(false);
      setOAuthDialog((current) =>
        current?.operationId === operationId
          ? {
              ...current,
              terminal: "error",
              message: error instanceof Error ? error.message : "Failed to start OAuth login",
            }
          : current,
      );
    }
  }

  async function respondOAuth(prompt: OAuthPromptUpdate, value: string, cancelled = false) {
    if (!oauthDialog) return;
    setOAuthBusy(true);
    try {
      await window.zeno.providers.respondOAuth(
        oauthDialog.operationId,
        prompt.promptId,
        value,
        cancelled,
      );
    } catch (error) {
      setOAuthBusy(false);
      showAppError(error instanceof Error ? error.message : "Failed to continue OAuth login");
    }
  }

  function closeOAuthDialog() {
    const dialog = oauthDialog;
    oauthOperationId.current = undefined;
    setOAuthDialog(undefined);
    setOAuthBusy(false);
    setOAuthValue("");
    if (dialog && !dialog.terminal) {
      void window.zeno.providers.cancelOAuth(dialog.operationId).catch(() => undefined);
    }
  }

  const oauthPrompt: ProviderOAuthPrompt | undefined = oauthDialog?.prompt?.prompt;

  return (
    <>
      {props.children({
        getProvider: (provider) => providers.find((item) => item.provider === provider),
        loading,
        openConfig,
        refresh: refreshProviders,
      })}

      {configProvider && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/50 p-4"
              data-testid="provider-config-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="provider-config-dialog-title"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeConfig();
              }}
            >
              <form
                className="provider-oauth-dialog surface-panel w-full max-w-[32rem] overflow-hidden shadow-2xl"
                data-testid="provider-key-form"
                onSubmit={(event) => void saveApiKey(event)}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="provider-oauth-header">
                  <div className="provider-oauth-heading">
                    <span className="provider-oauth-icon" aria-hidden>
                      <LogIn size={17} strokeWidth={1.8} />
                    </span>
                    <div>
                      <h2 id="provider-config-dialog-title" className="provider-oauth-title">
                        {configProvider.displayName}
                      </h2>
                      <p>{configProvider.provider}</p>
                    </div>
                  </div>
                  <SettingsIconButton
                    className="provider-oauth-close"
                    aria-label={tr("common.cancel")}
                    disabled={loading}
                    onClick={closeConfig}
                  >
                    <X size={16} />
                  </SettingsIconButton>
                </div>

                <div className="provider-oauth-body">
                  <label className="provider-oauth-prompt">
                    <span>{tr("auth.apiKey")}</span>
                    <div className="provider-oauth-input-row">
                      <SettingsInput
                        data-testid="provider-api-key-input"
                        type="password"
                        autoComplete="off"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        disabled={loading}
                        placeholder="••••••••"
                      />
                      <SettingsButton
                        type="submit"
                        variant="default"
                        testId="provider-save-key"
                        disabled={loading || !apiKey.trim()}
                      >
                        {loading ? tr("auth.saving") : tr("auth.saveKey")}
                      </SettingsButton>
                    </div>
                  </label>
                </div>

                <div
                  className="provider-oauth-footer provider-config-footer"
                  data-testid="provider-config-footer"
                >
                  <div className="provider-config-footer-left">
                    {configProvider.oauthSupported ? (
                      <SettingsPillButton
                        label={
                          configProvider.oauthActive
                            ? tr("auth.oauthRelogin")
                            : tr("auth.oauthSignIn")
                        }
                        testId={`provider-oauth-${configProvider.provider}`}
                        disabled={loading || Boolean(oauthDialog)}
                        onClick={() => void startOAuth(configProvider)}
                      />
                    ) : null}
                  </div>
                  <div className="provider-config-footer-right">
                    <SettingsPillButton
                      label={tr("auth.clear")}
                      danger
                      testId={`provider-clear-${configProvider.provider}`}
                      disabled={loading || !configProvider.configured}
                      onClick={() => void clearAuth(configProvider.provider)}
                    />
                    <SettingsPillButton
                      label={tr("common.cancel")}
                      disabled={loading}
                      onClick={closeConfig}
                    />
                  </div>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}

      {oauthDialog && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/50 p-4"
              data-testid="provider-oauth-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="provider-oauth-dialog-title"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeOAuthDialog();
              }}
            >
              <div
                className="provider-oauth-dialog surface-panel w-full max-w-[32rem] overflow-hidden shadow-2xl"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="provider-oauth-header">
                  <div className="provider-oauth-heading">
                    <span className="provider-oauth-icon" aria-hidden>
                      <LogIn size={17} strokeWidth={1.8} />
                    </span>
                    <div>
                      <h2 id="provider-oauth-dialog-title" className="provider-oauth-title">
                        {tr("auth.oauthTitle", { provider: oauthDialog.displayName })}
                      </h2>
                      <p>{tr("auth.oauthHint")}</p>
                    </div>
                  </div>
                  <SettingsIconButton
                    className="provider-oauth-close"
                    aria-label={tr("auth.oauthClose")}
                    onClick={closeOAuthDialog}
                  >
                    <X size={16} />
                  </SettingsIconButton>
                </div>

                <div className="provider-oauth-body">
                  {!oauthDialog.terminal && oauthDialog.authUrl ? (
                    <div className="provider-oauth-step" data-testid="provider-oauth-browser-step">
                      <div className="provider-oauth-step-copy">
                        <strong>{tr("auth.oauthBrowser")}</strong>
                        <span>
                          {oauthDialog.authUrl.instructions || tr("auth.oauthBrowserHint")}
                        </span>
                      </div>
                      <SettingsButton
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          void window.zeno.workspace.openExternal(oauthDialog.authUrl?.url ?? "")
                        }
                      >
                        <ExternalLink size={13} />
                        {tr("auth.oauthOpenBrowser")}
                      </SettingsButton>
                    </div>
                  ) : null}

                  {!oauthDialog.terminal && oauthDialog.deviceCode ? (
                    <div className="provider-oauth-device" data-testid="provider-oauth-device-step">
                      <span>{tr("auth.oauthDeviceCode")}</span>
                      <SettingsButton
                        type="button"
                        variant="outline"
                        className="provider-oauth-code h-auto"
                        testId="provider-oauth-device-code"
                        onClick={() =>
                          void navigator.clipboard.writeText(oauthDialog.deviceCode?.userCode ?? "")
                        }
                      >
                        {oauthDialog.deviceCode.userCode}
                        <Copy size={14} />
                      </SettingsButton>
                      <SettingsButton
                        type="button"
                        variant="link"
                        className="provider-oauth-link h-auto p-0"
                        onClick={() =>
                          void window.zeno.workspace.openExternal(
                            oauthDialog.deviceCode?.verificationUri ?? "",
                          )
                        }
                      >
                        {oauthDialog.deviceCode.verificationUri}
                        <ExternalLink size={12} />
                      </SettingsButton>
                    </div>
                  ) : null}

                  {oauthDialog.message ? (
                    <div
                      className={cn(
                        "provider-oauth-message",
                        oauthDialog.terminal === "error" && "provider-oauth-message-error",
                      )}
                      data-testid="provider-oauth-message"
                    >
                      <p className="m-0">{oauthDialog.message}</p>
                      {oauthDialog.terminal === "error" &&
                      /fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|network|proxy/i.test(
                        oauthDialog.message,
                      ) ? (
                        <p
                          className="m-0 mt-2 opacity-90"
                          data-testid="provider-oauth-network-hint"
                        >
                          {tr("auth.oauthNetworkHint")}
                          {oauthDialog.provider === "xai"
                            ? ` ${tr("auth.oauthNetworkHintXai")}`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {!oauthDialog.terminal && oauthDialog.links?.length ? (
                    <div className="provider-oauth-links">
                      {oauthDialog.links.map((link) => (
                        <SettingsButton
                          key={link.url}
                          type="button"
                          variant="link"
                          className="h-auto p-0"
                          onClick={() => void window.zeno.workspace.openExternal(link.url)}
                        >
                          {link.label || link.url}
                          <ExternalLink size={12} />
                        </SettingsButton>
                      ))}
                    </div>
                  ) : null}

                  {oauthDialog.terminal === "complete" ? (
                    <div className="provider-oauth-result" data-testid="provider-oauth-complete">
                      <span className="provider-oauth-result-icon provider-oauth-result-success">
                        <Check size={19} strokeWidth={2} />
                      </span>
                      <div>
                        <strong>{tr("auth.oauthSuccess")}</strong>
                        <p>{tr("auth.oauthSuccessHint")}</p>
                      </div>
                    </div>
                  ) : oauthDialog.terminal === "cancelled" ? (
                    <div className="provider-oauth-result" data-testid="provider-oauth-cancelled">
                      <span className="provider-oauth-result-icon">
                        <X size={18} />
                      </span>
                      <div>
                        <strong>{tr("auth.oauthCancelled")}</strong>
                      </div>
                    </div>
                  ) : null}

                  {!oauthDialog.terminal && oauthPrompt?.type === "select" ? (
                    <div className="provider-oauth-prompt" data-testid="provider-oauth-select">
                      <strong>{oauthPrompt.message}</strong>
                      <div className="provider-oauth-options">
                        {oauthPrompt.options.map((option) => (
                          <SettingsButton
                            key={option.id}
                            type="button"
                            variant="outline"
                            className="h-auto w-full justify-between"
                            disabled={oauthBusy}
                            onClick={() => void respondOAuth(oauthDialog.prompt!, option.id, false)}
                          >
                            <span className="flex min-w-0 flex-col items-start text-left">
                              <span>{option.label}</span>
                              {option.description ? <small>{option.description}</small> : null}
                            </span>
                            <ChevronRight size={15} />
                          </SettingsButton>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {!oauthDialog.terminal && oauthPrompt && oauthPrompt.type !== "select" ? (
                    <form
                      className="provider-oauth-prompt"
                      data-testid="provider-oauth-prompt"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (oauthDialog.prompt) {
                          void respondOAuth(oauthDialog.prompt, oauthValue, false);
                        }
                      }}
                    >
                      <label htmlFor="provider-oauth-input">{oauthPrompt.message}</label>
                      <div className="provider-oauth-input-row">
                        <SettingsInput
                          id="provider-oauth-input"
                          data-testid="provider-oauth-input"
                          type={oauthPrompt.type === "secret" ? "password" : "text"}
                          value={oauthValue}
                          placeholder={oauthPrompt.placeholder}
                          autoComplete="off"
                          autoFocus
                          disabled={oauthBusy}
                          onChange={(event) => setOAuthValue(event.target.value)}
                        />
                        <SettingsButton
                          type="submit"
                          variant="default"
                          testId="provider-oauth-continue"
                          disabled={oauthBusy}
                        >
                          {tr("auth.oauthContinue")}
                        </SettingsButton>
                      </div>
                    </form>
                  ) : null}

                  {!oauthDialog.terminal && !oauthPrompt ? (
                    <div className="provider-oauth-waiting" data-testid="provider-oauth-waiting">
                      <LoaderCircle className="animate-spin" size={16} />
                      <span>{tr("auth.oauthWaiting")}</span>
                    </div>
                  ) : null}
                </div>

                <div className="provider-oauth-footer">
                  <SettingsPillButton
                    label={oauthDialog.terminal ? tr("auth.oauthClose") : tr("common.cancel")}
                    onClick={closeOAuthDialog}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function ProviderAuthSummaryRow(props: {
  provider: ProviderAuthSummary | undefined;
  loading: boolean;
  onConfigure: (provider: string) => void;
  tr: (key: MessageKey, vars?: Record<string, string>) => string;
}) {
  const { provider, tr } = props;
  if (!provider) return null;
  return (
    <div className="settings-row" data-testid={`provider-row-${provider.provider}`}>
      <div className="settings-row-copy min-w-0 flex-1">
        <div className="settings-row-title">{tr("section.auth")}</div>
        <div className="settings-row-desc">
          {provider.provider}
          {provider.source ? ` · ${provider.source}` : ""}
          {provider.oauthActive ? ` · ${tr("auth.oauthActive")}` : ""}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <SettingsPillButton
          label={tr("auth.configure")}
          testId={`provider-configure-${provider.provider}`}
          disabled={props.loading}
          onClick={() => props.onConfigure(provider.provider)}
        />
      </div>
    </div>
  );
}

/** Full pi API Types (docs/custom-provider.md) — order matches common custom use first. */
const CUSTOM_MODEL_API_OPTIONS: Array<{ value: CustomModelApi; label: string }> = [
  { value: "openai-completions", label: "openai-completions" },
  { value: "openai-responses", label: "openai-responses" },
  { value: "anthropic-messages", label: "anthropic-messages" },
  { value: "google-generative-ai", label: "google-generative-ai" },
  { value: "azure-openai-responses", label: "azure-openai-responses" },
  { value: "openai-codex-responses", label: "openai-codex-responses" },
  { value: "mistral-conversations", label: "mistral-conversations" },
  { value: "google-vertex", label: "google-vertex" },
  { value: "bedrock-converse-stream", label: "bedrock-converse-stream" },
];

const CUSTOM_MODEL_API_VALUES = new Set<string>(CUSTOM_MODEL_API_OPTIONS.map((opt) => opt.value));
const MANUAL_MODEL_CATALOG_VALUE = "__pix_manual_model__";
/** Same rule as agent-runtime upsertCustomProviderInModelsJson. */
const CUSTOM_PROVIDER_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

type PiCatalogModel = ModelSummary & {
  api: CustomModelApi;
  input: Array<"text" | "image">;
  contextWindow: number;
  maxTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
};

function modelCatalogKey(model: Pick<ModelSummary, "provider" | "id">): string {
  return `${model.provider}/${model.id}`;
}

/** Only offer catalog records that can be written back to pi's custom-provider format. */
function isPiCatalogModel(model: ModelSummary): model is PiCatalogModel {
  const cost = model.cost;
  return (
    model.source === "builtin" &&
    CUSTOM_MODEL_API_VALUES.has(model.api ?? "") &&
    Array.isArray(model.input) &&
    model.input.length > 0 &&
    model.input.every((input) => input === "text" || input === "image") &&
    typeof model.contextWindow === "number" &&
    model.contextWindow > 0 &&
    typeof model.maxTokens === "number" &&
    model.maxTokens > 0 &&
    typeof cost?.input === "number" &&
    typeof cost?.output === "number" &&
    typeof cost?.cacheRead === "number" &&
    typeof cost?.cacheWrite === "number"
  );
}

function findCatalogModelForId(
  catalog: PiCatalogModel[],
  modelId: string,
): PiCatalogModel | undefined {
  const matches = catalog.filter((model) => model.id === modelId);
  return matches.length === 1 ? matches[0] : undefined;
}

/** Split enabledModels into exact provider/id picks vs free-form globs (pi-style). */
function splitEnabledModels(
  patterns: string[],
  catalog: ModelSummary[],
): { exact: Set<string>; globs: string[] } {
  const catalogKeys = new Set(catalog.map((m) => `${m.provider}/${m.id}`));
  const exact = new Set<string>();
  const globs: string[] = [];
  for (const raw of patterns) {
    const pattern = raw.trim();
    if (!pattern) continue;
    const bare = (pattern.split(":")[0] ?? pattern).trim();
    const isGlob = bare.includes("*") || bare.includes("?") || bare.includes("[");
    if (isGlob) {
      globs.push(pattern);
      continue;
    }
    if (bare.includes("/") && catalogKeys.has(bare)) {
      exact.add(bare);
      if (pattern.includes(":")) globs.push(pattern);
      continue;
    }
    const idMatches = catalog.filter((m) => m.id === bare);
    if (idMatches.length === 1) {
      exact.add(`${idMatches[0]!.provider}/${idMatches[0]!.id}`);
      if (pattern.includes(":")) globs.push(pattern);
      continue;
    }
    globs.push(pattern);
  }
  return { exact, globs };
}

function buildEnabledModelsPatterns(selected: Set<string>, globText: string): string[] {
  const globs = globText
    .split(/[\n,]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const exact = [...selected].sort((a, b) => a.localeCompare(b));
  const extra = globs.filter((line) => {
    const bare = (line.split(":")[0] ?? line).trim();
    if (selected.has(bare)) return line.includes(":");
    return true;
  });
  return [...exact, ...extra];
}

function ModelsSectionContent(
  props: SettingsPageProps & {
    tr: (key: MessageKey, vars?: Record<string, string>) => string;
    auth: ProviderAuthControls;
  },
) {
  const { tr } = props;
  const [models, setModels] = useState<ModelSummary[]>([]);
  /** Exact provider/id picks for pi enabledModels (fast-switch scope). */
  const [scopedSelected, setScopedSelected] = useState<Set<string>>(() => new Set());
  /** Free-form globs / bare ids / thinking suffixes (wildcard mode). */
  const [scopedGlobText, setScopedGlobText] = useState("");
  const [scopedBusy, setScopedBusy] = useState(false);
  const [defaultKey, setDefaultKey] = useState("");
  const [query, setQuery] = useState("");
  const [expandedProviderGroups, setExpandedProviderGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogBusy, setDialogBusy] = useState(false);
  /** When set, dialog is editing this models.json entry. */
  const [editingOrigin, setEditingOrigin] = useState<{ provider: string; modelId: string } | null>(
    null,
  );
  const [providerId, setProviderId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [api, setApi] = useState<CustomModelApi>("openai-completions");
  const [apiKey, setApiKey] = useState("");
  const [authHeader, setAuthHeader] = useState(false);
  const [authHeaderTouched, setAuthHeaderTouched] = useState(false);
  /** HTTP User-Agent for proxy providers; default ZenoDesktop/{appVersion}. */
  const [userAgent, setUserAgent] = useState("ZenoDesktop/0.0.0");
  const [appVersion, setAppVersion] = useState("0.0.0");
  const [catalogModelKey, setCatalogModelKey] = useState(MANUAL_MODEL_CATALOG_VALUE);
  const [modelSuggestionsOpen, setModelSuggestionsOpen] = useState(false);
  const [activeCatalogModelIndex, setActiveCatalogModelIndex] = useState(0);
  const modelIdInputRef = useRef<HTMLInputElement>(null);
  const modelSuggestionsContentRef = useRef<HTMLDivElement>(null);
  const [modelId, setModelId] = useState("");
  const [modelName, setModelName] = useState("");
  const [reasoning, setReasoning] = useState(false);
  const [inputMode, setInputMode] = useState<"text" | "text-image">("text");
  const [contextWindow, setContextWindow] = useState("128000");
  const [maxTokens, setMaxTokens] = useState("16384");
  const [costInput, setCostInput] = useState("0");
  const [costOutput, setCostOutput] = useState("0");
  const [costCacheRead, setCostCacheRead] = useState("0");
  const [costCacheWrite, setCostCacheWrite] = useState("0");
  const sessionKey =
    props.snapshot?.model != null
      ? `${props.snapshot.model.provider}/${props.snapshot.model.id}`
      : "";
  const catalogModels = useMemo(() => models.filter(isPiCatalogModel), [models]);
  const selectedCatalogModel = useMemo(
    () => catalogModels.find((model) => modelCatalogKey(model) === catalogModelKey),
    [catalogModelKey, catalogModels],
  );
  const matchingCatalogModels = useMemo(() => {
    const query = modelId.trim().toLowerCase();
    if (!query) return catalogModels;
    return catalogModels.filter((model) =>
      `${model.id} ${model.provider}`.toLowerCase().includes(query),
    );
  }, [catalogModels, modelId]);
  const catalogMetadataLocked = selectedCatalogModel !== undefined;

  const showAppError = useShellStore((s) => s.showAppError);

  function localizeCustomModelError(message: string): string {
    // Backend models-json throws English; map known validation strings for locale UI.
    if (
      message.includes("Provider id must start with a letter or digit") ||
      message.includes("use only letters, digits")
    ) {
      return tr("models.customProviderInvalid");
    }
    if (
      message === "Provider id is required" ||
      message === "Base URL is required" ||
      message === "Model id is required"
    ) {
      return tr("models.customRequired");
    }
    if (message.startsWith("Unsupported API type:")) {
      return message;
    }
    return message;
  }

  function showError(err: unknown, fallback: string) {
    const raw = err instanceof Error ? err.message : fallback;
    const stripped =
      raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/i, "").trim() || fallback;
    showAppError(localizeCustomModelError(stripped));
  }

  function parseOptionalNumber(raw: string): number | undefined {
    const t = raw.trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  }

  function defaultUserAgent(version = appVersion): string {
    const v = version.replace(/^v/i, "").trim() || "0.0.0";
    return `ZenoDesktop/${v}`;
  }

  function resetCustomForm() {
    setEditingOrigin(null);
    setProviderId("");
    setBaseUrl("");
    setApi("openai-completions");
    setApiKey("");
    setAuthHeader(false);
    setAuthHeaderTouched(false);
    setUserAgent(defaultUserAgent());
    setCatalogModelKey(MANUAL_MODEL_CATALOG_VALUE);
    setModelSuggestionsOpen(false);
    setActiveCatalogModelIndex(0);
    setModelId("");
    setModelName("");
    setReasoning(false);
    setInputMode("text");
    setContextWindow("128000");
    setMaxTokens("16384");
    setCostInput("0");
    setCostOutput("0");
    setCostCacheRead("0");
    setCostCacheWrite("0");
  }

  function applyCatalogModel(model: PiCatalogModel) {
    setCatalogModelKey(modelCatalogKey(model));
    setModelId(model.id);
    setModelName(model.name || model.id);
    setApi(model.api);
    setReasoning(model.reasoning);
    setInputMode(model.input.includes("image") ? "text-image" : "text");
    setContextWindow(String(model.contextWindow));
    setMaxTokens(String(model.maxTokens));
    setCostInput(String(model.cost.input));
    setCostOutput(String(model.cost.output));
    setCostCacheRead(String(model.cost.cacheRead));
    setCostCacheWrite(String(model.cost.cacheWrite));
  }

  function setModelIdFromInput(value: string) {
    setCatalogModelKey(MANUAL_MODEL_CATALOG_VALUE);
    setModelId(value);
    setModelSuggestionsOpen(true);
    setActiveCatalogModelIndex(0);
  }

  function chooseCatalogModel(model: PiCatalogModel) {
    applyCatalogModel(model);
    setModelSuggestionsOpen(false);
    setActiveCatalogModelIndex(0);
  }

  function handleModelIdKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    const count = matchingCatalogModels.length;
    if (event.key === "Escape") {
      setModelSuggestionsOpen(false);
      return;
    }
    if (!modelSuggestionsOpen || count === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveCatalogModelIndex((current) => Math.min(current + 1, count - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveCatalogModelIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      chooseCatalogModel(matchingCatalogModels[Math.min(activeCatalogModelIndex, count - 1)]!);
    }
  }

  async function refresh() {
    setLoading(true);
    try {
      await props.onEnsureHost();
      // Prefer catalog reload so models.json / extension providers re-resolve (#16/#17).
      const [list, settings] = await Promise.all([
        window.zeno.models.refreshCatalog().catch(() => window.zeno.models.list()),
        window.zeno.settings.get(),
      ]);
      setModels(list);
      const patterns = settings.enabledModels ?? [];
      const { exact, globs } = splitEnabledModels(patterns, list);
      setScopedSelected(exact);
      setScopedGlobText(globs.join("\n"));
      setDefaultKey(
        settings.defaultProvider && settings.defaultModel
          ? `${settings.defaultProvider}/${settings.defaultModel}`
          : "",
      );
    } catch (err) {
      showError(err, "Failed to list models");
    } finally {
      setLoading(false);
    }
  }

  async function saveEnabledModels(selected: Set<string>, globText: string) {
    setScopedBusy(true);
    try {
      await props.onEnsureHost();
      const patterns = buildEnabledModelsPatterns(selected, globText);
      await window.zeno.settings.patch({ enabledModels: patterns });
      setScopedSelected(selected);
      setScopedGlobText(globText);
      useShellStore.getState().setStatus(tr("models.scopedSaved"));
    } catch (err) {
      showError(err, tr("models.scopedSaveFailed"));
      await refresh();
    } finally {
      setScopedBusy(false);
    }
  }

  async function setModelFastSwitch(provider: string, id: string, on: boolean) {
    const key = `${provider}/${id}`;
    const next = new Set(scopedSelected);
    if (on) next.add(key);
    else next.delete(key);
    await saveEnabledModels(next, scopedGlobText);
  }

  useEffect(() => {
    void refresh();
    void window.zeno.app
      .getRuntime()
      .then((runtime) => {
        const v = (runtime.appVersion || "0.0.0").replace(/^v/i, "").trim() || "0.0.0";
        setAppVersion(v);
        setUserAgent((current) =>
          !current || current === "ZenoDesktop/0.0.0" ? `ZenoDesktop/${v}` : current,
        );
      })
      .catch(() => {
        // keep fallback version
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dialogOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !dialogBusy) {
        ev.preventDefault();
        setDialogOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialogOpen, dialogBusy]);

  function openCustomDialog() {
    resetCustomForm();
    setUserAgent(defaultUserAgent());
    setDialogOpen(true);
  }

  async function openEditCustomDialog(model: ModelSummary) {
    resetCustomForm();
    setEditingOrigin({ provider: model.provider, modelId: model.id });
    setProviderId(model.provider);
    setModelId(model.id);
    setModelName(model.name || model.id);
    setReasoning(Boolean(model.reasoning));
    setUserAgent(defaultUserAgent());
    setDialogOpen(true);
    setDialogBusy(true);
    try {
      await props.onEnsureHost();
      const config = await window.zeno.models.getConfig();
      const provider = config.providers.find((row) => row.provider === model.provider);
      if (!provider) {
        showError(new Error("Model not found in models.json"), "Custom model missing");
        return;
      }
      if (provider.baseUrl) setBaseUrl(provider.baseUrl);
      if (provider.api && CUSTOM_MODEL_API_VALUES.has(provider.api)) {
        setApi(provider.api as CustomModelApi);
      }
      setAuthHeader(provider.authHeader === true);
      setAuthHeaderTouched(true);
      setUserAgent(provider.userAgent?.trim() || defaultUserAgent());
      const entry = provider.models.find((row) => row.id === model.id);
      if (entry) {
        if (entry.name) setModelName(entry.name);
        if (typeof entry.reasoning === "boolean") setReasoning(entry.reasoning);
        if (entry.input === "text" || entry.input === "text-image") setInputMode(entry.input);
        if (entry.contextWindow != null) setContextWindow(String(entry.contextWindow));
        if (entry.maxTokens != null) setMaxTokens(String(entry.maxTokens));
        if (entry.costInput != null) setCostInput(String(entry.costInput));
        if (entry.costOutput != null) setCostOutput(String(entry.costOutput));
        if (entry.costCacheRead != null) setCostCacheRead(String(entry.costCacheRead));
        if (entry.costCacheWrite != null) setCostCacheWrite(String(entry.costCacheWrite));
      }
      const catalogModel = findCatalogModelForId(catalogModels, model.id);
      if (catalogModel) applyCatalogModel(catalogModel);
    } catch (err) {
      showError(err, "Failed to load custom model");
    } finally {
      setDialogBusy(false);
    }
  }

  function closeCustomDialog() {
    if (dialogBusy) return;
    setDialogOpen(false);
    setModelSuggestionsOpen(false);
    setEditingOrigin(null);
  }

  async function useInSession(model: ModelSummary) {
    setLoading(true);
    try {
      let snapshot = await window.zeno.models.set(model.provider, model.id);
      if (
        (snapshot.availableServiceTiers?.length ?? 0) > 0 &&
        snapshot.serviceTier !== props.serviceTier
      ) {
        snapshot = await window.zeno.serviceTier.set(props.serviceTier);
      }
      props.onSnapshot(snapshot);
      await refresh();
    } catch (err) {
      showError(err, "Failed to set model");
    } finally {
      setLoading(false);
    }
  }

  async function setAsDefault(model: ModelSummary) {
    setLoading(true);
    try {
      await window.zeno.settings.patch({
        defaultProvider: model.provider,
        defaultModel: model.id,
      });
      setDefaultKey(`${model.provider}/${model.id}`);
    } catch (err) {
      showError(err, "Failed to save default");
    } finally {
      setLoading(false);
    }
  }

  async function saveCustomProvider(event: FormEvent) {
    event.preventDefault();
    const nextProviderId = providerId.trim();
    if (!nextProviderId || !baseUrl.trim() || !modelId.trim()) {
      showAppError(tr("models.customRequired"));
      return;
    }
    if (!CUSTOM_PROVIDER_ID_RE.test(nextProviderId)) {
      showAppError(tr("models.customProviderInvalid"));
      return;
    }
    setDialogBusy(true);
    try {
      await props.onEnsureHost();
      const payload: Parameters<typeof window.zeno.models.upsertCustomProvider>[0] = {
        provider: nextProviderId,
        baseUrl: baseUrl.trim(),
        api,
        modelId: modelId.trim(),
        input: inputMode,
      };
      if (modelName.trim()) payload.modelName = modelName.trim();
      if (apiKey.trim()) payload.apiKey = apiKey.trim();
      // Always persist authHeader when editing so unchecking clears models.json flag.
      payload.authHeader = authHeader;
      payload.userAgent = userAgent.trim() || defaultUserAgent();
      if (reasoning) payload.reasoning = true;
      const ctx = parseOptionalNumber(contextWindow);
      if (ctx != null) payload.contextWindow = ctx;
      const maxOut = parseOptionalNumber(maxTokens);
      if (maxOut != null) payload.maxTokens = maxOut;
      const cIn = parseOptionalNumber(costInput);
      if (cIn != null) payload.costInput = cIn;
      const cOut = parseOptionalNumber(costOutput);
      if (cOut != null) payload.costOutput = cOut;
      const cRead = parseOptionalNumber(costCacheRead);
      if (cRead != null) payload.costCacheRead = cRead;
      const cWrite = parseOptionalNumber(costCacheWrite);
      if (cWrite != null) payload.costCacheWrite = cWrite;
      if (editingOrigin) {
        payload.previousProvider = editingOrigin.provider;
        payload.previousModelId = editingOrigin.modelId;
      }
      await window.zeno.models.upsertCustomProvider(payload);
      resetCustomForm();
      setDialogOpen(false);
      await Promise.all([refresh(), props.auth.refresh()]);
    } catch (err) {
      showError(err, tr("models.customSaveFailed"));
    } finally {
      setDialogBusy(false);
    }
  }

  async function removeCustomModel(model: ModelSummary) {
    const name = model.name || model.id;
    if (!window.confirm(tr("models.customDeleteConfirm", { name }))) return;
    setLoading(true);
    try {
      await props.onEnsureHost();
      await window.zeno.models.removeCustomModel(model.provider, model.id);
      await Promise.all([refresh(), props.auth.refresh()]);
    } catch (err) {
      showError(err, tr("models.customDeleteFailed"));
    } finally {
      setLoading(false);
    }
  }

  const filteredModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((model) => {
      const haystack = `${model.provider} ${model.id} ${model.name}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [models, query]);

  const builtinModels = useMemo(
    () => filteredModels.filter((model) => model.source !== "custom"),
    [filteredModels],
  );
  const customModels = useMemo(
    () => filteredModels.filter((model) => model.source === "custom"),
    [filteredModels],
  );

  /** Same grouping as composer model picker (brand-cased provider labels). */
  const builtinProviderGroups = useMemo(
    () => groupModelsByProvider(builtinModels, tr("models.group.custom")),
    [builtinModels, props.locale],
  );
  const customProviderGroups = useMemo(
    () => groupModelsByProvider(customModels, tr("models.group.custom")),
    [customModels, props.locale],
  );

  function renderModelRow(
    model: ModelSummary,
    options?: { last?: boolean; hideProviderPrefix?: boolean; allowEdit?: boolean },
  ) {
    const key = `${model.provider}/${model.id}`;
    const isDefault = defaultKey === key;
    const isSession = sessionKey === key;
    return (
      <div
        key={key}
        className={cn("settings-row", options?.last && "settings-row-last")}
        data-testid={`model-row-${model.provider}-${model.id}`}
        data-default={isDefault ? "true" : "false"}
        data-session={isSession ? "true" : "false"}
      >
        <div className="settings-row-copy min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="settings-row-title truncate">{model.name || model.id}</span>
            {isDefault ? (
              <span className="settings-model-badge settings-model-badge-default">
                {tr("models.badgeDefault")}
              </span>
            ) : null}
            {isSession ? (
              <span className="settings-model-badge settings-model-badge-session">
                {tr("models.badgeSession")}
              </span>
            ) : null}
          </div>
          <div className="settings-row-desc">
            {options?.hideProviderPrefix ? model.id : `${model.provider}/${model.id}`}
            {model.reasoning ? " · reasoning" : ""}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-[var(--muted-foreground)] whitespace-nowrap">
              {tr("models.scopeToggle")}
            </span>
            <SettingsHelpTip
              ariaLabel={tr("models.scopeToggleHelpTitle")}
              testId={`model-scope-help-${model.provider}-${model.id}`}
              side="top"
              align="end"
            >
              <div className="flex flex-col gap-1.5">
                <p className="m-0 font-medium text-[var(--popover-foreground)]">
                  {tr("models.scopeToggleHelpTitle")}
                </p>
                <p className="m-0 text-[var(--muted-foreground)]">
                  {tr("models.scopeToggleHelpP1")}
                </p>
                <p className="m-0 text-[var(--muted-foreground)]">
                  {tr("models.scopeToggleHelpP2")}
                </p>
                <SettingsDocsLink href={PI_DOCS_SETTINGS_URL} testId="model-scope-docs-link">
                  {tr("models.scopeToggleHelpDocs")}
                </SettingsDocsLink>
              </div>
            </SettingsHelpTip>
            <SettingsToggle
              checked={scopedSelected.has(key)}
              onChange={(on) => void setModelFastSwitch(model.provider, model.id, on)}
              disabled={loading || dialogBusy || scopedBusy}
              testId={`model-scope-${model.provider}-${model.id}`}
              aria-label={tr("models.scopeToggle")}
            />
          </div>
          {options?.allowEdit ? (
            <SettingsIconButton
              danger
              disabled={loading || dialogBusy}
              onClick={() => void removeCustomModel(model)}
              testId={`model-delete-${model.provider}-${model.id}`}
              title={tr("models.customDelete")}
              aria-label={tr("models.customDelete")}
            >
              <Trash2 className="size-3.5" strokeWidth={1.75} />
            </SettingsIconButton>
          ) : null}
          {options?.allowEdit ? (
            <SettingsPillButton
              label={tr("models.customEdit")}
              disabled={loading || dialogBusy}
              onClick={() => void openEditCustomDialog(model)}
              testId={`model-edit-${model.provider}-${model.id}`}
            />
          ) : null}
          <SettingsPillButton
            label={tr("models.useSession")}
            disabled={loading || isSession}
            onClick={() => void useInSession(model)}
            testId={`model-use-${model.id}`}
          />
          <SettingsPillButton
            label={tr("models.setDefault")}
            disabled={loading || isDefault}
            onClick={() => void setAsDefault(model)}
            testId={`model-default-${model.id}`}
          />
        </div>
      </div>
    );
  }

  const searching = query.trim().length > 0;

  function toggleProviderGroup(key: string) {
    setExpandedProviderGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderProviderGroupCard(
    group: (typeof builtinProviderGroups)[number],
    source: "builtin" | "custom",
  ) {
    const provider = props.auth.getProvider(group.models[0]?.provider ?? "");
    const expanded = searching || expandedProviderGroups.has(group.key);
    const contentId = `models-provider-content-${group.key}`;
    const testId = `models-${source}-group-${group.key}`;

    return (
      <div key={group.key} className="models-provider-section" data-testid={testId}>
        <div className="settings-card">
          <button
            type="button"
            className="models-provider-card-trigger"
            aria-expanded={expanded}
            aria-controls={contentId}
            data-testid={`${testId}-toggle`}
            onClick={() => toggleProviderGroup(group.key)}
          >
            <span className="models-provider-card-title">{group.label}</span>
            <span className="models-provider-card-summary">
              <span className="models-provider-card-count">
                {tr("models.providerCount", { count: String(group.models.length) })}
              </span>
              {provider ? (
                <span
                  className="settings-status-chip"
                  data-configured={provider.configured ? "true" : "false"}
                  data-testid={`provider-configured-${provider.provider}`}
                >
                  {provider.configured ? tr("auth.configured") : tr("auth.missing")}
                </span>
              ) : null}
            </span>
            <ChevronRight
              className="models-provider-card-chevron"
              data-expanded={expanded ? "true" : "false"}
              size={17}
              strokeWidth={1.75}
              aria-hidden
            />
          </button>

          {expanded ? (
            <div id={contentId} className="models-provider-card-content">
              <ProviderAuthSummaryRow
                provider={provider}
                loading={loading || props.auth.loading}
                onConfigure={props.auth.openConfig}
                tr={tr}
              />
              <div data-testid={`models-list-${source}-${group.key}`}>
                {group.models.map((model, index) =>
                  renderModelRow(model, {
                    last: index === group.models.length - 1,
                    hideProviderPrefix: true,
                    ...(source === "custom" ? { allowEdit: true } : {}),
                  }),
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  function renderModelCategory(
    source: "builtin" | "custom",
    groups: typeof builtinProviderGroups,
    emptyLabel: string,
  ) {
    const testId = `models-${source}`;
    return (
      <section className="settings-section-block" data-testid={testId}>
        <h2 className="settings-section-label">{tr(`models.group.${source}`)}</h2>
        <div className="models-category-groups">
          {groups.length > 0 ? (
            groups.map((group) => renderProviderGroupCard(group, source))
          ) : (
            <div className="settings-card">
              <div className="settings-row settings-row-last">
                <div className="settings-row-desc">{emptyLabel}</div>
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <SettingsPageShell title={tr("section.models")} testId="settings-models">
      <div className="mb-3 flex items-center gap-2">
        <SettingsSearchField
          testId="models-search"
          value={query}
          onChange={setQuery}
          placeholder={tr("models.search")}
        />
        <SettingsPillButton
          label={tr("models.customAdd")}
          onClick={openCustomDialog}
          disabled={loading}
          testId="models-add-custom"
        />
        <SettingsPillButton
          label={loading ? "…" : tr("models.reloadCatalog")}
          onClick={() => void Promise.all([refresh(), props.auth.refresh()])}
          disabled={loading || props.auth.loading}
          testId="models-refresh"
        />
      </div>

      <SettingsSectionBlock
        label={tr("models.wildcardSection")}
        labelHintAria={tr("models.wildcardHelpTitle")}
        labelHint={
          <div className="flex flex-col gap-1.5">
            <p className="m-0 font-medium text-[var(--popover-foreground)]">
              {tr("models.wildcardHelpTitle")}
            </p>
            <p className="m-0 text-[var(--muted-foreground)]">{tr("models.wildcardHelpP1")}</p>
            <p className="m-0 text-[var(--muted-foreground)]">{tr("models.wildcardHelpP2")}</p>
            <p className="m-0 text-[var(--muted-foreground)]">{tr("models.wildcardHelpP3")}</p>
            <div className="flex flex-col gap-0.5">
              <SettingsDocsLink href={PI_DOCS_SETTINGS_URL} testId="models-wildcard-docs-settings">
                {tr("models.wildcardHelpDocs")}
              </SettingsDocsLink>
              <SettingsDocsLink href={PI_DOCS_USAGE_URL} testId="models-wildcard-docs-usage">
                {tr("models.wildcardHelpDocsUsage")}
              </SettingsDocsLink>
            </div>
          </div>
        }
        testId="models-wildcard"
      >
        <div className="space-y-3 px-3 py-3">
          <SettingsTextarea
            data-testid="models-scoped-patterns"
            className="models-scoped-patterns-input h-[7.5rem] min-h-0 w-full resize-none overflow-y-auto font-mono text-sm field-sizing-fixed"
            rows={6}
            value={scopedGlobText}
            onChange={(e) => setScopedGlobText(e.target.value)}
            placeholder={tr("models.scopedPatternsPh")}
            disabled={loading || scopedBusy}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SettingsPillButton
              label={scopedBusy ? tr("models.scopedSaving") : tr("models.wildcardSave")}
              testId="models-wildcard-save"
              disabled={loading || scopedBusy}
              onClick={() => void saveEnabledModels(scopedSelected, scopedGlobText)}
            />
            <SettingsPillButton
              label={tr("models.scopedClear")}
              testId="models-scope-clear"
              disabled={loading || scopedBusy}
              onClick={() => void saveEnabledModels(new Set(), "")}
            />
            {scopedSelected.size > 0 || scopedGlobText.trim() ? (
              <span className="text-[11px] text-[var(--muted-foreground)]">
                {tr("models.scopedCount", {
                  count: String(
                    scopedSelected.size +
                      scopedGlobText.split(/[\n,]+/).filter((l) => l.trim()).length,
                  ),
                })}
              </span>
            ) : null}
          </div>
        </div>
      </SettingsSectionBlock>

      {renderModelCategory(
        "custom",
        customProviderGroups,
        searching ? tr("models.searchEmpty") : tr("models.group.customEmpty"),
      )}

      {renderModelCategory(
        "builtin",
        builtinProviderGroups,
        searching ? tr("models.searchEmpty") : tr("models.group.builtinEmpty"),
      )}

      {dialogOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/50 p-4"
              data-testid="models-custom-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="models-custom-dialog-title"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closeCustomDialog();
              }}
            >
              <div
                className="models-custom-dialog surface-panel flex max-h-[min(88vh,720px)] w-full max-w-[40rem] flex-col overflow-hidden shadow-2xl"
                onMouseDownCapture={(event) => {
                  const target = event.target;
                  if (
                    target === modelIdInputRef.current ||
                    (target instanceof Node && modelSuggestionsContentRef.current?.contains(target))
                  ) {
                    return;
                  }
                  setModelSuggestionsOpen(false);
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="models-custom-dialog-header">
                  <h2 id="models-custom-dialog-title" className="models-custom-dialog-title">
                    {editingOrigin ? tr("models.customEditTitle") : tr("models.customAdd")}
                  </h2>
                </div>

                <form
                  className="flex min-h-0 flex-1 flex-col"
                  data-testid="models-custom-form"
                  onSubmit={(e) => void saveCustomProvider(e)}
                >
                  <div className="models-custom-dialog-body zeno-scroll">
                    <div className="models-custom-form-grid">
                      <label className="models-custom-field">
                        <span>{tr("models.customProvider")}</span>
                        <SettingsInput
                          data-testid="models-custom-provider"
                          value={providerId}
                          onChange={(e) => setProviderId(e.target.value)}
                          placeholder={tr("models.customProviderPh")}
                          disabled={dialogBusy}
                          autoComplete="off"
                          autoFocus
                        />
                        <p className="m-0 text-[11px] leading-snug text-[var(--text-subtle)]">
                          {tr("models.customProviderHint")}
                        </p>
                      </label>
                      <label className="models-custom-field">
                        <span>{tr("models.customApi")}</span>
                        <SettingsSelect
                          testId="models-custom-api"
                          fullWidth
                          value={api}
                          onChange={(v) => setApi(v as CustomModelApi)}
                          disabled={dialogBusy || catalogMetadataLocked}
                          options={CUSTOM_MODEL_API_OPTIONS.map((opt) => ({
                            value: opt.value,
                            label: opt.label,
                          }))}
                        />
                      </label>
                      <label className="models-custom-field models-custom-field-span">
                        <span>{tr("models.customBaseUrl")}</span>
                        <SettingsInput
                          data-testid="models-custom-base-url"
                          value={baseUrl}
                          onChange={(e) => setBaseUrl(e.target.value)}
                          placeholder={tr("models.customBaseUrlPh")}
                          disabled={dialogBusy}
                          autoComplete="off"
                        />
                        <p className="m-0 text-[11px] leading-snug text-[var(--text-subtle)]">
                          {tr("models.customBaseUrlHint")}
                        </p>
                      </label>
                      <label className="models-custom-field models-custom-field-span">
                        <span>{tr("models.customApiKey")}</span>
                        <SettingsInput
                          data-testid="models-custom-api-key"
                          type="password"
                          value={apiKey}
                          onChange={(e) => {
                            const value = e.target.value;
                            setApiKey(value);
                            if (value.trim() && !authHeaderTouched) setAuthHeader(true);
                          }}
                          placeholder={tr("models.customApiKeyPh")}
                          disabled={dialogBusy}
                          autoComplete="off"
                        />
                      </label>
                      <label className="models-custom-field models-custom-field-span">
                        <span>{tr("models.customModelId")}</span>
                        <Popover
                          open={modelSuggestionsOpen && catalogModels.length > 0}
                          onOpenChange={(open) => {
                            setModelSuggestionsOpen(open);
                            if (open) setActiveCatalogModelIndex(0);
                          }}
                        >
                          <PopoverAnchor asChild>
                            <SettingsInput
                              ref={modelIdInputRef}
                              data-testid="models-custom-model-id"
                              value={modelId}
                              onChange={(e) => setModelIdFromInput(e.target.value)}
                              onKeyDown={handleModelIdKeyDown}
                              placeholder={tr("models.customModelIdPh")}
                              disabled={dialogBusy}
                              autoComplete="off"
                              aria-autocomplete="list"
                              aria-expanded={modelSuggestionsOpen}
                            />
                          </PopoverAnchor>
                          <PopoverContent
                            ref={modelSuggestionsContentRef}
                            className="z-[12000] w-[var(--radix-popover-trigger-width)] p-0"
                            align="start"
                            onOpenAutoFocus={(e) => e.preventDefault()}
                            onInteractOutside={(e) => {
                              if (e.target === modelIdInputRef.current) e.preventDefault();
                            }}
                            data-testid="models-custom-model-suggestions"
                          >
                            <Command shouldFilter={false}>
                              <CommandList className="max-h-56">
                                {matchingCatalogModels.length === 0 ? (
                                  <CommandEmpty>{tr("models.searchEmpty")}</CommandEmpty>
                                ) : (
                                  <CommandGroup>
                                    {matchingCatalogModels.map((model, index) => (
                                      <CommandItem
                                        key={modelCatalogKey(model)}
                                        value={modelCatalogKey(model)}
                                        data-active={
                                          index === activeCatalogModelIndex ? "true" : "false"
                                        }
                                        data-testid="models-custom-model-option"
                                        className="data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                                        onMouseMove={() => setActiveCatalogModelIndex(index)}
                                        onSelect={() => {
                                          chooseCatalogModel(model);
                                        }}
                                      >
                                        <span className="min-w-0 truncate font-mono">
                                          {model.id}
                                        </span>
                                        <CommandShortcut>{model.provider}</CommandShortcut>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <p className="m-0 text-[11px] leading-snug text-[var(--text-subtle)]">
                          {catalogMetadataLocked
                            ? tr("models.customModelCatalogLocked")
                            : tr("models.customModelManualHint")}
                        </p>
                      </label>
                      <label className="models-custom-field">
                        <span>{tr("models.customModelName")}</span>
                        <SettingsInput
                          data-testid="models-custom-model-name"
                          value={modelName}
                          onChange={(e) => setModelName(e.target.value)}
                          disabled={dialogBusy || catalogMetadataLocked}
                          autoComplete="off"
                        />
                      </label>
                      <label className="models-custom-field">
                        <span>{tr("models.customContextWindow")}</span>
                        <SettingsInput
                          data-testid="models-custom-context-window"
                          inputMode="numeric"
                          value={contextWindow}
                          onChange={(e) => setContextWindow(e.target.value)}
                          disabled={dialogBusy || catalogMetadataLocked}
                          autoComplete="off"
                        />
                      </label>
                      <label className="models-custom-field">
                        <span>{tr("models.customMaxTokens")}</span>
                        <SettingsInput
                          data-testid="models-custom-max-tokens"
                          inputMode="numeric"
                          value={maxTokens}
                          onChange={(e) => setMaxTokens(e.target.value)}
                          disabled={dialogBusy || catalogMetadataLocked}
                          autoComplete="off"
                        />
                      </label>

                      <div className="models-custom-toolbar">
                        <label
                          className="models-custom-chip"
                          data-active={inputMode === "text" ? "true" : "false"}
                        >
                          <SettingsInput
                            type="radio"
                            name="models-custom-input"
                            data-testid="models-custom-input-text"
                            checked={inputMode === "text"}
                            onChange={() => setInputMode("text")}
                            disabled={dialogBusy || catalogMetadataLocked}
                          />
                          {tr("models.customInputText")}
                        </label>
                        <label
                          className="models-custom-chip"
                          data-active={inputMode === "text-image" ? "true" : "false"}
                        >
                          <SettingsInput
                            type="radio"
                            name="models-custom-input"
                            data-testid="models-custom-input"
                            checked={inputMode === "text-image"}
                            onChange={() => setInputMode("text-image")}
                            disabled={dialogBusy || catalogMetadataLocked}
                          />
                          {tr("models.customInputTextImage")}
                        </label>
                        <label
                          className="models-custom-check"
                          data-on={reasoning ? "true" : "false"}
                        >
                          <SettingsInput
                            type="checkbox"
                            data-testid="models-custom-reasoning"
                            checked={reasoning}
                            onChange={(e) => setReasoning(e.target.checked)}
                            disabled={dialogBusy || catalogMetadataLocked}
                          />
                          {tr("models.customReasoning")}
                        </label>
                        <label
                          className="models-custom-check"
                          data-on={authHeader ? "true" : "false"}
                        >
                          <SettingsInput
                            type="checkbox"
                            data-testid="models-custom-auth-header"
                            checked={authHeader}
                            onChange={(e) => {
                              setAuthHeader(e.target.checked);
                              setAuthHeaderTouched(true);
                            }}
                            disabled={dialogBusy}
                          />
                          {tr("models.customAuthHeader")}
                        </label>
                      </div>

                      <details className="models-custom-advanced">
                        <summary>{tr("models.customSectionAdvanced")}</summary>
                        <div className="models-custom-advanced-body">
                          <label className="models-custom-field models-custom-field-span">
                            <span>{tr("models.customUserAgent")}</span>
                            <SettingsInput
                              data-testid="models-custom-user-agent"
                              value={userAgent}
                              onChange={(e) => setUserAgent(e.target.value)}
                              placeholder={defaultUserAgent()}
                              disabled={dialogBusy}
                              autoComplete="off"
                            />
                            <p className="m-0 text-[11px] leading-snug text-[var(--text-subtle)]">
                              {tr("models.customUserAgentHint")}
                            </p>
                          </label>
                          <label className="models-custom-field">
                            <span>{tr("models.customCostInput")}</span>
                            <SettingsInput
                              data-testid="models-custom-cost-input"
                              inputMode="decimal"
                              value={costInput}
                              onChange={(e) => setCostInput(e.target.value)}
                              disabled={dialogBusy || catalogMetadataLocked}
                              autoComplete="off"
                            />
                          </label>
                          <label className="models-custom-field">
                            <span>{tr("models.customCostOutput")}</span>
                            <SettingsInput
                              data-testid="models-custom-cost-output"
                              inputMode="decimal"
                              value={costOutput}
                              onChange={(e) => setCostOutput(e.target.value)}
                              disabled={dialogBusy || catalogMetadataLocked}
                              autoComplete="off"
                            />
                          </label>
                          <label className="models-custom-field">
                            <span>{tr("models.customCostCacheRead")}</span>
                            <SettingsInput
                              data-testid="models-custom-cost-cache-read"
                              inputMode="decimal"
                              value={costCacheRead}
                              onChange={(e) => setCostCacheRead(e.target.value)}
                              disabled={dialogBusy || catalogMetadataLocked}
                              autoComplete="off"
                            />
                          </label>
                          <label className="models-custom-field">
                            <span>{tr("models.customCostCacheWrite")}</span>
                            <SettingsInput
                              data-testid="models-custom-cost-cache-write"
                              inputMode="decimal"
                              value={costCacheWrite}
                              onChange={(e) => setCostCacheWrite(e.target.value)}
                              disabled={dialogBusy || catalogMetadataLocked}
                              autoComplete="off"
                            />
                          </label>
                        </div>
                      </details>
                    </div>
                  </div>

                  <div className="models-custom-dialog-footer">
                    <SettingsButton
                      type="button"
                      variant="ghost"
                      testId="models-custom-cancel"
                      className="h-9 px-3.5"
                      disabled={dialogBusy}
                      onClick={closeCustomDialog}
                    >
                      {tr("common.cancel")}
                    </SettingsButton>
                    <SettingsButton
                      type="submit"
                      variant="default"
                      className="h-9 px-4"
                      testId="models-custom-save"
                      disabled={dialogBusy}
                    >
                      {dialogBusy ? tr("models.customSaving") : tr("models.customSave")}
                    </SettingsButton>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </SettingsPageShell>
  );
}

function ModelsSection(
  props: SettingsPageProps & { tr: (key: MessageKey, vars?: Record<string, string>) => string },
) {
  return (
    <ProviderAuthScope {...props}>
      {(auth) => <ModelsSectionContent {...props} auth={auth} />}
    </ProviderAuthScope>
  );
}

/** pi HTTP_IDLE_TIMEOUT_CHOICES + Zeno longer presets (ms → i18n). */
const HTTP_IDLE_TIMEOUT_PRESETS: ReadonlyArray<{ ms: number; labelKey: MessageKey }> = [
  { ms: 30_000, labelKey: "piSettings.httpIdle30s" },
  { ms: 60_000, labelKey: "piSettings.httpIdle1m" },
  { ms: 120_000, labelKey: "piSettings.httpIdle2m" },
  { ms: 300_000, labelKey: "piSettings.httpIdle5m" },
  { ms: 900_000, labelKey: "piSettings.httpIdle15m" },
  { ms: 1_800_000, labelKey: "piSettings.httpIdle30m" },
  { ms: 3_600_000, labelKey: "piSettings.httpIdle60m" },
  { ms: 0, labelKey: "piSettings.httpIdleDisabled" },
];

function httpIdleTimeoutOptions(
  tr: (key: MessageKey, vars?: Record<string, string>) => string,
  currentMs: number | undefined,
): Array<{ value: string; label: string }> {
  const options = HTTP_IDLE_TIMEOUT_PRESETS.map((row) => ({
    value: String(row.ms),
    label: tr(row.labelKey),
  }));
  if (currentMs === undefined || !Number.isFinite(currentMs)) return options;
  const key = String(Math.floor(currentMs));
  if (options.some((opt) => opt.value === key)) return options;
  // Surface pi/custom values not in the preset list (so the select can echo them).
  return [
    {
      value: key,
      label:
        currentMs === 0
          ? tr("piSettings.httpIdleDisabled")
          : tr("piSettings.httpIdleCustom", { seconds: String(Math.round(currentMs / 1000)) }),
    },
    ...options,
  ];
}

/**
 * Only surface pi settings that help the desktop GUI.
 * CLI/TUI-only options (theme, quietStartup, skill commands, free-text model ids)
 * stay in ~/.pi/agent and the Models page.
 */
type PiDraft = {
  defaultThinkingLevel: string;
  defaultProjectTrust: "ask" | "always" | "never";
  compactionEnabled: boolean;
  compactionReserveTokens: number;
  compactionKeepRecentTokens: number;
  retryEnabled: boolean;
  retryMaxRetries: number;
  retryBaseDelayMs: number;
  hideThinkingBlock: boolean;
  steeringMode: "all" | "one-at-a-time";
  followUpMode: "all" | "one-at-a-time";
  doubleEscapeAction: "fork" | "tree" | "none";
  treeFilterMode: "default" | "no-tools" | "user-only" | "labeled-only" | "all";
  httpIdleTimeoutMs: number;
  enableInstallTelemetry: boolean;
  enableAnalytics: boolean;
};

function piViewToDraft(view: PiSettingsView): PiDraft {
  return {
    defaultThinkingLevel: view.defaultThinkingLevel ?? "off",
    defaultProjectTrust: view.defaultProjectTrust ?? "ask",
    compactionEnabled: Boolean(view.compactionEnabled),
    compactionReserveTokens: view.compactionReserveTokens ?? 16384,
    compactionKeepRecentTokens: view.compactionKeepRecentTokens ?? 20000,
    retryEnabled: Boolean(view.retryEnabled),
    retryMaxRetries: view.retryMaxRetries ?? 3,
    retryBaseDelayMs: view.retryBaseDelayMs ?? 2000,
    hideThinkingBlock: Boolean(view.hideThinkingBlock),
    steeringMode: view.steeringMode ?? "all",
    followUpMode: view.followUpMode ?? "all",
    doubleEscapeAction: view.doubleEscapeAction ?? "fork",
    treeFilterMode: view.treeFilterMode ?? "default",
    // Zeno product default: 60 minutes (pi upstream default is 5 minutes / 300000).
    httpIdleTimeoutMs: view.httpIdleTimeoutMs ?? 3_600_000,
    enableInstallTelemetry: view.enableInstallTelemetry === true,
    enableAnalytics: view.enableAnalytics === true,
  };
}

function PiSettingsSection(
  props: SettingsPageProps & { tr: (key: MessageKey, vars?: Record<string, string>) => string },
) {
  const { tr } = props;
  const [view, setView] = useState<PiSettingsView | undefined>();
  const [prefs, setPrefs] = useState<PiDraft | undefined>();
  const [loading, setLoading] = useState(true);
  const showAppError = useShellStore((s) => s.showAppError);
  /** Latest draft for debounced auto-save (toggles/selects + number fields). */
  const prefsRef = useRef<PiDraft | undefined>(undefined);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveSeqRef = useRef(0);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== undefined) clearTimeout(saveTimerRef.current);
    };
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      await props.onEnsureHost();
      const next = await window.zeno.settings.get();
      const draft = piViewToDraft(next);
      setView(next);
      setPrefs(draft);
      prefsRef.current = draft;
    } catch (err) {
      showAppError(err instanceof Error ? err.message : tr("piSettings.saveFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function commitPrefs(draft: PiDraft) {
    const seq = ++saveSeqRef.current;
    try {
      const patch: PiSettingsPatch = { ...draft };
      const result = await window.zeno.settings.patch(patch);
      if (seq !== saveSeqRef.current) return;
      const next = piViewToDraft(result.settings);
      setView(result.settings);
      setPrefs(next);
      prefsRef.current = next;
      props.onSnapshot(result.snapshot);
      useShellStore.getState().setStatus(tr("piSettings.saved"));
    } catch (err) {
      if (seq !== saveSeqRef.current) return;
      showAppError(err instanceof Error ? err.message : tr("piSettings.saveFailed"));
      // Reload server truth so UI does not stay on a failed local draft.
      try {
        const next = await window.zeno.settings.get();
        if (seq !== saveSeqRef.current) return;
        const draft = piViewToDraft(next);
        setView(next);
        setPrefs(draft);
        prefsRef.current = draft;
      } catch {
        // ignore secondary load failure
      }
    }
  }

  function scheduleCommit(draft: PiDraft, debounceMs: number) {
    prefsRef.current = draft;
    if (saveTimerRef.current !== undefined) clearTimeout(saveTimerRef.current);
    if (debounceMs <= 0) {
      void commitPrefs(draft);
      return;
    }
    saveTimerRef.current = setTimeout(() => {
      const latest = prefsRef.current;
      if (latest) void commitPrefs(latest);
    }, debounceMs);
  }

  function flushCommit() {
    if (saveTimerRef.current !== undefined) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = undefined;
    }
    const latest = prefsRef.current;
    if (latest) void commitPrefs(latest);
  }

  function onFieldKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    flushCommit();
  }

  /** Instant save for toggles/selects; light debounce for number typing. */
  function patchPrefs(patch: Partial<PiDraft>, options?: { debounceMs?: number }) {
    setPrefs((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      scheduleCommit(next, options?.debounceMs ?? 0);
      return next;
    });
  }

  // Host derives both lists from the configured default model's real API metadata.
  const thinkingLevels = view?.availableThinkingLevels ?? ["off"];
  const serviceTiers = view?.availableServiceTiers ?? [];
  const serviceTierSupported = serviceTiers.length > 0;
  const disabled = loading || !prefs;
  const numFieldClass = "w-24 text-right tabular-nums";

  return (
    <SettingsPageShell title={tr("section.piSettings")} testId="settings-pi">
      <SettingsSectionBlock label={tr("piSettings.sessionDefaults")}>
        <SettingsRow
          title={tr("piSettings.defaultThinking")}
          description={tr("piSettings.defaultThinkingHint")}
          control={
            <SettingsSelect
              testId="pi-default-thinking"
              size="md"
              value={String(prefs?.defaultThinkingLevel ?? "off")}
              onChange={(v) => patchPrefs({ defaultThinkingLevel: v })}
              options={thinkingLevels.map((level) => ({
                value: level,
                label: thinkingLevelLabel(props.locale, level),
              }))}
              disabled={disabled}
            />
          }
        />
        <SettingsRow
          title={tr("piSettings.defaultServiceTier")}
          description={tr("piSettings.defaultServiceTierHint")}
          control={
            <SettingsSelect
              testId="pi-default-service-tier"
              size="md"
              value={serviceTierSupported ? props.serviceTier : "unsupported"}
              onChange={(v) => props.onServiceTierChange(v as ServiceTierId)}
              options={
                serviceTierSupported
                  ? serviceTiers.map((tier) => ({
                      value: tier,
                      label:
                        tier === "priority"
                          ? tr("composer.speed.priority")
                          : tier === "flex"
                            ? tr("composer.speed.flex")
                            : tr("composer.speed.default"),
                    }))
                  : [{ value: "unsupported", label: tr("composer.model.speedUnsupported") }]
              }
              disabled={disabled || !serviceTierSupported}
            />
          }
        />
        <SettingsRow
          title={tr("piSettings.defaultTrust")}
          description={tr("piSettings.defaultTrustHint")}
          control={
            <SettingsSelect
              testId="pi-default-trust"
              size="md"
              value={String(prefs?.defaultProjectTrust ?? "ask")}
              onChange={(v) => patchPrefs({ defaultProjectTrust: v as "ask" | "always" | "never" })}
              options={[
                { value: "ask", label: tr("piSettings.trustAsk") },
                { value: "always", label: tr("piSettings.trustAlways") },
                { value: "never", label: tr("piSettings.trustNever") },
              ]}
              disabled={disabled}
            />
          }
          last
        />
      </SettingsSectionBlock>

      <SettingsSectionBlock label={tr("piSettings.agentBehavior")}>
        <SettingsRow
          title={tr("piSettings.compaction")}
          description={tr("piSettings.compactionHint")}
          control={
            <SettingsToggle
              checked={Boolean(prefs?.compactionEnabled)}
              onChange={(on) => patchPrefs({ compactionEnabled: on })}
              testId="pi-compaction"
              disabled={disabled}
            />
          }
        />
        <SettingsRow
          title={tr("piSettings.compactionReserve")}
          description={tr("piSettings.compactionReserveHint")}
          control={
            <SettingsInput
              type="number"
              min={1024}
              step={1024}
              className={numFieldClass}
              data-testid="pi-compaction-reserve"
              disabled={disabled}
              value={prefs?.compactionReserveTokens ?? 16384}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                patchPrefs({ compactionReserveTokens: n }, { debounceMs: 400 });
              }}
              onBlur={() => flushCommit()}
              onKeyDown={onFieldKeyDown}
            />
          }
        />
        <SettingsRow
          title={tr("piSettings.compactionKeepRecent")}
          description={tr("piSettings.compactionKeepRecentHint")}
          control={
            <SettingsInput
              type="number"
              min={1024}
              step={1024}
              className={numFieldClass}
              data-testid="pi-compaction-keep"
              disabled={disabled}
              value={prefs?.compactionKeepRecentTokens ?? 20000}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                patchPrefs({ compactionKeepRecentTokens: n }, { debounceMs: 400 });
              }}
              onBlur={() => flushCommit()}
              onKeyDown={onFieldKeyDown}
            />
          }
        />
        <SettingsRow
          title={tr("piSettings.retry")}
          description={tr("piSettings.retryHint")}
          control={
            <SettingsToggle
              checked={Boolean(prefs?.retryEnabled)}
              onChange={(on) => patchPrefs({ retryEnabled: on })}
              testId="pi-retry"
              disabled={disabled}
            />
          }
        />
        <SettingsRow
          title={tr("piSettings.retryMax")}
          description={tr("piSettings.retryMaxHint")}
          control={
            <SettingsInput
              type="number"
              min={0}
              max={20}
              step={1}
              className={numFieldClass}
              data-testid="pi-retry-max"
              disabled={disabled}
              value={prefs?.retryMaxRetries ?? 3}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                patchPrefs({ retryMaxRetries: n }, { debounceMs: 400 });
              }}
              onBlur={() => flushCommit()}
              onKeyDown={onFieldKeyDown}
            />
          }
        />
        <SettingsRow
          title={tr("piSettings.retryBaseDelay")}
          description={tr("piSettings.retryBaseDelayHint")}
          control={
            <SettingsInput
              type="number"
              min={0}
              max={60000}
              step={100}
              className={numFieldClass}
              data-testid="pi-retry-base-delay"
              disabled={disabled}
              value={prefs?.retryBaseDelayMs ?? 2000}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                patchPrefs({ retryBaseDelayMs: n }, { debounceMs: 400 });
              }}
              onBlur={() => flushCommit()}
              onKeyDown={onFieldKeyDown}
            />
          }
        />
        <SettingsRow
          title={tr("piSettings.hideThinking")}
          description={tr("piSettings.hideThinkingHint")}
          control={
            <SettingsToggle
              checked={Boolean(prefs?.hideThinkingBlock)}
              onChange={(on) => patchPrefs({ hideThinkingBlock: on })}
              testId="pi-hide-thinking"
              disabled={disabled}
            />
          }
        />
        <SettingsRow
          title={tr("piSettings.thinkingBudgets")}
          description={
            view?.thinkingBudgets
              ? JSON.stringify(view.thinkingBudgets)
              : tr("piSettings.thinkingBudgetsEmpty")
          }
          control={<span className="text-xs opacity-60">{tr("piSettings.cliOnly")}</span>}
          last
        />
      </SettingsSectionBlock>

      <SettingsSectionBlock
        label={tr("piSettings.queueSection")}
        labelHint={tr("piSettings.queueSectionHint")}
        labelHintAria={tr("piSettings.queueSection")}
        testId="pi-settings-queue"
      >
        <SettingsRow
          title={tr("piSettings.steeringMode")}
          description={tr("piSettings.steeringModeHint")}
          control={
            <SettingsSelect
              testId="pi-steering-mode"
              size="md"
              value={String(prefs?.steeringMode ?? "all")}
              onChange={(v) => patchPrefs({ steeringMode: v as "all" | "one-at-a-time" })}
              options={[
                { value: "all", label: tr("piSettings.queueModeAll") },
                { value: "one-at-a-time", label: tr("piSettings.queueModeOne") },
              ]}
              disabled={disabled}
            />
          }
        />
        <SettingsRow
          title={tr("piSettings.followUpMode")}
          description={tr("piSettings.followUpModeHint")}
          control={
            <SettingsSelect
              testId="pi-followup-mode"
              size="md"
              value={String(prefs?.followUpMode ?? "all")}
              onChange={(v) => patchPrefs({ followUpMode: v as "all" | "one-at-a-time" })}
              options={[
                { value: "all", label: tr("piSettings.queueModeAll") },
                { value: "one-at-a-time", label: tr("piSettings.queueModeOne") },
              ]}
              disabled={disabled}
            />
          }
          last
        />
      </SettingsSectionBlock>

      <SettingsSectionBlock label={tr("piSettings.navSection")}>
        <SettingsRow
          title={tr("piSettings.doubleEscape")}
          description={tr("piSettings.doubleEscapeHint")}
          control={
            <SettingsSelect
              testId="pi-double-escape"
              size="md"
              value={String(prefs?.doubleEscapeAction ?? "fork")}
              onChange={(v) => patchPrefs({ doubleEscapeAction: v as "fork" | "tree" | "none" })}
              options={[
                { value: "fork", label: tr("piSettings.doubleEscapeFork") },
                { value: "tree", label: tr("piSettings.doubleEscapeTree") },
                { value: "none", label: tr("piSettings.doubleEscapeNone") },
              ]}
              disabled={disabled}
            />
          }
        />
        <SettingsRow
          title={tr("piSettings.treeFilter")}
          description={tr("piSettings.treeFilterHint")}
          control={
            <SettingsSelect
              testId="pi-tree-filter"
              size="lg"
              value={String(prefs?.treeFilterMode ?? "default")}
              onChange={(v) =>
                patchPrefs({
                  treeFilterMode: v as
                    | "default"
                    | "no-tools"
                    | "user-only"
                    | "labeled-only"
                    | "all",
                })
              }
              options={[
                { value: "default", label: tr("piSettings.treeFilterDefault") },
                { value: "no-tools", label: tr("piSettings.treeFilterNoTools") },
                { value: "user-only", label: tr("piSettings.treeFilterUserOnly") },
                { value: "labeled-only", label: tr("piSettings.treeFilterLabeledOnly") },
                { value: "all", label: tr("piSettings.treeFilterAll") },
              ]}
              disabled={disabled}
            />
          }
          last
        />
      </SettingsSectionBlock>

      <SettingsSectionBlock label={tr("piSettings.networkSection")}>
        <SettingsRow
          title={tr("piSettings.httpIdle")}
          description={tr("piSettings.httpIdleHint")}
          control={
            <SettingsSelect
              testId="pi-http-idle"
              size="lg"
              // Options cover pi HTTP_IDLE_TIMEOUT_CHOICES + longer product presets.
              value={String(prefs?.httpIdleTimeoutMs ?? 3_600_000)}
              onChange={(v) => patchPrefs({ httpIdleTimeoutMs: Number(v) })}
              options={httpIdleTimeoutOptions(tr, prefs?.httpIdleTimeoutMs)}
              disabled={disabled}
            />
          }
        />
        <SettingsRow
          title={tr("piSettings.installTelemetry")}
          description={tr("piSettings.installTelemetryHint")}
          control={
            <SettingsToggle
              // Product default off (pi upstream defaults install telemetry on when unset).
              checked={prefs?.enableInstallTelemetry === true}
              onChange={(on) => patchPrefs({ enableInstallTelemetry: on })}
              testId="pi-install-telemetry"
              disabled={disabled}
            />
          }
        />
        <SettingsRow
          title={tr("piSettings.analytics")}
          description={tr("piSettings.analyticsHint")}
          control={
            <SettingsToggle
              checked={prefs?.enableAnalytics === true}
              onChange={(on) => patchPrefs({ enableAnalytics: on })}
              testId="pi-analytics"
              disabled={disabled}
            />
          }
          last
        />
      </SettingsSectionBlock>

      {view?.degradedCapabilities?.length ? (
        <SettingsSectionBlock label={tr("piSettings.degradedSection")}>
          <div className="px-3 py-2 text-xs opacity-70 space-y-1" data-testid="pi-degraded-list">
            {view.degradedCapabilities.map((item) => {
              const key =
                item === "tui" || item.includes("TUI")
                  ? "piSettings.degraded.tui"
                  : item === "sandbox" || item.includes("sandbox") || item.includes("Container")
                    ? "piSettings.degraded.sandbox"
                    : item === "llama" || item.includes("llama")
                      ? "piSettings.degraded.llama"
                      : item === "gist" || item.includes("Gist")
                        ? "piSettings.degraded.gist"
                        : null;
              return <div key={item}>• {key ? tr(key) : item}</div>;
            })}
          </div>
        </SettingsSectionBlock>
      ) : null}
    </SettingsPageShell>
  );
}
