/**
 * The composer draft, per session.
 *
 * Switching sessions used to carry the draft across: type into one session, switch, and the
 * next session's composer showed the previous text. The composer itself is not remounted
 * (it has no `key`), so only the state needed isolating.
 *
 * Shape follows `content-mode-prefs.ts`: one bounded map keyed by the session file. The key
 * derivation is shared with it rather than re-implemented, because two session-scoped
 * preferences that normalise paths differently would eventually disagree about which
 * session a value belongs to.
 *
 * Preference only (localStorage). Never the source of truth for a running turn.
 */

import { MAX_ATTACHMENTS } from "./attachments.ts";
import { contentModeSessionKey } from "./content-mode-prefs.ts";

export type ComposerDraft = {
  prompt: string;
  attachments: string[];
};

/** Kept short of localStorage's limits; a draft is a note, not a document store. */
const MAX_DRAFT_CHARS = 20_000;

/** Bound growth — drop oldest entries when exceeded. */
const MAX_SESSION_ENTRIES = 80;

const BY_SESSION_KEY = "zeno.composerDraft.bySession";

export const EMPTY_COMPOSER_DRAFT: ComposerDraft = { prompt: "", attachments: [] };

export function isEmptyComposerDraft(draft: ComposerDraft): boolean {
  return draft.prompt.trim() === "" && draft.attachments.length === 0;
}

/** Drop what cannot be restored rather than trusting the stored shape. */
function normalizeDraft(value: unknown): ComposerDraft | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as { prompt?: unknown; attachments?: unknown };
  const prompt = typeof raw.prompt === "string" ? raw.prompt.slice(0, MAX_DRAFT_CHARS) : "";
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments.filter((p): p is string => typeof p === "string" && p.trim() !== "")
    : [];
  const draft: ComposerDraft = { prompt, attachments: attachments.slice(0, MAX_ATTACHMENTS) };
  return isEmptyComposerDraft(draft) ? undefined : draft;
}

function readSessionMap(): Record<string, ComposerDraft> {
  try {
    const raw = localStorage.getItem(BY_SESSION_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, ComposerDraft> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!key) continue;
      const draft = normalizeDraft(value);
      if (draft) out[key] = draft;
    }
    return out;
  } catch {
    return {};
  }
}

function writeSessionMap(map: Record<string, ComposerDraft>): void {
  try {
    localStorage.setItem(BY_SESSION_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

/** The draft left in a session, or an empty one when nothing was stored. */
export function loadComposerDraftForSession(sessionFile: string | undefined | null): ComposerDraft {
  const key = sessionFile?.trim() ? contentModeSessionKey(sessionFile) : "";
  if (!key) return { ...EMPTY_COMPOSER_DRAFT };
  const hit = readSessionMap()[key];
  return hit
    ? { prompt: hit.prompt, attachments: [...hit.attachments] }
    : { ...EMPTY_COMPOSER_DRAFT };
}

/**
 * Remember a draft, or forget it when it is empty.
 *
 * Deleting on empty keeps the map to sessions that actually hold something, so the bound
 * below is spent on real drafts rather than on empty entries left by every session visited.
 */
export function saveComposerDraftForSession(
  sessionFile: string | undefined | null,
  draft: ComposerDraft,
): void {
  const key = sessionFile?.trim() ? contentModeSessionKey(sessionFile) : "";
  if (!key) return;

  const map = readSessionMap();
  delete map[key];
  const next = normalizeDraft(draft);
  if (next) {
    // Re-insert so this key counts as newest when trimming.
    map[key] = next;
  }
  const keys = Object.keys(map);
  if (keys.length > MAX_SESSION_ENTRIES) {
    for (let i = 0; i < keys.length - MAX_SESSION_ENTRIES; i++) {
      const drop = keys[i];
      if (drop) delete map[drop];
    }
  }
  writeSessionMap(map);
}
