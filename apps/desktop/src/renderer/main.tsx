import { IPC_PROTOCOL_VERSION } from "@zeno/contracts";
import type {
  CatalogPackage,
  HostEvent,
  HostSnapshot,
  McpConfig,
  PackageSummary,
  ResourceSummary,
  SessionInfoView,
  SessionThreadSummary,
  SessionTreeView,
} from "@zeno/contracts";
import {
  StrictMode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ArrowDown } from "lucide-react";
import { AppSidebar } from "./components/AppSidebar.tsx";
import { CommandPalette } from "./components/CommandPalette.tsx";
import { Composer } from "./components/Composer.tsx";
import { ConfirmDialog } from "./components/ConfirmDialog.tsx";
import { ErrorDialog } from "./components/ErrorDialog.tsx";
import { unwrapRemoteIpcError } from "../shared/ipc-error.ts";
import { ExtensionUiChrome } from "./components/ExtensionUiChrome.tsx";
import { ExtensionUiHost } from "./components/ExtensionUiHost.tsx";
import { ProjectTrustDialog } from "./components/ProjectTrustDialog.tsx";
import { ProjectsPage } from "./components/ProjectsPage.tsx";
import { SessionInfoPanel, SessionTreePanel } from "./components/SessionParityPanels.tsx";
import { RenameDialog } from "./components/RenameDialog.tsx";
import { SettingsPage } from "./components/settings/SettingsPage.tsx";
import {
  SettingsSearchField,
  SettingsSelect,
  SettingsToggle,
} from "./components/settings/SettingsPrimitives.tsx";
import {
  EnvPanel,
  envPanelLayoutForWidth,
  type EnvPanelLayoutMode,
} from "./components/EnvPanel.tsx";
import { BootstrapOverlay } from "./components/BootstrapOverlay.tsx";

import { PixLogo } from "./components/PixLogo.tsx";
import { ThreadHeader } from "./components/ThreadHeader.tsx";
import { PiTuiTerminal, preloadPiTuiTerminal } from "./components/PiTuiTerminal.tsx";
import { WindowCaptionButtons } from "./components/WindowCaptionButtons.tsx";
import { SessionTimelineScroller } from "./components/SessionTimelineContent.tsx";
import { MessageScrollerButton } from "@/components/ui/message-scroller";
import { buildShellCommands } from "./lib/commands.ts";
import { isPromptImagePath, promptWithAttachedPaths } from "./lib/composer-suggestions.ts";
import {
  buildUnifiedSlashCatalog,
  parseShellInjection,
  parseSlashLine,
  resolveBuiltinSlash,
} from "./lib/slash-parity.ts";
import { applyAppearancePrefs } from "./lib/appearance-prefs.ts";
import {
  applyDocumentTheme,
  colorModeFromPiTheme,
  piThemeLabel,
  resolveNativeThemeSource,
} from "./lib/theme.ts";
import {
  activeThemePack,
  applyThemeSelection,
  isDefaultThemeSelection,
  resolveSidebarMaterialGlass,
  resolveSkinColorMode,
} from "./lib/theme-packs.ts";
import { cn } from "./lib/utils.ts";
import { isExtensionUiDialogMethod, promptExtensionUiDialog } from "./lib/extension-ui-prompt.ts";
import {
  applyExtensionUiFireForget,
  emptyExtensionUiPortableState,
  isExtensionUiFireForgetMethod,
  mcpStatusFromExtensionUi,
  type ExtensionUiPortableState,
} from "./lib/extension-ui-state.ts";
import { t, type Locale } from "./lib/i18n.ts";
import {
  clampToAvailableServiceTier,
  migrateLegacySpeedToServiceTier,
  resolveDisplayServiceTiers,
  type ServiceTierId,
} from "./lib/service-tier.ts";
import {
  clampToAvailableThinkingLevel,
  resolveDisplayThinkingLevels,
} from "./lib/thinking-levels.ts";
import {
  loadAccessMode,
  loadAccessVisibility,
  loadShowContextUsage,
  resolveAccessMode,
  saveAccessMode,
  saveAccessVisibility,
  saveShowContextUsage,
  type AccessMode,
  type AccessVisibility,
} from "./lib/settings-prefs.ts";
import { requestMacNotificationPermission } from "./lib/notification-permission.ts";
import { loadNotificationPrefs } from "./lib/notification-prefs.ts";
import { installOverlayScroll, syncOverlayScroll } from "./lib/overlay-scroll.ts";
import { sidebarRailWidth } from "./lib/sidebar-prefs.ts";
import { matchShortcut, SHORTCUT_OVERRIDES_CHANGED_EVENT } from "./lib/shortcuts.ts";
import { loadContentModeForSession } from "./lib/content-mode-prefs.ts";
import { projectTrustPromptKey, shouldPromptProjectTrust } from "./lib/project-trust-prompt.ts";
import { loadTerminalPrefs, resolveTerminalTheme } from "./lib/terminal-prefs.ts";
import {
  loadPinnedProjects,
  markUnreadOnAgentSettle,
  mergeThreadRows,
  savePinnedProjects,
} from "./lib/project-prefs.ts";
import {
  filterRecentWorkspaces,
  firstLine,
  isNonProjectWorkspacePath,
  mergeRecentWithOpenProject,
  prependRecentPath,
  threadsForWorkspaceBucket,
  unionRecentWorkspaces,
  workspaceLabel,
} from "./lib/workspace.ts";
import { appendHostEvent } from "./lib/host-events.ts";
import { deriveRunState, historyToTimeline, type TimelineItem } from "./lib/timeline.ts";
import {
  classifyRuntimeEventDelivery,
  sessionKeyFromSnapshot,
  sessionRunKey,
  shouldReuseForegroundThread,
  useShellStore,
} from "./store/shell-store.ts";
import "./styles.css";

const initialThemeState = useShellStore.getState();
applyDocumentTheme(initialThemeState.colorMode);
applyThemeSelection(
  initialThemeState.themeSelection,
  initialThemeState.colorMode,
  [],
  undefined,
  initialThemeState.sidebarTranslucent,
);
applyAppearancePrefs();
const NEW_SESSION_OP_TIMEOUT_MS = 30_000;

/** Surface app-level errors as a modal (agent timeline errors stay in-chat). */
function reportAppError(error: unknown, fallback: string): string {
  const raw = error instanceof Error && error.message.trim() ? error.message : fallback;
  const message = unwrapRemoteIpcError(raw);
  useShellStore.getState().showAppError(message);
  return message;
}

function unknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "";
}

/** Host still mid-turn while UI thought it was idle (stale running flag / prior IPC orphan). */
function isAlreadyProcessingError(error: unknown): boolean {
  const message = unknownErrorMessage(error);
  return /already processing/i.test(message);
}

/** Abort timed out and main recycled the host — in-flight prompt IPC is expected to die. */
function isAbortRecycleError(error: unknown): boolean {
  const message = unknownErrorMessage(error);
  return /recycled after abort|timed out handling agent\.abort/i.test(message);
}

function maybeNotify(kind: "complete" | "error" | "crash", body?: string): void {
  const prefs = loadNotificationPrefs();
  if (!prefs.enabled) return;
  if (kind === "complete" && !prefs.onComplete) return;
  if (kind === "error" && !prefs.onError) return;
  if (kind === "crash" && !prefs.onHostCrash) return;
  const locale = useShellStore.getState().locale;
  const title =
    kind === "complete"
      ? t(locale, "notify.completeTitle")
      : kind === "error"
        ? t(locale, "notify.errorTitle")
        : t(locale, "notify.crashTitle");
  // Focus check runs in main via requireUnfocused (document.hasFocus is unreliable in Electron).
  void window.zeno.notifications
    .show({
      title,
      body: body?.trim() || title,
      silent: !prefs.sound,
      requireUnfocused: prefs.onlyWhenUnfocused,
    })
    .catch(() => undefined);
}

/**
 * Mark sidebar session unread when a turn settles and the user is not currently
 * reading that transcript (other session, settings, packages, …).
 * Must run before settleSessionByRuntime drops the runtime→session binding.
 */
function maybeMarkUnreadForRuntime(runtimeId: string): void {
  const store = useShellStore.getState();
  const sessionKey = store.sessionKeyForRuntime(runtimeId);
  if (!sessionKey) return;
  markUnreadOnAgentSettle(sessionKey, {
    activeSessionKey: sessionKeyFromSnapshot(store.snapshot),
    view: store.view,
  });
}

async function respondToExtensionUi(event: Extract<HostEvent, { type: "extensionUi.request" }>) {
  if (!isExtensionUiDialogMethod(event.method)) return;
  const { ok, value } = await promptExtensionUiDialog({
    ...event,
    method: event.method,
  });
  await window.zeno.extensionUi.respond({
    runtimeId: event.runtimeId,
    requestId: event.requestId,
    ok,
    value,
  });
}

function applyExtensionNotify(
  notify: { message: string; type: "info" | "warning" | "error" } | undefined,
): void {
  if (!notify?.message) return;
  // Surface in host status strip; escalate error/warning to OS notifications.
  useShellStore.getState().setStatus(notify.message);
  if (notify.type === "error") {
    maybeNotify("error", notify.message);
  } else if (notify.type === "warning") {
    maybeNotify("error", notify.message);
  }
}

function hostPillState(status: string, running: boolean): string {
  if (running) return "running";
  const lower = status.toLowerCase();
  if (lower.includes("ready") || lower.includes("settled") || lower.includes("restarted"))
    return "ready";
  if (lower.includes("exit") || lower.includes("fail") || lower.includes("crash")) return "error";
  return "idle";
}

function App() {
  useEffect(() => {
    if (loadNotificationPrefs().enabled) {
      void requestMacNotificationPermission();
    }
  }, []);

  const status = useShellStore((s) => s.status);
  const snapshot = useShellStore((s) => s.snapshot);
  const events = useShellStore((s) => s.events);
  const liveStream = useShellStore((s) => s.liveStream);
  const history = useShellStore((s) => s.history);
  const threads = useShellStore((s) => s.threads);
  const prompt = useShellStore((s) => s.prompt);
  const sentPrompts = useShellStore((s) => s.sentPrompts);
  const queuedMessages = useShellStore((s) => s.queuedMessages);
  const running = useShellStore((s) => s.running);
  const sessionMarkers = useShellStore((s) => s.sessionMarkers);
  const runningSessions = useShellStore((s) => s.runningSessions);
  const reviewOpen = useShellStore((s) => s.reviewOpen);
  const envPanelOpen = useShellStore((s) => s.envPanelOpen);
  const sidebarOpen = useShellStore((s) => s.sidebarOpen);
  const lastFailure = useShellStore((s) => s.lastFailure);
  const appError = useShellStore((s) => s.appError);
  const view = useShellStore((s) => s.view);
  const runtimeId = useShellStore((s) => s.runtimeId);
  const packages = useShellStore((s) => s.packages);
  const resources = useShellStore((s) => s.resources);
  const ecoLoading = useShellStore((s) => s.ecoLoading);
  const colorMode = useShellStore((s) => s.colorMode);
  const themePreference = useShellStore((s) => s.themePreference);
  const themeSelection = useShellStore((s) => s.themeSelection);
  const themeLibrary = useShellStore((s) => s.themeLibrary);
  const themePreview = useShellStore((s) => s.themePreview);
  const sidebarTranslucent = useShellStore((s) => s.sidebarTranslucent);
  const defaultThemeActive = isDefaultThemeSelection(themeSelection) && !themePreview;
  const activeSkin = defaultThemeActive
    ? undefined
    : activeThemePack(themeSelection, themeLibrary.skins, themePreview);
  const activeSkinPack = activeSkin?.config;
  const activeSkinMode = activeSkinPack
    ? resolveSkinColorMode(activeSkinPack, colorMode)
    : colorMode;
  const sidebarGlass = activeSkinPack
    ? resolveSidebarMaterialGlass(activeSkinPack, sidebarTranslucent)
    : false;
  /** Electron chrome source — keep "system" when following OS so matchMedia can update. */
  const nativeThemeSource = resolveNativeThemeSource(themePreference, activeSkinPack?.appearance);
  const locale = useShellStore((s) => s.locale);
  const sidebarCollapsed = useShellStore((s) => s.sidebarCollapsed);
  const sidebarWidthPx = useShellStore((s) => s.sidebarWidthPx);
  const settingsSection = useShellStore((s) => s.settingsSection);
  const paletteOpen = useShellStore((s) => s.paletteOpen);
  const contentMode = useShellStore((s) => s.contentMode);
  const setContentMode = useShellStore((s) => s.setContentMode);
  /** When false, PiTuiTerminal is unmounted (no previous-session canvas). */
  const [terminalSurfaceActive, setTerminalSurfaceActive] = useState(true);
  /** Portable extension fire-and-forget chrome (status / widgets / title / working). */
  const [extensionUiState, setExtensionUiState] = useState<ExtensionUiPortableState>(() =>
    emptyExtensionUiPortableState(),
  );
  const extensionUiStateRef = useRef(extensionUiState);
  extensionUiStateRef.current = extensionUiState;
  const [mcpServerCount, setMcpServerCount] = useState(0);
  /** Session file the mounted terminal is waiting for (normed path). */
  const transitionSessionRef = useRef<string | null>(null);
  /** Match main-process session keys (macOS /private/var collapse). */
  function normSessionPath(path: string): string {
    let p = path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    if (p.startsWith("/private/")) p = p.slice("/private".length);
    return p;
  }

  /**
   * Sync paint: unmount the old TUI in this call stack (before any await).
   * PiTuiTerminal keeps its host hidden until the expected session is ready.
   */
  function beginSurfaceTransition(expectsSession?: string) {
    transitionSessionRef.current = expectsSession?.trim() ? normSessionPath(expectsSession) : null;
    flushSync(() => setTerminalSurfaceActive(false));
  }

  function endSurfaceTransition(fromSession?: string) {
    const expects = transitionSessionRef.current;
    if (expects && fromSession?.trim()) {
      if (normSessionPath(fromSession) !== expects) return;
    }
    transitionSessionRef.current = null;
  }

  /**
   * Restore chat vs terminal for a session after open/switch.
   * Terminal: contentMode + remount TUI for the *already applied* sessionFile.
   */
  function restoreSessionContentMode(sessionFile: string | undefined) {
    const desired = loadContentModeForSession(sessionFile);
    // Block terminal only when *this* session is mid-turn (not a stale global flag
    // from a parked previous session — that left an empty terminal pane after hops).
    const targetBusy = sessionFile
      ? useShellStore.getState().isSessionRunning(sessionFile)
      : useShellStore.getState().running;
    if (desired === "terminal" && !targetBusy && sessionFile?.trim()) {
      // Warm Ghostty before mounting the surface so WASM startup overlaps the
      // session/layout work instead of delaying the first visible frame.
      preloadPiTuiTerminal();
      holdBlankRef.current = false;
      pendingScrollBottomRef.current = false;
      setTimelineReady(true);
      // Snapshot already has the new sessionFile; mount only that identity.
      setContentMode("terminal", { persist: false });
      transitionSessionRef.current = normSessionPath(sessionFile);
      // Double rAF: wait until contentMode + flex layout commit before mount so
      // FitAddon does not measure a zero-height host after a session hop.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (useShellStore.getState().contentMode !== "terminal") return;
          setTerminalSurfaceActive(true);
        });
      });
      return;
    }
    setTerminalSurfaceActive(false);
    if (useShellStore.getState().contentMode !== "chat") {
      setContentMode("chat", { persist: false });
    }
  }

  const setStatus = useShellStore((s) => s.setStatus);
  const setEvents = useShellStore((s) => s.setEvents);
  const setThreads = useShellStore((s) => s.setThreads);
  const setPrompt = useShellStore((s) => s.setPrompt);
  const setSentPrompts = useShellStore((s) => s.setSentPrompts);
  const setRunning = useShellStore((s) => s.setRunning);
  const setSessionRunning = useShellStore((s) => s.setSessionRunning);
  const setSessionMarker = useShellStore((s) => s.setSessionMarker);
  const setReviewOpen = useShellStore((s) => s.setReviewOpen);
  const setEnvPanelOpen = useShellStore((s) => s.setEnvPanelOpen);
  /** Whether env panel can be shown at current thread-column width. */

  /** float = overlay without squeeze; dock = flex squeeze. */
  const [envPanelLayout, setEnvPanelLayout] = useState<Exclude<EnvPanelLayoutMode, "none">>("dock");
  const [sessionTreeOpen, setSessionTreeOpen] = useState(false);
  const [sessionTreeMode, setSessionTreeMode] = useState<"navigate" | "fork">("navigate");
  const [sessionTree, setSessionTree] = useState<SessionTreeView | undefined>();
  const [sessionTreeLoading, setSessionTreeLoading] = useState(false);
  const [sessionTreeError, setSessionTreeError] = useState<string | undefined>();
  const [sessionInfoOpen, setSessionInfoOpen] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<SessionInfoView | undefined>();
  const [sessionInfoLoading, setSessionInfoLoading] = useState(false);
  const [sessionInfoError, setSessionInfoError] = useState<string | undefined>();
  /** `/name` with no args → rename dialog for pi session display name. */
  const [sessionNameDialogOpen, setSessionNameDialogOpen] = useState(false);
  /**
   * Cold-start gate: full-window overlay until pi is ensured and host config is loaded.
   * Main process may already be running ensure; we join that work and show live status.
   */
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] = useState(() =>
    t(useShellStore.getState().locale, "boot.starting"),
  );
  const [bootstrapDetail, setBootstrapDetail] = useState<string | undefined>();
  const [bootstrapError, setBootstrapError] = useState<string | undefined>();
  const lastEscapeAtRef = useRef(0);
  const threadColumnRef = useRef<HTMLElement | null>(null);
  const setSidebarOpen = useShellStore((s) => s.setSidebarOpen);
  const setLastFailure = useShellStore((s) => s.setLastFailure);
  const clearAppError = useShellStore((s) => s.clearAppError);
  const setView = useShellStore((s) => s.setView);
  const setPackages = useShellStore((s) => s.setPackages);
  const setResources = useShellStore((s) => s.setResources);
  const setEcoLoading = useShellStore((s) => s.setEcoLoading);
  const setThemePreference = useShellStore((s) => s.setThemePreference);
  const setThemeSelection = useShellStore((s) => s.setThemeSelection);
  const setThemeLibrary = useShellStore((s) => s.setThemeLibrary);
  const setThemePreview = useShellStore((s) => s.setThemePreview);
  const toggleColorMode = useShellStore((s) => s.toggleColorMode);
  const syncSystemTheme = useShellStore((s) => s.syncSystemTheme);
  const toggleSidebarCollapsed = useShellStore((s) => s.toggleSidebarCollapsed);
  const setSidebarWidthPx = useShellStore((s) => s.setSidebarWidthPx);
  const setSidebarTranslucent = useShellStore((s) => s.setSidebarTranslucent);
  const setLocale = useShellStore((s) => s.setLocale);
  const setSettingsSection = useShellStore((s) => s.setSettingsSection);
  const setPaletteOpen = useShellStore((s) => s.setPaletteOpen);
  const setRuntimeId = useShellStore((s) => s.setRuntimeId);
  const setLastSequence = useShellStore((s) => s.setLastSequence);
  const acceptSnapshot = useShellStore((s) => s.acceptSnapshot);
  const applySessionOpen = useShellStore((s) => s.applySessionOpen);
  const resetAfterStop = useShellStore((s) => s.resetAfterStop);

  const timelineEndRef = useRef<HTMLDivElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const composerDockRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingComposerFocus = useRef(false);
  /** Floating composer height — timeline bottom inset so last rows stay above the input. */
  const [composerDockHeight, setComposerDockHeight] = useState(200);
  const [modelOptions, setModelOptions] = useState<
    Array<{ provider: string; id: string; name: string }>
  >([]);
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);
  /** Sessions keyed by project cwd — all projects, no switch required to browse. */
  const [threadsByCwd, setThreadsByCwd] = useState<Record<string, SessionThreadSummary[]>>({});
  const [accessMode, setAccessMode] = useState<AccessMode>(loadAccessMode);
  const [accessVisibility, setAccessVisibility] = useState<AccessVisibility>(loadAccessVisibility);
  const [showContextUsage, setShowContextUsage] = useState(loadShowContextUsage);
  const [shortcutRevision, setShortcutRevision] = useState(0);

  function applyAccessMode(mode: AccessMode) {
    const next = resolveAccessMode(mode, accessVisibility);
    setAccessMode(next);
    saveAccessMode(next);
    // Full access maps onto project trust when host is live.
    if (next === "full") {
      const snap = useShellStore.getState().snapshot;
      if (snap && !snap.projectTrusted) {
        void window.zeno.trust.set(true).then(
          (nextSnap) => {
            acceptSnapshot(nextSnap);
            setStatus("Project trusted");
          },
          (error: unknown) => {
            reportAppError(error, "Failed to set trust");
          },
        );
      }
    }
  }

  function applyAccessVisibility(visibility: AccessVisibility) {
    setAccessVisibility(visibility);
    saveAccessVisibility(visibility);
    // If the selected mode was hidden, fall back to a still-visible option.
    const resolved = resolveAccessMode(accessMode, visibility);
    if (resolved !== accessMode) {
      setAccessMode(resolved);
      saveAccessMode(resolved);
    }
  }

  function applyShowContextUsage(value: boolean) {
    setShowContextUsage(value);
    saveShowContextUsage(value);
  }
  const [serviceTier, setServiceTier] = useState<ServiceTierId>(() => {
    try {
      // Prefer new key; fall back to legacy speed labels.
      const next = localStorage.getItem("zeno.composer.serviceTier");
      if (next === "flex" || next === "default" || next === "priority") return next;
      return migrateLegacySpeedToServiceTier(localStorage.getItem("zeno.composer.speed"));
    } catch {
      // ignore
    }
    return "default";
  });
  const [attachments, setAttachments] = useState<string[]>([]);
  /** Cwds dismissed with "Later" this app session (no trust.json write). */
  const trustPromptDismissedRef = useRef<Set<string>>(new Set());
  const [trustPromptDismissTick, setTrustPromptDismissTick] = useState(0);
  const [trustPromptBusy, setTrustPromptBusy] = useState(false);
  /**
   * Project backing the current composer/session chrome. Pure conversations clear it,
   * while a rail-only project selection remains independent until a session is created.
   */
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState<string | undefined>();
  /** Always-current workspace for async helpers (avoids stale closures after setState). */
  const selectedWorkspacePathRef = useRef<string | undefined>(undefined);
  selectedWorkspacePathRef.current = selectedWorkspacePath;
  /** Explicit project-row selection, independent from the workspace of the active session. */
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | undefined>();
  const selectedProjectPathRef = useRef<string | undefined>(undefined);
  selectedProjectPathRef.current = selectedProjectPath;
  /**
   * True while global「新建会话」is in flight. Forces conversation empty chrome
   * (title + no project highlight) without wiping snapshot model/thinking mid-flight.
   */
  const [pendingPureConversation, setPendingPureConversation] = useState(false);
  const pendingPureConversationRef = useRef(false);

  function selectProjectPath(path: string | undefined) {
    const projectPath = asProjectPath(path);
    selectedProjectPathRef.current = projectPath;
    setSelectedProjectPath(projectPath);
  }

  function selectWorkspacePath(path: string | undefined) {
    selectedWorkspacePathRef.current = path;
    setSelectedWorkspacePath(path);
    // Workspace/session navigation selects its session row, not the containing project row.
    selectProjectPath(undefined);
  }

  /** Last known model chrome — survives snapshot gaps so composer never flashes "未选择模型". */
  const lastComposerChromeRef = useRef<{
    model?: { provider: string; id: string; api?: string; reasoning?: boolean };
    thinkingLevel?: string;
    availableThinkingLevels?: string[];
    serviceTier?: ServiceTierId;
    availableServiceTiers?: ServiceTierId[];
  }>({});
  if (snapshot?.model) {
    const prev = lastComposerChromeRef.current;
    const thinkingLevel = snapshot.thinkingLevel ?? prev.thinkingLevel;
    // Model-specific list from pi getSupportedThinkingLevels — keep last known across gaps.
    const availableThinkingLevels =
      snapshot.availableThinkingLevels ?? prev.availableThinkingLevels;
    const nextServiceTier =
      snapshot.serviceTier === "flex" ||
      snapshot.serviceTier === "default" ||
      snapshot.serviceTier === "priority"
        ? snapshot.serviceTier
        : prev.serviceTier;
    const availableServiceTiers = resolveDisplayServiceTiers(
      snapshot.availableServiceTiers ?? prev.availableServiceTiers,
    );
    lastComposerChromeRef.current = {
      model: snapshot.model,
      ...(thinkingLevel !== undefined ? { thinkingLevel } : {}),
      ...(availableThinkingLevels !== undefined ? { availableThinkingLevels } : {}),
      ...(nextServiceTier !== undefined ? { serviceTier: nextServiceTier } : {}),
      ...(availableServiceTiers.length > 0 ? { availableServiceTiers } : {}),
    };
  }

  /** Hide conversation/scratch dirs from project chrome / sidebar. */
  function asProjectPath(path: string | undefined): string | undefined {
    if (!path || isNonProjectWorkspacePath(path)) return undefined;
    return path;
  }

  // Prefer explicit selection over host snapshot so mid-switch host.ready cannot flash the rail.
  // While creating a pure conversation, never fall back to the old project snapshot cwd.
  const workspacePath =
    asProjectPath(selectedWorkspacePath) ??
    (pendingPureConversation ? undefined : asProjectPath(snapshot?.cwd));
  const workspace = workspaceLabel(workspacePath);
  /** Host running under conversation home (not a user project), or about to. */
  const isPureConversation =
    pendingPureConversation || Boolean(snapshot?.cwd && isNonProjectWorkspacePath(snapshot.cwd));
  /** Suppress snapshot→selection sync while switchThread / newBlankTask is in flight. */
  const switchingSessionRef = useRef(false);

  useEffect(() => {
    // Never promote conversation/scratch dirs into the "selected project" slot.
    if (switchingSessionRef.current || pendingPureConversationRef.current) return;
    if (snapshot?.cwd && !isNonProjectWorkspacePath(snapshot.cwd)) {
      selectWorkspacePath(snapshot.cwd);
    }
  }, [snapshot?.cwd]);
  /** Session identity — used to pin scroll + remount timeline rows on switch. */
  const sessionKey = snapshot?.sessionFile ?? snapshot?.sessionId ?? "";
  const foregroundMarkerState = sessionKey
    ? sessionMarkers[sessionRunKey(sessionKey)]?.state
    : undefined;
  // Prefer per-session marker for waiting / recovering so the composer + timeline
  // keep the live phase after model errors (auto-retry) and extension UI prompts.
  const runState =
    foregroundMarkerState === "waiting" || foregroundMarkerState === "recovering"
      ? foregroundMarkerState
      : deriveRunState({ hostStatus: status, running, lastFailure });
  const timeline = useMemo(() => {
    // history = session JSONL at open; liveStream = append-only log for this session
    // (streamed text only grows). Do not re-project deltas from the events ring.
    const items = [...historyToTimeline(history), ...liveStream.items].filter(
      (item) => !(snapshot?.hideThinkingBlock && item.kind === "thinking"),
    );
    // Prefix ids with session so React does not reuse rows across switches.
    if (!sessionKey) return items;
    return items.map((item) => ({ ...item, id: `${sessionKey}:${item.id}` }));
  }, [history, liveStream, sessionKey, snapshot?.hideThinkingBlock]);
  const hasActivity = timeline.length > 0;
  const waitingForInput = runState === "waiting" || foregroundMarkerState === "waiting";
  const activeThread = threads.find((thread) => thread.active);
  const threadTitle =
    activeThread?.title ||
    (sentPrompts[0]
      ? firstLine(sentPrompts[0])
      : pendingPureConversation || isPureConversation || !snapshot
        ? t(locale, "thread.new")
        : t(locale, "thread.current"));
  const displayModel = snapshot?.model ?? lastComposerChromeRef.current.model;
  // Dynamic per current model (HostSnapshot.availableThinkingLevels); full set only as cold fallback.
  const displayThinkingLevels = resolveDisplayThinkingLevels(
    snapshot?.availableThinkingLevels ?? lastComposerChromeRef.current.availableThinkingLevels,
  );
  const displayThinkingLevel = clampToAvailableThinkingLevel(
    snapshot?.thinkingLevel ?? lastComposerChromeRef.current.thinkingLevel ?? "off",
    displayThinkingLevels,
  );
  // OpenAI service_tier only — empty when current model has no request-priority control.
  const displayServiceTiers = resolveDisplayServiceTiers(
    snapshot?.availableServiceTiers ?? lastComposerChromeRef.current.availableServiceTiers,
  );
  const displayServiceTier = clampToAvailableServiceTier(
    snapshot?.serviceTier ?? lastComposerChromeRef.current.serviceTier ?? serviceTier,
    displayServiceTiers.length > 0 ? displayServiceTiers : ["default"],
  );

  function normalizeCwdKey(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+$/, "");
  }

  /** Keep optimistic/live rows when a slower disk scan returns older metadata. */
  function mergeSidebarThreads(
    previous: SessionThreadSummary[],
    incoming: SessionThreadSummary[],
  ): SessionThreadSummary[] {
    const merged = mergeThreadRows(previous, incoming);
    const incomingById = new Map(incoming.map((row) => [row.id, row]));
    return merged.map((row) => {
      const latest = incomingById.get(row.id);
      return latest ? { ...row, active: latest.active } : row;
    });
  }

  /**
   * Write host/disk rows into one cwd bucket. Filters by thread.cwd and never
   * replaces a non-empty bucket with a raced empty/mismatched list (rapid
   * project「新建会话」used to poison maps and hide 对话 rows).
   */
  function cacheThreadsForCwd(cwd: string, threads: SessionThreadSummary[]) {
    const key = normalizeCwdKey(cwd);
    if (!key) return;
    const matched = threadsForWorkspaceBucket(threads, cwd);
    if (matched.length === 0) {
      setThreadsByCwd((prev) => {
        const existing = prev[key] ?? [];
        if (existing.length > 0) return prev;
        return { ...prev, [key]: existing };
      });
      return;
    }
    setThreadsByCwd((prev) => ({
      ...prev,
      [key]: mergeSidebarThreads(prev[key] ?? [], matched),
    }));
  }

  async function refreshThreads() {
    try {
      const listed = await window.zeno.session.list();
      const cwd = useShellStore.getState().snapshot?.cwd;
      const matched = cwd ? threadsForWorkspaceBucket(listed.threads, cwd) : listed.threads;
      setThreads(mergeSidebarThreads(useShellStore.getState().threads, matched));
      if (cwd) cacheThreadsForCwd(cwd, listed.threads);
    } catch {
      // Host may be stopped.
    }
  }

  /**
   * Optimistically update the open session title/messageCount after the user sends.
   * Needed because pi defers flushing session JSONL until the first assistant message
   * — without this, a brand-new conversation stays invisible (or keeps "(no messages)")
   * for the whole first turn.
   *
   * Preserve list position:「优先级」is import/add order and must not jump on activity.
   * 「最近更新」reorders at render time via sortThreadsByMode, not here.
   */
  function touchActiveThreadInSidebar(userText: string) {
    const store = useShellStore.getState();
    const snap = store.snapshot;
    const sessionId = snap?.sessionId?.trim();
    const sessionPath = snap?.sessionFile?.trim();
    if (!sessionId && !sessionPath) return;
    const cwd = (snap?.cwd || "").trim();
    const title = firstLine(userText) || t(store.locale, "thread.new");
    const now = new Date().toISOString();
    const newLabel = t(store.locale, "thread.new");
    const patch = (list: SessionThreadSummary[]): SessionThreadSummary[] => {
      const match = (row: SessionThreadSummary) =>
        (sessionId && row.id === sessionId) ||
        (sessionPath && row.path.replace(/\\/g, "/") === sessionPath.replace(/\\/g, "/"));
      const existingIndex = list.findIndex(match);
      const existing = existingIndex >= 0 ? list[existingIndex] : undefined;
      const base = (existing?.titleBase ?? existing?.title ?? "").trim();
      const looksDefault =
        !base || base === "(no messages)" || /^Thread\s/i.test(base) || base === newLabel;
      const nextTitle = existing && !looksDefault ? existing.title : title;
      const nextBase = existing && !looksDefault ? (existing.titleBase ?? existing.title) : title;
      const nextRow: SessionThreadSummary = existing
        ? {
            ...existing,
            title: nextTitle,
            titleBase: nextBase,
            modifiedAt: now,
            messageCount: Math.max(existing.messageCount, 1),
            active: true,
          }
        : {
            id: sessionId || sessionPath || `live-${now}`,
            path: sessionPath || sessionId || "",
            cwd,
            title,
            titleBase: title,
            modifiedAt: now,
            messageCount: 1,
            active: true,
          };
      if (existingIndex >= 0) {
        // Existing session: update in place — do not jump to top on activity.
        return list.map((row, index) =>
          index === existingIndex ? nextRow : { ...row, active: false },
        );
      }
      // Brand-new session: land at the top of this project's (or 对话) session list only.
      return [nextRow, ...list.map((row) => ({ ...row, active: false }))];
    };
    setThreads(patch(store.threads));
    if (cwd) {
      const key = normalizeCwdKey(cwd);
      setThreadsByCwd((prev) => ({
        ...prev,
        [key]: patch(prev[key] ?? prev[cwd] ?? []),
      }));
    }
  }

  async function refreshProjectSessions(paths: string[]) {
    // Never treat conversation/scratch homes as project buckets.
    const unique = [
      ...new Set(
        paths.map(normalizeCwdKey).filter((cwd) => cwd && !isNonProjectWorkspacePath(cwd)),
      ),
    ];
    if (unique.length === 0) return;
    const results = await Promise.all(
      unique.map(async (cwd) => {
        try {
          const threads = await window.zeno.session.listForCwd(cwd);
          return [cwd, threadsForWorkspaceBucket(threads, cwd)] as const;
        } catch {
          return [cwd, [] as SessionThreadSummary[]] as const;
        }
      }),
    );
    setThreadsByCwd((prev) => {
      const next = { ...prev };
      for (const [cwd, threads] of results) {
        // Empty raced result must not wipe a warm project cache.
        if (threads.length === 0) {
          if (!next[cwd]?.length) next[cwd] = next[cwd] ?? [];
          continue;
        }
        next[cwd] = mergeSidebarThreads(prev[cwd] ?? [], threads);
      }
      return next;
    });
  }

  /**
   * Prefetch pure-conversation sessions (Documents/Zeno/conversations) so the
   * 对话 rail stays populated even while a project host is active.
   */
  async function refreshConversationSessions() {
    try {
      const convCwd = await window.zeno.workspace.ensureConversation();
      const threads = await window.zeno.session.listForCwd(convCwd);
      // Only accept pure-conversation rows; cacheThreadsForCwd also refuses empty races.
      cacheThreadsForCwd(convCwd, threadsForWorkspaceBucket(threads, convCwd));
    } catch {
      // Host may be stopped or conversation home unavailable.
    }
  }

  useEffect(() => {
    applyDocumentTheme(colorMode);
    applyThemeSelection(
      themeSelection,
      colorMode,
      themeLibrary.skins,
      themePreview,
      sidebarTranslucent,
    );
  }, [colorMode, sidebarTranslucent, themeLibrary.skins, themePreview, themeSelection]);

  useEffect(() => {
    let cancelled = false;
    void window.zeno.themes
      .list()
      .then((library) => {
        if (cancelled) return;
        setThemeLibrary(library);
        setThemeSelection({ id: library.activeId });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [setThemeLibrary, setThemeSelection]);

  useEffect(() => {
    void window.zeno.appearance.setThemeSource(nativeThemeSource);
  }, [nativeThemeSource]);

  // Overlay auto-hide scrollbars for main content panes (settings / packages / thread…).
  useEffect(() => installOverlayScroll(), []);

  // Env panel: float in free right gutter when it would not cover conversation;
  // dock (squeeze) when it would cover. Prefer dock over hiding the chrome entirely
  // so chat view keeps a reachable env toggle on medium widths.
  useEffect(() => {
    if (view !== "thread") return;
    const el = threadColumnRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = (width: number) => {
      const mode = envPanelLayoutForWidth(width);
      // "none" still docks — never hide the header toggle for medium widths.
      setEnvPanelLayout(mode === "float" ? "float" : "dock");
    };
    apply(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      apply(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  // Follow OS appearance when theme preference is "system".
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const onChange = () => syncSystemTheme();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [syncSystemTheme, themePreference]);

  useEffect(() => {
    void refreshRecentWorkspaces();
  }, [snapshot?.cwd]);

  // The persisted mode is available on the first render, before the host
  // snapshot arrives. Start Ghostty immediately so cold startup can proceed
  // in parallel with host/session restoration.
  useLayoutEffect(() => {
    if (contentMode === "terminal") preloadPiTuiTerminal();
  }, [contentMode]);

  // Load sessions for every known project so expand shows chats without switching first.
  useEffect(() => {
    const paths = [...(workspacePath ? [workspacePath] : []), ...recentWorkspaces];
    void refreshProjectSessions(paths);
    // Always refresh pure conversations for the 对话 section.
    void refreshConversationSessions();
  }, [workspacePath, recentWorkspaces]);

  // Cold start: gate until host/config is loaded. Default runtime is builtin SDK —
  // do not probe/install global pi here (Settings → Pi handles global install/switch).
  useEffect(() => {
    let cancelled = false;
    const loc = () => useShellStore.getState().locale;
    const setBoot = (status: string, detail?: string) => {
      if (cancelled) return;
      setBootstrapStatus(status);
      setBootstrapDetail(detail);
      useShellStore.getState().setStatus(status);
    };
    void (async () => {
      try {
        setBoot(t(loc(), "boot.starting"));
        if (cancelled) return;

        setBoot(t(loc(), "boot.workspaces"));
        await refreshRecentWorkspaces();
        if (cancelled) return;

        setBoot(t(loc(), "boot.host"));
        await refreshPiStatus({ ensure: true });
        if (cancelled) return;

        setBoot(t(loc(), "boot.config"));
        await refreshConversationSessions();
        if (cancelled) return;
        // Auto-resume starts the host before this window subscribes to events,
        // so session.opened (and its history) is often missed. Project it now.
        await hydrateResumedSession();
        if (cancelled) return;

        setBoot(t(loc(), "boot.ready"));
        // Brief beat so "ready" is readable before the shell appears.
        await new Promise((resolve) => window.setTimeout(resolve, 180));
      } catch (error) {
        if (!cancelled) {
          const detail = error instanceof Error ? error.message : String(error);
          setBoot(t(loc(), "boot.failed", { detail }));
          setBootstrapError(detail);
          // Still try to bring the shell up so the user is not stuck forever.
          try {
            await refreshRecentWorkspaces();
            await refreshPiStatus({ ensure: true });
            await refreshConversationSessions();
            await hydrateResumedSession();
          } catch {
            // ignore secondary failures
          }
        }
      } finally {
        if (!cancelled) setBootstrapReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () =>
      window.zeno.host.onEvent((event) => {
        const store = useShellStore.getState();
        if (event.type === "host.ready" || event.type === "runtime.snapshot") {
          store.acceptSnapshot(event.snapshot);
          // New runtime → drop previous extension chrome (status/widgets/title).
          if (
            event.snapshot.runtimeId &&
            extensionUiStateRef.current.runtimeId &&
            event.snapshot.runtimeId !== extensionUiStateRef.current.runtimeId
          ) {
            const cleared = emptyExtensionUiPortableState(event.snapshot.runtimeId);
            extensionUiStateRef.current = cleared;
            setExtensionUiState(cleared);
          }
          // Host up → refresh pi-home status (packages / resources), project or not.
          if (event.type === "host.ready") void refreshPiStatus({ ensure: false });
        } else if (event.type === "host.restarted") {
          store.acceptSnapshot(event.snapshot);
          // Clear busy markers bound to the previous runtime (e.g. abort-timeout recycle).
          store.settleSessionByRuntime(event.previousRuntimeId, "aborted");
          store.setStatus("Agent Host restarted");
          {
            const cleared = emptyExtensionUiPortableState(event.snapshot.runtimeId);
            extensionUiStateRef.current = cleared;
            setExtensionUiState(cleared);
          }
          void refreshPiStatus({ ensure: false });
        } else if (event.type === "host.crashed") {
          // Background (parked) host death must not wipe the foreground session.
          if (event.runtimeId && store.runtimeId && event.runtimeId !== store.runtimeId) {
            store.settleSessionByRuntime(event.runtimeId, "crashed", event.message);
            return;
          }
          store.resetAfterCrash(event.message);
          {
            const cleared = emptyExtensionUiPortableState();
            extensionUiStateRef.current = cleared;
            setExtensionUiState(cleared);
          }
          maybeNotify("crash", event.message);
        } else if (event.type === "session.list") {
          const cwd = store.snapshot?.cwd;
          const matched = cwd ? threadsForWorkspaceBucket(event.threads, cwd) : event.threads;
          store.setThreads(mergeSidebarThreads(store.threads, matched));
          if (cwd && matched.length > 0) cacheThreadsForCwd(cwd, matched);
        } else if (event.type === "session.opened") {
          // switchThread / newBlankTask apply the open themselves. Intermediate
          // session.opened (e.g. from workspace.openPath) must not wipe history into
          // an empty hero flash mid-transition.
          if (switchingSessionRef.current || pendingPureConversationRef.current) {
            const cwd = event.snapshot.cwd;
            if (cwd && event.threads.length > 0) cacheThreadsForCwd(cwd, event.threads);
            return;
          }
          markSessionOpenForBottomScroll();
          store.applySessionOpen(event);
          requestContentReveal();
          // Keep sidebar caches in sync without clearing other projects' lists.
          const cwd = event.snapshot.cwd;
          if (cwd && event.threads.length > 0) cacheThreadsForCwd(cwd, event.threads);
        } else if (event.type === "packages.progress") {
          if (event.message) store.setStatus(event.message);
        } else if (event.type === "packages.changed") {
          store.setPackages(event.packages);
          // Install/remove/update may load new skills/prompts/extensions.
          void window.zeno.resources
            .list()
            .then((list) => store.setResources(list))
            .catch(() => undefined);
        } else if (event.type === "runtime.event") {
          const delivery = classifyRuntimeEventDelivery(store, event);
          // Background (parked) hosts only surface terminal events for sidebar markers.
          if (delivery === "stale-runtime") {
            if (event.event.type === "agent.settled") {
              // Background / parked host — always mark unread if not the open thread.
              maybeMarkUnreadForRuntime(event.runtimeId);
              const failure = store.takePendingFailure(event.runtimeId);
              if (failure) {
                store.settleSessionByRuntime(event.runtimeId, "failed", failure);
                maybeNotify("error", failure);
              } else if (store.sessionKeyForRuntime(event.runtimeId)) {
                store.settleSessionByRuntime(event.runtimeId, "completed");
                maybeNotify("complete");
              }
            } else if (event.event.type === "message.failed") {
              store.setPendingFailure(event.runtimeId, event.event.message);
              const aborted = event.event.reason === "aborted";
              if (aborted) {
                store.takePendingFailure(event.runtimeId);
                maybeMarkUnreadForRuntime(event.runtimeId);
                store.settleSessionByRuntime(event.runtimeId, "aborted", event.event.message);
                // User-initiated abort is not a failure — skip the "task failed" notification.
              }
              // Non-abort errors stay busy so auto-retry can re-enter recovering.
            } else if (event.event.type === "retry.started") {
              const key = store.sessionKeyForRuntime(event.runtimeId);
              if (key) {
                store.setSessionMarker(key, "recovering", {
                  runtimeId: event.runtimeId,
                  reason: event.event.errorMessage,
                });
              }
            } else if (event.event.type === "retry.ended") {
              if (!event.event.success) {
                const msg = event.event.finalError ?? "Retry failed";
                store.setPendingFailure(event.runtimeId, msg);
                maybeMarkUnreadForRuntime(event.runtimeId);
                store.settleSessionByRuntime(event.runtimeId, "failed", msg);
                store.takePendingFailure(event.runtimeId);
                maybeNotify("error", msg);
              } else {
                store.takePendingFailure(event.runtimeId);
                const key = store.sessionKeyForRuntime(event.runtimeId);
                if (key) {
                  store.setSessionMarker(key, "running", { runtimeId: event.runtimeId });
                }
              }
            }
            // Ignore background agent.started — re-binding can re-light finished rows.
            return;
          }
          if (delivery === "duplicate") return;

          // Always fold into append-only liveStream first (sequence-deduped, text never
          // shrinks). Do this even on "gap" so tokens we did receive are not discarded.
          store.applyLiveStreamEvent(event.event, store.sentPrompts, {
            sequence: event.sequence,
          });

          if (delivery === "gap") {
            // Recover host high-water mark; liveStream already has this event's tokens.
            void window.zeno.host.snapshot().then(store.acceptSnapshot);
            store.setEvents((current) => appendHostEvent(current, event));
            if (event.sequence > store.lastSequence) store.setLastSequence(event.sequence);
            return;
          }
          if (event.sequence > store.lastSequence) store.setLastSequence(event.sequence);

          if (event.event.type === "queue.updated") {
            store.setQueuedMessages({
              steering: event.event.steering,
              followUp: event.event.followUp,
            });
          } else if (event.event.type === "message.failed") {
            store.setLastFailure(event.event.message);
            store.setPendingFailure(event.runtimeId, event.event.message);
            const aborted = event.event.reason === "aborted";
            if (aborted) {
              store.takePendingFailure(event.runtimeId);
              maybeMarkUnreadForRuntime(event.runtimeId);
              store.settleSessionByRuntime(event.runtimeId, "aborted", event.event.message);
              // User-initiated abort is not a failure — skip the "task failed" notification.
            }
            // Non-abort model errors keep the turn busy. Auto-retry emits retry.started
            // (recovering); final failure is settled by retry.ended / agent.settled.
          } else if (event.event.type === "retry.started") {
            const key =
              store.sessionKeyForRuntime(event.runtimeId) || sessionKeyFromSnapshot(store.snapshot);
            if (key) {
              store.setSessionMarker(key, "recovering", {
                runtimeId: event.runtimeId,
                reason: event.event.errorMessage,
              });
            }
            store.setStatus(`Retrying ${event.event.attempt}/${event.event.maxAttempts}…`);
          } else if (event.event.type === "retry.ended") {
            if (!event.event.success) {
              const msg = event.event.finalError ?? "Retry failed";
              store.setLastFailure(msg);
              store.setPendingFailure(event.runtimeId, msg);
              maybeMarkUnreadForRuntime(event.runtimeId);
              store.settleSessionByRuntime(event.runtimeId, "failed", msg);
              store.takePendingFailure(event.runtimeId);
              maybeNotify("error", msg);
            } else {
              store.takePendingFailure(event.runtimeId);
              store.setLastFailure(undefined);
              const key =
                store.sessionKeyForRuntime(event.runtimeId) ||
                sessionKeyFromSnapshot(store.snapshot);
              if (key) {
                store.setSessionMarker(key, "running", { runtimeId: event.runtimeId });
              }
            }
          } else if (event.event.type === "agent.settled") {
            maybeMarkUnreadForRuntime(event.runtimeId);
            const failure = store.takePendingFailure(event.runtimeId);
            if (failure) {
              // Model error without a successful recovery (or after retries exhausted).
              store.setLastFailure(failure);
              store.settleSessionByRuntime(event.runtimeId, "failed", failure);
              maybeNotify("error", failure);
            } else if (store.sessionKeyForRuntime(event.runtimeId)) {
              store.setLastFailure(undefined);
              store.settleSessionByRuntime(event.runtimeId, "completed");
              maybeNotify("complete");
            }
            // Disk is flushed after assistant message — sync rail title/recency.
            void window.zeno.session
              .list()
              .then((listed) => {
                if (!listed?.threads) return;
                const cwd = useShellStore.getState().snapshot?.cwd;
                const matched = cwd
                  ? threadsForWorkspaceBucket(listed.threads, cwd)
                  : listed.threads;
                useShellStore
                  .getState()
                  .setThreads(mergeSidebarThreads(useShellStore.getState().threads, matched));
                if (cwd && matched.length > 0) cacheThreadsForCwd(cwd, matched);
              })
              .catch(() => undefined);
          } else if (event.event.type === "user.message") {
            // Live session now has the user text in memory — refresh rail title/order.
            void window.zeno.session
              .list()
              .then((listed) => {
                if (!listed?.threads) return;
                const cwd = useShellStore.getState().snapshot?.cwd;
                const matched = cwd
                  ? threadsForWorkspaceBucket(listed.threads, cwd)
                  : listed.threads;
                useShellStore
                  .getState()
                  .setThreads(mergeSidebarThreads(useShellStore.getState().threads, matched));
                if (cwd && matched.length > 0) cacheThreadsForCwd(cwd, matched);
              })
              .catch(() => undefined);
          } else if (event.event.type === "message.completed") {
            // A successful assistant step clears sticky failure from a prior retry.
            store.takePendingFailure(event.runtimeId);
            store.setLastFailure(undefined);
          }
          // Do NOT set running from agent.started / compaction.started — those can fire
          // around host/session lifecycle without a user prompt and stuck the sidebar spinner.
          // Busy markers are only set by sendPrompt → setSessionRunning(true).
        } else if (event.type === "extensionUi.request") {
          // Drop only when a different runtime is active. Allow through when
          // runtimeId is not yet set (session_start can race host.ready).
          if (store.runtimeId && event.runtimeId !== store.runtimeId) return;

          // Fire-and-forget portable methods (notify/status/widget/title/editor/working).
          if (isExtensionUiFireForgetMethod(event.method)) {
            const result = applyExtensionUiFireForget(extensionUiStateRef.current, {
              runtimeId: event.runtimeId,
              method: event.method,
              args: event.args,
            });
            extensionUiStateRef.current = result.state;
            setExtensionUiState(result.state);
            if (result.editorText !== undefined) {
              store.setPrompt(result.editorText);
            }
            applyExtensionNotify(result.notify);
          } else if (isExtensionUiDialogMethod(event.method)) {
            // Only show waiting if this session is already in a user-initiated turn.
            const key = sessionKeyFromSnapshot(store.snapshot);
            if (key && store.runningSessions[key]) {
              store.setSessionMarker(key, "waiting", {
                runtimeId: event.runtimeId,
                reason: event.method,
              });
            }
            void respondToExtensionUi(event).finally(() => {
              const st = useShellStore.getState();
              const k = sessionKeyFromSnapshot(st.snapshot);
              if (k && st.runningSessions[k]) {
                st.setSessionMarker(k, "running", { runtimeId: event.runtimeId });
              }
            });
          }
        }
        // Events ring is diagnostics / activity only — not the text authority.
        store.setEvents((current) => appendHostEvent(current, event));
      }),
    [],
  );

  /**
   * Pin the conversation scrollport to its true bottom (above the in-flow composer).
   * Never use element.scrollIntoView — that can scroll the window/app chrome instead
   * of only the content column.
   */
  function pinTimelineScrollport(behavior: ScrollBehavior = "auto") {
    const el = timelineScrollRef.current;
    if (!el) return;
    const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
    if (behavior === "smooth") {
      el.scrollTo({ top: maxTop, behavior: "smooth" });
    } else {
      el.scrollTop = maxTop;
    }
    // Programmatic pins do not always keep the floating thumb in sync — force it.
    syncOverlayScroll(el, { show: true });
    requestAnimationFrame(() => syncOverlayScroll(el, { show: true }));
  }

  /**
   * Session open/switch: hold the content pane blank until history is applied and
   * scrolled to bottom. Never show empty-hero or project-bar protrusion mid-transition.
   */
  const pendingScrollBottomRef = useRef(false);
  /** True from switch/open start until we intentionally reveal (blocks empty early-exit). */
  const holdBlankRef = useRef(false);
  const [timelineReady, setTimelineReady] = useState(true);
  /** Bumped after applySessionOpen so settle re-runs even when history length is unchanged. */
  const [revealToken, setRevealToken] = useState(0);

  function markSessionOpenForBottomScroll() {
    pendingScrollBottomRef.current = true;
    holdBlankRef.current = true;
    setTimelineReady(false);
  }

  function requestContentReveal() {
    setRevealToken((n) => n + 1);
  }

  function finishBlankHold() {
    holdBlankRef.current = false;
    pendingScrollBottomRef.current = false;
    setTimelineReady(true);
  }

  // After history lands: pin to bottom while still invisible, then reveal, then
  // re-pin once ThreadHeader / composer height change the viewport.
  useLayoutEffect(() => {
    if (!pendingScrollBottomRef.current) return;

    // Mid-switch before applySessionOpen: dock resize / partial renders must stay blank.
    // Never flash empty-hero ("在 xxx 中开始") or the composer project protrusion.
    if (switchingSessionRef.current) return;

    const el = timelineScrollRef.current;
    if (!el) return;

    if (timeline.length === 0) {
      // True empty session after apply (revealToken bumped, switch done).
      finishBlankHold();
      return;
    }

    let cancelled = false;
    let frames = 0;
    // Markdown layout can take a few frames; stay invisible while measuring.
    const preRevealFrames = 6;

    // Pin only the conversation scrollport (bottom edge = top of composer dock).
    const pinBottom = () => pinTimelineScrollport("auto");

    // Sync pin before paint of this commit.
    pinBottom();

    const tick = () => {
      if (cancelled) return;
      pinBottom();
      frames += 1;
      if (frames < preRevealFrames) {
        requestAnimationFrame(tick);
        return;
      }
      // Reveal while already pinned; header/composer height changes resize the scrollport.
      holdBlankRef.current = false;
      setTimelineReady(true);
      // Post-reveal pins: after paint so clientHeight reflects final column layout.
      requestAnimationFrame(() => {
        if (cancelled) return;
        pinBottom();
        requestAnimationFrame(() => {
          if (cancelled) return;
          pinBottom();
          requestAnimationFrame(() => {
            if (cancelled) return;
            pinBottom();
            pendingScrollBottomRef.current = false;
          });
        });
      });
    };

    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [sessionKey, history.length, timeline.length, composerDockHeight, revealToken]);

  // Track composer height so the jump-to-bottom control sits above the sticky dock
  // (composer is in-flow — content area bottom is the dock top, not the window edge).
  useEffect(() => {
    const dock = composerDockRef.current;
    if (!dock || typeof ResizeObserver === "undefined") return;
    const apply = () => setComposerDockHeight(Math.ceil(dock.getBoundingClientRect().height));
    apply();
    const ro = new ResizeObserver(() => apply());
    ro.observe(dock);
    return () => ro.disconnect();
  }, [hasActivity, showContextUsage, accessVisibility, timelineReady]);

  /**
   * After cold start the host may already be bound to lastWorkspace's recent
   * session, but the renderer never received session.opened. Pull that
   * projection so the last thread is actually open, not just highlighted.
   */
  async function hydrateResumedSession(): Promise<void> {
    const store = useShellStore.getState();
    const file = store.snapshot?.sessionFile?.trim();
    if (!file || !store.runtimeId) return;
    if (store.history.length > 0 || store.liveStream.items.length > 0) return;
    try {
      const opened = await window.zeno.session.switch(file);
      applySessionOpen(opened);
      requestContentReveal();
      restoreSessionContentMode(opened.snapshot.sessionFile?.trim() || file);
    } catch {
      // Click-to-open still works if projection fails.
    }
  }

  async function ensureHost(): Promise<HostSnapshot> {
    const store = useShellStore.getState();
    if (store.snapshot && store.runtimeId) return store.snapshot;
    let knownCwd =
      asProjectPath(store.snapshot?.cwd) ??
      asProjectPath(selectedWorkspacePath) ??
      (await window.zeno.workspace.getCwd().catch(() => undefined));
    // Prefer a real project cwd; ignore conversation/scratch for "has project" checks.
    if (knownCwd && isNonProjectWorkspacePath(knownCwd)) {
      knownCwd = undefined;
    }
    // No user project → host still needs a cwd. Prefer conversation home for pure chat;
    // fall back to date scratch only for background pi-status (packages/resources).
    if (!knownCwd) {
      knownCwd = await window.zeno.workspace.ensureConversation();
    }
    if (!isNonProjectWorkspacePath(knownCwd)) {
      selectWorkspacePath(knownCwd);
    }
    setStatus("正在启动 Agent Host…");
    const value = await window.zeno.host.start({ cwd: knownCwd });
    acceptSnapshot(value);
    setStatus("Agent Host ready");
    // Apply persisted OpenAI service_tier when the current model supports it.
    if (serviceTier !== "default") {
      try {
        acceptSnapshot(await window.zeno.serviceTier.set(serviceTier));
      } catch {
        // Model may not support service_tier — UI will show unsupported.
      }
    }
    try {
      await refreshComposerModels();
    } catch {
      setModelOptions([]);
    }
    await refreshThreads();
    await refreshRecentWorkspaces();
    return value;
  }

  /**
   * Composer model picker: only providers with stored/runtime/env auth or OAuth.
   * Settings still lists every model for configuration.
   */
  async function refreshComposerModels(): Promise<void> {
    const [models, providers] = await Promise.all([
      window.zeno.models.list(),
      window.zeno.providers.list(),
    ]);
    const readyProviders = new Set(
      providers.filter((provider) => provider.configured).map((provider) => provider.provider),
    );
    setModelOptions(
      models
        .filter((model) => readyProviders.has(model.provider))
        .map((model) => ({
          provider: model.provider,
          id: model.id,
          name: model.name,
          ...(model.source ? { source: model.source } : {}),
        })),
    );
  }

  // Re-filter when returning to the thread (e.g. after saving a provider API key).
  useEffect(() => {
    if (view !== "thread" || !runtimeId) return;
    void refreshComposerModels().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refresh on view/runtime changes
  }, [view, runtimeId]);

  /**
   * Always pull pi-home status (packages + resources) when local pi/agent is available.
   * Independent of whether a user project is open — host may use a quiet scratch cwd.
   */
  async function refreshPiStatus(options?: { ensure?: boolean }) {
    const ensure = options?.ensure !== false;
    try {
      if (ensure) await ensureHost();
      else if (!useShellStore.getState().runtimeId) return;
      const [pkgs, res, mcpCfg] = await Promise.all([
        window.zeno.packages.list(),
        window.zeno.resources.list(),
        window.zeno.mcp.getConfig().catch(() => ({ mcpServers: {} as Record<string, unknown> })),
      ]);
      setPackages(pkgs);
      setResources(res);
      setMcpServerCount(Object.keys(mcpCfg.mcpServers ?? {}).length);
    } catch {
      // Pi/agent host unavailable — keep previous counts.
    }
  }

  async function refresh() {
    try {
      acceptSnapshot(await window.zeno.host.snapshot());
      await refreshThreads();
    } catch (error) {
      reportAppError(error, "Snapshot failed");
    }
  }

  async function refreshSessionTree() {
    setSessionTreeLoading(true);
    setSessionTreeError(undefined);
    try {
      if (!useShellStore.getState().snapshot) await ensureHost();
      setSessionTree(await window.zeno.session.tree());
    } catch (error) {
      setSessionTreeError(error instanceof Error ? error.message : "Failed to load session tree");
    } finally {
      setSessionTreeLoading(false);
    }
  }

  async function openSessionTree(mode: "navigate" | "fork" = "navigate") {
    setSessionTreeMode(mode);
    setSessionTreeOpen(true);
    await refreshSessionTree();
  }

  async function refreshSessionInfo() {
    setSessionInfoLoading(true);
    setSessionInfoError(undefined);
    try {
      if (!useShellStore.getState().snapshot) await ensureHost();
      setSessionInfo(await window.zeno.session.info());
    } catch (error) {
      setSessionInfoError(error instanceof Error ? error.message : "Failed to load session info");
    } finally {
      setSessionInfoLoading(false);
    }
  }

  async function openSessionInfo() {
    setSessionInfoOpen(true);
    await refreshSessionInfo();
  }

  async function runBuiltinSlash(name: string, args: string, source?: string): Promise<boolean> {
    const action = resolveBuiltinSlash(name, args, source);
    switch (action.type) {
      case "new":
        await newSessionInCurrentWorkspace();
        return true;
      case "model":
        setSettingsSection("models");
        setView("settings");
        return true;
      case "settings":
        setSettingsSection("piSettings");
        setView("settings");
        return true;
      case "session":
        await openSessionInfo();
        return true;
      case "name": {
        const nextName = action.name.trim();
        if (!nextName) {
          // No argument → open rename dialog (visual /name, like CLI prompting for a name).
          setSessionNameDialogOpen(true);
          return true;
        }
        acceptSnapshot(await window.zeno.session.setName(nextName));
        setStatus(t(locale, "session.parity.named", { name: nextName }));
        await refreshThreads();
        return true;
      }
      case "tree":
        await openSessionTree();
        return true;
      case "fork":
        await openSessionTree("fork");
        return true;
      case "clone": {
        const opened = await window.zeno.session.clone();
        markSessionOpenForBottomScroll();
        applySessionOpen(opened);
        setStatus(t(locale, "session.parity.cloned"));
        return true;
      }
      case "compact": {
        acceptSnapshot(await window.zeno.session.compact(action.instructions));
        setStatus(t(locale, "session.parity.compacted"));
        await refreshThreads();
        return true;
      }
      case "export": {
        const result = await window.zeno.session.exportPick(action.format);
        if (!result) return true;
        setStatus(
          t(locale, "session.parity.exported", {
            format: action.format,
            path: result.path,
          }),
        );
        return true;
      }
      case "import": {
        const opened = action.path
          ? await window.zeno.session.import(action.path)
          : await window.zeno.session.importPick();
        if (!opened) return true;
        markSessionOpenForBottomScroll();
        applySessionOpen(opened);
        setStatus(t(locale, "session.parity.imported"));
        return true;
      }
      case "copy": {
        const text = await window.zeno.session.copyLastAssistant();
        if (!text) {
          reportAppError(
            new Error(t(locale, "session.parity.copyFailed")),
            t(locale, "session.parity.copyFailed"),
          );
          return true;
        }
        await navigator.clipboard.writeText(text);
        setStatus(t(locale, "session.parity.copied"));
        return true;
      }
      case "share": {
        try {
          setStatus(t(locale, "session.parity.sharing"));
          const shared = await window.zeno.session.share();
          await navigator.clipboard.writeText(shared.url).catch(() => undefined);
          setStatus(t(locale, "session.parity.shared", { url: shared.url }));
          void window.zeno.workspace.openExternal(shared.url).catch(() => undefined);
        } catch (error) {
          reportAppError(error, t(locale, "session.parity.shareFailed"));
        }
        return true;
      }
      case "reload": {
        acceptSnapshot(await window.zeno.runtime.reload());
        setStatus(t(locale, "session.parity.reloaded"));
        return true;
      }
      case "hotkeys":
        setSettingsSection("shortcuts");
        setView("settings");
        return true;
      case "mcp":
        setView("packages");
        return true;
      case "login":
        setSettingsSection("models");
        setView("settings");
        return true;
      case "upcoming":
        reportAppError(
          new Error(t(locale, "session.parity.commandUpcoming", { name: action.name })),
          t(locale, "session.parity.commandUnavailable"),
        );
        return true;
      case "runtime":
      case "unknown":
        return false;
      default:
        return false;
    }
  }

  /**
   * Edit + resend policy (pi-native):
   * - Any user message with an entry id can be edited (session tree can branch from any turn).
   * - Last user message: navigateTree + resend immediately.
   * - Earlier user messages: confirm first — later turns on this branch are abandoned.
   * Uses navigateTree (same JSONL), never fork (new file).
   */
  const [editResendConfirm, setEditResendConfirm] = useState<{
    item: Extract<TimelineItem, { kind: "user" }>;
    text: string;
  } | null>(null);

  function isLastUserMessage(item: Extract<TimelineItem, { kind: "user" }>): boolean {
    for (let i = timeline.length - 1; i >= 0; i--) {
      const row = timeline[i];
      if (row?.kind !== "user") continue;
      if (item.entryId && row.entryId) return row.entryId === item.entryId;
      return row.id === item.id;
    }
    return true;
  }

  async function editUserAndResend(
    item: Extract<TimelineItem, { kind: "user" }>,
    text: string,
    options?: { skipConfirm?: boolean },
  ) {
    const next = text.trim();
    if (!next || useShellStore.getState().running) return;
    if (!options?.skipConfirm && !isLastUserMessage(item)) {
      setEditResendConfirm({ item, text: next });
      return;
    }
    try {
      if (item.entryId) {
        markSessionOpenForBottomScroll();
        const opened = await window.zeno.session.navigateTree(item.entryId, {
          summarize: false,
        });
        if (opened.cancelled) {
          setTimelineReady(true);
          pendingScrollBottomRef.current = false;
          return;
        }
        applySessionOpen({
          snapshot: opened.snapshot,
          threads: opened.threads,
          history: opened.history,
        });
        requestContentReveal();
      }
      // Pass text/attachments explicitly — do not rely on setState + sendPrompt closure.
      await sendPrompt(undefined, undefined, {
        text: next,
        attachments: item.attachments ? [...item.attachments] : [],
      });
    } catch (error) {
      reportAppError(error, t(locale, "timeline.editFailed"));
      setTimelineReady(true);
      pendingScrollBottomRef.current = false;
    }
  }

  async function sendPrompt(
    event?: FormEvent,
    streamingBehavior?: "steer" | "followUp",
    overrides?: { text?: string; attachments?: string[] },
  ) {
    event?.preventDefault();
    // Always read prompt from the store so edit-resend / async paths are not stale.
    const draft = overrides?.text ?? useShellStore.getState().prompt;
    const attachedPaths = [...(overrides?.attachments ?? attachments)];
    const displayMessage =
      draft.trim() || (attachedPaths.length > 0 ? t(locale, "composer.attach.defaultPrompt") : "");
    if (!displayMessage) return;

    // Built-in slash commands (do not hit the model unless unresolved).
    const slash = parseSlashLine(displayMessage);
    if (slash && attachedPaths.length === 0) {
      try {
        if (!useShellStore.getState().snapshot) await ensureHost();
        const source = buildUnifiedSlashCatalog(useShellStore.getState().snapshot, locale).find(
          (item) => item.name === slash.name,
        )?.source;
        const handled = await runBuiltinSlash(slash.name, slash.args, source);
        if (handled) {
          setPrompt("");
          return;
        }
      } catch (error) {
        reportAppError(error, t(locale, "session.parity.slashFailed"));
        return;
      }
    }

    // pi `!cmd` / `!!cmd` shell injection.
    const shell = parseShellInjection(displayMessage);
    if (shell.kind !== "none" && attachedPaths.length === 0) {
      if (!shell.command.trim()) return;
      const agentWasRunning = useShellStore.getState().running;
      setPrompt("");
      if (!agentWasRunning) setRunning(true);
      setStatus(
        shell.kind === "hidden-shell"
          ? t(locale, "session.parity.shellHidden")
          : t(locale, "session.parity.shellRunning"),
      );
      try {
        if (!useShellStore.getState().snapshot) await ensureHost();
        const result = await window.zeno.session.bash(shell.command, {
          excludeFromContext: shell.kind === "hidden-shell",
        });
        acceptSnapshot(result.snapshot);
        const shellEvent = {
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "runtime.event" as const,
          runtimeId: result.snapshot.runtimeId,
          sequence: result.snapshot.sequence,
          event: { type: "shell.completed" as const, ...result.result },
        };
        setEvents((current) => appendHostEvent(current, shellEvent));
        useShellStore
          .getState()
          .applyLiveStreamEvent(shellEvent.event, useShellStore.getState().sentPrompts, {
            sequence: shellEvent.sequence,
          });
        setStatus(
          result.result.exitCode === 0
            ? t(locale, "session.parity.shellDone")
            : t(locale, "session.parity.shellExit", { code: String(result.result.exitCode) }),
        );
      } catch (error) {
        setPrompt(draft);
        reportAppError(error, t(locale, "session.parity.shellFailed"));
      } finally {
        if (!agentWasRunning) setRunning(false);
      }
      return;
    }

    const wasRunning = useShellStore.getState().running;
    const queueBehavior = wasRunning ? (streamingBehavior ?? "steer") : undefined;
    const message = promptWithAttachedPaths(displayMessage, attachedPaths);
    const imagePaths = attachedPaths.filter(isPromptImagePath);

    // If the user switches sessions mid-request, ignore late host results for this view.
    const snapAtStart = useShellStore.getState().snapshot;
    const sessionAtStart = sessionKeyFromSnapshot(snapAtStart);
    const runtimeAtStart = snapAtStart?.runtimeId;
    const stillSameSession = () => {
      return sessionKeyFromSnapshot(useShellStore.getState().snapshot) === sessionAtStart;
    };

    // ── Queue path (agent already mid-turn) ──────────────────────────────────
    // Steer / follow-up must NOT paint as delivered user rows or pollute
    // sentPrompts. Otherwise the live assistant bubble splits around a ghost
    // user message, and later host delivery duplicates the row.
    if (queueBehavior) {
      setPrompt("");
      setAttachments([]);
      const prevQueue = useShellStore.getState().queuedMessages;
      // Optimistic queue card; host snapshot is authoritative on success.
      useShellStore.getState().setQueuedMessages({
        steering: queueBehavior === "steer" ? [...prevQueue.steering, message] : prevQueue.steering,
        followUp:
          queueBehavior === "followUp" ? [...prevQueue.followUp, message] : prevQueue.followUp,
      });
      setStatus(queueBehavior === "followUp" ? "Follow-up queued" : "Guidance queued");
      try {
        if (!useShellStore.getState().snapshot) await ensureHost();
        if (!stillSameSession()) {
          // Switched away — drop optimistic queue chrome for this view.
          useShellStore.getState().setQueuedMessages(prevQueue);
          return;
        }
        const next = await window.zeno.agent.prompt(message, queueBehavior, imagePaths);
        if (stillSameSession()) acceptSnapshot(next);
      } catch (error) {
        if (!stillSameSession()) return;
        useShellStore.getState().setQueuedMessages(prevQueue);
        setPrompt(draft);
        setAttachments((current) => [...new Set([...attachedPaths, ...current])].slice(0, 12));
        reportAppError(error, "排队失败");
      }
      return;
    }

    // ── Normal send path ─────────────────────────────────────────────────────
    setPrompt("");
    setAttachments([]);
    setSentPrompts((current) => [...current, displayMessage]);
    // Optimistic user row with the same payload as the host (includes <attached-paths>).
    // Host user.message dedupes by text and merges attachment paths if needed.
    useShellStore
      .getState()
      .applyLiveStreamEvent(
        { type: "user.message", content: message },
        useShellStore.getState().sentPrompts,
        { optimistic: true },
      );
    // Surface / retitle the conversation in the sidebar immediately (do not wait for
    // agent settle — pi has not flushed the session file yet on first turn).
    // Avoid an immediate list() here: host may still show "(no messages)" and clobber
    // this title before the user message is in the live SessionManager.
    touchActiveThreadInSidebar(displayMessage);

    // Flip send → stop immediately (before ensureHost / stream wait).
    if (sessionAtStart) setSessionRunning(sessionAtStart, true, runtimeAtStart);
    else setRunning(true);
    setLastFailure(undefined);
    setStatus("Agent running...");
    let promptDispatched = false;
    /** Host was still mid-turn; we queued as steer and must keep the busy marker. */
    let keepRunningAfterQueue = false;
    try {
      if (!useShellStore.getState().snapshot) await ensureHost();
      // User may have switched sessions during ensureHost — do not bind the new
      // runtime to the old session key or prompt into the wrong host.
      if (!stillSameSession()) {
        if (sessionAtStart) setSessionRunning(sessionAtStart, false, runtimeAtStart);
        else setRunning(false);
        return;
      }
      const rid = useShellStore.getState().runtimeId ?? runtimeAtStart;
      if (sessionAtStart && rid) setSessionRunning(sessionAtStart, true, rid);
      promptDispatched = true;
      try {
        const next = await window.zeno.agent.prompt(message, undefined, imagePaths);
        if (!stillSameSession()) return;
        acceptSnapshot(next);
        setStatus("Agent settled");
        await refreshThreads();
      } catch (error) {
        // UI thought the agent was idle but the host is still mid-turn (e.g. an
        // older build timed out the IPC while the utility process kept going).
        // Queue as steer so the message is not dropped and the stop control stays up.
        if (!stillSameSession()) return;
        if (isAbortRecycleError(error)) {
          // Host was hard-recycled because abort hung — turn is gone; leave UI idle.
          setStatus("Agent aborted");
          return;
        }
        if (!isAlreadyProcessingError(error)) throw error;
        // Retract the optimistic delivered row — this is a queue, not a send.
        useShellStore.getState().retractOptimisticUserMessage(displayMessage);
        setSentPrompts((current) => {
          const index = current.lastIndexOf(displayMessage);
          return index < 0 ? current : [...current.slice(0, index), ...current.slice(index + 1)];
        });
        const prevQueue = useShellStore.getState().queuedMessages;
        useShellStore.getState().setQueuedMessages({
          steering: [...prevQueue.steering, message],
          followUp: prevQueue.followUp,
        });
        try {
          const next = await window.zeno.agent.prompt(message, "steer", imagePaths);
          if (!stillSameSession()) return;
          acceptSnapshot(next);
          setStatus("Guidance queued");
          keepRunningAfterQueue = true;
        } catch (steerError) {
          if (stillSameSession()) {
            useShellStore.getState().setQueuedMessages(prevQueue);
          }
          throw steerError;
        }
      }
    } catch (error) {
      // Switched away — do not restore draft into the new session.
      if (!stillSameSession()) return;
      // Abort recycle tears down the in-flight prompt RPC on purpose — not a send failure.
      if (isAbortRecycleError(error)) {
        setStatus("Agent aborted");
        return;
      }
      // Host/workspace/IPC failures → modal + restore draft for retry.
      useShellStore.getState().retractOptimisticUserMessage(displayMessage);
      setPrompt(draft);
      setAttachments((current) => [...new Set([...attachedPaths, ...current])].slice(0, 12));
      setSentPrompts((current) => {
        const idx = current.lastIndexOf(displayMessage);
        if (idx < 0) return current;
        return [...current.slice(0, idx), ...current.slice(idx + 1)];
      });
      reportAppError(error, "发送失败");
    } finally {
      if (keepRunningAfterQueue && stillSameSession()) {
        if (sessionAtStart) setSessionRunning(sessionAtStart, true, runtimeAtStart);
        else setRunning(true);
      } else if (!sessionAtStart) {
        if (stillSameSession()) setRunning(false);
      } else if (stillSameSession()) {
        // Still viewing this session: clear busy (settled events may already have
        // set completed/failed — setSessionRunning keeps terminal markers).
        setSessionRunning(sessionAtStart, false, runtimeAtStart);
      } else if (!promptDispatched) {
        // Switched away before prompt left the renderer — drop optimistic marker.
        setSessionRunning(sessionAtStart, false, runtimeAtStart);
      }
      // Switched away after dispatch: leave marker for park + settleSessionByRuntime.
      useShellStore.getState().syncForegroundRunning();
    }
  }

  async function clearQueuedMessages() {
    const queuedCount = queuedMessages.steering.length + queuedMessages.followUp.length;
    if (queuedCount === 0) return;
    try {
      const next = await window.zeno.agent.clearQueue();
      acceptSnapshot(next);
      // Queued messages never enter sentPrompts / liveStream until host delivery.
      setStatus("Queued messages cleared");
    } catch (error) {
      reportAppError(error, "清空队列失败");
    }
  }

  async function pickComposerAttachments(mode: "files" | "folders" = "files") {
    try {
      // Windows/Linux require separate dialogs for files vs folders (Electron limitation).
      const paths = await window.zeno.workspace.pickAttachments({ mode });
      if (paths.length === 0) return;
      setAttachments((current) => [...new Set([...current, ...paths])].slice(0, 12));
    } catch (error) {
      reportAppError(error, mode === "folders" ? "添加文件夹失败" : "添加文件失败");
    }
  }

  async function abort() {
    const snap = useShellStore.getState().snapshot;
    const key = sessionKeyFromSnapshot(snap);
    const runtimeId = snap?.runtimeId;
    try {
      acceptSnapshot(await window.zeno.agent.abort());
      setStatus("Agent aborted");
      // Prefer terminal settle events when present; still clear busy so Stop flips
      // back to Send immediately after a successful abort RPC.
      if (key) {
        setSessionMarker(key, "aborted", runtimeId ? { runtimeId } : {});
      } else {
        setRunning(false);
      }
    } catch (error) {
      const message = unknownErrorMessage(error);
      // Abort IPC timed out (or host recycled mid-abort). Do NOT mark idle — a ghost
      // mid-turn would make the next send trip "already processing" without steer.
      // Keep the stop control up until agent.settled / host.restarted clears it.
      if (/timed out|recycled after abort/i.test(message)) {
        setStatus("Abort requested — waiting for agent to stop…");
        if (key) {
          setSessionMarker(key, "running", runtimeId ? { runtimeId } : {});
        } else {
          setRunning(true);
        }
        return;
      }
      reportAppError(error, "Abort failed");
      if (key) {
        setSessionMarker(key, "aborted", runtimeId ? { runtimeId } : {});
      } else {
        setRunning(false);
      }
    }
  }

  async function crash() {
    try {
      await window.zeno.test.crashHost();
    } catch (error) {
      reportAppError(error, "Crash command failed");
    }
  }

  async function stop() {
    await window.zeno.host.stop();
    resetAfterStop();
  }

  function openProjects() {
    setView("projects");
    setSidebarOpen(false);
  }

  async function openPackages() {
    setView("packages");
    setSidebarOpen(false);
    setEcoLoading(true);
    try {
      await refreshPiStatus({ ensure: true });
    } catch (error) {
      reportAppError(error, "Failed to list packages");
    } finally {
      setEcoLoading(false);
    }
  }

  async function openResources() {
    setView("resources");
    setSidebarOpen(false);
    setEcoLoading(true);
    try {
      await refreshPiStatus({ ensure: true });
    } catch (error) {
      reportAppError(error, "Failed to list resources");
    } finally {
      setEcoLoading(false);
    }
  }

  async function openSettings() {
    setView("settings");
    setSettingsSection("general");
    setSidebarOpen(false);
  }

  /**
   * After package install/enable/remove/update, re-read models.json + extension
   * providers so composer model list stays current without a manual packages-page button.
   */
  async function reloadModelsAfterPackageChange(): Promise<void> {
    try {
      await window.zeno.models.refreshCatalog().catch(() => window.zeno.models.list());
      await refreshComposerModels().catch(() => undefined);
      acceptSnapshot(await window.zeno.host.snapshot());
    } catch {
      // Non-fatal: package op already succeeded.
    }
  }

  async function installPackage(
    source: string,
    scope: "global" | "project",
    options?: { temporary?: boolean },
  ) {
    const loc = useShellStore.getState().locale;
    setEcoLoading(true);
    setStatus(
      t(loc, options?.temporary ? "packages.status.installingTemp" : "packages.status.installing", {
        scope,
      }),
    );
    try {
      await ensureHost();
      const next = await window.zeno.packages.install(source, scope, options);
      setPackages(next);
      setStatus(
        t(loc, options?.temporary ? "packages.status.installedTemp" : "packages.status.installed"),
      );
      acceptSnapshot(await window.zeno.host.snapshot());
      await refreshPiStatus({ ensure: false });
      await reloadModelsAfterPackageChange();
    } catch (error) {
      reportAppError(error, t(loc, "packages.status.installFailed"));
      throw error;
    } finally {
      setEcoLoading(false);
    }
  }

  async function setPackageEnabled(source: string, scope: "global" | "project", enabled: boolean) {
    const loc = useShellStore.getState().locale;
    setEcoLoading(true);
    try {
      const next = await window.zeno.packages.setEnabled(source, scope, enabled);
      setPackages(next);
      setStatus(
        t(loc, enabled ? "packages.status.enabled" : "packages.status.disabled", { source }),
      );
      acceptSnapshot(await window.zeno.host.snapshot());
      await refreshPiStatus({ ensure: false });
      await reloadModelsAfterPackageChange();
    } catch (error) {
      reportAppError(error, t(loc, "packages.status.enableFailed"));
      throw error;
    } finally {
      setEcoLoading(false);
    }
  }

  async function removePackage(source: string, scope: "global" | "project") {
    const loc = useShellStore.getState().locale;
    setEcoLoading(true);
    setStatus(t(loc, "packages.status.removing", { scope }));
    try {
      const next = await window.zeno.packages.remove(source, scope);
      setPackages(next);
      setStatus(t(loc, "packages.status.removed"));
      acceptSnapshot(await window.zeno.host.snapshot());
      await refreshPiStatus({ ensure: false });
      await reloadModelsAfterPackageChange();
    } catch (error) {
      reportAppError(error, t(loc, "packages.status.removeFailed"));
      throw error;
    } finally {
      setEcoLoading(false);
    }
  }

  async function updatePackages(source?: string) {
    const loc = useShellStore.getState().locale;
    setEcoLoading(true);
    setStatus(
      source
        ? t(loc, "packages.status.updating", { source })
        : t(loc, "packages.status.updatingAll"),
    );
    try {
      const next = await window.zeno.packages.update(source);
      setPackages(next);
      setStatus(t(loc, "packages.status.updated"));
      acceptSnapshot(await window.zeno.host.snapshot());
      await refreshPiStatus({ ensure: false });
      await reloadModelsAfterPackageChange();
    } catch (error) {
      reportAppError(error, t(loc, "packages.status.updateFailed"));
      throw error;
    } finally {
      setEcoLoading(false);
    }
  }

  async function checkPackageUpdates(): Promise<
    Array<{ source: string; displayName: string; type: "npm" | "git"; scope: "global" | "project" }>
  > {
    const loc = useShellStore.getState().locale;
    setEcoLoading(true);
    setStatus(t(loc, "packages.status.checkingUpdates"));
    try {
      const updates = await window.zeno.packages.checkUpdates();
      setStatus(
        updates.length === 0
          ? t(loc, "packages.updateCheckedNone")
          : t(loc, "packages.updateAvailableCount", { n: String(updates.length) }),
      );
      return updates;
    } catch (error) {
      reportAppError(error, t(loc, "packages.status.checkUpdatesFailed"));
      throw error;
    } finally {
      setEcoLoading(false);
    }
  }

  async function refreshRecentWorkspaces() {
    try {
      const listed = await window.zeno.workspace.listRecent();
      // Read from ref so callers that just cleared selection don't exclude the old project.
      const selected = asProjectPath(selectedWorkspacePathRef.current);
      // Union with in-memory rail: never let a prefs refresh drop siblings that were
      // visible (composer project switch used to replace state with a short list).
      setRecentWorkspaces((prev) =>
        unionRecentWorkspaces(filterRecentWorkspaces(listed, { max: 12 }), prev, {
          ...(selected ? { selected } : {}),
          max: 12,
        }),
      );
    } catch {
      // Keep the previous list — never wipe the rail on a transient listRecent failure.
    }
  }

  async function openWorkspacePath(
    cwd: string,
    options?: { resumeRecent?: boolean; sessionFile?: string },
  ) {
    setStatus(options?.resumeRecent ? `Resuming ${cwd}…` : `Opening workspace ${cwd}…`);
    setEvents([]);
    setSentPrompts([]);
    useShellStore.getState().setHistory([]);
    useShellStore.getState().clearLiveStream();
    // Promote the project we are leaving into recent *before* clearing selection,
    // same rationale as newBlankTask — otherwise it only lived as workspacePath and
    // vanishes from 项目 when the composer picker switches away.
    const previous = asProjectPath(selectedWorkspacePathRef.current);
    if (previous && normalizeCwdKey(previous) !== normalizeCwdKey(cwd)) {
      setRecentWorkspaces((prev) => prependRecentPath(prev, previous, 12));
    }
    selectWorkspacePath(cwd);
    // Optimistic rail update so the target appears immediately (worktree / project).
    if (!isNonProjectWorkspacePath(cwd)) {
      setRecentWorkspaces((prev) =>
        mergeRecentWithOpenProject(prependRecentPath([...prev], cwd, 12), cwd, 12),
      );
    }
    const snap = await window.zeno.workspace.openPath(cwd, {
      resumeRecent: options?.resumeRecent === true && !options?.sessionFile,
      ...(options?.sessionFile ? { sessionFile: options.sessionFile } : {}),
    });
    acceptSnapshot(snap);
    setStatus("Agent Host ready");
    // Single list refresh after open — active flag comes from the live host once.
    // Re-check host cwd: a concurrent openWorkspacePath (rapid project 新建会话)
    // may have already switched the host; never write the *new* project's sessions
    // under this path's bucket.
    const listed = await window.zeno.session.list();
    const hostCwd = useShellStore.getState().snapshot?.cwd;
    if (!hostCwd || normalizeCwdKey(hostCwd) !== normalizeCwdKey(cwd)) {
      await refreshRecentWorkspaces();
      return;
    }
    const matched = threadsForWorkspaceBucket(listed.threads, cwd);
    setThreads(mergeSidebarThreads(useShellStore.getState().threads, matched));
    cacheThreadsForCwd(cwd, matched);
    await refreshRecentWorkspaces();
  }

  async function openWorkspacePicker() {
    try {
      const picked = await window.zeno.workspace.pickFolder();
      if (!picked) return;
      await openWorkspacePath(picked, { resumeRecent: false });
    } catch (error) {
      reportAppError(error, "Failed to open workspace");
    }
  }

  async function resumeWorkspace() {
    try {
      const raw = (await window.zeno.workspace.getCwd()) ?? workspacePath;
      const cwd = asProjectPath(raw);
      if (!cwd) {
        // No real project to resume — stay project-less (do not open date folder as project).
        await ensureHost();
        return;
      }
      await openWorkspacePath(cwd, { resumeRecent: true });
    } catch (error) {
      reportAppError(error, "Failed to resume workspace");
    }
  }

  async function toggleTrust() {
    try {
      const next = !(snapshot?.projectTrusted ?? false);
      setStatus(next ? "Trusting project…" : "Untrusting project…");
      acceptSnapshot(await window.zeno.trust.set(next));
      setStatus("Agent Host ready");
    } catch (error) {
      reportAppError(error, "Failed to set trust");
    }
  }

  // Prefer live host cwd for trust (openPath may update snapshot before selection state).
  // Allow temp/e2e project paths that still carry .pi config (ephemeral ≠ non-project for trust).
  const trustPromptCwd = snapshot?.cwd?.trim()
    ? snapshot.cwd
    : asProjectPath(selectedWorkspacePath);
  // tick forces re-render after in-session dismiss without writing trust.json.
  void trustPromptDismissTick;
  const showProjectTrustPrompt = shouldPromptProjectTrust({
    contentMode,
    cwd: trustPromptCwd,
    trust: snapshot?.trust,
    projectTrusted: snapshot?.projectTrusted,
    dismissedKeys: trustPromptDismissedRef.current,
  });

  async function answerProjectTrust(trusted: boolean) {
    if (!trustPromptCwd || trustPromptBusy) return;
    setTrustPromptBusy(true);
    try {
      setStatus(trusted ? "Trusting project…" : "Untrusting project…");
      acceptSnapshot(await window.zeno.trust.set(trusted));
      setStatus("Agent Host ready");
    } catch (error) {
      reportAppError(error, "Failed to set trust");
    } finally {
      setTrustPromptBusy(false);
    }
  }

  function dismissProjectTrustPrompt() {
    if (!trustPromptCwd) return;
    trustPromptDismissedRef.current.add(projectTrustPromptKey(trustPromptCwd));
    setTrustPromptDismissTick((n) => n + 1);
  }

  async function changeModel(provider: string, id: string) {
    try {
      setStatus(`Switching model ${provider}/${id}…`);
      let next = await window.zeno.models.set(provider, id);
      acceptSnapshot(next);
      // A preference selected while another model was active becomes effective now.
      if ((next.availableServiceTiers?.length ?? 0) > 0 && next.serviceTier !== serviceTier) {
        next = await window.zeno.serviceTier.set(serviceTier);
        acceptSnapshot(next);
      }
      setStatus("Agent Host ready");
    } catch (error) {
      reportAppError(error, "Failed to set model");
    }
  }

  async function changeThinking(level: string) {
    try {
      setStatus(`Thinking level ${level}…`);
      acceptSnapshot(await window.zeno.thinking.set(level));
      setStatus("Agent Host ready");
    } catch (error) {
      reportAppError(error, "Failed to set thinking level");
    }
  }

  async function changeServiceTier(tier: ServiceTierId) {
    setServiceTier(tier);
    try {
      localStorage.setItem("zeno.composer.serviceTier", tier);
    } catch {
      // ignore
    }
    const current = useShellStore.getState().snapshot;
    if (!current) {
      setStatus("Request priority preference saved");
      return;
    }
    try {
      setStatus(`Service tier ${tier}…`);
      acceptSnapshot(await window.zeno.serviceTier.set(tier));
      setStatus("Agent Host ready");
    } catch (error) {
      reportAppError(error, "Failed to set service tier");
    }
  }

  async function openThread() {
    setView("thread");
    setSidebarOpen(false);
    // Thread column remounts when leaving settings/packages — restore true content bottom
    // (scrollport above composer), not the window top.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = timelineScrollRef.current;
        if (!el) return;
        if (el.scrollHeight > el.clientHeight + 4) {
          pinTimelineScrollport("auto");
        }
      });
    });
  }

  async function newSessionInCurrentWorkspace() {
    // Do not abort a generating session — main parks the busy host and starts a new one.
    try {
      // Always wait for a fully ready host (process + runtime), not only a runtimeId flag.
      await ensureHost();
      setView("thread");
      setSidebarOpen(false);
      setPrompt("");
      setAttachments([]);
      setStatus("Creating session...");
      const opened = await window.zeno.session.create();
      markSessionOpenForBottomScroll();
      applySessionOpen(opened);
      requestContentReveal();
      setStatus("Agent Host ready");
      await refreshThreads();
      if (isNonProjectWorkspacePath(opened.snapshot.cwd)) await refreshConversationSessions();
    } catch (error) {
      reportAppError(error, "无法在当前位置新建会话");
      setTimelineReady(true);
      pendingScrollBottomRef.current = false;
    }
  }

  /** Monotonic id so rapid「新建会话」clicks only apply the latest result. */
  const newBlankTaskGenRef = useRef(0);
  const newBlankTaskInFlightRef = useRef(false);

  /**
   * Unscoped「新建会话」(no selected project, or 对话 section header):
   * Pure conversation — NOT bound to any project.
   * Host cwd = Documents/Zeno/conversations (hidden from 项目 rail / recent).
   * A selected project or its row action uses newThreadForProject instead.
   *
   * Lifecycle (clear/start/create) runs as one main-process exclusive op so rapid
   * clicks cannot kill a mid-start host (Windows exit code 0).
   */
  async function newBlankTask() {
    const gen = ++newBlankTaskGenRef.current;
    // Coalesce bursts: one in-flight op; later clicks only bump gen and wait their turn.
    if (newBlankTaskInFlightRef.current) return;

    // Do not abort a generating session — main parks the busy host for tab-like switching.
    if (gen !== newBlankTaskGenRef.current) return;

    if (useShellStore.getState().contentMode === "terminal") {
      beginSurfaceTransition();
      setContentMode("chat", { persist: false });
      await window.zeno.terminal.suspend().catch(() => undefined);
    }

    setView("thread");
    setSidebarOpen(false);
    setPrompt("");
    setReviewOpen(false);
    setEvents([]);
    setSentPrompts([]);
    setLastFailure(undefined);
    setAttachments([]);
    useShellStore.getState().setHistory([]);
    useShellStore.getState().clearLiveStream();

    const prevSnap = useShellStore.getState().snapshot;
    const prevProject = asProjectPath(selectedWorkspacePath) ?? asProjectPath(prevSnap?.cwd);
    // Project was listed only via workspacePath (excluded from recent while open).
    // Promote it into recent BEFORE clearing selection so the card never unmounts.
    if (prevProject) {
      setRecentWorkspaces((prev) => prependRecentPath(prev, prevProject, 12));
    }

    pendingPureConversationRef.current = true;
    setPendingPureConversation(true);
    selectWorkspacePath(undefined);
    // Do NOT setSnapshot(undefined) — composer would flash 未选择模型 / empty would
    // flash 打开工作区以开始. pendingPureConversation drives conversation chrome instead.

    newBlankTaskInFlightRef.current = true;
    const newBlankWatchdog = setTimeout(() => {
      if (!newBlankTaskInFlightRef.current) return;
      newBlankTaskGenRef.current += 1;
      newBlankTaskInFlightRef.current = false;
      pendingPureConversationRef.current = false;
      setPendingPureConversation(false);
      reportAppError(new Error("新建会话超时，请重试"), "无法开始新会话");
      setTimelineReady(true);
      pendingScrollBottomRef.current = false;
    }, NEW_SESSION_OP_TIMEOUT_MS);
    try {
      setStatus("Creating conversation...");
      setRuntimeId(undefined);
      setLastSequence(0);

      // Single exclusive main-process op (safe under rapid clicks).
      const opened = await window.zeno.session.createBlankConversation();
      if (gen !== newBlankTaskGenRef.current) return;

      markSessionOpenForBottomScroll();
      applySessionOpen(opened);
      requestContentReveal();
      restoreSessionContentMode(opened.snapshot.sessionFile);
      // Pure conversation: protrusion must show「选择项目」, never a leftover project.
      selectWorkspacePath(undefined);
      selectProjectPath(undefined);
      pendingPureConversationRef.current = false;
      setPendingPureConversation(false);
      setStatus("Agent Host ready");
      try {
        await refreshComposerModels();
      } catch {
        // keep previous modelOptions
      }
      if (gen !== newBlankTaskGenRef.current) return;
      await refreshThreads();
      await refreshConversationSessions();
      await refreshRecentWorkspaces();

      // If more clicks arrived while we worked, run once more for the latest gen.
      if (gen !== newBlankTaskGenRef.current) {
        newBlankTaskInFlightRef.current = false;
        void newBlankTask();
        return;
      }
    } catch (error) {
      if (gen !== newBlankTaskGenRef.current) return;
      pendingPureConversationRef.current = false;
      setPendingPureConversation(false);
      reportAppError(error, "无法开始新会话");
      setTimelineReady(true);
      pendingScrollBottomRef.current = false;
    } finally {
      clearTimeout(newBlankWatchdog);
      if (gen === newBlankTaskGenRef.current) {
        newBlankTaskInFlightRef.current = false;
      }
    }
  }

  const newThreadForProjectGenRef = useRef(0);
  const newThreadForProjectInFlightRef = useRef(false);
  const newThreadForProjectPendingPathRef = useRef<string | null>(null);

  /**
   * Open the selected project if needed, then create a new session under it.
   * Serialized + latest-wins: concurrent openWorkspacePath used to race host
   * listSessions into the wrong cwd bucket and hide 对话 rows.
   */
  async function newThreadForProject(path: string) {
    newThreadForProjectGenRef.current += 1;
    newThreadForProjectPendingPathRef.current = path;
    // Coalesce bursts: one in-flight op; later clicks only bump gen + pending path.
    if (newThreadForProjectInFlightRef.current) return;

    newThreadForProjectInFlightRef.current = true;

    // Watchdog: release the in-flight gate if this op hangs (e.g. the main-process
    // lifecycle queue is stuck while the busy host is parked), so later「新建会话」
    // clicks can retry instead of being silently swallowed.
    const newThreadWatchdog = setTimeout(() => {
      if (!newThreadForProjectInFlightRef.current) return;
      newThreadForProjectGenRef.current += 1;
      newThreadForProjectPendingPathRef.current = null;
      newThreadForProjectInFlightRef.current = false;
      reportAppError(new Error("新建会话超时，请重试"), "无法在项目下新建会话");
      setTimelineReady(true);
      pendingScrollBottomRef.current = false;
    }, NEW_SESSION_OP_TIMEOUT_MS);
    try {
      while (true) {
        const runGen = newThreadForProjectGenRef.current;
        const target = newThreadForProjectPendingPathRef.current;
        if (!target) break;
        newThreadForProjectPendingPathRef.current = null;

        try {
          // Do not abort a generating session — main parks the busy host.
          if (useShellStore.getState().contentMode === "terminal") {
            beginSurfaceTransition();
            setContentMode("chat", { persist: false });
            await window.zeno.terminal.suspend().catch(() => undefined);
          }
          if (runGen !== newThreadForProjectGenRef.current) continue;

          setView("thread");
          setSidebarOpen(false);
          setPrompt("");
          setReviewOpen(false);
          setEvents([]);
          setSentPrompts([]);
          setLastFailure(undefined);
          setAttachments([]);
          useShellStore.getState().setHistory([]);
          useShellStore.getState().clearLiveStream();
          selectWorkspacePath(target);

          const current = useShellStore.getState().snapshot?.cwd;
          if (!current || normalizeCwdKey(current) !== normalizeCwdKey(target)) {
            await openWorkspacePath(target, { resumeRecent: false });
          } else {
            await ensureHost();
          }
          if (runGen !== newThreadForProjectGenRef.current) continue;

          setStatus("Creating thread...");
          const opened = await window.zeno.session.create();
          if (runGen !== newThreadForProjectGenRef.current) continue;

          markSessionOpenForBottomScroll();
          applySessionOpen(opened);
          requestContentReveal();
          restoreSessionContentMode(opened.snapshot.sessionFile);
          setStatus("Agent Host ready");
          await refreshThreads();
          // Keep 对话 rail warm while hopping between project hosts.
          await refreshConversationSessions();
        } catch (error) {
          if (runGen !== newThreadForProjectGenRef.current) continue;
          reportAppError(error, "无法在项目下新建会话");
          setTimelineReady(true);
          pendingScrollBottomRef.current = false;
        }

        // Another click arrived while we worked — run once more for the latest path.
        if (runGen !== newThreadForProjectGenRef.current) continue;
        break;
      }
    } finally {
      clearTimeout(newThreadWatchdog);
      newThreadForProjectInFlightRef.current = false;
      // Path queued after we cleared inFlight but before exit — pick it up.
      if (newThreadForProjectPendingPathRef.current) {
        void newThreadForProject(newThreadForProjectPendingPathRef.current);
      }
    }
  }

  async function removeRecentWorkspace(path: string) {
    try {
      const pathKey = normalizeCwdKey(path);
      const selectedKey = selectedWorkspacePathRef.current
        ? normalizeCwdKey(selectedWorkspacePathRef.current)
        : "";
      const selectedProjectKey = selectedProjectPathRef.current
        ? normalizeCwdKey(selectedProjectPathRef.current)
        : "";
      const snapCwd = useShellStore.getState().snapshot?.cwd;
      const openCwd = asProjectPath(selectedWorkspacePathRef.current) ?? asProjectPath(snapCwd);
      const wasActive =
        (Boolean(openCwd) && normalizeCwdKey(openCwd!) === pathKey) ||
        selectedKey === pathKey ||
        (Boolean(snapCwd) && normalizeCwdKey(snapCwd!) === pathKey);

      // Optimistic drop so the card vanishes before IPC returns (and survives
      // refreshRecentWorkspaces union races that used to re-add from memory).
      setRecentWorkspaces((prev) => prev.filter((p) => normalizeCwdKey(p) !== pathKey));
      // Drop pin so 置顶 cannot keep a deleted worktree/project visible.
      try {
        const nextPinned = loadPinnedProjects().filter((p) => normalizeCwdKey(p) !== pathKey);
        savePinnedProjects(nextPinned);
        window.dispatchEvent(new Event("zeno-project-rail-changed"));
      } catch {
        // ignore
      }

      // Removing the open project must clear UI current workspace, otherwise
      // ProjectList keeps injecting workspacePath into allPaths and it never disappears.
      if (selectedProjectKey === pathKey) selectProjectPath(undefined);
      if (wasActive) {
        selectWorkspacePath(undefined);
        await window.zeno.workspace.clearActive().catch(() => undefined);
        useShellStore.getState().setSnapshot(undefined);
        setRuntimeId(undefined);
        setLastSequence(0);
        setThreads([]);
        setEvents([]);
        setSentPrompts([]);
        useShellStore.getState().setHistory([]);
        useShellStore.getState().clearLiveStream();
        setModelOptions([]);
      }

      const listed = await window.zeno.workspace.removeRecent(path);
      setRecentWorkspaces(
        filterRecentWorkspaces(listed, { max: 12 }).filter((p) => normalizeCwdKey(p) !== pathKey),
      );
      // Drop cached sessions for the removed project.
      setThreadsByCwd((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (normalizeCwdKey(key) === pathKey) delete next[key];
        }
        return next;
      });
    } catch (error) {
      reportAppError(error, "Failed to remove project");
    }
  }

  // Settings → worktree delete: drop from sidebar project list + clear if active.
  const removeRecentWorkspaceRef = useRef(removeRecentWorkspace);
  removeRecentWorkspaceRef.current = removeRecentWorkspace;
  useEffect(() => {
    const onWorktreeRemoved = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path;
      if (typeof path !== "string" || !path.trim()) return;
      void removeRecentWorkspaceRef.current(path);
    };
    window.addEventListener("zeno-worktree-removed", onWorktreeRemoved);
    return () => window.removeEventListener("zeno-worktree-removed", onWorktreeRemoved);
  }, []);

  async function revealWorkspace(path: string) {
    try {
      await window.zeno.workspace.revealInFolder(path);
    } catch (error) {
      reportAppError(error, "Failed to reveal folder");
    }
  }

  async function forkThread(entryId?: string) {
    if (running) return;
    if (!entryId) {
      await openSessionTree("fork");
      return;
    }
    try {
      if (!useShellStore.getState().runtimeId) await ensureHost();
      setStatus("Forking thread...");
      const opened = await window.zeno.session.fork(entryId);
      markSessionOpenForBottomScroll();
      applySessionOpen(opened);
      setPrompt(opened.selectedText ?? "");
      const cwd = opened.snapshot.cwd;
      if (cwd) {
        const key = normalizeCwdKey(cwd);
        setThreadsByCwd((prev) => ({
          ...prev,
          [key]: mergeSidebarThreads(prev[key] ?? [], opened.threads),
        }));
      }
      requestContentReveal();
      setStatus("Agent Host ready");
    } catch (error) {
      reportAppError(error, "Failed to fork thread");
      setTimelineReady(true);
      pendingScrollBottomRef.current = false;
    }
  }

  async function switchThread(sessionPath: string, projectCwd?: string) {
    const currentStore = useShellStore.getState();
    const targetSessionKey = sessionRunKey(sessionPath);
    const currentSessionKeys = [
      sessionRunKey(currentStore.snapshot?.sessionFile),
      sessionRunKey(currentStore.snapshot?.sessionId),
    ];
    // Re-selecting the live session usually just restores the thread view.
    // After quit/reopen, auto-resume binds sessionFile before history arrives —
    // that click must still project the session (otherwise only a hop-away works).
    if (
      shouldReuseForegroundThread({
        switching: switchingSessionRef.current,
        runtimeId: currentStore.runtimeId,
        targetKey: targetSessionKey,
        currentKeys: currentSessionKeys,
        historyCount: currentStore.history.length,
        liveCount: currentStore.liveStream.items.length,
      })
    ) {
      setView("thread");
      return;
    }

    if (
      !switchingSessionRef.current &&
      currentStore.runtimeId &&
      targetSessionKey &&
      currentSessionKeys.includes(targetSessionKey)
    ) {
      setView("thread");
      try {
        const opened = await window.zeno.session.switch(sessionPath);
        applySessionOpen(opened);
        requestContentReveal();
        restoreSessionContentMode(opened.snapshot.sessionFile?.trim() || sessionPath);
      } catch (error) {
        reportAppError(error, "无法打开会话");
      }
      return;
    }

    // Tab-like switch: never abort. Main parks a busy host and may promote a parked one.
    switchingSessionRef.current = true;
    const fromMode = useShellStore.getState().contentMode;
    // Best-effort target mode from prefs (sessionPath is the session file).
    const targetModePref = loadContentModeForSession(sessionPath);
    const stayTerminal = fromMode === "terminal" && targetModePref === "terminal";
    const landTerminal = targetModePref === "terminal";

    // Unmount an outgoing TUI synchronously so Chromium cannot retain its
    // canvas layer while either destination surface is being prepared.
    if (landTerminal) {
      beginSurfaceTransition(sessionPath);
    } else if (fromMode === "terminal") {
      beginSurfaceTransition();
    }

    // Keep the chat viewport hidden until the target history is applied and
    // pinned. Terminal-to-terminal hops keep the terminal background instead.
    if (!stayTerminal) {
      markSessionOpenForBottomScroll();
    }

    // Terminal → chat: suspend the source TUI for a later tab hop. Terminal → terminal:
    // controller.open parks/promotes after the target session has landed.
    if (fromMode === "terminal" && !stayTerminal) {
      setContentMode("chat", { persist: false });
      try {
        await window.zeno.terminal.suspend();
      } catch {
        // ignore
      }
    }
    if (stayTerminal) {
      holdBlankRef.current = false;
      pendingScrollBottomRef.current = false;
      setTimelineReady(true);
    }
    setEvents([]);
    setSentPrompts([]);
    // Drop prior history so empty chrome cannot paint even if ready flips early.
    useShellStore.getState().setHistory([]);
    useShellStore.getState().clearLiveStream();
    try {
      const store = useShellStore.getState();

      // Resolve the session's working directory (project or pure-conversation home).
      let targetCwd = projectCwd?.trim() || undefined;
      if (!targetCwd) {
        const hit = store.threads.find((t) => t.path === sessionPath || t.id === sessionPath);
        if (hit?.cwd) targetCwd = hit.cwd;
      }
      if (!targetCwd) {
        for (const list of Object.values(threadsByCwd)) {
          const hit = list.find((t) => t.path === sessionPath || t.id === sessionPath);
          if (hit?.cwd) {
            targetCwd = hit.cwd;
            break;
          }
        }
      }
      if (!targetCwd) {
        targetCwd = await window.zeno.workspace.ensureConversation();
      }

      const currentCwd = store.snapshot?.cwd;
      const hostReady = Boolean(store.runtimeId && store.snapshot);
      const sameCwd =
        Boolean(currentCwd) && normalizeCwdKey(currentCwd!) === normalizeCwdKey(targetCwd);
      const needWorkspaceSwitch = !hostReady || !sameCwd;

      // Leaving a project for pure conversation: promote project into recent BEFORE
      // selection clears (same pattern as newBlankTask). Otherwise projectKeys empties
      // for a frame and every project session floods the 对话 section.
      const prevProject =
        asProjectPath(selectedWorkspacePathRef.current) ?? asProjectPath(currentCwd);
      const targetProject = asProjectPath(targetCwd);
      if (prevProject && !targetProject) {
        setRecentWorkspaces((prev) => prependRecentPath(prev, prevProject, 12));
      }

      // Optimistic: only flip `active` flags — never empty lists or collapse projects.
      const markActive = (list: SessionThreadSummary[]) =>
        list.map((t) => ({
          ...t,
          active: t.path === sessionPath || t.id === sessionPath,
        }));
      setThreadsByCwd((prev) => {
        const next: Record<string, SessionThreadSummary[]> = {};
        for (const [k, list] of Object.entries(prev)) {
          next[k] = markActive(list);
        }
        const key = normalizeCwdKey(targetCwd!);
        if (!next[key]?.length && store.threads.length > 0 && sameCwd) {
          next[key] = markActive(store.threads);
        } else if (next[key]) {
          next[key] = markActive(next[key]);
        }
        return next;
      });
      if (sameCwd) {
        setThreads(markActive(store.threads));
      }
      // Do NOT change selectedWorkspacePath until open succeeds (avoids rail flash).
      setStatus("Switching thread...");
      setView("thread");

      // Host must run under the session's cwd. Pure conversation vs project are different hosts.
      if (needWorkspaceSwitch) {
        await window.zeno.workspace.openPath(targetCwd, { sessionFile: sessionPath });
      }

      // Authoritative open: history + threads + snapshot in one store update.
      const opened = await window.zeno.session.switch(sessionPath);
      // Keep switchingSessionRef true until after apply+reveal so layout won't
      // treat the empty interim as a settled empty session.
      applySessionOpen(opened);
      useShellStore.getState().syncForegroundRunning();
      const cwd = opened.snapshot.cwd || targetCwd;
      // If we land on conversation home, keep prev project on the rail (selection → undefined).
      const nextProject = asProjectPath(cwd);
      if (!nextProject && prevProject) {
        setRecentWorkspaces((prev) => prependRecentPath(prev, prevProject, 12));
      }
      selectWorkspacePath(nextProject);
      if (cwd) {
        const key = normalizeCwdKey(cwd);
        setThreadsByCwd((prev) => ({
          ...prev,
          [key]: mergeSidebarThreads(prev[key] ?? [], opened.threads),
        }));
      }
      setEvents([]);
      setSentPrompts([]);
      setStatus("Agent Host ready");
      if (needWorkspaceSwitch) void refreshRecentWorkspaces();
      // End switch gate, then bump reveal so settle runs with final history.
      switchingSessionRef.current = false;
      requestContentReveal();
      // Restore this session's remembered surface (chat vs terminal).
      const landedFile = opened.snapshot.sessionFile?.trim() || sessionPath;
      restoreSessionContentMode(landedFile);
      // Chat landings never need a terminal surface transition.
      // If we expected terminal but restored chat (e.g. busy), clear the
      // session identity gate; terminal landings clear it from onReady.
      if (useShellStore.getState().contentMode !== "terminal") {
        window.requestAnimationFrame(() => endSurfaceTransition());
      }
    } catch (error) {
      reportAppError(error, "无法打开会话");
      holdBlankRef.current = false;
      pendingScrollBottomRef.current = false;
      setTimelineReady(true);
      void refreshThreads();
      endSurfaceTransition();
    } finally {
      switchingSessionRef.current = false;
    }
  }

  /**
   * Terminal mode = real pi TUI via PTY (`pi --session <file>`), not CSS skin.
   * PiTuiTerminal subscribes to data before opening the PTY and owns first-frame
   * readiness, so a previous-session canvas cannot flash during the transition.
   */
  async function enterTerminalMode() {
    const store = useShellStore.getState();
    const sessionFile = store.snapshot?.sessionFile?.trim();
    const cwd = store.snapshot?.cwd?.trim() || workspacePath?.trim() || undefined;
    if (!sessionFile) {
      reportAppError(new Error("No session file"), t(locale, "contentMode.needSession"));
      return;
    }
    if (!cwd) {
      reportAppError(new Error("No workspace cwd"), t(locale, "contentMode.needSession"));
      return;
    }
    if (store.running) {
      reportAppError(new Error("Agent busy"), t(locale, "contentMode.waitForTurn"));
      return;
    }
    // Do not dispose here — open() resumes a suspended same-session PTY for instant enter.
    // Cross-session replace/park is handled inside terminal.open.
    beginSurfaceTransition(sessionFile);
    holdBlankRef.current = false;
    pendingScrollBottomRef.current = false;
    setTimelineReady(true);
    setContentMode("terminal");
    // Mount on the next frame after contentMode is applied.
    window.requestAnimationFrame(() => {
      if (useShellStore.getState().contentMode !== "terminal") return;
      setTerminalSurfaceActive(true);
    });
  }

  async function leaveTerminalMode() {
    // Hold chat until the same session has been reloaded from disk. The sync
    // unmount removes the canvas from Chromium's compositor before mode flips.
    switchingSessionRef.current = true;
    beginSurfaceTransition();
    markSessionOpenForBottomScroll();
    setContentMode("chat");
    let contentReloaded = false;
    try {
      // Suspend (keep process warm) so re-entering this session is instant.
      const suspended = await window.zeno.terminal.suspend();
      const store = useShellStore.getState();
      const sessionFile =
        suspended.sessionFile?.trim() || store.snapshot?.sessionFile?.trim() || undefined;
      if (sessionFile) {
        const opened = await window.zeno.session.switch(sessionFile);
        applySessionOpen(opened);
        // Keep ProjectList's per-cwd cache in sync — otherwise active flags and
        // titles lag behind store.threads and sidebar markers look incomplete.
        const cwd = opened.snapshot.cwd?.trim();
        if (cwd && opened.threads.length > 0) {
          const key = normalizeCwdKey(cwd);
          setThreadsByCwd((prev) => ({
            ...prev,
            [key]: mergeSidebarThreads(prev[key] ?? [], opened.threads),
          }));
        }
        contentReloaded = true;
      }
    } catch (error) {
      reportAppError(error, t(locale, "contentMode.closeFailed"));
      try {
        await window.zeno.terminal.dispose();
      } catch {
        // ignore
      }
    } finally {
      switchingSessionRef.current = false;
      if (contentReloaded) requestContentReveal();
      else finishBlankHold();
      endSurfaceTransition();
    }
  }

  async function toggleContentModeSurface() {
    const store = useShellStore.getState();
    if (store.running) {
      reportAppError(new Error("Agent busy"), t(locale, "contentMode.waitForTurn"));
      return;
    }
    if (store.contentMode === "terminal") {
      await leaveTerminalMode();
    } else {
      await enterTerminalMode();
    }
  }

  // Preference may restore "terminal" without a session — fall back to chat.
  // PTY open is owned by PiTuiTerminal (subscribe-then-open).
  useEffect(() => {
    if (contentMode !== "terminal") return;
    const sessionFile = snapshot?.sessionFile?.trim();
    const cwd = snapshot?.cwd?.trim() || workspacePath?.trim();
    if (!sessionFile || !cwd) {
      setContentMode("chat");
      endSurfaceTransition();
    }
  }, [contentMode, snapshot?.sessionFile, snapshot?.cwd, workspacePath, setContentMode]);

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendPrompt(undefined, running && event.altKey ? "followUp" : undefined);
      return;
    }
    // doubleEscapeAction from pi settings: tree | fork | none
    if (event.key === "Escape" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now();
      const double = now - lastEscapeAtRef.current < 450;
      lastEscapeAtRef.current = now;
      if (!double) return;
      event.preventDefault();
      const action = snapshot?.doubleEscapeAction ?? "fork";
      if (action === "tree") void openSessionTree();
      else if (action === "fork") void forkThread();
    }
  }

  function focusComposer() {
    pendingComposerFocus.current = true;
    setView("thread");
    setPaletteOpen(false);
    // Immediate attempt if already on thread (textarea mounted).
    requestAnimationFrame(() => {
      if (useShellStore.getState().view === "thread" && composerRef.current) {
        composerRef.current.focus();
        pendingComposerFocus.current = false;
      }
    });
  }

  // After leaving packages/resources/settings, the composer mounts asynchronously.
  useEffect(() => {
    if (view !== "thread" || !pendingComposerFocus.current) return;
    const id = requestAnimationFrame(() => {
      composerRef.current?.focus();
      pendingComposerFocus.current = false;
    });
    return () => cancelAnimationFrame(id);
  }, [view]);

  const commands = useMemo(
    () =>
      buildShellCommands(
        {
          newThread: () => void newBlankTask(),
          openPackages: () => void openPackages(),
          openResources: () => void openResources(),
          openSettings: () => void openSettings(),
          openThread: () => void openThread(),
          focusComposer,
          toggleTheme: () => toggleColorMode(),
          forkThread: () => void forkThread(),
          toggleReview: () => setReviewOpen((open) => !open),
          toggleEnvPanel: () => {
            // Chat / content view only — terminal mode never exposes env chrome.
            if (useShellStore.getState().contentMode !== "chat") return;
            setEnvPanelOpen((open) => !open);
          },
          toggleContentMode: () => void toggleContentModeSurface(),
        },
        locale,
      ),
    // handlers close over latest store setters; recompute lightly when mode/view/locale changes
    [colorMode, view, running, workspacePath, hasActivity, shortcutRevision, locale, contentMode],
  );

  useEffect(() => {
    const refreshShortcuts = () => setShortcutRevision((revision) => revision + 1);
    window.addEventListener(SHORTCUT_OVERRIDES_CHANGED_EVENT, refreshShortcuts);
    return () => window.removeEventListener(SHORTCUT_OVERRIDES_CHANGED_EVENT, refreshShortcuts);
  }, []);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      // Ignore plain typing in inputs (allow mod shortcuts).
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const editable = tag === "input" || tag === "textarea" || target?.isContentEditable === true;
      if (editable && !(event.metaKey || event.ctrlKey)) return;

      const id = matchShortcut(event);
      if (!id) return;
      event.preventDefault();
      switch (id) {
        case "command-palette":
          setPaletteOpen(!useShellStore.getState().paletteOpen);
          break;
        case "new-thread":
          void newBlankTask();
          break;
        case "packages":
          void openPackages();
          break;
        case "resources":
          void openResources();
          break;
        case "settings":
          void openSettings();
          break;
        case "thread":
          void openThread();
          break;
        case "focus-composer":
          focusComposer();
          break;
        case "fork-thread":
          void forkThread();
          break;
        case "toggle-theme":
          toggleColorMode();
          break;
        case "toggle-env-panel":
          // Chat / content view only — terminal mode never exposes env chrome.
          if (useShellStore.getState().contentMode !== "chat") break;
          setEnvPanelOpen((open) => !open);
          break;
        case "toggle-content-mode":
          void toggleContentModeSurface();
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commands]);

  // Optional: if pi theme name is ever present on snapshot, suggest color mode once.
  useEffect(() => {
    const record = snapshot as (HostSnapshot & { theme?: string }) | undefined;
    const mapped = colorModeFromPiTheme(record?.theme);
    if (mapped && mapped !== colorMode) {
      // Do not auto-override user preference after first manual toggle; only when unset path.
    }
  }, [snapshot, colorMode]);

  const railWidth = sidebarRailWidth(sidebarCollapsed, sidebarWidthPx);
  const mcpNavBadge = mcpStatusFromExtensionUi(extensionUiState);

  return (
    <div
      className={cn(
        // Relative shell: sidebar overlays the clear native window region.
        "app-shell relative h-full w-full overflow-hidden text-[var(--text)]",
        sidebarOpen && "sidebar-open",
      )}
      style={
        {
          ["--sidebar-current-width" as string]: `${railWidth}px`,
        } as React.CSSProperties
      }
      data-testid="zeno-app"
      data-theme={activeSkinMode}
      data-theme-skin={themeSelection.id}
      data-bootstrap-ready={bootstrapReady ? "true" : "false"}
    >
      <div className="skin-wallpaper" aria-hidden data-testid="skin-wallpaper" />
      {/* Linux only (customWindowControls); Windows uses native titleBarOverlay. */}
      <WindowCaptionButtons />
      {!bootstrapReady ? (
        <BootstrapOverlay
          status={bootstrapStatus}
          {...(bootstrapDetail ? { detail: bootstrapDetail } : {})}
          {...(bootstrapError ? { error: bootstrapError } : {})}
        />
      ) : null}
      <AppSidebar
        colorMode={activeSkinMode}
        themePreference={themePreference}
        locale={locale}
        view={view}
        settingsSection={settingsSection}
        status={status}
        hostPillState={hostPillState(status, running)}
        runState={runState}
        running={running}
        sessionMarkers={sessionMarkers}
        runningSessions={runningSessions}
        collapsed={sidebarCollapsed}
        widthPx={sidebarWidthPx}
        translucent={sidebarTranslucent}
        glass={sidebarGlass}
        snapshot={snapshot}
        workspacePath={workspacePath}
        selectedProjectPath={selectedProjectPath}
        workspace={workspace}
        recentWorkspaces={recentWorkspaces}
        threads={threads}
        threadsByCwd={threadsByCwd}
        threadTitle={threadTitle}
        packageCount={
          (packages.length > 0
            ? packages.length
            : (snapshot?.configuredPackages.global ?? 0) +
              (snapshot?.configuredPackages.project ?? 0)) + mcpServerCount
        }
        {...(mcpNavBadge ? { mcpBadge: mcpNavBadge.badge, mcpDetail: mcpNavBadge.detail } : {})}
        resourceCount={
          resources.length > 0
            ? resources.length
            : snapshot?.resources
              ? snapshot.resources.extensions +
                snapshot.resources.skills +
                snapshot.resources.prompts +
                snapshot.resources.themes +
                snapshot.resources.contextFiles
              : 0
        }
        canFork={timeline.some((item) => item.kind === "user")}
        onOpenPalette={() => setPaletteOpen(true)}
        onToggleTheme={() => toggleColorMode()}
        onToggleCollapse={() => toggleSidebarCollapsed()}
        onResizeWidth={(px) => setSidebarWidthPx(px)}
        onNewThread={() => void newBlankTask()}
        onSelectProject={(path) => selectProjectPath(path)}
        onOpenProjects={() => openProjects()}
        onOpenPackages={() => void openPackages()}
        onOpenResources={() => void openResources()}
        onOpenSettings={() => void openSettings()}
        onBackToApp={() => void openThread()}
        onSettingsSection={(section) => setSettingsSection(section)}
        onOpenWorkspace={() => void openWorkspacePicker()}
        onResumeWorkspace={() => void resumeWorkspace()}
        onToggleTrust={() => void toggleTrust()}
        onOpenRecent={(path) => void openWorkspacePath(path, { resumeRecent: true })}
        onSwitchThread={(path, projectCwd) => void switchThread(path, projectCwd)}
        onForkThread={() => void forkThread()}
        onNewThreadForProject={(path) => void newThreadForProject(path)}
        onRemoveRecent={(path) => void removeRecentWorkspace(path)}
        onRevealInFolder={(path) => void revealWorkspace(path)}
        onRefresh={() => void refresh()}
        onCrash={() => void crash()}
        onStop={() => void stop()}
      />

      {/*
        .shell-content is opaque and inset by the rail, leaving the sidebar area clear
        for the native window vibrancy behind it.
      */}
      <div
        className="shell-content"
        style={{
          paddingLeft: railWidth,
          // When collapsed, content is full width.
          maxWidth: "100%",
        }}
        data-testid="shell-main"
        data-rail-width={railWidth}
      >
        {view === "thread" ? (
          <section
            ref={threadColumnRef}
            className="main-column relative flex h-full min-w-0 flex-1 flex-col"
          >
            {/*
              Chat: title only when timeline is ready and has messages.
              Terminal: always show header so chat⇄TUI toggle never disappears
              (session switch into terminal leaves timelineReady false because
              MessageScroller is unmounted and the blank-hold effect never settles).
            */}
            {contentMode === "terminal" || (timelineReady && hasActivity) ? (
              <ThreadHeader
                locale={locale}
                title={threadTitle}
                thread={activeThread}
                workspacePath={workspacePath}
                sessionId={snapshot?.sessionId}
                collapsed={sidebarCollapsed}
                contentModeSwitchLocked={running}
                onToggleContentMode={() => void toggleContentModeSurface()}
                extensionUi={extensionUiState}
              />
            ) : null}

            {/*
              Env panel:
              - float: sits in right gutter, does not squeeze conversation
              - dock: would cover content if floated → take flex space and squeeze
              - auto-hide when column cannot fit min content + panel
            */}
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-row">
              {/*
                Terminal mode: pi TUI fills the pane *below* ThreadHeader (not full
                window). Chat mode: MessageScroller timeline + sticky composer.
              */}
              {contentMode === "terminal" &&
              snapshot?.sessionFile?.trim() &&
              (snapshot.cwd?.trim() || workspacePath?.trim()) ? (
                <div
                  className="thread-pane thread-pane-terminal flex min-h-0 min-w-0 flex-1 flex-col"
                  data-content-mode="terminal"
                  data-testid="thread-terminal-surface"
                  style={{
                    background: resolveTerminalTheme(loadTerminalPrefs(), activeSkinMode)
                      .background,
                  }}
                >
                  {/* Unmounted while switching so the previous session canvas is gone. */}
                  {terminalSurfaceActive ? (
                    <PiTuiTerminal
                      key={snapshot.sessionFile}
                      sessionFile={snapshot.sessionFile}
                      cwd={(snapshot.cwd?.trim() || workspacePath || "").trim()}
                      colorMode={activeSkinMode}
                      // Equal content insets + floating right-edge scrollbar (see PiTuiTerminal).
                      className="min-h-0 flex-1"
                      onReady={(info) => {
                        endSurfaceTransition(info.sessionFile);
                      }}
                      onOpenError={(error) => {
                        reportAppError(error, t(locale, "contentMode.openFailed"));
                        // Keep per-session terminal preference so the user can retry.
                        setContentMode("chat", { persist: false });
                        setTerminalSurfaceActive(false);
                        endSurfaceTransition();
                      }}
                      onProcessExit={() => {
                        void leaveTerminalMode();
                      }}
                    />
                  ) : null}
                </div>
              ) : (
                <div className="thread-pane">
                  <SessionTimelineScroller
                    autoScroll={timelineReady && hasActivity}
                    viewportRef={timelineScrollRef}
                    viewportClassName={cn(!timelineReady && "invisible pointer-events-none")}
                    viewportBusy={!timelineReady}
                    viewportReady={timelineReady}
                    items={timeline}
                    events={events}
                    running={running}
                    waiting={waitingForInput}
                    locale={locale}
                    sessionKey={sessionKey}
                    {...(workspacePath ? { workspacePath } : {})}
                    ready={timelineReady}
                    editingLocked={running}
                    endRef={timelineEndRef}
                    onEditUser={(item, text) => void editUserAndResend(item, text)}
                    onForkAssistant={(item) => {
                      // pi fork: new session file from this assistant entry
                      void forkThread(item.entryId);
                    }}
                    emptyState={
                      <div
                        className="thread-messages empty flex min-h-full flex-1 flex-col items-center justify-center px-4 text-center"
                        data-testid="empty-hero"
                      >
                        <PixLogo className="mb-5 size-12" title={t(locale, "app.name")} />
                        <h1 className="m-0 max-w-lg text-[26px] leading-snug font-semibold tracking-[-0.03em] text-[var(--text)]">
                          {workspacePath
                            ? t(locale, "empty.title", { name: workspace.name })
                            : isPureConversation || snapshot || pendingPureConversation
                              ? t(locale, "empty.titleConversation")
                              : t(locale, "empty.titleNoWorkspace")}
                        </h1>
                        {!workspacePath ? (
                          <p className="mt-3 max-w-md text-[13px] text-[var(--muted-foreground)]">
                            {isPureConversation || snapshot || pendingPureConversation
                              ? t(locale, "empty.subtitleConversation")
                              : t(locale, "empty.subtitleNoWorkspace")}
                          </p>
                        ) : null}
                      </div>
                    }
                    footer={
                      <>
                        {/*
                          mt-auto pins the dock to the bottom of the min-h-full column when
                          messages are short; sticky keeps it glued to the scrollport bottom
                          while scrolling long threads. (Flattened MessageScroller items no
                          longer provide a flex-1 message wrapper that used to push this down.)
                        */}
                        <div
                          ref={composerDockRef}
                          className="composer-dock pointer-events-none sticky bottom-0 z-[2] mt-auto w-full shrink-0 bg-[var(--canvas)] pt-1 pb-2"
                          data-mode="sticky"
                          data-testid="composer-dock"
                        >
                          {/*
                            Jump-to-bottom is anchored to the dock top (not the scrollport
                            bottom). Measuring dock height and using bottom:Npx was fragile —
                            a low floor (72px) parked the control inside the composer card.
                          */}
                          {timelineReady && hasActivity ? (
                            <MessageScrollerButton
                              data-testid="scroll-to-bottom"
                              direction="end"
                              behavior="smooth"
                              title={t(locale, "thread.scrollToBottom")}
                              aria-label={t(locale, "thread.scrollToBottom")}
                              className={cn(
                                "pointer-events-auto z-20 size-7 rounded-full border border-border bg-popover text-foreground",
                                "shadow-[0_4px_16px_rgb(0_0_0/0.28)] hover:bg-accent",
                                // Defeat MessageScrollerButton’s default data-[direction=end]:bottom-4.
                                "data-[direction=end]:bottom-[calc(100%+12px)]",
                              )}
                              style={{
                                left: "50%",
                                marginLeft: -14, // half of size-7 (28px)
                              }}
                            >
                              <ArrowDown className="size-3.5" strokeWidth={2.25} />
                              <span className="sr-only">{t(locale, "thread.scrollToBottom")}</span>
                            </MessageScrollerButton>
                          ) : null}
                          {hasActivity && timelineReady ? (
                            <div
                              className="composer-dock-fade pointer-events-none absolute inset-x-0 top-0 z-[1] h-10 -translate-y-full"
                              aria-hidden
                            />
                          ) : null}
                          <div className="pointer-events-auto w-full">
                            <ExtensionUiChrome
                              locale={locale}
                              state={extensionUiState}
                              region="aboveEditor"
                            />
                          </div>
                          <Composer
                            locale={locale}
                            prompt={prompt}
                            onPromptChange={setPrompt}
                            onSubmit={(event) => void sendPrompt(event)}
                            onAbort={() => void abort()}
                            onKeyDown={onComposerKeyDown}
                            running={running}
                            composerRef={composerRef}
                            workspacePath={workspacePath}
                            recentWorkspaces={recentWorkspaces}
                            onOpenProject={(path) =>
                              void openWorkspacePath(path, { resumeRecent: true })
                            }
                            onAddProject={() => void openWorkspacePicker()}
                            showProjectBar={timelineReady && !hasActivity}
                            accessMode={accessMode}
                            onAccessMode={applyAccessMode}
                            accessVisibility={accessVisibility}
                            modelOptions={modelOptions}
                            modelValue={
                              displayModel ? `${displayModel.provider}/${displayModel.id}` : ""
                            }
                            onModelChange={(provider, id) => void changeModel(provider, id)}
                            thinkingLevel={displayThinkingLevel}
                            thinkingLevels={displayThinkingLevels}
                            onThinkingChange={(level) => void changeThinking(level)}
                            serviceTier={displayServiceTier}
                            serviceTiers={displayServiceTiers}
                            onServiceTierChange={(tier) => void changeServiceTier(tier)}
                            contextPercent={snapshot?.usage?.context?.percent ?? undefined}
                            contextTokens={
                              snapshot?.usage?.context?.tokens ??
                              snapshot?.usage?.tokens.total ??
                              undefined
                            }
                            showContextUsage={showContextUsage}
                            projectTrusted={snapshot?.projectTrusted}
                            runState={runState}
                            piThemeLabel={piThemeLabel(snapshot)}
                            attachments={attachments}
                            onPickAttachments={pickComposerAttachments}
                            onRemoveAttachment={(path) =>
                              setAttachments((current) => current.filter((item) => item !== path))
                            }
                            onAddAttachments={(paths) =>
                              setAttachments((current) =>
                                [...new Set([...current, ...paths])].slice(0, 12),
                              )
                            }
                            packages={packages}
                            slashCommands={buildUnifiedSlashCatalog(snapshot, locale).map(
                              (item) => ({
                                name: item.name,
                                description: item.upcoming
                                  ? `${item.description}${t(locale, "slash.upcomingSuffix")}`
                                  : item.description,
                                source:
                                  item.source === "skill" ||
                                  item.source === "prompt" ||
                                  item.source === "extension" ||
                                  item.source === "builtin"
                                    ? item.source
                                    : "builtin",
                                ...(item.argumentHint ? { argumentHint: item.argumentHint } : {}),
                              }),
                            )}
                            queuedMessages={queuedMessages}
                            onClearQueue={() => void clearQueuedMessages()}
                          />
                          <div className="pointer-events-auto w-full">
                            <ExtensionUiChrome
                              locale={locale}
                              state={extensionUiState}
                              region="belowEditor"
                            />
                          </div>
                        </div>
                      </>
                    }
                  />
                </div>
              )}

              <EnvPanel
                locale={locale}
                cwd={workspacePath ?? snapshot?.cwd}
                layout={envPanelLayout}
                open={contentMode === "chat" && envPanelOpen}
                onOpenSettings={() => {
                  setSettingsSection("environment");
                  setView("settings");
                }}
                onOpenProject={(path) => void openWorkspacePath(path, { resumeRecent: true })}
              />
            </div>
          </section>
        ) : view === "projects" ? (
          <ProjectsPage
            locale={locale}
            workspacePath={workspacePath}
            recentWorkspaces={recentWorkspaces}
            threadsByCwd={threadsByCwd}
            onOpenProject={(path) => {
              void openWorkspacePath(path, { resumeRecent: true });
              setView("thread");
            }}
            onCreateProject={() => void openWorkspacePicker()}
            onNewSession={(path) => {
              void newThreadForProject(path);
              setView("thread");
            }}
            onOpenSession={(sessionPath, projectCwd) => {
              void switchThread(sessionPath, projectCwd);
              setView("thread");
            }}
            onRemoveProject={(path) => void removeRecentWorkspace(path)}
          />
        ) : view === "packages" ? (
          <PackagesPage
            locale={locale}
            packages={packages}
            loading={ecoLoading}
            onRefresh={() => void openPackages()}
            onInstall={(source, scope, options) => installPackage(source, scope, options)}
            onRemove={(source, scope) => removePackage(source, scope)}
            onUpdate={(source) => updatePackages(source)}
            onCheckUpdates={() => checkPackageUpdates()}
            onSetEnabled={(source, scope, enabled) => setPackageEnabled(source, scope, enabled)}
          />
        ) : view === "resources" ? (
          <ResourcesPage
            locale={locale}
            resources={resources}
            loading={ecoLoading}
            onRefresh={() => void openResources()}
          />
        ) : (
          <SettingsPage
            snapshot={snapshot}
            status={status}
            locale={locale}
            section={settingsSection}
            colorMode={activeSkinMode}
            themePreference={themePreference}
            themeSelection={themeSelection}
            themeLibrary={themeLibrary}
            sidebarTranslucent={sidebarTranslucent}
            sidebarWidthPx={sidebarWidthPx}
            accessVisibility={accessVisibility}
            onAccessVisibility={applyAccessVisibility}
            accessMode={accessMode}
            onAccessMode={applyAccessMode}
            showContextUsage={showContextUsage}
            onShowContextUsage={applyShowContextUsage}
            serviceTier={serviceTier}
            onServiceTierChange={(tier) => void changeServiceTier(tier)}
            onEnsureHost={() => ensureHost()}
            onSnapshot={acceptSnapshot}
            onLocale={setLocale}
            onThemePreference={setThemePreference}
            onThemeSelection={setThemeSelection}
            onThemeLibrary={setThemeLibrary}
            onThemePreview={setThemePreview}
            onTranslucent={setSidebarTranslucent}
            onSidebarWidth={setSidebarWidthPx}
            onToggleTrust={() => void toggleTrust()}
          />
        )}

        {reviewOpen ? (
          <aside className="review-panel" data-testid="review-panel">
            <header>
              <h2>Review</h2>
              <button type="button" className="btn-ghost" onClick={() => setReviewOpen(false)}>
                Close
              </button>
            </header>
            <div className="review-body">
              <p className="empty-note">Runtime snapshot and recent host events.</p>
              <pre data-testid="runtime-snapshot">
                {snapshot ? JSON.stringify(snapshot, null, 2) : "No runtime snapshot yet."}
              </pre>
              <pre data-testid="event-log" style={{ marginTop: "0.75rem" }}>
                {events.length ? JSON.stringify(events.slice(-12), null, 2) : "No events yet."}
              </pre>
              {/* Keep stream-output for E2E assertions on latest assistant text. */}
              <pre data-testid="stream-output" style={{ marginTop: "0.75rem" }}>
                {timeline
                  .filter((item) => item.kind === "assistant")
                  .map((item) => item.text)
                  .join("\n") || "No model output yet."}
              </pre>
            </div>
          </aside>
        ) : (
          // Hidden mirrors so existing E2E selectors remain available without opening Review.
          <div hidden>
            <pre data-testid="runtime-snapshot">
              {snapshot ? JSON.stringify(snapshot, null, 2) : "No runtime snapshot yet."}
            </pre>
            <pre data-testid="event-log">
              {events.length ? JSON.stringify(events, null, 2) : "No events yet."}
            </pre>
            <pre data-testid="stream-output">
              {timeline
                .filter((item) => item.kind === "assistant")
                .map((item) => item.text)
                .join("\n") || "No model output yet."}
            </pre>
          </div>
        )}
      </div>
      {/* /shell-main — content column right of overlay sidebar */}

      <CommandPalette
        open={paletteOpen}
        locale={locale}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
      />
      <SessionTreePanel
        open={sessionTreeOpen}
        mode={sessionTreeMode}
        locale={locale}
        tree={sessionTree}
        loading={sessionTreeLoading}
        error={sessionTreeError}
        onClose={() => setSessionTreeOpen(false)}
        onRefresh={() => void refreshSessionTree()}
        onNavigate={async (node, options) => {
          try {
            if (sessionTreeMode === "fork") {
              setStatus(t(locale, "sessionTree.busy.forking"));
              await forkThread(node.id);
              setSessionTreeOpen(false);
              focusComposer();
              return;
            }
            if (options?.summarize) {
              setStatus(t(locale, "session.parity.treeSummarizing"));
            } else {
              setStatus(t(locale, "sessionTree.busy.navigating"));
            }
            const opened = await window.zeno.session.navigateTree(node.id, options);
            if (opened.cancelled) {
              setStatus(t(locale, "session.parity.treeFailed"));
              return;
            }
            markSessionOpenForBottomScroll();
            applySessionOpen({
              snapshot: opened.snapshot,
              threads: opened.threads,
              history: opened.history,
            });
            // User-message targets: pi rewinds to parent and returns text for re-send.
            if (opened.selectedText !== undefined) {
              setPrompt(opened.selectedText);
            }
            setSessionTreeOpen(false);
            setStatus(t(locale, "session.parity.treeNavigated"));
            focusComposer();
          } catch (error) {
            reportAppError(error, t(locale, "session.parity.treeFailed"));
          }
        }}
      />
      <SessionInfoPanel
        open={sessionInfoOpen}
        locale={locale}
        info={sessionInfo}
        loading={sessionInfoLoading}
        error={sessionInfoError}
        onClose={() => setSessionInfoOpen(false)}
        onRefresh={() => void refreshSessionInfo()}
        onRename={async (name) => {
          if (!name) return;
          try {
            acceptSnapshot(await window.zeno.session.setName(name));
            await refreshSessionInfo();
            await refreshThreads();
          } catch (error) {
            reportAppError(error, t(locale, "session.parity.renameFailed"));
          }
        }}
        onExport={async (format) => {
          try {
            const result = await window.zeno.session.exportPick(format);
            if (!result) return;
            setStatus(t(locale, "session.parity.exported", { format, path: result.path }));
          } catch (error) {
            reportAppError(error, t(locale, "session.parity.exportFailed"));
          }
        }}
        onShare={async () => {
          try {
            setStatus(t(locale, "session.parity.sharing"));
            const shared = await window.zeno.session.share();
            await navigator.clipboard.writeText(shared.url).catch(() => undefined);
            setStatus(t(locale, "session.parity.shared", { url: shared.url }));
            void window.zeno.workspace.openExternal(shared.url).catch(() => undefined);
          } catch (error) {
            reportAppError(error, t(locale, "session.parity.shareFailed"));
          }
        }}
        onClone={async () => {
          try {
            const opened = await window.zeno.session.clone();
            markSessionOpenForBottomScroll();
            applySessionOpen(opened);
            setSessionInfoOpen(false);
            setStatus(t(locale, "session.parity.cloned"));
          } catch (error) {
            reportAppError(error, t(locale, "session.parity.cloneFailed"));
          }
        }}
        onCompact={async () => {
          try {
            acceptSnapshot(await window.zeno.session.compact());
            await refreshSessionInfo();
            setStatus(t(locale, "session.parity.compacted"));
          } catch (error) {
            reportAppError(error, t(locale, "session.parity.compactFailed"));
          }
        }}
      />

      <RenameDialog
        open={sessionNameDialogOpen}
        title={t(locale, "session.renameTitle")}
        label={t(locale, "sessionInfo.name")}
        initialValue={snapshot?.sessionName ?? ""}
        confirmLabel={t(locale, "common.confirm")}
        cancelLabel={t(locale, "common.cancel")}
        testId="session-name-dialog"
        onCancel={() => setSessionNameDialogOpen(false)}
        onConfirm={(value) => {
          setSessionNameDialogOpen(false);
          const name = value.trim();
          if (!name) return;
          void (async () => {
            try {
              if (!useShellStore.getState().snapshot) await ensureHost();
              acceptSnapshot(await window.zeno.session.setName(name));
              setStatus(t(locale, "session.parity.named", { name }));
              await refreshThreads();
            } catch (error) {
              reportAppError(error, t(locale, "session.parity.renameFailed"));
            }
          })();
        }}
      />

      <ConfirmDialog
        open={Boolean(editResendConfirm)}
        title={t(locale, "timeline.editConfirmTitle")}
        message={t(locale, "timeline.editConfirmMessage")}
        confirmLabel={t(locale, "timeline.editConfirm")}
        cancelLabel={t(locale, "common.cancel")}
        danger
        testId="timeline-edit-resend-confirm"
        onCancel={() => setEditResendConfirm(null)}
        onConfirm={() => {
          const pending = editResendConfirm;
          setEditResendConfirm(null);
          if (!pending) return;
          void editUserAndResend(pending.item, pending.text, { skipConfirm: true });
        }}
      />

      <ProjectTrustDialog
        open={showProjectTrustPrompt}
        locale={locale}
        cwd={trustPromptCwd ?? ""}
        busy={trustPromptBusy}
        onTrust={() => void answerProjectTrust(true)}
        onDistrust={() => void answerProjectTrust(false)}
        onLater={dismissProjectTrustPrompt}
      />

      <ErrorDialog
        open={Boolean(appError)}
        title={t(locale, "error.dialogTitle")}
        message={appError ?? ""}
        confirmLabel={t(locale, "error.dialogOk")}
        onClose={clearAppError}
      />

      <ExtensionUiHost locale={locale} />
    </div>
  );
}

function PackagesPage(props: {
  locale: Locale;
  packages: PackageSummary[];
  loading: boolean;
  onRefresh: () => void;
  onInstall: (
    source: string,
    scope: "global" | "project",
    options?: { temporary?: boolean },
  ) => Promise<void>;
  onRemove: (source: string, scope: "global" | "project") => Promise<void>;
  onUpdate: (source?: string) => Promise<void>;
  onCheckUpdates: () => Promise<
    Array<{ source: string; displayName: string; type: "npm" | "git"; scope: "global" | "project" }>
  >;
  onSetEnabled: (source: string, scope: "global" | "project", enabled: boolean) => Promise<void>;
}) {
  const tr = (key: Parameters<typeof t>[1], vars?: Record<string, string>) =>
    t(props.locale, key, vars);
  /** Trial install: like CLI `-e` — not written to settings. */
  const [temporary, setTemporary] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Sources known to have an available update after the last check. */
  const [updateSources, setUpdateSources] = useState<Set<string>>(() => new Set());
  const [updatesChecked, setUpdatesChecked] = useState(false);
  const CATALOG_PAGE = 20;
  const [tab, setTab] = useState<"installed" | "discover">("installed");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogPackage[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogLoadingMore, setCatalogLoadingMore] = useState(false);
  const [catalogError, setCatalogError] = useState<string>();
  const [installingSource, setInstallingSource] = useState<string>();
  const [discoverScope, setDiscoverScope] = useState<"global" | "project">("global");
  /** Discover tab: plugin packages vs MCP servers. */
  const [discoverType, setDiscoverType] = useState<"plugin" | "mcp">("plugin");
  /** Installed MCP servers from mcp.json. */
  const [mcpServers, setMcpServers] = useState<McpConfig>({ mcpServers: {} });
  /** True when MCP config was modified and needs a host restart to take effect. */
  const [mcpDirty, setMcpDirty] = useState(false);
  const catalogLoadGen = useRef(0);
  const catalogLoadingMoreRef = useRef(false);
  const catalogEndRef = useRef<HTMLDivElement | null>(null);

  const installedSources = useMemo(() => {
    const set = new Set<string>();
    for (const p of props.packages) {
      set.add(p.source);
      // also match bare name without npm: prefix
      if (p.source.startsWith("npm:")) set.add(p.source.slice(4));
    }
    return set;
  }, [props.packages]);

  const catalogHasMore = catalog.length < catalogTotal;

  async function loadCatalog(query = catalogQuery) {
    const gen = ++catalogLoadGen.current;
    setCatalogLoading(true);
    setCatalogError(undefined);
    setCatalogLoadingMore(false);
    catalogLoadingMoreRef.current = false;
    try {
      const result =
        discoverType === "mcp"
          ? await window.zeno.mcp.searchCatalog(query.trim() || undefined, CATALOG_PAGE, 0)
          : await window.zeno.packages.searchCatalog(query.trim() || undefined, CATALOG_PAGE, 0);
      if (gen !== catalogLoadGen.current) return;
      setCatalog(result.packages);
      setCatalogTotal(result.total);
    } catch (error) {
      if (gen !== catalogLoadGen.current) return;
      setCatalog([]);
      setCatalogTotal(0);
      setCatalogError(error instanceof Error ? error.message : tr("packages.discoverFailed"));
    } finally {
      if (gen === catalogLoadGen.current) setCatalogLoading(false);
    }
  }

  async function loadMoreCatalog() {
    if (!catalogHasMore || catalogLoading || catalogLoadingMoreRef.current) return;
    catalogLoadingMoreRef.current = true;
    setCatalogLoadingMore(true);
    const gen = catalogLoadGen.current;
    const from = catalog.length;
    try {
      const result =
        discoverType === "mcp"
          ? await window.zeno.mcp.searchCatalog(
              catalogQuery.trim() || undefined,
              CATALOG_PAGE,
              from,
            )
          : await window.zeno.packages.searchCatalog(
              catalogQuery.trim() || undefined,
              CATALOG_PAGE,
              from,
            );
      if (gen !== catalogLoadGen.current) return;
      if (result.packages.length === 0) {
        // Registry has no more pages — clamp total so we stop requesting.
        setCatalogTotal(from);
        return;
      }
      setCatalog((prev) => {
        const seen = new Set(prev.map((p) => p.name));
        const next = [...prev];
        for (const item of result.packages) {
          if (seen.has(item.name)) continue;
          seen.add(item.name);
          next.push(item);
        }
        return next;
      });
      setCatalogTotal(result.total);
    } catch (error) {
      if (gen !== catalogLoadGen.current) return;
      setCatalogError(error instanceof Error ? error.message : tr("packages.discoverFailed"));
    } finally {
      if (gen === catalogLoadGen.current) {
        catalogLoadingMoreRef.current = false;
        setCatalogLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    if (tab !== "discover") return;
    void loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, discoverType]);

  // Load MCP config when viewing installed tab
  useEffect(() => {
    if (tab === "installed") void loadMcpConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab !== "discover") return;
    const handle = window.setTimeout(() => void loadCatalog(catalogQuery), 320);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogQuery]);

  // Infinite scroll: load next page when the list end enters the page-body viewport.
  useEffect(() => {
    if (tab !== "discover" || !catalogHasMore || catalogLoading) return;
    const sentinel = catalogEndRef.current;
    if (!sentinel) return;
    const root = sentinel.closest(".page-body");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMoreCatalog();
      },
      { root: root instanceof Element ? root : null, rootMargin: "160px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, catalogHasMore, catalogLoading, catalogLoadingMore, catalog.length, catalogQuery]);

  async function installFromCatalog(item: CatalogPackage) {
    setInstallingSource(item.source);
    setBusy(true);
    try {
      await props.onInstall(
        item.source,
        discoverScope,
        temporary ? { temporary: true } : undefined,
      );
      props.onRefresh();
    } catch {
      // modal via parent
    } finally {
      setInstallingSource(undefined);
      setBusy(false);
    }
  }

  async function installMcpFromCatalog(item: CatalogPackage) {
    setInstallingSource(item.source);
    setBusy(true);
    try {
      // Derive a short server name from the package name
      const name = item.name.startsWith("@") ? item.name.split("/").pop()! : item.name;
      await window.zeno.mcp.installServer(name, item.name);
      await loadMcpConfig();
      setMcpDirty(true);
    } catch {
      // parent reports error
    } finally {
      setInstallingSource(undefined);
      setBusy(false);
    }
  }

  async function removeMcp(name: string) {
    setBusy(true);
    try {
      await window.zeno.mcp.removeServer(name);
      await loadMcpConfig();
      // Reload the agent host so pi-mcp-adapter re-reads mcp.json and
      // disconnects from the removed server immediately.  Removal is safe
      // to reload — we are removing a server, not adding one, so a crash
      // loop from a broken server is impossible.
      try {
        await window.zeno.runtime.reload();
        setMcpDirty(false);
      } catch {
        // Host may not be running yet; config is already saved.  Show the
        // pending hint so the user knows to restart manually.
        setMcpDirty(true);
      }
    } catch {
      // parent reports error
    } finally {
      setBusy(false);
    }
  }

  async function setMcpEnabled(name: string, enabled: boolean) {
    setBusy(true);
    try {
      await window.zeno.mcp.setEnabled(name, enabled);
      await loadMcpConfig();
      setMcpDirty(true);
    } catch {
      // parent reports error
    } finally {
      setBusy(false);
    }
  }

  async function updateMcp(name: string) {
    setBusy(true);
    try {
      await window.zeno.mcp.updateServer(name);
      setMcpDirty(true);
    } catch {
      // parent reports error
    } finally {
      setBusy(false);
    }
  }

  async function loadMcpConfig() {
    try {
      const cfg = await window.zeno.mcp.getConfig();
      setMcpServers(cfg);
    } catch {
      // keep previous state
    }
  }

  function formatWeekly(n: number | undefined): string | undefined {
    if (n == null || !Number.isFinite(n)) return undefined;
    if (n >= 1000)
      return tr("packages.discoverWeekly", { n: `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` });
    return tr("packages.discoverWeekly", { n: String(Math.round(n)) });
  }

  async function runCheckUpdates() {
    setBusy(true);
    try {
      const updates = await props.onCheckUpdates();
      setUpdateSources(new Set(updates.map((u) => u.source)));
      setUpdatesChecked(true);
    } catch {
      // parent reports error
    } finally {
      setBusy(false);
    }
  }

  async function runUpdate(source?: string) {
    setBusy(true);
    try {
      await props.onUpdate(source);
      if (source) {
        setUpdateSources((prev) => {
          const next = new Set(prev);
          next.delete(source);
          return next;
        });
      } else {
        setUpdateSources(new Set());
      }
      setUpdatesChecked(true);
    } catch {
      // parent reports error
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page" data-testid="packages-page">
      <header className="page-header">
        <h1>{tr("packages.title")}</h1>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn-secondary"
            data-testid="packages-refresh"
            onClick={() => {
              if (tab === "discover") void loadCatalog();
              else props.onRefresh();
            }}
            disabled={props.loading || busy || catalogLoading}
          >
            {props.loading || catalogLoading ? tr("packages.loading") : tr("packages.refresh")}
          </button>
          {tab === "installed" ? (
            <>
              <button
                type="button"
                className="btn-secondary"
                data-testid="packages-check-updates"
                onClick={() => void runCheckUpdates()}
                disabled={props.loading || busy || props.packages.length === 0}
                title={tr("packages.checkUpdatesHint")}
              >
                {tr("packages.checkUpdates")}
              </button>
              {updatesChecked && updateSources.size > 0 ? (
                <button
                  type="button"
                  className="btn-secondary"
                  data-testid="packages-update-all"
                  onClick={() => void runUpdate()}
                  disabled={props.loading || busy}
                >
                  {tr("packages.updateAllAvailable")}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </header>
      <div className="page-tabs" data-testid="packages-tabs">
        <button
          type="button"
          className="page-tab"
          data-active={tab === "installed" ? "true" : "false"}
          data-testid="packages-tab-installed"
          onClick={() => setTab("installed")}
        >
          {tr("packages.tab.installed")}
        </button>
        <button
          type="button"
          className="page-tab"
          data-active={tab === "discover" ? "true" : "false"}
          data-testid="packages-tab-discover"
          onClick={() => setTab("discover")}
        >
          {tr("packages.tab.discover")}
        </button>
      </div>
      <div className="page-body">
        <div className="page-body-inner">
          {tab === "discover" ? (
            <div data-testid="packages-discover">
              {/* One toolbar: search · scope · open web · trial toggle. Install only via list. */}
              <div
                className="mb-3 flex min-w-0 flex-nowrap items-center gap-2"
                data-testid="packages-discover-toolbar"
              >
                <SettingsSearchField
                  testId="packages-discover-search"
                  value={catalogQuery}
                  onChange={setCatalogQuery}
                  placeholder={tr("packages.discoverSearch")}
                  className="min-w-0 flex-1"
                />
                <SettingsSelect
                  testId="packages-discover-type"
                  size="md"
                  className="h-9 shrink-0"
                  value={discoverType}
                  onChange={(v) => setDiscoverType(v as "plugin" | "mcp")}
                  disabled={busy || Boolean(installingSource)}
                  options={[
                    { value: "plugin", label: tr("packages.installedSection") },
                    { value: "mcp", label: tr("mcp.scopeLabel") },
                  ]}
                />
                {discoverType === "plugin" ? (
                  <SettingsSelect
                    testId="packages-discover-scope"
                    size="md"
                    className="h-9 shrink-0"
                    value={discoverScope}
                    onChange={(v) => setDiscoverScope(v as "global" | "project")}
                    disabled={busy || Boolean(installingSource)}
                    options={[
                      { value: "global", label: tr("packages.scopeGlobal") },
                      { value: "project", label: tr("packages.scopeProject") },
                    ]}
                  />
                ) : null}
                {discoverType === "plugin" ? (
                  <a
                    className="btn-secondary inline-flex h-9 shrink-0 items-center whitespace-nowrap no-underline"
                    href="https://pi.dev/packages"
                    target="_blank"
                    rel="noreferrer"
                    data-testid="packages-catalog-link"
                  >
                    {tr("packages.discoverOpenWeb")}
                  </a>
                ) : null}
                {discoverType === "plugin" ? (
                  <div
                    className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-[var(--border)] px-2.5"
                    data-testid="package-temporary-label"
                    title={tr("packages.temporary")}
                  >
                    <span className="whitespace-nowrap text-[12px] text-[var(--muted-foreground)]">
                      {tr("packages.installTemp")}
                    </span>
                    <SettingsToggle
                      checked={temporary}
                      onChange={setTemporary}
                      disabled={props.loading || busy}
                      testId="package-temporary"
                      aria-label={tr("packages.temporary")}
                    />
                  </div>
                ) : null}
              </div>
              {catalogError ? (
                <p className="form-error" data-testid="packages-discover-error">
                  {catalogError}
                </p>
              ) : null}
              {catalogLoading && catalog.length === 0 ? (
                <p className="m-0 text-[13px] text-[var(--muted-foreground)]">
                  {tr("packages.discoverLoading")}
                </p>
              ) : catalog.length === 0 ? (
                <div className="empty-panel" data-testid="packages-discover-empty">
                  <p>{tr("packages.discoverEmpty")}</p>
                </div>
              ) : (
                <div className="item-list" data-testid="packages-discover-list">
                  {catalog.map((item) => {
                    const mcpName = item.name.startsWith("@")
                      ? item.name.split("/").pop()!
                      : item.name;
                    const installed =
                      discoverType === "mcp"
                        ? mcpName in (mcpServers.mcpServers ?? {})
                        : installedSources.has(item.source) || installedSources.has(item.name);
                    const installing = installingSource === item.source;
                    return (
                      <article
                        key={item.name}
                        className="item-card"
                        data-testid={`catalog-package-${item.name}`}
                      >
                        <div className="min-w-0 flex-1">
                          <a
                            className="title cursor-pointer no-underline hover:underline"
                            href={`https://www.npmjs.com/package/${item.name}`}
                            target="_blank"
                            rel="noreferrer"
                            title={`${tr("packages.discoverOpenWeb")} → ${item.name}`}
                          >
                            {item.name}
                          </a>
                          <div className="meta">
                            v{item.version}
                            {item.publisher ? ` · ${item.publisher}` : ""}
                            {formatWeekly(item.weeklyDownloads)
                              ? ` · ${formatWeekly(item.weeklyDownloads)}`
                              : ""}
                          </div>
                          {item.description ? (
                            <p className="m-0 mt-1.5 text-[12.5px] leading-snug text-[var(--muted-foreground)]">
                              {item.description}
                            </p>
                          ) : null}
                          <div className="mt-1 font-mono text-[11px] text-[var(--text-subtle)]">
                            {item.source}
                          </div>
                        </div>
                        <div className="badges">
                          {item.keywords
                            ?.filter((k) => k !== "pi-package" && k !== "mcp-server")
                            .slice(0, 3)
                            .map((k) => (
                              <span key={k} className="chip">
                                {k}
                              </span>
                            ))}
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            data-testid={`catalog-install-${item.name}`}
                            disabled={installed || installing || busy || props.loading}
                            onClick={() =>
                              discoverType === "mcp"
                                ? void installMcpFromCatalog(item)
                                : void installFromCatalog(item)
                            }
                            title={
                              discoverType === "mcp"
                                ? tr("mcp.install")
                                : temporary
                                  ? tr("packages.temporary")
                                  : tr("packages.discoverInstall")
                            }
                          >
                            {installed
                              ? tr(
                                  discoverType === "mcp"
                                    ? "mcp.installed"
                                    : "packages.discoverInstalled",
                                )
                              : installing
                                ? tr("mcp.installing")
                                : discoverType === "mcp"
                                  ? tr("mcp.install")
                                  : temporary
                                    ? tr("packages.installTemp")
                                    : tr("packages.discoverInstall")}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  <div
                    ref={catalogEndRef}
                    className="py-2 text-center text-[12px] text-[var(--text-subtle)]"
                    data-testid="packages-discover-scroll-end"
                  >
                    {catalogLoadingMore
                      ? tr("packages.discoverLoadingMore")
                      : catalogHasMore
                        ? null
                        : catalog.length > 0
                          ? tr("packages.discoverEnd")
                          : null}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {props.packages.length === 0 ? (
                <div className="empty-panel" data-testid="packages-empty">
                  <h2>{tr("packages.emptyTitle")}</h2>
                  <p>{tr("packages.emptyBody")}</p>
                </div>
              ) : (
                <>
                  <h3 className="text-[14px] font-semibold text-[var(--foreground)]">
                    {tr("packages.installedSection")}
                  </h3>
                  <div className="item-list" data-testid="packages-list">
                    {updatesChecked ? (
                      <p className="form-hint m-0" data-testid="packages-update-summary">
                        {updateSources.size === 0
                          ? tr("packages.updateCheckedNone")
                          : tr("packages.updateAvailableCount", {
                              n: String(updateSources.size),
                            })}
                      </p>
                    ) : null}
                    {props.packages.map((item) => {
                      const hasUpdate = updateSources.has(item.source);
                      return (
                        <article
                          key={`${item.scope}:${item.source}`}
                          className="item-card"
                          data-enabled={item.enabled ? "true" : "false"}
                          data-update={hasUpdate ? "true" : "false"}
                          data-testid={`package-card-${item.scope}-${item.source}`}
                        >
                          <div className="min-w-0">
                            <div className="title">{item.source}</div>
                            <div className="meta">
                              {item.installedPath ? item.installedPath : tr("packages.notResolved")}
                              {item.filtered ? ` · ${tr("packages.filtered")}` : ""}
                            </div>
                          </div>
                          <div className="badges">
                            <span
                              className="chip-status"
                              data-tone={item.enabled ? "on" : "off"}
                              data-testid={`package-status-${item.scope}-${item.source}`}
                            >
                              {item.enabled ? tr("packages.enabled") : tr("packages.disabled")}
                            </span>
                            {hasUpdate ? (
                              <span className="chip-status" data-tone="update">
                                {tr("packages.updateAvailable")}
                              </span>
                            ) : null}
                            <span className="chip">{item.scope}</span>
                            <span className="chip">{item.kind}</span>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              data-testid={`package-enable-${item.scope}-${item.source}`}
                              disabled={props.loading || busy}
                              onClick={() =>
                                void props.onSetEnabled(item.source, item.scope, !item.enabled)
                              }
                            >
                              {item.enabled ? tr("packages.disable") : tr("packages.enable")}
                            </button>
                            {item.kind !== "local" ? (
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                data-testid={`package-update-${item.scope}-${item.source}`}
                                disabled={
                                  props.loading || busy || (updatesChecked ? !hasUpdate : false)
                                }
                                title={
                                  updatesChecked && !hasUpdate
                                    ? tr("packages.upToDate")
                                    : tr("packages.update")
                                }
                                onClick={() => void runUpdate(item.source)}
                              >
                                {updatesChecked && !hasUpdate
                                  ? tr("packages.upToDate")
                                  : tr("packages.update")}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btn-ghost btn-sm danger"
                              data-testid={`package-remove-${item.scope}-${item.source}`}
                              disabled={props.loading || busy}
                              onClick={() => void props.onRemove(item.source, item.scope)}
                            >
                              {tr("packages.remove")}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}

              {/* MCP Servers section in installed tab */}
              <div className="mt-4" data-testid="mcp-installed">
                {Object.keys(mcpServers.mcpServers ?? {}).length > 0 ? (
                  <>
                    <div className="flex items-center gap-3">
                      <h3 className="text-[14px] font-semibold text-[var(--foreground)]">
                        {tr("mcp.installedTitle")}
                      </h3>
                      {mcpDirty && (
                        <span className="chip-status" data-tone="update">
                          {tr("mcp.restartHint")}
                        </span>
                      )}
                    </div>
                    {mcpDirty && (
                      <p className="form-hint m-0 mt-1">{tr("mcp.restartHintDetail")}</p>
                    )}
                    <div className="item-list mt-2">
                      {Object.entries(mcpServers.mcpServers).map(([name, cfg]) => (
                        <article
                          key={name}
                          className="item-card"
                          data-enabled={cfg.disabled ? "false" : "true"}
                          data-testid={`mcp-card-${name}`}
                        >
                          <div className="min-w-0">
                            <div className="title">{name}</div>
                            <div className="meta">
                              {cfg.packageName ?? `${cfg.command} ${cfg.args?.join(" ") ?? ""}`}
                            </div>
                          </div>
                          <div className="badges">
                            <span
                              className="chip-status"
                              data-tone={cfg.disabled ? "off" : "on"}
                              data-testid={`mcp-status-${name}`}
                            >
                              {cfg.disabled ? tr("packages.disabled") : tr("packages.enabled")}
                            </span>
                            <span className="chip">global</span>
                            <span className="chip">npm</span>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              data-testid={`mcp-enable-${name}`}
                              disabled={busy}
                              onClick={() => void setMcpEnabled(name, !!cfg.disabled)}
                            >
                              {cfg.disabled ? tr("packages.enable") : tr("packages.disable")}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              data-testid={`mcp-update-${name}`}
                              disabled={busy}
                              title={tr("packages.update")}
                              onClick={() => void updateMcp(name)}
                            >
                              {tr("packages.update")}
                            </button>
                            <button
                              type="button"
                              className="btn-ghost btn-sm danger"
                              data-testid={`mcp-remove-${name}`}
                              disabled={busy}
                              onClick={() => void removeMcp(name)}
                            >
                              {tr("mcp.remove")}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="empty-panel" data-testid="mcp-empty">
                    <h2>{tr("mcp.emptyTitle")}</h2>
                    <p>{tr("mcp.emptyBody")}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function ResourcesPage(props: {
  locale: Locale;
  resources: ResourceSummary[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const tr = (key: Parameters<typeof t>[1], vars?: Record<string, string>) =>
    t(props.locale, key, vars);
  return (
    <section className="page" data-testid="resources-page">
      <header className="page-header">
        <h1>{tr("resources.title")}</h1>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn-secondary"
            data-testid="resources-refresh"
            onClick={props.onRefresh}
            disabled={props.loading}
          >
            {props.loading ? tr("resources.loading") : tr("resources.refresh")}
          </button>
        </div>
      </header>
      <div className="page-body">
        <div className="page-body-inner">
          {props.resources.length === 0 ? (
            <div className="empty-panel" data-testid="resources-empty">
              <h2>{tr("resources.emptyTitle")}</h2>
              <p>{tr("resources.emptyBody")}</p>
            </div>
          ) : (
            <div className="item-list" data-testid="resources-list">
              {props.resources.map((item) => (
                <article key={`${item.kind}:${item.path}:${item.name}`} className="item-card">
                  <div className="min-w-0">
                    <div className="title">{item.name}</div>
                    <div className="meta">
                      {item.path || "—"}
                      {item.source ? ` · ${item.source}` : ""}
                      {item.kind === "context" || item.kind === "system"
                        ? tr("resources.contextHint")
                        : ""}
                    </div>
                  </div>
                  <div className="badges flex items-center gap-2">
                    <span className="chip">{item.kind}</span>
                    {item.path ? (
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        data-testid={`resource-open-${item.kind}-${item.name}`}
                        onClick={() => void window.zeno.workspace.openFile(item.path)}
                      >
                        {tr("resources.open")}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const root = document.querySelector("#root");
if (!root) throw new Error("Renderer root element is missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
