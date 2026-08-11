/**
 * Desktop appearance typography prefs (localStorage — not pi settings).
 * Applied as CSS custom properties on <html>.
 */

export type AppearancePrefs = {
  /** App chrome / conversation body font size (px). */
  uiFontSize: number;
  /** Markdown / tool code block font size (px). */
  codeFontSize: number;
  /** CSS font-family stack for UI chrome and conversation text. */
  uiFontFamily: string;
  /** CSS font-family stack for Markdown / tool code blocks. */
  codeFontFamily: string;
};

const KEY = "pix.appearance.prefs.v1";
export const APPEARANCE_PREFS_CHANGED_EVENT = "pix-appearance-prefs";

/** Matches styles.css @theme --font-sans default. */
export const DEFAULT_UI_FONT_FAMILY =
  '"Inter", "SF Pro Text", "Segoe UI", system-ui, -apple-system, sans-serif';
/** Matches styles.css @theme --font-mono default. */
export const DEFAULT_CODE_FONT_FAMILY =
  '"SF Mono", "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';

export const DEFAULT_APPEARANCE_PREFS: AppearancePrefs = {
  uiFontSize: 14,
  codeFontSize: 12,
  uiFontFamily: DEFAULT_UI_FONT_FAMILY,
  codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
};

export const UI_FONT_SIZE_MIN = 12;
export const UI_FONT_SIZE_MAX = 20;
export const CODE_FONT_SIZE_MIN = 10;
export const CODE_FONT_SIZE_MAX = 20;

const MAX_FONT_FAMILY_LENGTH = 512;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeFontFamily(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_FONT_FAMILY_LENGTH) return fallback;
  // Reject control characters that could break CSS custom properties.
  for (const ch of trimmed) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return fallback;
  }
  return trimmed;
}

export function normalizeAppearancePrefs(
  raw: Partial<AppearancePrefs> | null | undefined,
): AppearancePrefs {
  const base = { ...DEFAULT_APPEARANCE_PREFS, ...raw };
  return {
    uiFontSize: clamp(Number(base.uiFontSize), UI_FONT_SIZE_MIN, UI_FONT_SIZE_MAX),
    codeFontSize: clamp(Number(base.codeFontSize), CODE_FONT_SIZE_MIN, CODE_FONT_SIZE_MAX),
    uiFontFamily: normalizeFontFamily(base.uiFontFamily, DEFAULT_UI_FONT_FAMILY),
    codeFontFamily: normalizeFontFamily(base.codeFontFamily, DEFAULT_CODE_FONT_FAMILY),
  };
}

export function loadAppearancePrefs(): AppearancePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE_PREFS };
    return normalizeAppearancePrefs(JSON.parse(raw) as Partial<AppearancePrefs>);
  } catch {
    return { ...DEFAULT_APPEARANCE_PREFS };
  }
}

export function saveAppearancePrefs(prefs: AppearancePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalizeAppearancePrefs(prefs)));
  } catch {
    // ignore quota / private mode
  }
}

export function patchAppearancePrefs(patch: Partial<AppearancePrefs>): AppearancePrefs {
  const next = normalizeAppearancePrefs({ ...loadAppearancePrefs(), ...patch });
  saveAppearancePrefs(next);
  applyAppearancePrefs(next);
  try {
    window.dispatchEvent(new CustomEvent(APPEARANCE_PREFS_CHANGED_EVENT, { detail: next }));
  } catch {
    // ignore non-DOM
  }
  return next;
}

export function resetAppearancePrefs(): AppearancePrefs {
  const next = { ...DEFAULT_APPEARANCE_PREFS };
  saveAppearancePrefs(next);
  applyAppearancePrefs(next);
  try {
    window.dispatchEvent(new CustomEvent(APPEARANCE_PREFS_CHANGED_EVENT, { detail: next }));
  } catch {
    // ignore
  }
  return next;
}

/** Write CSS variables used by styles.css for UI / code type. */
export function applyAppearancePrefs(prefs: AppearancePrefs = loadAppearancePrefs()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--ui-font-size", `${prefs.uiFontSize}px`);
  root.style.setProperty("--code-font-size", `${prefs.codeFontSize}px`);
  root.style.setProperty("--font-sans", prefs.uiFontFamily);
  root.style.setProperty("--font-mono", prefs.codeFontFamily);
}
