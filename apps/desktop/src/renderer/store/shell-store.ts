/**
 * Short-lived UI projection store.
 * Host snapshots/events and pi JSONL remain the authority — this store must not
 * persist agent config, session trees, or secrets. Desktop prefs (locale, sidebar
 * chrome) may use localStorage only.
 */
import type {
  HostEvent,
  HostSnapshot,
  PackageSummary,
  QueuedMessages,
  ResourceSummary,
  RuntimeEvent,
  SessionHistoryMessage,
  SessionThreadSummary,
  ThemeLibrarySnapshot,
} from "@zeno/contracts";
import { create } from "zustand";
import { DEFAULT_LOCALE, isLocale, type Locale } from "../lib/i18n.ts";
import { SHELL_SIDEBAR } from "../lib/layout.ts";
import { SIDEBAR_DEFAULT_TRANSLUCENT, clampSidebarWidth } from "../lib/sidebar-prefs.ts";
import {
  COMPLETED_MARKER_MS,
  STICKY_TERMINAL_MARKER_MS,
  isBusyRunState,
  type SessionMarker,
} from "../lib/session-markers.ts";
import type { ThreadRunState } from "../lib/timeline.ts";
import {
  applyRuntimeEventToLiveStream,
  emptyLiveStream,
  resetLiveStream,
  retractOptimisticUserMessage,
  type LiveStreamState,
} from "../lib/live-stream.ts";
import {
  isThemePreference,
  nextThemePreference,
  resolveColorMode,
  systemPrefersDark,
  type ResolvedColorMode,
  type ThemePreference,
} from "../lib/theme.ts";
import {
  EMPTY_THEME_LIBRARY,
  loadThemeSelection,
  saveThemeSelection,
  type ThemePreview,
  type ThemeSelection,
} from "../lib/theme-packs.ts";
import {
  loadContentMode,
  saveContentMode,
  saveContentModeForSession,
  toggleContentMode as flipContentMode,
  type ContentMode,
} from "../lib/content-mode-prefs.ts";

export type { ContentMode };

/** Timers that clear terminal sidebar glyphs (completed / failed / aborted / …) back to idle. */
const markerClearTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearMarkerTimer(key: string): void {
  const timer = markerClearTimers.get(key);
  if (timer !== undefined) {
    clearTimeout(timer);
    markerClearTimers.delete(key);
  }
}

function scheduleMarkerClear(key: string, delayMs: number, apply: () => void): void {
  clearMarkerTimer(key);
  markerClearTimers.set(
    key,
    setTimeout(() => {
      markerClearTimers.delete(key);
      apply();
    }, delayMs),
  );
}

export type ShellView = "thread" | "projects" | "packages" | "resources" | "settings";
export type ColorMode = ResolvedColorMode;
export type { ThemePreference, ResolvedColorMode };
/** Implemented settings sections only (no stub / coming-soon nav). */
export type SettingsSection =
  | "general"
  | "appearance"
  | "terminal"
  | "runtimes"
  | "environment"
  | "worktree"
  | "behavior"
  | "git"
  | "usage"
  | "notifications"
  | "shortcuts"
  | "proxy"
  | "models"
  | "piSettings"
  | "pi"
  | "archived";

export interface ShellState {
  status: string;
  snapshot: HostSnapshot | undefined;
  events: HostEvent[];
  /**
   * Append-only live timeline for content after `history` (current session).
   * Streamed text only grows; cleared on session switch.
   */
  liveStream: LiveStreamState;
  history: SessionHistoryMessage[];
  threads: SessionThreadSummary[];
  prompt: string;
  sentPrompts: string[];
  queuedMessages: QueuedMessages;
  /** Foreground session is generating (composer stop button). */
  running: boolean;
  /**
   * Per-session run markers for the sidebar (ui-spec §5.2 glyphs).
   * Keys are sessionFile or sessionId (normalized).
   */
  sessionMarkers: Record<string, SessionMarker>;
  /**
   * Sessions with an in-flight agent turn (including background/parked hosts).
   * Derived-compatible with markers; kept for callers that only need busy flags.
   */
  runningSessions: Record<string, true>;
  /** runtimeId → session key, so background settle events can clear the right row. */
  runningRuntimeIds: Record<string, string>;
  /**
   * Last session key bound to a runtime while it was busy.
   * Survives `setSessionRunning(false)` / idle so late `agent.settled` can still
   * mark sidebar unread after the busy map is cleared.
   */
  lastSessionByRuntime: Record<string, string>;
  reviewOpen: boolean;
  /** Session environment panel (right rail). */
  envPanelOpen: boolean;
  /** Mobile overlay open (narrow layout). */
  sidebarOpen: boolean;
  /** Desktop collapse to icon rail. */
  sidebarCollapsed: boolean;
  sidebarWidthPx: number;
  /** Original shell's native frosted rail preference, used by the unskinned default mode. */
  sidebarTranslucent: boolean;
  locale: Locale;
  settingsSection: SettingsSection;
  lastFailure: string | undefined;
  /**
   * Model errors that have not yet finalized (auto-retry may still recover).
   * Keyed by runtimeId so background hosts do not clobber the foreground failure text.
   */
  pendingFailureByRuntime: Record<string, string>;
  /** App-level error modal (not agent timeline errors). */
  appError: string | undefined;
  view: ShellView;
  packages: PackageSummary[];
  resources: ResourceSummary[];
  ecoLoading: boolean;
  themePreference: ThemePreference;
  resolvedColorMode: ResolvedColorMode;
  /** Resolved appearance applied to data-theme (alias of resolvedColorMode). */
  colorMode: ResolvedColorMode;
  /** Persisted active skin id; skin data itself lives in Electron userData. */
  themeSelection: ThemeSelection;
  themeLibrary: ThemeLibrarySnapshot;
  /** Ephemeral Studio state, never written to the theme library until the user saves it. */
  themePreview: ThemePreview | undefined;
  paletteOpen: boolean;
  runtimeId: string | undefined;
  lastSequence: number;
  /**
   * Primary content surface: React chat timeline vs embedded pi TUI (PTY).
   * Preference only — enter/leave transitions live in main.tsx (open/dispose PTY).
   */
  contentMode: ContentMode;

  setStatus: (status: string) => void;
  /**
   * Set content surface. By default persists for the current session (and global last-used).
   * Pass `persist: false` for temporary UI flips during session switch teardown so we do not
   * overwrite another session's remembered chat/terminal choice.
   */
  setContentMode: (
    mode: ContentMode,
    options?: { persist?: boolean; sessionFile?: string },
  ) => void;
  toggleContentMode: () => void;
  setSnapshot: (snapshot: HostSnapshot | undefined) => void;
  setEvents: (events: HostEvent[] | ((current: HostEvent[]) => HostEvent[])) => void;
  /** Apply one runtime event to the append-only live stream log. */
  applyLiveStreamEvent: (
    event: RuntimeEvent,
    prompts: string[],
    options?: { sequence?: number },
  ) => void;
  /**
   * Drop an optimistic user row (e.g. send reclassified as steer queue).
   * Does not touch host authority — only the local live stream projection.
   */
  retractOptimisticUserMessage: (displayText: string) => void;
  /** Drop all stream state (session switch). */
  clearLiveStream: () => void;
  setHistory: (history: SessionHistoryMessage[]) => void;
  setThreads: (threads: SessionThreadSummary[]) => void;
  setPrompt: (prompt: string) => void;
  setSentPrompts: (prompts: string[] | ((current: string[]) => string[])) => void;
  setQueuedMessages: (messages: QueuedMessages) => void;
  setRunning: (running: boolean) => void;
  /** Set sidebar marker + busy flag for a session (running / waiting / failed / …). */
  setSessionMarker: (
    sessionKey: string,
    state: ThreadRunState,
    options?: { reason?: string; runtimeId?: string },
  ) => void;
  /** Mark/unmark a session as generating (sidebar marker + foreground running). */
  setSessionRunning: (sessionKey: string, running: boolean, runtimeId?: string) => void;
  /** Settle a session by runtime id (completed flash, failed, aborted, …). */
  settleSessionByRuntime: (
    runtimeId: string,
    state: Extract<ThreadRunState, "completed" | "failed" | "aborted" | "crashed" | "idle">,
    reason?: string,
  ) => void;
  /** Session key for a runtime (busy map, then last-known). */
  sessionKeyForRuntime: (runtimeId: string) => string | undefined;
  clearSessionRunningByRuntime: (runtimeId: string) => void;
  isSessionRunning: (sessionKey: string | undefined) => boolean;
  /** After switch/open: composer `running` follows the newly focused session only. */
  syncForegroundRunning: () => void;
  setReviewOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  setEnvPanelOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  setSidebarOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setSidebarWidthPx: (px: number) => void;
  setSidebarTranslucent: (value: boolean) => void;
  setLocale: (locale: Locale) => void;
  setSettingsSection: (section: SettingsSection) => void;
  setLastFailure: (failure: string | undefined) => void;
  /** Remember a model error for a runtime until settle / successful recovery. */
  setPendingFailure: (runtimeId: string, message: string | undefined) => void;
  takePendingFailure: (runtimeId: string) => string | undefined;
  showAppError: (message: string) => void;
  clearAppError: () => void;
  setView: (view: ShellView) => void;
  setPackages: (packages: PackageSummary[]) => void;
  setResources: (resources: ResourceSummary[]) => void;
  setEcoLoading: (loading: boolean) => void;
  setThemePreference: (preference: ThemePreference) => void;
  setThemeSelection: (selection: ThemeSelection) => void;
  setThemeLibrary: (library: ThemeLibrarySnapshot) => void;
  setThemePreview: (preview: ThemePreview | undefined) => void;
  /** @deprecated use setThemePreference */
  setColorMode: (mode: ThemePreference) => void;
  /** Cycles system → light → dark. */
  toggleColorMode: () => void;
  /** Re-read OS preference when themePreference is system. */
  syncSystemTheme: () => void;
  setPaletteOpen: (open: boolean) => void;
  setRuntimeId: (id: string | undefined) => void;
  setLastSequence: (sequence: number) => void;
  acceptSnapshot: (snapshot: HostSnapshot) => void;
  applySessionOpen: (input: {
    snapshot: HostSnapshot;
    threads: SessionThreadSummary[];
    history: SessionHistoryMessage[];
  }) => void;
  resetAfterStop: () => void;
  resetAfterCrash: (message: string) => void;
}

type RuntimeHostEvent = Extract<HostEvent, { type: "runtime.event" }>;

export type RuntimeEventDelivery = "accept" | "duplicate" | "gap" | "stale-runtime";

/**
 * Normalize session file / id for running-session maps and sidebar markers.
 *
 * Collapses macOS `/private/var` → `/var` the same way as terminal PTY keys so
 * host snapshots, sidebar rows, and TUI realpaths all hit the same marker entry.
 */
export function sessionRunKey(raw: string | undefined | null): string {
  if (!raw) return "";
  let p = raw.replace(/\\/g, "/").replace(/\/+$/, "").trim().toLowerCase();
  if (!p) return "";
  // Apple firmlink: /var is a symlink to /private/var.
  if (p.startsWith("/private/")) p = p.slice("/private".length);
  return p;
}

export function sessionKeyFromSnapshot(
  snapshot: Pick<HostSnapshot, "sessionFile" | "sessionId"> | undefined,
): string {
  if (!snapshot) return "";
  return sessionRunKey(snapshot.sessionFile?.trim() || snapshot.sessionId?.trim() || "");
}

/**
 * Command snapshots can overtake streamed events across Electron IPC channels.
 * Events covered by that snapshot are still valid unless they were already recorded.
 */
export function classifyRuntimeEventDelivery(
  state: Pick<ShellState, "runtimeId" | "lastSequence" | "events">,
  event: RuntimeHostEvent,
): RuntimeEventDelivery {
  if (event.runtimeId !== state.runtimeId) return "stale-runtime";
  const duplicate = state.events.some(
    (item) =>
      item.type === "runtime.event" &&
      item.runtimeId === event.runtimeId &&
      item.sequence === event.sequence,
  );
  if (duplicate) return "duplicate";
  if (event.sequence > state.lastSequence + 1) return "gap";
  return "accept";
}

function loadPref<T>(key: string, parse: (raw: string) => T | undefined, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const value = parse(raw);
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

function savePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota / private mode
  }
}

function loadLocale(): Locale {
  return loadPref("zeno.locale", (raw) => (isLocale(raw) ? raw : undefined), DEFAULT_LOCALE);
}

function loadThemePreference(): ThemePreference {
  return loadPref("zeno.colorMode", (raw) => (isThemePreference(raw) ? raw : undefined), "system");
}

function themeState(preference: ThemePreference): {
  themePreference: ThemePreference;
  resolvedColorMode: ResolvedColorMode;
  colorMode: ResolvedColorMode;
} {
  const resolvedColorMode = resolveColorMode(preference, systemPrefersDark());
  return {
    themePreference: preference,
    resolvedColorMode,
    colorMode: resolvedColorMode,
  };
}

function loadSidebarCollapsed(): boolean {
  return loadPref(
    "zeno.sidebarCollapsed",
    (raw) => (raw === "1" ? true : raw === "0" ? false : undefined),
    false,
  );
}

function loadSidebarWidth(): number {
  return loadPref(
    "zeno.sidebarWidth",
    (raw) => {
      const n = Number(raw);
      return Number.isFinite(n) ? clampSidebarWidth(n) : undefined;
    },
    SHELL_SIDEBAR.defaultPx,
  );
}

function loadSidebarTranslucent(): boolean {
  return loadPref(
    "zeno.sidebarTranslucent",
    (raw) => (raw === "0" ? false : raw === "1" ? true : undefined),
    SIDEBAR_DEFAULT_TRANSLUCENT,
  );
}

export const useShellStore = create<ShellState>((set, get) => ({
  status: "Agent Host is stopped",
  snapshot: undefined,
  events: [],
  liveStream: emptyLiveStream(),
  history: [],
  threads: [],
  prompt: "",
  sentPrompts: [],
  queuedMessages: { steering: [], followUp: [] },
  running: false,
  sessionMarkers: {},
  runningSessions: {},
  runningRuntimeIds: {},
  lastSessionByRuntime: {},
  reviewOpen: false,
  envPanelOpen: false,
  sidebarOpen: false,
  sidebarCollapsed: loadSidebarCollapsed(),
  sidebarWidthPx: loadSidebarWidth(),
  sidebarTranslucent: loadSidebarTranslucent(),
  locale: loadLocale(),
  settingsSection: "general",
  lastFailure: undefined,
  pendingFailureByRuntime: {},
  appError: undefined,
  view: "thread",
  packages: [],
  resources: [],
  ecoLoading: false,
  ...themeState(loadThemePreference()),
  themeSelection: loadThemeSelection(),
  themeLibrary: EMPTY_THEME_LIBRARY,
  themePreview: undefined,
  paletteOpen: false,
  runtimeId: undefined,
  lastSequence: 0,
  contentMode: loadContentMode(),

  setStatus: (status) => set({ status }),
  setContentMode: (mode, options) => {
    const persist = options?.persist !== false;
    if (persist) {
      const sessionFile = options?.sessionFile ?? get().snapshot?.sessionFile;
      if (sessionFile?.trim()) {
        saveContentModeForSession(sessionFile, mode);
      } else {
        saveContentMode(mode);
      }
    }
    // Terminal never shows env chrome — drop the panel when leaving chat view.
    set({ contentMode: mode, ...(mode === "terminal" ? { envPanelOpen: false } : {}) });
  },
  toggleContentMode: () => {
    const next = flipContentMode(get().contentMode);
    const sessionFile = get().snapshot?.sessionFile;
    if (sessionFile?.trim()) {
      saveContentModeForSession(sessionFile, next);
    } else {
      saveContentMode(next);
    }
    set({ contentMode: next, ...(next === "terminal" ? { envPanelOpen: false } : {}) });
  },
  setSnapshot: (snapshot) => set({ snapshot }),
  setEvents: (events) =>
    set((state) => ({
      events: typeof events === "function" ? events(state.events) : events,
    })),
  applyLiveStreamEvent: (event, prompts, options) =>
    set((state) => ({
      liveStream: applyRuntimeEventToLiveStream(state.liveStream, event, prompts, options),
    })),
  retractOptimisticUserMessage: (displayText) =>
    set((state) => ({
      liveStream: retractOptimisticUserMessage(state.liveStream, displayText),
    })),
  clearLiveStream: () => set({ liveStream: resetLiveStream() }),
  setHistory: (history) => set({ history }),
  setThreads: (threads) => set({ threads }),
  setPrompt: (prompt) => set({ prompt }),
  setSentPrompts: (prompts) =>
    set((state) => ({
      sentPrompts: typeof prompts === "function" ? prompts(state.sentPrompts) : prompts,
    })),
  setQueuedMessages: (queuedMessages) => set({ queuedMessages }),
  setRunning: (running) => set({ running }),
  setSessionMarker: (sessionKey, markerState, options) => {
    const key = sessionRunKey(sessionKey);
    // Never toggle global `running` without a session identity — that stuck the
    // composer/sidebar after switches when sessionFile was briefly empty.
    if (!key) return;
    // Path/id aliases share the same marker object. Transition every linked key
    // together so a mirrored id cannot remain "running" after the path settles.
    const currentMarker = get().sessionMarkers[key];
    const linkedKeys = currentMarker
      ? Object.entries(get().sessionMarkers)
          .filter(([candidate, marker]) => candidate === key || marker === currentMarker)
          .map(([candidate]) => candidate)
      : [key];
    for (const linkedKey of linkedKeys) clearMarkerTimer(linkedKey);
    set((state) => {
      const sessionMarkers = { ...state.sessionMarkers };
      const runningSessions = { ...state.runningSessions };
      const runningRuntimeIds = { ...state.runningRuntimeIds };
      const lastSessionByRuntime = { ...state.lastSessionByRuntime };
      if (markerState === "idle") {
        for (const linkedKey of linkedKeys) {
          delete sessionMarkers[linkedKey];
          delete runningSessions[linkedKey];
        }
      } else {
        const marker: SessionMarker = { state: markerState };
        if (options?.reason?.trim()) marker.reason = options.reason.trim();
        for (const linkedKey of linkedKeys) {
          sessionMarkers[linkedKey] = marker;
          if (isBusyRunState(markerState)) runningSessions[linkedKey] = true;
          else delete runningSessions[linkedKey];
        }
      }
      if (options?.runtimeId) {
        const rid = options.runtimeId;
        if (markerState === "idle") {
          if (linkedKeys.includes(runningRuntimeIds[rid] ?? "")) delete runningRuntimeIds[rid];
          // Drop durable map so a recycled runtime cannot re-target this row.
          delete lastSessionByRuntime[rid];
        } else if (isBusyRunState(markerState)) {
          // Only bind runtime→session while busy. Drop on settle so late events
          // cannot re-light a finished row.
          runningRuntimeIds[rid] = key;
          lastSessionByRuntime[rid] = key;
          // A new busy turn owns this session — drop other runtimes' durable maps
          // that still point at this path/id alias group.
          for (const [otherRid, sessionKeyForRid] of Object.entries(lastSessionByRuntime)) {
            if (otherRid !== rid && linkedKeys.includes(sessionKeyForRid)) {
              delete lastSessionByRuntime[otherRid];
            }
          }
        } else {
          // completed / failed / aborted / crashed — release busy + durable map.
          // Clearing lastSessionByRuntime here is required: abort() sets aborted via
          // setSessionMarker (not settleSessionByRuntime), and a late settle from the
          // old runtime would otherwise re-apply failed/aborted after recovery.
          if (linkedKeys.includes(runningRuntimeIds[rid] ?? "")) delete runningRuntimeIds[rid];
          delete lastSessionByRuntime[rid];
        }
      }
      // Composer stop tracks the *foreground* session only.
      const fgKey = sessionKeyFromSnapshot(state.snapshot);
      return {
        sessionMarkers,
        runningSessions,
        runningRuntimeIds,
        lastSessionByRuntime,
        running: fgKey ? Boolean(runningSessions[fgKey]) : false,
      };
    });
    // Flash then clear — completed is short; failed/aborted/crashed a bit longer.
    if (markerState === "completed") {
      scheduleMarkerClear(key, COMPLETED_MARKER_MS, () => {
        const current = get().sessionMarkers[key];
        if (current?.state !== "completed") return;
        get().setSessionMarker(key, "idle");
      });
    } else if (markerState === "failed" || markerState === "aborted" || markerState === "crashed") {
      scheduleMarkerClear(key, STICKY_TERMINAL_MARKER_MS, () => {
        const current = get().sessionMarkers[key];
        if (current?.state !== markerState) return;
        get().setSessionMarker(key, "idle");
      });
    }
  },
  setSessionRunning: (sessionKey, runningFlag, runtimeId) => {
    if (runningFlag) {
      get().setSessionMarker(sessionKey, "running", runtimeId ? { runtimeId } : undefined);
      // Mirror under the alternate session identity so sidebar rows keyed by
      // path vs id both resolve (common after terminal ↔ chat session.switch).
      const snap = get().snapshot;
      const fileKey = sessionRunKey(snap?.sessionFile);
      const idKey = sessionRunKey(snap?.sessionId);
      const primary = sessionRunKey(sessionKey);
      if (fileKey && idKey && fileKey !== idKey && (primary === fileKey || primary === idKey)) {
        const other = primary === fileKey ? idKey : fileKey;
        const marker = get().sessionMarkers[primary];
        if (marker) {
          set((state) => ({
            sessionMarkers: { ...state.sessionMarkers, [other]: marker },
            runningSessions: { ...state.runningSessions, [other]: true as const },
          }));
        }
      }
      return;
    }
    // End of prompt IPC: keep terminal outcomes (failed/aborted/completed from events).
    const key = sessionRunKey(sessionKey);
    if (!key) return;
    const existing = get().sessionMarkers[key];
    if (existing && !isBusyRunState(existing.state)) {
      set((state) => {
        const fgKey = sessionKeyFromSnapshot(state.snapshot);
        const runningSessions = { ...state.runningSessions };
        delete runningSessions[key];
        return {
          runningSessions,
          running: fgKey ? Boolean(runningSessions[fgKey]) : false,
        };
      });
      return;
    }
    // Still busy in the map when prompt IPC returns: do NOT wipe to idle.
    // Race with agent.settled used to clear the spinner before completed/failed
    // landed (worse on terminal hops where event ordering is less predictable).
    // Soft-complete so the rail keeps a glyph; settle may overwrite with the
    // authoritative outcome (or the completed timer fades this away).
    if (existing && isBusyRunState(existing.state)) {
      get().setSessionMarker(sessionKey, "completed", runtimeId ? { runtimeId } : undefined);
      return;
    }
    get().setSessionMarker(sessionKey, "idle", runtimeId ? { runtimeId } : undefined);
  },
  sessionKeyForRuntime: (runtimeId) => {
    if (!runtimeId) return undefined;
    const state = get();
    return state.runningRuntimeIds[runtimeId] ?? state.lastSessionByRuntime[runtimeId];
  },
  settleSessionByRuntime: (runtimeId, markerState, reason) => {
    const key = get().sessionKeyForRuntime(runtimeId);
    if (!key) return;
    const state = get();
    // Ignore late settles from an old runtime once a newer turn owns this session.
    const ownerRid = Object.entries(state.runningRuntimeIds).find(([, k]) => k === key)?.[0];
    if (ownerRid && ownerRid !== runtimeId && isBusyRunState(state.sessionMarkers[key]?.state)) {
      set((s) => {
        if (!s.lastSessionByRuntime[runtimeId]) return s;
        const lastSessionByRuntime = { ...s.lastSessionByRuntime };
        delete lastSessionByRuntime[runtimeId];
        return { lastSessionByRuntime };
      });
      return;
    }
    get().setSessionMarker(key, markerState, { runtimeId, ...(reason ? { reason } : {}) });
    // Drop durable mapping after settle so a recycled runtime id cannot target the old row.
    set((s) => {
      if (!s.lastSessionByRuntime[runtimeId]) return s;
      const lastSessionByRuntime = { ...s.lastSessionByRuntime };
      delete lastSessionByRuntime[runtimeId];
      return { lastSessionByRuntime };
    });
  },
  clearSessionRunningByRuntime: (runtimeId) => {
    const key = get().sessionKeyForRuntime(runtimeId);
    if (!key) return;
    get().setSessionMarker(key, "idle", { runtimeId });
    set((state) => {
      if (!state.lastSessionByRuntime[runtimeId]) return state;
      const lastSessionByRuntime = { ...state.lastSessionByRuntime };
      delete lastSessionByRuntime[runtimeId];
      return { lastSessionByRuntime };
    });
  },
  isSessionRunning: (sessionKey) => {
    const key = sessionRunKey(sessionKey);
    return Boolean(key && get().runningSessions[key]);
  },
  syncForegroundRunning: () => {
    const state = get();
    const fgKey = sessionKeyFromSnapshot(state.snapshot);
    set({ running: fgKey ? Boolean(state.runningSessions[fgKey]) : false });
  },
  setReviewOpen: (open) =>
    set((state) => ({
      reviewOpen: typeof open === "function" ? open(state.reviewOpen) : open,
    })),
  setEnvPanelOpen: (open) =>
    set((state) => ({
      envPanelOpen: typeof open === "function" ? open(state.envPanelOpen) : open,
    })),
  setSidebarOpen: (open) =>
    set((state) => ({
      sidebarOpen: typeof open === "function" ? open(state.sidebarOpen) : open,
    })),
  setSidebarCollapsed: (sidebarCollapsed) => {
    savePref("zeno.sidebarCollapsed", sidebarCollapsed ? "1" : "0");
    set({ sidebarCollapsed });
  },
  toggleSidebarCollapsed: () => {
    const next = !get().sidebarCollapsed;
    get().setSidebarCollapsed(next);
  },
  setSidebarWidthPx: (px) => {
    const sidebarWidthPx = clampSidebarWidth(px);
    savePref("zeno.sidebarWidth", String(sidebarWidthPx));
    set({ sidebarWidthPx });
  },
  setSidebarTranslucent: (sidebarTranslucent) => {
    savePref("zeno.sidebarTranslucent", sidebarTranslucent ? "1" : "0");
    set({ sidebarTranslucent });
  },
  setLocale: (locale) => {
    savePref("zeno.locale", locale);
    set({ locale });
  },
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  setLastFailure: (lastFailure) => set({ lastFailure }),
  setPendingFailure: (runtimeId, message) => {
    if (!runtimeId) return;
    set((state) => {
      const pendingFailureByRuntime = { ...state.pendingFailureByRuntime };
      if (message === undefined || message === "") {
        delete pendingFailureByRuntime[runtimeId];
      } else {
        pendingFailureByRuntime[runtimeId] = message;
      }
      return { pendingFailureByRuntime };
    });
  },
  takePendingFailure: (runtimeId) => {
    if (!runtimeId) return undefined;
    const message = get().pendingFailureByRuntime[runtimeId];
    if (message === undefined) return undefined;
    set((state) => {
      if (!(runtimeId in state.pendingFailureByRuntime)) return state;
      const pendingFailureByRuntime = { ...state.pendingFailureByRuntime };
      delete pendingFailureByRuntime[runtimeId];
      return { pendingFailureByRuntime };
    });
    return message;
  },
  showAppError: (appError) => set({ appError }),
  clearAppError: () => set({ appError: undefined }),
  setView: (view) => set({ view }),
  setPackages: (packages) => set({ packages }),
  setResources: (resources) => set({ resources }),
  setEcoLoading: (ecoLoading) => set({ ecoLoading }),
  setThemePreference: (preference) => {
    savePref("zeno.colorMode", preference);
    set(themeState(preference));
  },
  setThemeSelection: (selection) => {
    set({ themeSelection: saveThemeSelection(selection) });
  },
  setThemeLibrary: (themeLibrary) => set({ themeLibrary }),
  setThemePreview: (themePreview) => set({ themePreview }),
  setColorMode: (preference) => {
    get().setThemePreference(preference);
  },
  toggleColorMode: () => {
    const next = nextThemePreference(get().themePreference);
    get().setThemePreference(next);
  },
  syncSystemTheme: () => {
    const preference = get().themePreference;
    if (preference !== "system") return;
    set(themeState("system"));
  },
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setRuntimeId: (runtimeId) => set({ runtimeId }),
  setLastSequence: (lastSequence) => set({ lastSequence }),
  acceptSnapshot: (snapshot) =>
    set((state) => {
      const key = sessionKeyFromSnapshot(snapshot);
      return {
        snapshot,
        queuedMessages: snapshot.queuedMessages,
        runtimeId: snapshot.runtimeId,
        lastSequence: snapshot.sequence,
        // Never invent busy from a snapshot — only runningSessions (sendPrompt) can.
        running: key ? Boolean(state.runningSessions[key]) : false,
      };
    }),
  applySessionOpen: (input) =>
    set((state) => {
      const key = sessionKeyFromSnapshot(input.snapshot);
      const idKey = sessionRunKey(input.snapshot.sessionId);
      // Integrity for busy glyphs during session/terminal hops:
      // - Keep busy markers that still have runningSessions OR a runtime binding
      //   (runningRuntimeIds / lastSessionByRuntime). Terminal ↔ chat switches
      //   call applySessionOpen often; dropping busy glyphs without a binding
      //   caused "spinner missing" on the rail.
      // - Drop true orphans (busy glyph, no busy map, no runtime map).
      const runtimeBoundKeys = new Set<string>();
      for (const sessionKey of Object.values(state.runningRuntimeIds)) {
        if (sessionKey) runtimeBoundKeys.add(sessionKey);
      }
      for (const sessionKey of Object.values(state.lastSessionByRuntime)) {
        if (sessionKey) runtimeBoundKeys.add(sessionKey);
      }
      const sessionMarkers: Record<string, SessionMarker> = {};
      const runningSessions: Record<string, true> = {};
      for (const [k, marker] of Object.entries(state.sessionMarkers)) {
        if (isBusyRunState(marker.state) && !state.runningSessions[k] && !runtimeBoundKeys.has(k)) {
          continue; // true orphan busy — discard
        }
        sessionMarkers[k] = marker;
        if (isBusyRunState(marker.state)) runningSessions[k] = true;
      }
      // Re-sync runningSessions from surviving busy markers + prior map.
      for (const k of Object.keys(state.runningSessions)) {
        if (sessionMarkers[k] && isBusyRunState(sessionMarkers[k]?.state)) {
          runningSessions[k] = true;
        }
      }
      // Mirror path ↔ id so ProjectList rows keyed either way keep the glyph.
      if (key && idKey && key !== idKey) {
        if (sessionMarkers[key] && !sessionMarkers[idKey]) {
          sessionMarkers[idKey] = sessionMarkers[key]!;
          if (isBusyRunState(sessionMarkers[key]?.state)) runningSessions[idKey] = true;
        } else if (sessionMarkers[idKey] && !sessionMarkers[key]) {
          sessionMarkers[key] = sessionMarkers[idKey]!;
          if (isBusyRunState(sessionMarkers[idKey]?.state)) runningSessions[key] = true;
        }
      }
      const busyHere = Boolean((key && runningSessions[key]) || (idKey && runningSessions[idKey]));
      return {
        snapshot: input.snapshot,
        runtimeId: input.snapshot.runtimeId,
        lastSequence: input.snapshot.sequence,
        threads:
          input.threads.length > 0
            ? input.threads
            : state.threads.map((t) => ({
                ...t,
                active: t.path === input.snapshot.sessionFile || t.id === input.snapshot.sessionId,
              })),
        history: input.history,
        events: [],
        liveStream: emptyLiveStream(),
        sentPrompts: [],
        queuedMessages: input.snapshot.queuedMessages,
        lastFailure: undefined,
        // Drop pending failures for the runtime we are leaving; keep others (parked).
        pendingFailureByRuntime: state.runtimeId
          ? Object.fromEntries(
              Object.entries(state.pendingFailureByRuntime).filter(
                ([rid]) => rid !== state.runtimeId,
              ),
            )
          : state.pendingFailureByRuntime,
        sessionMarkers,
        runningSessions,
        // Foreground only — never inherit previous session's busy flag.
        running: busyHere,
        view: "thread" as const,
      };
    }),
  resetAfterStop: () => {
    for (const key of markerClearTimers.keys()) clearMarkerTimer(key);
    set({
      snapshot: undefined,
      threads: [],
      history: [],
      events: [],
      liveStream: emptyLiveStream(),
      queuedMessages: { steering: [], followUp: [] },
      running: false,
      sessionMarkers: {},
      runningSessions: {},
      runningRuntimeIds: {},
      lastSessionByRuntime: {},
      pendingFailureByRuntime: {},
      lastFailure: undefined,
      runtimeId: undefined,
      lastSequence: 0,
      status: "Agent Host stopped",
    });
  },
  resetAfterCrash: (message) =>
    set((state) => {
      // Only clear foreground; background parked hosts may still be fine.
      const fgKey = sessionKeyFromSnapshot(state.snapshot);
      const runningSessions = { ...state.runningSessions };
      const runningRuntimeIds = { ...state.runningRuntimeIds };
      const lastSessionByRuntime = { ...state.lastSessionByRuntime };
      const sessionMarkers = { ...state.sessionMarkers };
      if (fgKey) {
        clearMarkerTimer(fgKey);
        delete runningSessions[fgKey];
        sessionMarkers[fgKey] = { state: "crashed", reason: message };
      }
      if (state.runtimeId) {
        delete runningRuntimeIds[state.runtimeId];
        delete lastSessionByRuntime[state.runtimeId];
      }
      return {
        runtimeId: undefined,
        lastSequence: 0,
        running: false,
        sessionMarkers,
        runningSessions,
        runningRuntimeIds,
        lastSessionByRuntime,
        queuedMessages: { steering: [], followUp: [] },
        snapshot: undefined,
        liveStream: emptyLiveStream(),
        status: message,
      };
    }),
}));
