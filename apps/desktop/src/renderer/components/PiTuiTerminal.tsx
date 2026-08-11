/**
 * Embedded pi TUI — ghostty-web + main-process node-pty (`pi --session`).
 *
 * - Parent gates mounting during session transitions; this component owns readiness.
 * - Canvas stays visibility:hidden until ready.
 * - open() resumes/promotes warm PTYs when possible (do not dispose before open).
 * - Hidden IME textarea is pinned to the VT cursor so composition tracks the prompt.
 * - Content uses equal L/R host padding; Ghostty's built-in canvas scrollbar is
 *   suppressed. A floating thumb (zero layout width) sticks to the app right edge
 *   so the gutter never skews terminal margins (same model as chat overlay scroll).
 */
import { useEffect, useRef, useState } from "react";
import {
  applyTerminalLineHeight,
  loadTerminalPrefs,
  resolveTerminalTheme,
  terminalOptionsFromPrefs,
  TERMINAL_PREFS_CHANGED_EVENT,
  type TerminalPrefs,
} from "../lib/terminal-prefs.ts";
import { cn } from "../lib/utils.ts";

type GhosttyModule = typeof import("ghostty-web");
type GhosttyTerminal = InstanceType<GhosttyModule["Terminal"]>;
type GhosttyFitAddon = InstanceType<GhosttyModule["FitAddon"]>;

/** Equal content inset; scrollbar is a floating overlay and does not consume this. */
const TERMINAL_CONTENT_INSET_PX = 8;
const TERMINAL_THUMB_HITBOX_PX = 12;
const TERMINAL_THUMB_MIN_PX = 28;
const TERMINAL_THUMB_HIDE_MS = 900;

// Keep the expensive module/WASM initialization shared across terminal mounts.
// This also lets the app warm Ghostty while the host/session is restoring.
let ghosttyReadyPromise: Promise<GhosttyModule> | null = null;

function loadGhostty(): Promise<GhosttyModule> {
  ghosttyReadyPromise ??= import("ghostty-web")
    .then(async (module) => {
      await module.init();
      return module;
    })
    .catch((error) => {
      // Allow a later terminal attempt to retry after a transient load failure.
      ghosttyReadyPromise = null;
      throw error;
    });
  return ghosttyReadyPromise;
}

/** Start Ghostty's WASM load before a terminal surface needs to be painted. */
export function preloadPiTuiTerminal(): void {
  void loadGhostty().catch(() => undefined);
}

type GhosttyMetrics = { width: number; height: number };

/**
 * ghostty-web FitAddon hard-codes a ~15px scrollbar gutter (gA) when computing
 * cols, which steals width from one side only. We fit against the full content
 * box (padding already encodes equal L/R margins); the floating overlay thumb
 * takes zero layout width — matching chat MessageScroller.
 */
function installFitWithoutScrollbarGutter(
  fit: GhosttyFitAddon,
  getTerminal: () => GhosttyTerminal | null,
): void {
  fit.proposeDimensions = () => {
    const terminal = getTerminal();
    const element = terminal?.element;
    if (!terminal || !element) return undefined;
    const renderer = (terminal as unknown as { renderer?: { getMetrics?: () => GhosttyMetrics } })
      .renderer;
    const metrics = renderer?.getMetrics?.();
    if (!metrics || metrics.width <= 0 || metrics.height <= 0) return undefined;
    if (typeof element.clientWidth === "undefined") return undefined;
    const style = window.getComputedStyle(element);
    const padT = Number.parseInt(style.paddingTop, 10) || 0;
    const padB = Number.parseInt(style.paddingBottom, 10) || 0;
    const padL = Number.parseInt(style.paddingLeft, 10) || 0;
    const padR = Number.parseInt(style.paddingRight, 10) || 0;
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (width <= 0 || height <= 0) return undefined;
    const cols = Math.max(2, Math.floor((width - padL - padR) / metrics.width));
    const rows = Math.max(1, Math.floor((height - padT - padB) / metrics.height));
    return { cols, rows };
  };
}

/** Stop Ghostty from painting its in-canvas scrollbar (we use a floating thumb). */
function suppressGhosttyCanvasScrollbar(term: GhosttyTerminal): void {
  const renderer = (
    term as unknown as {
      renderer?: { renderScrollbar?: (...args: unknown[]) => void };
    }
  ).renderer;
  if (renderer) {
    renderer.renderScrollbar = () => {
      /* no-op — floating overlay owns the chrome */
    };
  }
  const t = term as unknown as {
    showScrollbar?: () => void;
    hideScrollbar?: () => void;
    fadeInScrollbar?: () => void;
    fadeOutScrollbar?: () => void;
    scrollbarOpacity?: number;
    scrollbarVisible?: boolean;
  };
  t.showScrollbar = () => {
    t.scrollbarOpacity = 0;
    t.scrollbarVisible = false;
  };
  t.hideScrollbar = () => {
    t.scrollbarOpacity = 0;
    t.scrollbarVisible = false;
  };
  t.fadeInScrollbar = () => {
    t.scrollbarOpacity = 0;
  };
  t.fadeOutScrollbar = () => {
    t.scrollbarOpacity = 0;
    t.scrollbarVisible = false;
  };
  t.scrollbarOpacity = 0;
  t.scrollbarVisible = false;
}

/** Right edge for the floating thumb — flush with shell-main when the TUI fills it. */
function terminalThumbRightEdge(shell: HTMLElement, shellRect: DOMRect): number {
  const main = document.querySelector<HTMLElement>('[data-testid="shell-main"]');
  if (main?.isConnected) {
    const mainRect = main.getBoundingClientRect();
    if (mainRect.width > 0 && Math.abs(shellRect.right - mainRect.right) <= 2) {
      return mainRect.right;
    }
  }
  return shellRect.right;
}

/**
 * Position the floating terminal scrollbar thumb.
 * Ghostty: viewportY=0 is the bottom (live output); viewportY=scrollback is the top.
 */
function updateTerminalOverlayThumb(input: {
  shell: HTMLElement;
  thumb: HTMLDivElement;
  term: GhosttyTerminal;
  visible: boolean;
}): void {
  const { shell, thumb, term, visible } = input;
  if (!shell.isConnected) {
    thumb.dataset.visible = "false";
    return;
  }
  let scrollback = 0;
  try {
    scrollback = term.getScrollbackLength();
  } catch {
    thumb.dataset.visible = "false";
    return;
  }
  const rows = Math.max(1, term.rows || 1);
  if (scrollback < 1) {
    thumb.dataset.visible = "false";
    return;
  }
  const rect = shell.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    thumb.dataset.visible = "false";
    return;
  }
  const track = Math.max(0, rect.height);
  const total = scrollback + rows;
  const thumbH = Math.max(TERMINAL_THUMB_MIN_PX, Math.min(track, (rows / total) * track));
  const maxTop = Math.max(0, track - thumbH);
  const viewportY = Math.max(0, Math.min(scrollback, term.viewportY || 0));
  // viewportY=0 → bottom; viewportY=scrollback → top
  const visualTop = maxTop * (1 - viewportY / scrollback);
  const right = terminalThumbRightEdge(shell, rect);
  thumb.style.height = `${thumbH}px`;
  thumb.style.top = `${rect.top + visualTop}px`;
  thumb.style.left = `${right - TERMINAL_THUMB_HITBOX_PX}px`;
  const pinned = thumb.dataset.hovered === "true" || thumb.dataset.dragging === "true";
  thumb.dataset.visible = visible || pinned ? "true" : "false";
}

/**
 * Pi paints its editor caret with reverse-video SGR while also positioning a
 * hardware cursor for IME support. The hardware cursor is the only visible
 * caret in the embedded surface, so remove the duplicate styling but keep the
 * text and all cursor movement sequences intact.
 */
function stripPiEditorCursorStyle(data: string): string {
  return data.replaceAll("\x1b[7m", "").replaceAll("\x1b[27m", "");
}

/** Match main-process normalizeSessionKey (incl. macOS /private/var collapse). */
function normSession(path: string): string {
  let p = path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  if (p.startsWith("/private/")) p = p.slice("/private".length);
  return p;
}

/**
 * pi draws the prompt separator with a full-width box-drawing row before its
 * input state settles. Ghostty can leave its cursor on that row's final cell;
 * move only the local VT cursor to the next row's head so the first caret is
 * presented at the prompt without sending a synthetic key to pi.
 */
function normalizeInitialPromptCursor(term: GhosttyTerminal): void {
  const active = term.buffer.active;
  const cursorX = active.cursorX;
  const cursorY = active.cursorY;
  if (cursorX !== term.cols - 1 || cursorY >= term.rows - 1) return;
  const line = active.getLine(cursorY)?.translateToString(true).trim() ?? "";
  if (line.length < Math.max(8, Math.floor(term.cols * 0.5))) return;
  if (!Array.from(line).every((char) => /[\u2500-\u257f\u2014=-]/u.test(char))) return;
  term.write("\x1b[B\r");
}

/**
 * ghostty-web parks its IME helper at (0,0). Without tracking, Chinese/Japanese
 * composition and the system caret sit at the top of the surface instead of the
 * pi prompt. Pin the textarea over the active VT cell (xterm-style).
 */
function syncTerminalInputCaret(term: GhosttyTerminal): void {
  const textarea = term.textarea;
  const host = term.element;
  if (!textarea || !host) return;
  try {
    // SelectionManager temporarily moves the textarea for the native context menu.
    if (textarea.style.pointerEvents === "auto") return;

    const renderer = (term as unknown as { renderer?: { getMetrics?: () => GhosttyMetrics } })
      .renderer;
    const metrics = renderer?.getMetrics?.();
    if (!metrics || metrics.width <= 0 || metrics.height <= 0) return;

    const cursorX = term.buffer.active.cursorX;
    const cursorY = term.buffer.active.cursorY;
    const w = 1;
    const h = Math.max(2, Math.round(metrics.height));
    const cellKey = `${cursorX}:${cursorY}:${metrics.width}:${metrics.height}`;
    const cachedLeft = Number(textarea.dataset.caretX);
    const cachedTop = Number(textarea.dataset.caretY);
    const hasCachedPosition =
      textarea.dataset.caretCell === cellKey &&
      Number.isFinite(cachedLeft) &&
      Number.isFinite(cachedTop);
    // Canvas sits inside equal host padding (and may be auto-centered for residual
    // cell width). Anchor IME to the canvas origin.
    let originLeft = 0;
    let originTop = 0;
    if (!hasCachedPosition) {
      const canvas = host.querySelector("canvas");
      if (canvas instanceof HTMLCanvasElement) {
        originLeft = canvas.offsetLeft;
        originTop = canvas.offsetTop;
      } else {
        const style = window.getComputedStyle(host);
        originLeft = Number.parseFloat(style.paddingLeft) || 0;
        originTop = Number.parseFloat(style.paddingTop) || 0;
      }
    }
    const left = hasCachedPosition ? cachedLeft : Math.round(originLeft + cursorX * metrics.width);
    const top = hasCachedPosition ? cachedTop : Math.round(originTop + cursorY * metrics.height);
    const cssLeft = `${left}px`;
    const cssTop = `${top}px`;
    const cssWidth = `${w}px`;
    const cssHeight = `${h}px`;
    // Ghostty can temporarily rewrite these styles, so the cache alone is not authoritative.
    if (
      textarea.dataset.caretCell === cellKey &&
      textarea.dataset.caretX === String(left) &&
      textarea.dataset.caretY === String(top) &&
      textarea.dataset.caretW === String(w) &&
      textarea.dataset.caretH === String(h) &&
      textarea.style.position === "absolute" &&
      textarea.style.left === cssLeft &&
      textarea.style.top === cssTop &&
      textarea.style.width === cssWidth &&
      textarea.style.height === cssHeight
    ) {
      return;
    }
    textarea.dataset.caretX = String(left);
    textarea.dataset.caretY = String(top);
    textarea.dataset.caretW = String(w);
    textarea.dataset.caretH = String(h);
    textarea.dataset.caretCell = cellKey;

    textarea.style.position = "absolute";
    textarea.style.left = cssLeft;
    textarea.style.top = cssTop;
    textarea.style.width = cssWidth;
    textarea.style.height = cssHeight;
    textarea.style.margin = "0";
    textarea.style.padding = "0";
    textarea.style.border = "none";
    textarea.style.outline = "none";
    textarea.style.resize = "none";
    textarea.style.overflow = "hidden";
    textarea.style.whiteSpace = "nowrap";
    textarea.style.opacity = "0";
    // The canvas owns the visible cursor. Keep the native textarea caret
    // invisible while retaining its geometry as the IME anchor.
    textarea.style.caretColor = "transparent";
    textarea.style.color = "transparent";
    // clipPath:inset(50%) zeros the caret box and parks IME at the host origin.
    textarea.style.clipPath = "none";
    textarea.style.zIndex = "1";
    // Clicks must hit the canvas for selection; keyboard stays on the focused caret.
    textarea.style.pointerEvents = "none";
  } catch {
    // ignore — caret tracking is best-effort
  }
}

function focusTerminalInput(term: GhosttyTerminal): void {
  syncTerminalInputCaret(term);
  try {
    const textarea = term.textarea;
    if (textarea) {
      // Composition text belongs to the PTY, not this helper textarea. Start
      // each focus with its native selection at the anchor edge.
      textarea.setSelectionRange(0, 0);
      textarea.scrollLeft = 0;
      textarea.focus({ preventScroll: true });
      return;
    }
  } catch {
    // fall through
  }
  try {
    term.focus();
  } catch {
    // ignore
  }
}

/** Quiet window after the last output frame; TUI startup often paints in bursts. */
const READY_SETTLE_MS = 160;
/** A resumed process still needs to redraw after its resize before it is revealed. */
const READY_SETTLE_RESUMED_MS = 100;
/** Fallback for a quiet/empty session; output-driven readiness remains preferred. */
const READY_MAX_MS = 2_400;
/** Promote/resume must not wait long — canvas is empty until pi repaints. */
const READY_MAX_RESUMED_MS = 600;

/** Nudge PTY size so parked pi TUI full-repaints into a fresh Ghostty canvas. */
function forcePtyRepaint(cols: number, rows: number, requestRedraw = false): void {
  const c = Math.max(20, Math.floor(cols));
  const r = Math.max(5, Math.floor(rows));
  const altC = c > 20 ? c - 1 : c + 1;
  const altR = r > 5 ? r - 1 : r + 1;
  void window.zeno.terminal.resize(altC, altR).catch(() => undefined);
  window.setTimeout(() => {
    void window.zeno.terminal.resize(c, r).catch(() => undefined);
    // Some TUI builds ignore a resize while an edit frame is idle. Ctrl+L redraws
    // without submitting or modifying the current input buffer.
    if (requestRedraw) void window.zeno.terminal.write("\x0c").catch(() => undefined);
  }, 16);
}

export function PiTuiTerminal(props: {
  sessionFile: string;
  cwd: string;
  colorMode: "light" | "dark";
  className?: string | undefined;
  /** Fired only after this mount has bound the expected session and painted. */
  onReady?: ((info: { sessionFile: string }) => void) | undefined;
  onOpenError?: ((error: unknown) => void) | undefined;
  onProcessExit?: ((event: { exitCode: number; signal?: number }) => void) | undefined;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const onExitRef = useRef(props.onProcessExit);
  const onReadyRef = useRef(props.onReady);
  const onOpenErrorRef = useRef(props.onOpenError);
  const colorModeRef = useRef(props.colorMode);
  const prefsRef = useRef<TerminalPrefs>(loadTerminalPrefs());
  const [surfaceReady, setSurfaceReady] = useState(false);
  const surfaceReadyRef = useRef(false);
  /** Exposed for e2e: grid + whether PTY actually painted into Ghostty. */
  const [paintStats, setPaintStats] = useState({
    cols: 0,
    rows: 0,
    bytes: 0,
    canvasW: 0,
    canvasH: 0,
  });
  onExitRef.current = props.onProcessExit;
  onReadyRef.current = props.onReady;
  onOpenErrorRef.current = props.onOpenError;
  colorModeRef.current = props.colorMode;

  useEffect(() => {
    const host = hostRef.current;
    const shell = shellRef.current;
    const thumb = thumbRef.current;
    const sessionFile = props.sessionFile.trim();
    const cwd = props.cwd.trim();
    const expectedKey = normSession(sessionFile);
    if (!host || !sessionFile || !cwd) return;

    let cancelled = false;
    let term: GhosttyTerminal | null = null;
    let fit: GhosttyFitAddon | null = null;
    let unsubData: (() => void) | undefined;
    let unsubExit: (() => void) | undefined;
    let onDataDisp: { dispose(): void } | undefined;
    let onResizeDisp: { dispose(): void } | undefined;
    let onSelDisp: { dispose(): void } | undefined;
    let onScrollDisp: { dispose(): void } | undefined;
    let onHostFocus: (() => void) | undefined;
    let detachThumbChrome: (() => void) | undefined;
    let thumbHideTimer: number | null = null;
    let thumbDrag:
      | {
          pointerId: number;
          startY: number;
          startViewportY: number;
          thumbHeight: number;
          scrollback: number;
        }
      | undefined;
    let fitId = 0;
    let caretFrameId = 0;
    let settleTimer: number | null = null;
    let maxTimer: number | null = null;
    let readyFired = false;
    /** Only accept data after open returns the *expected* session. */
    let acceptSessionKey: string | null = null;
    /** PTY output can arrive before the open IPC promise resolves; retain it in order. */
    const pendingData: string[] = [];
    /** Bytes written into Ghostty after open — blank canvas is not "ready". */
    let ptyBytes = 0;
    let openedResumed = false;
    let repaintAttempts = 0;
    setSurfaceReady(false);
    surfaceReadyRef.current = false;
    setPaintStats({ cols: 0, rows: 0, bytes: 0, canvasW: 0, canvasH: 0 });

    function paintHostBackground(prefs: TerminalPrefs) {
      const theme = resolveTerminalTheme(prefs, colorModeRef.current);
      if (shell) shell.style.background = theme.background;
      if (host) host.style.background = theme.background;
    }

    function applyPrefsToTerminal(target: GhosttyTerminal, prefs: TerminalPrefs) {
      const opts = terminalOptionsFromPrefs(prefs, colorModeRef.current);
      paintHostBackground(prefs);
      const options = target.options as Record<string, unknown>;
      options.fontFamily = opts.fontFamily;
      options.fontSize = opts.fontSize;
      options.cursorBlink = opts.cursorBlink;
      options.cursorStyle = opts.cursorStyle;
      options.smoothScrollDuration = opts.smoothScrollDuration;
      options.convertEol = opts.convertEol;
      options.theme = { ...opts.theme };
      options.scrollback = opts.scrollback;
      try {
        const renderer = (target as unknown as { renderer?: { setTheme?: (t: unknown) => void } })
          .renderer;
        renderer?.setTheme?.(opts.theme);
      } catch {
        // ignore
      }
      // ghostty-web has no lineHeight option — scale cell height after font metrics settle.
      applyTerminalLineHeight(target, opts.lineHeight);
      suppressGhosttyCanvasScrollbar(target);
      try {
        fit?.fit();
        // FitAddon may change cols/rows; re-apply so canvas matches the new grid.
        applyTerminalLineHeight(target, opts.lineHeight);
        void window.zeno.terminal.resize(target.cols, target.rows).catch(() => undefined);
      } catch {
        // ignore
      }
      syncTerminalInputCaret(target);
      syncOverlayThumb(true);
    }

    function syncOverlayThumb(show: boolean) {
      if (!shell || !thumb || !term) return;
      updateTerminalOverlayThumb({ shell, thumb, term, visible: show });
    }

    function scheduleThumbHide() {
      if (!thumb) return;
      if (thumbHideTimer != null) window.clearTimeout(thumbHideTimer);
      thumbHideTimer = window.setTimeout(() => {
        thumbHideTimer = null;
        if (thumb.dataset.hovered === "true" || thumb.dataset.dragging === "true") return;
        syncOverlayThumb(false);
      }, TERMINAL_THUMB_HIDE_MS);
    }

    function showOverlayThumb() {
      syncOverlayThumb(true);
      if (thumb?.dataset.dragging !== "true") scheduleThumbHide();
    }

    function readCanvasMetrics(target: GhosttyTerminal): { w: number; h: number } {
      try {
        const canvas = host?.querySelector("canvas");
        if (canvas instanceof HTMLCanvasElement) {
          return { w: canvas.width || 0, h: canvas.height || 0 };
        }
      } catch {
        // ignore
      }
      try {
        return { w: Math.max(0, target.cols * 8), h: Math.max(0, target.rows * 16) };
      } catch {
        return { w: 0, h: 0 };
      }
    }

    function publishPaintStats(target: GhosttyTerminal) {
      const { w, h } = readCanvasMetrics(target);
      setPaintStats({
        cols: target.cols,
        rows: target.rows,
        bytes: ptyBytes,
        canvasW: w,
        canvasH: h,
      });
    }

    /**
     * Ready only when Ghostty has a real grid and (for resume/promote) PTY bytes
     * actually landed — otherwise session hops look "ready" on a blank canvas.
     */
    function canDeclareReady(target: GhosttyTerminal | null): boolean {
      if (!target || acceptSessionKey !== expectedKey) return false;
      if (target.cols < 20 || target.rows < 5) return false;
      const { w, h } = readCanvasMetrics(target);
      if (w < 40 || h < 40) return false;
      // Cold open of a quiet session may have no bytes yet; resume must repaint.
      if (openedResumed && ptyBytes < 1) return false;
      return true;
    }

    function fireReady() {
      if (readyFired || cancelled) return;
      if (acceptSessionKey !== expectedKey) return;
      if (!canDeclareReady(term)) {
        // Not painted yet — nudge again instead of revealing a broken surface.
        if (term && repaintAttempts < 6) {
          repaintAttempts += 1;
          try {
            fit?.fit();
            forcePtyRepaint(term.cols, term.rows, openedResumed && repaintAttempts >= 3);
          } catch {
            // ignore
          }
          if (maxTimer != null) window.clearTimeout(maxTimer);
          maxTimer = window.setTimeout(
            () => {
              maxTimer = null;
              fireReady();
            },
            openedResumed ? 200 : 400,
          );
        }
        return;
      }
      readyFired = true;
      surfaceReadyRef.current = true;
      if (settleTimer != null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
      }
      if (maxTimer != null) {
        window.clearTimeout(maxTimer);
        maxTimer = null;
      }
      if (term) publishPaintStats(term);
      // Reveal first so layout metrics are final, then re-fit the cell grid.
      setSurfaceReady(true);
      window.requestAnimationFrame(() => {
        if (cancelled || !term) return;
        try {
          fit?.fit();
          void window.zeno.terminal.resize(term.cols, term.rows).catch(() => undefined);
          normalizeInitialPromptCursor(term);
          syncTerminalInputCaret(term);
          focusTerminalInput(term);
          publishPaintStats(term);
        } catch {
          // ignore
        }
        window.requestAnimationFrame(() => {
          if (cancelled) return;
          if (term) {
            try {
              fit?.fit();
              void window.zeno.terminal.resize(term.cols, term.rows).catch(() => undefined);
              focusTerminalInput(term);
              publishPaintStats(term);
            } catch {
              // ignore
            }
          }
          onReadyRef.current?.({ sessionFile });
        });
      });
    }

    let settleMs = READY_SETTLE_MS;
    let maxMs = READY_MAX_MS;

    function scheduleReadyAfterVerifiedOutput() {
      if (readyFired || cancelled) return;
      if (settleTimer != null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        fireReady();
      }, settleMs);
    }

    void (async () => {
      let ghostty: GhosttyModule;
      try {
        ghostty = await loadGhostty();
      } catch (err) {
        if (!cancelled) {
          console.error("[pi-tui] ghostty-web WASM init failed", err);
          onOpenErrorRef.current?.(err);
        }
        return;
      }
      if (cancelled || !hostRef.current) return;

      prefsRef.current = loadTerminalPrefs();
      const boot = terminalOptionsFromPrefs(prefsRef.current, colorModeRef.current);
      paintHostBackground(prefsRef.current);

      const next = new ghostty.Terminal({
        cursorBlink: boot.cursorBlink,
        cursorStyle: boot.cursorStyle,
        fontFamily: boot.fontFamily,
        fontSize: boot.fontSize,
        scrollback: boot.scrollback,
        smoothScrollDuration: boot.smoothScrollDuration,
        convertEol: boot.convertEol,
        theme: { ...boot.theme },
      });
      const nextFit = new ghostty.FitAddon();
      next.loadAddon(nextFit);
      next.open(host);
      try {
        next.reset();
      } catch {
        // ignore
      }
      term = next;
      fit = nextFit;
      // Replace FitAddon's gA gutter (equal L/R padding owns margins; floating thumb is free).
      installFitWithoutScrollbarGutter(nextFit, () => (cancelled ? null : term));
      suppressGhosttyCanvasScrollbar(next);

      function writeTerminalOutput(data: string) {
        if (data) ptyBytes += data.length;
        // Pi's TUI positions the hardware cursor after each render. Keep that
        // cursor visible and remove only the duplicate reverse-video styling.
        next.write(stripPiEditorCursorStyle(data), () => {
          if (cancelled) return;
          // The callback is scheduled after Ghostty's next render frame, so the
          // settle window starts only after this output is actually paintable.
          publishPaintStats(next);
          scheduleReadyAfterVerifiedOutput();
          syncTerminalInputCaret(next);
        });
        if (prefsRef.current.scrollOnOutput) {
          try {
            next.scrollToBottom();
          } catch {
            // ignore
          }
        }
      }

      unsubData = window.zeno.terminal.onData((event) => {
        if (cancelled) return;
        // Ignore queued bytes belonging to a PTY that was disposed during a hop.
        if (event.sessionFile && normSession(event.sessionFile) !== expectedKey) return;
        // Keep target bytes that race the open acknowledgement; dropping them
        // can reveal a blank or partially drawn session after the transition.
        if (acceptSessionKey !== expectedKey) {
          pendingData.push(event.data);
          return;
        }
        writeTerminalOutput(event.data);
      });
      unsubExit = window.zeno.terminal.onExit((event) => {
        if (event.sessionFile && normSession(event.sessionFile) !== expectedKey) return;
        onExitRef.current?.(event);
      });
      onDataDisp = next.onData((data) => {
        void window.zeno.terminal.write(data).catch(() => undefined);
        // Local keystrokes move the TUI caret before the next PTY frame arrives.
        syncTerminalInputCaret(next);
      });
      onResizeDisp = next.onResize(({ cols, rows }) => {
        void window.zeno.terminal.resize(cols, rows).catch(() => undefined);
        syncTerminalInputCaret(next);
        suppressGhosttyCanvasScrollbar(next);
        showOverlayThumb();
      });
      onSelDisp = next.onSelectionChange(() => {
        if (!prefsRef.current.copyOnSelect) return;
        try {
          const text = next.getSelection();
          if (text) void navigator.clipboard.writeText(text).catch(() => undefined);
        } catch {
          // ignore
        }
      });
      onScrollDisp = next.onScroll(() => {
        if (cancelled) return;
        showOverlayThumb();
      });
      // Wheel over the host also moves viewportY — keep the floating thumb in sync.
      const onHostWheel = () => {
        if (cancelled) return;
        window.requestAnimationFrame(() => {
          if (!cancelled) showOverlayThumb();
        });
      };
      host.addEventListener("wheel", onHostWheel, { passive: true });
      // Floating thumb drag → Ghostty scrollToLine (viewportY 0 = bottom).
      const onThumbPointerDown = (event: PointerEvent) => {
        if (!term || !thumb || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        let scrollback = 0;
        try {
          scrollback = term.getScrollbackLength();
        } catch {
          return;
        }
        if (scrollback < 1) return;
        const thumbHeight = thumb.getBoundingClientRect().height || TERMINAL_THUMB_MIN_PX;
        thumbDrag = {
          pointerId: event.pointerId,
          startY: event.clientY,
          startViewportY: term.viewportY || 0,
          thumbHeight,
          scrollback,
        };
        thumb.dataset.dragging = "true";
        thumb.dataset.visible = "true";
        try {
          thumb.setPointerCapture(event.pointerId);
        } catch {
          // ignore
        }
      };
      const onThumbPointerMove = (event: PointerEvent) => {
        if (!term || !thumbDrag || event.pointerId !== thumbDrag.pointerId || !shell) return;
        const track = Math.max(1, shell.getBoundingClientRect().height - thumbDrag.thumbHeight);
        // Dragging down increases visualTop → decreases viewportY (toward bottom).
        const deltaY = event.clientY - thumbDrag.startY;
        const nextY = Math.round(
          thumbDrag.startViewportY - (deltaY / track) * thumbDrag.scrollback,
        );
        try {
          term.scrollToLine(Math.max(0, Math.min(thumbDrag.scrollback, nextY)));
        } catch {
          // ignore
        }
        syncOverlayThumb(true);
      };
      const onThumbPointerUp = (event: PointerEvent) => {
        if (!thumbDrag || event.pointerId !== thumbDrag.pointerId) return;
        thumbDrag = undefined;
        if (thumb) {
          thumb.dataset.dragging = "false";
          try {
            thumb.releasePointerCapture(event.pointerId);
          } catch {
            // ignore
          }
        }
        scheduleThumbHide();
      };
      const onThumbEnter = () => {
        if (!thumb) return;
        thumb.dataset.hovered = "true";
        syncOverlayThumb(true);
      };
      const onThumbLeave = () => {
        if (!thumb) return;
        thumb.dataset.hovered = "false";
        if (thumb.dataset.dragging !== "true") scheduleThumbHide();
      };
      if (thumb) {
        thumb.addEventListener("pointerdown", onThumbPointerDown);
        thumb.addEventListener("pointermove", onThumbPointerMove);
        thumb.addEventListener("pointerup", onThumbPointerUp);
        thumb.addEventListener("pointercancel", onThumbPointerUp);
        thumb.addEventListener("pointerenter", onThumbEnter);
        thumb.addEventListener("pointerleave", onThumbLeave);
      }
      // ghostty-web 0.4 does not emit onRender from its frame loop and only
      // reports vertical cursor moves. Track both axes after each VT render.
      const trackInputCaret = () => {
        if (cancelled) return;
        syncTerminalInputCaret(next);
        caretFrameId = window.requestAnimationFrame(trackInputCaret);
      };
      trackInputCaret();
      // ghostty focuses the contenteditable host; keep the IME caret on the VT cell.
      onHostFocus = () => {
        if (cancelled) return;
        if (document.activeElement === next.textarea) return;
        focusTerminalInput(next);
      };
      host.addEventListener("focusin", onHostFocus);

      let cols = next.cols;
      let rows = next.rows;
      try {
        nextFit.fit();
        cols = next.cols;
        rows = next.rows;
      } catch {
        // ignore
      }
      suppressGhosttyCanvasScrollbar(next);
      syncOverlayThumb(false);

      detachThumbChrome = () => {
        host.removeEventListener("wheel", onHostWheel);
        if (!thumb) return;
        thumb.removeEventListener("pointerdown", onThumbPointerDown);
        thumb.removeEventListener("pointermove", onThumbPointerMove);
        thumb.removeEventListener("pointerup", onThumbPointerUp);
        thumb.removeEventListener("pointercancel", onThumbPointerUp);
        thumb.removeEventListener("pointerenter", onThumbEnter);
        thumb.removeEventListener("pointerleave", onThumbLeave);
        thumb.dataset.visible = "false";
        thumb.dataset.hovered = "false";
        thumb.dataset.dragging = "false";
      };

      // Do NOT dispose first — open() resumes same session or promotes a parked one.
      let opened: { sessionFile?: string; resumed?: boolean };
      try {
        opened = await window.zeno.terminal.open({
          sessionFile,
          cwd,
          cols,
          rows,
        });
      } catch (err) {
        if (!cancelled) onOpenErrorRef.current?.(err);
        return;
      }
      if (cancelled) {
        // Stale mount: only kill if we still own this session (don't wipe a newer hop).
        try {
          const st = await window.zeno.terminal.status();
          if (st.sessionFile && normSession(st.sessionFile) === expectedKey) {
            await window.zeno.terminal.suspend();
          }
        } catch {
          // ignore
        }
        return;
      }

      const liveKey = normSession(opened.sessionFile ?? sessionFile);
      if (liveKey !== expectedKey) {
        if (!cancelled) {
          onOpenErrorRef.current?.(new Error("Terminal opened for the wrong session"));
        }
        return;
      }

      openedResumed = Boolean(opened.resumed);
      if (opened.resumed) {
        settleMs = READY_SETTLE_RESUMED_MS;
        maxMs = READY_MAX_RESUMED_MS;
      }

      applyPrefsToTerminal(next, prefsRef.current);
      // Only now may PTY bytes hit the canvas.
      acceptSessionKey = expectedKey;
      for (const data of pendingData.splice(0)) writeTerminalOutput(data);

      fitId = window.requestAnimationFrame(() => {
        if (cancelled) return;
        try {
          nextFit.fit();
          // Parked/resumed pi keeps VT state but this Ghostty is empty — force a
          // full TUI repaint into the new canvas (same-size resize is often ignored).
          forcePtyRepaint(next.cols, next.rows);
          focusTerminalInput(next);
          publishPaintStats(next);
        } catch {
          // ignore
        }
        // Resumed: wait for real PTY bytes (canDeclareReady). Cold: allow quiet sessions.
        maxTimer = window.setTimeout(() => {
          maxTimer = null;
          fireReady();
        }, maxMs);
        if (!opened.resumed) {
          // Quiet cold session (no output yet) — still need a valid grid.
          scheduleReadyAfterVerifiedOutput();
        }
      });
      nextFit.observeResize();
    })();

    const onPrefs = (event: Event) => {
      const detail = (event as CustomEvent<TerminalPrefs>).detail;
      const prefs = detail ?? loadTerminalPrefs();
      prefsRef.current = prefs;
      if (term) applyPrefsToTerminal(term, prefs);
    };
    window.addEventListener(TERMINAL_PREFS_CHANGED_EVENT, onPrefs);

    return () => {
      cancelled = true;
      acceptSessionKey = null;
      surfaceReadyRef.current = false;
      window.removeEventListener(TERMINAL_PREFS_CHANGED_EVENT, onPrefs);
      window.cancelAnimationFrame(fitId);
      if (settleTimer != null) window.clearTimeout(settleTimer);
      if (maxTimer != null) window.clearTimeout(maxTimer);
      if (thumbHideTimer != null) window.clearTimeout(thumbHideTimer);
      unsubData?.();
      unsubExit?.();
      onDataDisp?.dispose();
      onResizeDisp?.dispose();
      onSelDisp?.dispose();
      onScrollDisp?.dispose();
      detachThumbChrome?.();
      window.cancelAnimationFrame(caretFrameId);
      if (onHostFocus) host.removeEventListener("focusin", onHostFocus);
      try {
        fit?.dispose();
      } catch {
        // ignore
      }
      try {
        term?.dispose();
      } catch {
        // ignore
      }
      term = null;
      fit = null;
      // Do not dispose main PTY here — parent switchThread/leave owns lifecycle.
      // Stale open path above disposes if it still owns the expected session.
    };
  }, [props.sessionFile, props.cwd]);

  useEffect(() => {
    colorModeRef.current = props.colorMode;
    if (!surfaceReadyRef.current) return;
    window.dispatchEvent(
      new CustomEvent(TERMINAL_PREFS_CHANGED_EVENT, { detail: loadTerminalPrefs() }),
    );
  }, [props.colorMode]);

  const initialBg = resolveTerminalTheme(loadTerminalPrefs(), props.colorMode).background;

  return (
    <div
      ref={shellRef}
      className={cn("pi-tui-terminal flex min-h-0 min-w-0 flex-1 flex-col", props.className)}
      data-testid="pi-tui-terminal"
      data-session={props.sessionFile}
      data-surface-ready={surfaceReady ? "true" : "false"}
      data-paint-cols={String(paintStats.cols)}
      data-paint-rows={String(paintStats.rows)}
      data-paint-bytes={String(paintStats.bytes)}
      data-paint-canvas-w={String(paintStats.canvasW)}
      data-paint-canvas-h={String(paintStats.canvasH)}
      style={{ background: initialBg }}
    >
      <div
        ref={hostRef}
        className="pi-tui-terminal-host min-h-0 min-w-0 flex-1"
        style={{
          background: initialBg,
          // Equal content margins; floating thumb does not consume this width.
          paddingLeft: TERMINAL_CONTENT_INSET_PX,
          paddingRight: TERMINAL_CONTENT_INSET_PX,
        }}
      />
      {/*
        Floating overlay scrollbar — fixed to the app right edge, zero layout width.
        Ghostty's in-canvas scrollbar is suppressed so L/R content margins stay equal.
      */}
      <div
        ref={thumbRef}
        className="pi-tui-scroll-thumb"
        data-visible="false"
        data-hovered="false"
        data-dragging="false"
        aria-hidden="true"
      />
    </div>
  );
}
