/**
 * Embedded pi TUI (ghostty-web) preferences — desktop-only localStorage.
 * Applied when the terminal surface mounts and when prefs change live.
 */

export type TerminalCursorStyle = "block" | "underline" | "bar";

/** Color palette for the terminal canvas. */
export type TerminalColorScheme = "dark" | "light" | "match";

export type TerminalPrefs = {
  /** CSS font-family stack. */
  fontFamily: string;
  /** Point size (px). */
  fontSize: number;
  /**
   * Cell line-height multiplier on top of measured font metrics.
   * 1.0 = ghostty native (tight); higher values add vertical padding per row.
   */
  lineHeight: number;
  cursorBlink: boolean;
  cursorStyle: TerminalCursorStyle;
  /** Scrollback lines retained by the VT buffer. */
  scrollback: number;
  /** Smooth scroll duration in ms; 0 = instant. */
  smoothScrollMs: number;
  /**
   * Convert bare LF to CRLF on write.
   * Off by default — full-screen TUIs (pi) control the cursor with VT sequences
   * and LF→CRLF shifts columns. Enable only for line-oriented shells if needed.
   */
  convertEol: boolean;
  /** Copy selection to the system clipboard as soon as it changes. */
  copyOnSelect: boolean;
  /** Keep viewport pinned to the bottom when new output arrives. */
  scrollOnOutput: boolean;
  /** Canvas palette: fixed dark/light, or follow desktop color mode. */
  colorScheme: TerminalColorScheme;
};

const KEY = "zeno.terminal.prefs.v1";
export const TERMINAL_PREFS_CHANGED_EVENT = "zeno-terminal-prefs";

export const DEFAULT_TERMINAL_PREFS: TerminalPrefs = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 13,
  // Slightly looser than ghostty native (1.0) — dense TUI rows are hard to scan.
  lineHeight: 1.2,
  cursorBlink: true,
  cursorStyle: "block",
  scrollback: 10_000,
  smoothScrollMs: 100,
  convertEol: false,
  copyOnSelect: true,
  scrollOnOutput: true,
  colorScheme: "match",
};

export const TERMINAL_FONT_SIZE_MIN = 10;
export const TERMINAL_FONT_SIZE_MAX = 28;
export const TERMINAL_LINE_HEIGHT_MIN = 1;
export const TERMINAL_LINE_HEIGHT_MAX = 1.5;
export const TERMINAL_LINE_HEIGHT_STEP = 0.1;
/** Discrete options shown in Settings → Terminal. */
export const TERMINAL_LINE_HEIGHT_OPTIONS = [1, 1.1, 1.2, 1.3, 1.4, 1.5] as const;
export const TERMINAL_SCROLLBACK_MIN = 500;
export const TERMINAL_SCROLLBACK_MAX = 100_000;
export const TERMINAL_SMOOTH_SCROLL_MAX = 500;

export type TerminalThemeColors = {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  selectionForeground: string;
};

export const TERMINAL_THEME_DARK: TerminalThemeColors = {
  background: "#191919",
  foreground: "#e8e8e8",
  cursor: "#e8e8e8",
  selectionBackground: "#3a3a3a",
  selectionForeground: "#e8e8e8",
};

export const TERMINAL_THEME_LIGHT: TerminalThemeColors = {
  background: "#f7f7f7",
  foreground: "#1a1a1a",
  cursor: "#1a1a1a",
  selectionBackground: "#c8d4e8",
  selectionForeground: "#1a1a1a",
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Round to one decimal and clamp into the supported line-height range. */
export function clampTerminalLineHeight(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_TERMINAL_PREFS.lineHeight;
  const rounded = Math.round(n * 10) / 10;
  return Math.min(TERMINAL_LINE_HEIGHT_MAX, Math.max(TERMINAL_LINE_HEIGHT_MIN, rounded));
}

function isCursorStyle(value: unknown): value is TerminalCursorStyle {
  return value === "block" || value === "underline" || value === "bar";
}

function isColorScheme(value: unknown): value is TerminalColorScheme {
  return value === "dark" || value === "light" || value === "match";
}

export function normalizeTerminalPrefs(
  raw: Partial<TerminalPrefs> | null | undefined,
): TerminalPrefs {
  const base = { ...DEFAULT_TERMINAL_PREFS, ...raw };
  return {
    fontFamily:
      typeof base.fontFamily === "string" && base.fontFamily.trim()
        ? base.fontFamily.trim()
        : DEFAULT_TERMINAL_PREFS.fontFamily,
    fontSize: clamp(Number(base.fontSize), TERMINAL_FONT_SIZE_MIN, TERMINAL_FONT_SIZE_MAX),
    lineHeight: clampTerminalLineHeight(Number(base.lineHeight)),
    cursorBlink: base.cursorBlink !== false,
    cursorStyle: isCursorStyle(base.cursorStyle)
      ? base.cursorStyle
      : DEFAULT_TERMINAL_PREFS.cursorStyle,
    scrollback: clamp(Number(base.scrollback), TERMINAL_SCROLLBACK_MIN, TERMINAL_SCROLLBACK_MAX),
    smoothScrollMs: clamp(Number(base.smoothScrollMs), 0, TERMINAL_SMOOTH_SCROLL_MAX),
    convertEol: base.convertEol === true,
    copyOnSelect: base.copyOnSelect !== false,
    scrollOnOutput: base.scrollOnOutput !== false,
    colorScheme: isColorScheme(base.colorScheme)
      ? base.colorScheme
      : DEFAULT_TERMINAL_PREFS.colorScheme,
  };
}

export function loadTerminalPrefs(): TerminalPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_TERMINAL_PREFS };
    return normalizeTerminalPrefs(JSON.parse(raw) as Partial<TerminalPrefs>);
  } catch {
    return { ...DEFAULT_TERMINAL_PREFS };
  }
}

export function saveTerminalPrefs(prefs: TerminalPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalizeTerminalPrefs(prefs)));
  } catch {
    // ignore quota / private mode
  }
}

export function patchTerminalPrefs(patch: Partial<TerminalPrefs>): TerminalPrefs {
  const next = normalizeTerminalPrefs({ ...loadTerminalPrefs(), ...patch });
  saveTerminalPrefs(next);
  try {
    window.dispatchEvent(new CustomEvent(TERMINAL_PREFS_CHANGED_EVENT, { detail: next }));
  } catch {
    // ignore non-DOM
  }
  return next;
}

export function resetTerminalPrefs(): TerminalPrefs {
  const next = { ...DEFAULT_TERMINAL_PREFS };
  saveTerminalPrefs(next);
  try {
    window.dispatchEvent(new CustomEvent(TERMINAL_PREFS_CHANGED_EVENT, { detail: next }));
  } catch {
    // ignore
  }
  return next;
}

/** Resolve canvas theme for the active desktop color mode. */
export function resolveTerminalTheme(
  prefs: TerminalPrefs,
  colorMode: "light" | "dark",
): TerminalThemeColors {
  if (prefs.colorScheme === "dark") return { ...TERMINAL_THEME_DARK };
  if (prefs.colorScheme === "light") return { ...TERMINAL_THEME_LIGHT };
  return colorMode === "light" ? { ...TERMINAL_THEME_LIGHT } : { ...TERMINAL_THEME_DARK };
}

/** Map prefs → ghostty-web constructor / runtime options. */
export function terminalOptionsFromPrefs(
  prefs: TerminalPrefs,
  colorMode: "light" | "dark",
): {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorBlink: boolean;
  cursorStyle: TerminalCursorStyle;
  scrollback: number;
  smoothScrollDuration: number;
  convertEol: boolean;
  theme: TerminalThemeColors;
} {
  const theme = resolveTerminalTheme(prefs, colorMode);
  return {
    fontFamily: prefs.fontFamily,
    fontSize: prefs.fontSize,
    lineHeight: prefs.lineHeight,
    cursorBlink: prefs.cursorBlink,
    cursorStyle: prefs.cursorStyle,
    scrollback: prefs.scrollback,
    smoothScrollDuration: prefs.smoothScrollMs,
    convertEol: prefs.convertEol,
    theme,
  };
}

type GhosttyFontMetrics = { width: number; height: number; baseline: number };

type GhosttyRendererForLineHeight = {
  metrics: GhosttyFontMetrics;
  measureFont?: () => GhosttyFontMetrics;
  resize?: (cols: number, rows: number) => void;
  render?: (
    buffer: unknown,
    forceAll?: boolean,
    viewportY?: number,
    scrollbackProvider?: unknown,
    scrollbarOpacity?: number,
  ) => void;
};

type GhosttyTerminalForLineHeight = {
  cols: number;
  rows: number;
  canvas?: HTMLCanvasElement | null;
  element?: HTMLElement | null;
  renderer?: GhosttyRendererForLineHeight;
  wasmTerm?: unknown;
  viewportY?: number;
};

/**
 * ghostty-web has no lineHeight option — cell height is ascent+descent+2px.
 * After open / font changes, scale measured cell height and re-size the canvas.
 */
export function applyTerminalLineHeight(term: unknown, lineHeight: number): void {
  const t = term as GhosttyTerminalForLineHeight;
  const renderer = t.renderer;
  if (!renderer?.measureFont || !renderer.metrics) return;
  let base: GhosttyFontMetrics;
  try {
    base = renderer.measureFont();
  } catch {
    return;
  }
  if (!base?.width || !base?.height) return;

  const mult = clampTerminalLineHeight(lineHeight);
  const height = Math.max(base.height, Math.round(base.height * mult));
  const extra = height - base.height;
  renderer.metrics = {
    width: base.width,
    height,
    // Keep glyphs optically centered in the taller cell.
    baseline: Math.max(1, base.baseline + Math.floor(extra / 2)),
  };

  const cols = Math.max(1, t.cols || 1);
  const rows = Math.max(1, t.rows || 1);
  try {
    renderer.resize?.(cols, rows);
  } catch {
    // ignore
  }

  const canvas =
    t.canvas ??
    (t.element?.querySelector?.("canvas") as HTMLCanvasElement | null | undefined) ??
    null;
  if (canvas) {
    const m = renderer.metrics;
    canvas.width = m.width * cols;
    canvas.height = m.height * rows;
    canvas.style.width = `${m.width * cols}px`;
    canvas.style.height = `${m.height * rows}px`;
  }

  try {
    if (t.wasmTerm && renderer.render) {
      renderer.render(t.wasmTerm, true, t.viewportY ?? 0, t);
    }
  } catch {
    // ignore
  }
}
