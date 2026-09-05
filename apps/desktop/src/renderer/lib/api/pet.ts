/**
 * API domain: desktop pet overlay — Electron edition.
 *
 * Mirrors zeno-update's `lib/api/pet.ts` command surface, but the Tauri
 * `invoke`/window calls are replaced by the `window.zeno.pet` preload bridge.
 * Resize/bubble offsets are computed here from the frame the main process
 * reports — Electron already returns logical CSS pixels (DIPs), so unlike Tauri
 * there is no scale-factor conversion.
 */

import {
  PET_BUBBLE_DISMISS_DEFAULT,
  PET_BUBBLE_WIDTH,
  isPetColor,
  isPetShape,
  normalizePetBubbleDismissSec,
  normalizePetBubbleShape,
  normalizePetBubbleStyle,
  normalizePetExpression,
  petBubbleOffsetX,
  petOverlayOriginForSize,
  type PetFocus,
  type PetTask,
} from "@/lib/pet";
import { isDesktopHost } from "./host";

export type PetPrefs = {
  enabled: boolean;
  visible: boolean;
  shape: string;
  color: string;
  eyeColor?: string;
  expression?: string;
  bubblesEnabled?: boolean;
  progressBarEnabled?: boolean;
  bubbleDismissSec?: number;
  bubbleShape?: string;
  bubbleStyle?: string;
  sizePx: number;
  x?: number | null;
  y?: number | null;
  overlayW?: number | null;
  overlayH?: number | null;
};

export const PET_PREFS_FALLBACK: PetPrefs = {
  enabled: false,
  visible: false,
  shape: "hex",
  color: "black",
  eyeColor: "auto",
  expression: "neutre",
  bubblesEnabled: true,
  progressBarEnabled: false,
  bubbleDismissSec: PET_BUBBLE_DISMISS_DEFAULT,
  bubbleShape: "round",
  bubbleStyle: "ink",
  sizePx: 128,
};

type PetBootGlobals = {
  __GROK_PET_BOOT__?: Partial<PetPrefs>;
};

/** First-paint prefs from the overlay init script (saved color, no green flash). */
export function readPetBootPrefs(): PetPrefs {
  const fallback: PetPrefs = {
    ...PET_PREFS_FALLBACK,
    enabled: true,
    visible: true,
  };
  if (typeof window === "undefined") return fallback;
  const raw = (window as unknown as PetBootGlobals).__GROK_PET_BOOT__;
  if (!raw || typeof raw !== "object") return fallback;
  return {
    ...fallback,
    ...raw,
    shape: isPetShape(raw.shape) ? raw.shape : fallback.shape,
    color: isPetColor(raw.color) ? raw.color : fallback.color,
    expression: normalizePetExpression(raw.expression),
    sizePx: raw.sizePx || fallback.sizePx,
    bubbleDismissSec: normalizePetBubbleDismissSec(raw.bubbleDismissSec),
    bubbleShape: normalizePetBubbleShape(raw.bubbleShape),
    bubbleStyle: normalizePetBubbleStyle(raw.bubbleStyle),
  };
}

/** Host overlay policy — compact idle + manual nudge drag on Electron. */
export type PetOverlayPolicy = {
  compactIdle: boolean;
  cursorClickThrough: boolean;
};

export const PET_OVERLAY_POLICY_FULL: PetOverlayPolicy = {
  compactIdle: false,
  cursorClickThrough: true,
};

/**
 * Last known prefs cache. `PetPrefs` is fetched over IPC (async), so a remount
 * that resets to `PET_PREFS_FALLBACK` would flash the fallback color before the
 * saved prefs arrive. Keep the most recent value here so re-entering the pet
 * settings surface starts from the persisted color instead.
 */
let petPrefsCache: PetPrefs | undefined;

/** Synchronous peek at the last known prefs (undefined before the first load). */
export function getPetPrefsCache(): PetPrefs | undefined {
  return petPrefsCache;
}

export async function petPrefsGet(): Promise<PetPrefs> {
  if (!isDesktopHost()) return { ...PET_PREFS_FALLBACK };
  const prefs = await window.zeno.pet.getPrefs();
  petPrefsCache = prefs;
  return prefs;
}

export async function petPrefsSet(prefs: PetPrefs): Promise<PetPrefs> {
  if (!isDesktopHost()) return prefs;
  const saved = await window.zeno.pet.setPrefs(prefs);
  petPrefsCache = saved;
  return saved;
}

export async function petShow(): Promise<PetPrefs> {
  if (!isDesktopHost()) return petPrefsGet();
  const saved = await window.zeno.pet.show();
  petPrefsCache = saved;
  return saved;
}

export async function petHide(): Promise<PetPrefs> {
  if (!isDesktopHost()) return petPrefsGet();
  const saved = await window.zeno.pet.hide();
  petPrefsCache = saved;
  return saved;
}

/** Flip visibility: `/pet` in the composer. Hides when shown, shows otherwise. */
export async function petToggle(): Promise<PetPrefs> {
  if (!isDesktopHost()) return petPrefsGet();
  const saved = await window.zeno.pet.toggle();
  petPrefsCache = saved;
  return saved;
}

export async function petPushFocus(focus: PetFocus): Promise<void> {
  if (!isDesktopHost()) return;
  await window.zeno.pet.pushFocus({
    kind: focus.kind,
    sessionId: focus.sessionId,
    title: focus.title,
    toolTitle: focus.toolTitle,
    rank: focus.rank,
    updatedAt: focus.updatedAt,
    composing: focus.composing === true,
  });
}

export async function petPushTasks(tasks: readonly PetTask[]): Promise<void> {
  if (!isDesktopHost()) return;
  await window.zeno.pet.pushTasks(
    tasks.map((task) => ({
      sessionId: task.sessionId,
      title: task.title,
      snippet: task.snippet,
      toolTitle: task.toolTitle,
      kind: task.kind,
      phase: task.phase,
      progress: task.progress,
      updatedAt: task.updatedAt,
    })),
  );
}

export async function petGetTasks(): Promise<PetTask[]> {
  if (!isDesktopHost()) return [];
  const raw = await window.zeno.pet.getTasks();
  if (!Array.isArray(raw)) return [];
  return raw;
}

export async function petGetFocus(): Promise<PetFocus | null> {
  if (!isDesktopHost()) return null;
  return window.zeno.pet.getFocus();
}

export async function petOpenSettings(): Promise<void> {
  if (!isDesktopHost()) return;
  await window.zeno.pet.openSettings();
}

export async function petFocusSession(sessionId: string): Promise<void> {
  if (!isDesktopHost()) return;
  await window.zeno.pet.focusSession(sessionId);
}

export async function petShowMain(): Promise<void> {
  if (!isDesktopHost()) return;
  await window.zeno.pet.showMain();
}

export type PetHitChrome = {
  markCx: number;
  markCy: number;
  markR: number;
  bubbleX: number;
  bubbleY: number;
  bubbleW: number;
  bubbleH: number;
  windowW: number;
  windowH: number;
};

export async function petSetHitChrome(chrome: PetHitChrome): Promise<void> {
  if (!isDesktopHost()) return;
  await window.zeno.pet.setHitChrome(chrome);
}

type WorkRect = { x: number; y: number; w: number; h: number };

export type PetOverlayFrame = {
  winX: number;
  winY: number;
  overlayW: number;
  overlayH: number;
  work: WorkRect;
};

/**
 * Resize the overlay. Keep the mark (bottom-center) still so reserved bubble
 * space grows around the pet instead of shoving it. Reopen uses the same rule.
 */
export async function petSyncOverlaySize(w: number, h: number): Promise<void> {
  if (!isDesktopHost()) return;
  try {
    const frame = await window.zeno.pet.readFrame();
    if (!frame) return;
    const curW = frame.overlayW;
    const curH = frame.overlayH;
    if (Math.abs(curW - w) < 1 && Math.abs(curH - h) < 1) return;
    const next = petOverlayOriginForSize({
      x: frame.winX,
      y: frame.winY,
      curW,
      curH,
      nextW: w,
      nextH: h,
    });
    await window.zeno.pet.syncSize({ x: next.x, y: next.y, width: w, height: h });
  } catch {
    /* best-effort */
  }
}

/** Overlay position + monitor work area, in logical CSS pixels. */
export async function petReadOverlayFrame(): Promise<PetOverlayFrame | null> {
  if (!isDesktopHost()) return null;
  try {
    return await window.zeno.pet.readFrame();
  } catch {
    return null;
  }
}

export async function petReadBubbleOffset(maxOffset: number): Promise<number> {
  if (!isDesktopHost()) return 0;
  try {
    const frame = await window.zeno.pet.readFrame();
    if (!frame) return 0;
    const markX = frame.winX + frame.overlayW / 2;
    return petBubbleOffsetX({
      leftGap: markX - frame.work.x,
      rightGap: frame.work.x + frame.work.w - markX,
      bubbleWidth: PET_BUBBLE_WIDTH,
      maxOffset,
    });
  } catch {
    return 0;
  }
}

export async function petSetDragging(dragging: boolean): Promise<void> {
  if (!isDesktopHost()) return;
  await window.zeno.pet.setDragging(dragging);
}

export async function petSetMenuOpen(open: boolean): Promise<void> {
  if (!isDesktopHost()) return;
  await window.zeno.pet.setMenuOpen(open);
}

export async function petSetIgnoreCursor(ignore: boolean): Promise<void> {
  if (!isDesktopHost()) return;
  await window.zeno.pet.setIgnoreCursor(ignore);
}

export async function petStartDragging(): Promise<void> {
  if (!isDesktopHost()) return;
  await window.zeno.pet.startDragging();
}

/** Move the overlay by logical CSS pixels (no compositor grab). */
export async function petNudge(dx: number, dy: number): Promise<void> {
  if (!isDesktopHost()) return;
  if (!dx && !dy) return;
  await window.zeno.pet.nudge(dx, dy);
}

export async function petWebviewReady(): Promise<PetOverlayPolicy> {
  if (!isDesktopHost()) return PET_OVERLAY_POLICY_FULL;
  return window.zeno.pet.policy();
}

export async function petOverlayPolicy(): Promise<PetOverlayPolicy> {
  if (!isDesktopHost()) return PET_OVERLAY_POLICY_FULL;
  return window.zeno.pet.policy();
}
