/** Desktop-only settings UI prefs (not agent/pi config). */

export type AccessMode = "default" | "autoReview" | "full";

/** Which permission options appear in the home composer menu. Independent toggles. */
export type AccessVisibility = {
  default: boolean;
  autoReview: boolean;
  full: boolean;
};

const ACCESS_MODE_KEY = "pix.accessMode";
const ACCESS_MODE_LEGACY_KEY = "pix.composer.access";

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    // ignore
  }
  return fallback;
}

function saveBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // ignore
  }
}

/** Currently selected permission mode (composer selection). */
export function loadAccessMode(): AccessMode {
  try {
    const raw =
      localStorage.getItem(ACCESS_MODE_KEY) ?? localStorage.getItem(ACCESS_MODE_LEGACY_KEY);
    if (raw === "default" || raw === "autoReview" || raw === "full") return raw;
  } catch {
    // ignore
  }
  return "default";
}

export function saveAccessMode(mode: AccessMode): void {
  try {
    localStorage.setItem(ACCESS_MODE_KEY, mode);
    localStorage.setItem(ACCESS_MODE_LEGACY_KEY, mode);
  } catch {
    // ignore
  }
}

/**
 * General settings toggles: which access options the composer may show.
 * Independent of the currently selected accessMode.
 */
export function loadAccessVisibility(): AccessVisibility {
  const visibility: AccessVisibility = {
    default: loadBool("pix.settings.access.showDefault", true),
    autoReview: loadBool("pix.settings.access.showAutoReview", true),
    full: loadBool("pix.settings.access.showFull", true),
  };
  return ensureAccessVisibility(visibility);
}

export function saveAccessVisibility(visibility: AccessVisibility): void {
  const next = ensureAccessVisibility(visibility);
  saveBool("pix.settings.access.showDefault", next.default);
  saveBool("pix.settings.access.showAutoReview", next.autoReview);
  saveBool("pix.settings.access.showFull", next.full);
}

/** At least one option must stay visible. */
export function ensureAccessVisibility(visibility: AccessVisibility): AccessVisibility {
  if (visibility.default || visibility.autoReview || visibility.full) return visibility;
  return { default: true, autoReview: false, full: false };
}

export function visibleAccessModes(visibility: AccessVisibility): AccessMode[] {
  const next = ensureAccessVisibility(visibility);
  const modes: AccessMode[] = [];
  if (next.default) modes.push("default");
  if (next.autoReview) modes.push("autoReview");
  if (next.full) modes.push("full");
  return modes;
}

/** Pick a valid selected mode given visibility. */
export function resolveAccessMode(mode: AccessMode, visibility: AccessVisibility): AccessMode {
  const visible = visibleAccessModes(visibility);
  if (visible.includes(mode)) return mode;
  return visible[0] ?? "default";
}

export function loadPreventSleep(): boolean {
  return loadBool("pix.settings.preventSleep", false);
}

export function savePreventSleep(value: boolean): void {
  saveBool("pix.settings.preventSleep", value);
}

export function loadSuggestions(): boolean {
  return loadBool("pix.settings.suggestions", true);
}

export function saveSuggestions(value: boolean): void {
  saveBool("pix.settings.suggestions", value);
}

/** Whether the composer shows context-window usage (e.g. 0% / 12%). Default on. */
export function loadShowContextUsage(): boolean {
  return loadBool("pix.settings.showContextUsage", true);
}

export function saveShowContextUsage(value: boolean): void {
  saveBool("pix.settings.showContextUsage", value);
}
