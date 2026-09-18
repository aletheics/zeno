/** Desktop-only settings UI prefs (not agent/pi config). */

import { contentModeSessionKey } from "./content-mode-prefs.ts";

export type AccessMode = "default" | "autoReview" | "full";

/** Which permission options appear in the home composer menu. Independent toggles. */
export type AccessVisibility = {
  default: boolean;
  autoReview: boolean;
  full: boolean;
};

const ACCESS_MODE_KEY = "zeno.accessMode";
const ACCESS_MODE_LEGACY_KEY = "zeno.composer.access";

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

export function isAccessMode(value: unknown): value is AccessMode {
  return value === "default" || value === "autoReview" || value === "full";
}

const ACCESS_MODE_BY_SESSION_KEY = "zeno.accessMode.bySession";
/** Bound growth — drop oldest entries when exceeded. */
const MAX_SESSION_MODE_ENTRIES = 80;

function readAccessModeMap(): Record<string, AccessMode> {
  try {
    const raw = localStorage.getItem(ACCESS_MODE_BY_SESSION_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, AccessMode> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (key && isAccessMode(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeAccessModeMap(map: Record<string, AccessMode>): void {
  try {
    localStorage.setItem(ACCESS_MODE_BY_SESSION_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

/**
 * The permission mode a session was last left on.
 *
 * This was one global value, so setting it in one session set it for every session — the
 * user's report was that a session showing 自动 came back as 默认 after another session was
 * changed, which is what sharing a single value looks like from the outside.
 *
 * Unlike `content-mode-prefs`, an unset session falls back to the **global last-used**
 * rather than to a fixed default: a permission mode is a standing preference about how you
 * want to work, so a session you have never touched should start from your last choice
 * instead of snapping back to `default`.
 */
export function loadAccessModeForSession(sessionFile: string | undefined | null): AccessMode {
  const key = sessionFile?.trim() ? contentModeSessionKey(sessionFile) : "";
  if (!key) return loadAccessMode();
  const hit = readAccessModeMap()[key];
  return isAccessMode(hit) ? hit : loadAccessMode();
}

export function saveAccessModeForSession(
  sessionFile: string | undefined | null,
  mode: AccessMode,
): void {
  const key = sessionFile?.trim() ? contentModeSessionKey(sessionFile) : "";
  if (!key || !isAccessMode(mode)) return;

  const map = readAccessModeMap();
  // Re-insert so this key counts as newest when trimming.
  delete map[key];
  map[key] = mode;
  const keys = Object.keys(map);
  if (keys.length > MAX_SESSION_MODE_ENTRIES) {
    for (let i = 0; i < keys.length - MAX_SESSION_MODE_ENTRIES; i++) {
      const drop = keys[i];
      if (drop) delete map[drop];
    }
  }
  writeAccessModeMap(map);
  // Keep the global in sync as "last used", for sessions that have no entry of their own.
  saveAccessMode(mode);
}

/**
 * General settings toggles: which access options the composer may show.
 * Independent of the currently selected accessMode.
 */
export function loadAccessVisibility(): AccessVisibility {
  const visibility: AccessVisibility = {
    default: loadBool("zeno.settings.access.showDefault", true),
    autoReview: loadBool("zeno.settings.access.showAutoReview", true),
    full: loadBool("zeno.settings.access.showFull", true),
  };
  return ensureAccessVisibility(visibility);
}

export function saveAccessVisibility(visibility: AccessVisibility): void {
  const next = ensureAccessVisibility(visibility);
  saveBool("zeno.settings.access.showDefault", next.default);
  saveBool("zeno.settings.access.showAutoReview", next.autoReview);
  saveBool("zeno.settings.access.showFull", next.full);
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
  return loadBool("zeno.settings.preventSleep", false);
}

export function savePreventSleep(value: boolean): void {
  saveBool("zeno.settings.preventSleep", value);
}

export function loadSuggestions(): boolean {
  return loadBool("zeno.settings.suggestions", true);
}

export function saveSuggestions(value: boolean): void {
  saveBool("zeno.settings.suggestions", value);
}

/** Whether the composer shows context-window usage (e.g. 0% / 12%). Default on. */
export function loadShowContextUsage(): boolean {
  return loadBool("zeno.settings.showContextUsage", true);
}

export function saveShowContextUsage(value: boolean): void {
  saveBool("zeno.settings.showContextUsage", value);
}
