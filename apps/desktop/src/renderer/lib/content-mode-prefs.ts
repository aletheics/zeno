/**
 * Desktop content surface preference: React chat vs embedded pi TUI.
 *
 * - Global key: last-used mode (cold start fallback when no session yet).
 * - Per-session map: each session remembers chat vs terminal independently so
 *   switching away and back restores the surface the user left it on.
 *
 * Preference only (localStorage). Actual PTY lifecycle is main-process IPC.
 */

export type ContentMode = "chat" | "terminal";

const GLOBAL_KEY = "pix.contentMode";
const BY_SESSION_KEY = "pix.contentMode.bySession";
/** Bound growth — drop oldest entries when exceeded. */
const MAX_SESSION_ENTRIES = 80;

export function isContentMode(value: unknown): value is ContentMode {
  return value === "chat" || value === "terminal";
}

/**
 * Normalize session JSONL path for map keys (stable across slash styles).
 * Same /private collapse as shell-store.sessionRunKey so chat⇄terminal hops keep prefs.
 */
export function contentModeSessionKey(sessionFile: string): string {
  let p = sessionFile.replace(/\\/g, "/").replace(/\/+$/, "").trim().toLowerCase();
  if (p.startsWith("/private/")) p = p.slice("/private".length);
  return p;
}

export function loadContentMode(): ContentMode {
  try {
    const raw = localStorage.getItem(GLOBAL_KEY);
    if (isContentMode(raw)) return raw;
  } catch {
    // ignore
  }
  return "chat";
}

export function saveContentMode(mode: ContentMode): void {
  try {
    localStorage.setItem(GLOBAL_KEY, mode);
  } catch {
    // ignore quota / private mode
  }
}

function readSessionMap(): Record<string, ContentMode> {
  try {
    const raw = localStorage.getItem(BY_SESSION_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, ContentMode> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === "string" && k && isContentMode(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeSessionMap(map: Record<string, ContentMode>): void {
  try {
    localStorage.setItem(BY_SESSION_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/**
 * Mode for a session. Defaults to **chat** when never set (new sessions open in view).
 * Does not fall back to the global last-used mode — that would make every new
 * session inherit terminal after one terminal visit.
 */
export function loadContentModeForSession(sessionFile: string | undefined | null): ContentMode {
  const key = sessionFile?.trim() ? contentModeSessionKey(sessionFile) : "";
  if (!key) return "chat";
  const map = readSessionMap();
  const hit = map[key];
  return isContentMode(hit) ? hit : "chat";
}

export function saveContentModeForSession(
  sessionFile: string | undefined | null,
  mode: ContentMode,
): void {
  const key = sessionFile?.trim() ? contentModeSessionKey(sessionFile) : "";
  if (!key || !isContentMode(mode)) return;
  const map = readSessionMap();
  // Re-insert so this key is treated as newest when trimming.
  delete map[key];
  map[key] = mode;
  const keys = Object.keys(map);
  if (keys.length > MAX_SESSION_ENTRIES) {
    const drop = keys.length - MAX_SESSION_ENTRIES;
    for (let i = 0; i < drop; i++) {
      const k = keys[i];
      if (k) delete map[k];
    }
  }
  writeSessionMap(map);
  // Keep global in sync as "last used" for cold start chrome.
  saveContentMode(mode);
}

export function toggleContentMode(mode: ContentMode): ContentMode {
  return mode === "chat" ? "terminal" : "chat";
}
