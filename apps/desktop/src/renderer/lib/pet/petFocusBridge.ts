/**
 * Pet focus subscriptions — pix adaptation.
 *
 * zeno-update wired this to `sessionLiveMapStore` / `sessionFinishedTurns` /
 * `sessionUnread`. pix injects those sources (live map, unread ids, finished
 * turns) as callbacks so the focus/task computation stays verbatim while the
 * data comes from `useShellStore` (see `pixFocusSource`).
 */

import { resolvePetFocus, type PetFocus, type PetFocusSession } from "./petFocus";
import {
  collectPetTasks,
  mergeHeldPetTasks,
  samePetTasks,
  stripHeldPetTasks,
  type HeldPetTask,
  type PetTask,
} from "./petTasks";
import { PET_BUBBLE_DISMISS_DEFAULT } from "./petBubbleChrome";
import { petStageSnippetStore } from "./petStageSnippets";
import type { SessionLiveMap } from "./pixLiveModel";

export type PetFocusBridgeOpts = {
  isEnabled: () => boolean;
  getSessions: () => readonly PetFocusSession[];
  /** pix: live map projected from `useShellStore`. */
  getLiveMap: () => SessionLiveMap;
  /** pix: unread session ids. */
  getUnreadIds: () => ReadonlySet<string>;
  /** pix: finished-turn timestamps per session. */
  getFinishedTurns: () => Readonly<Record<string, number>>;
  subscribeLiveMap: (cb: () => void) => () => void;
  subscribeFinishedTurns: (cb: () => void) => () => void;
  onUnreadChange?: (cb: () => void) => () => void;
  push: (focus: PetFocus) => void;
  pushTasks?: (tasks: PetTask[]) => void;
  getSnippets?: () => Readonly<Record<string, string>>;
  getDismissMs?: () => number;
  getComposing?: () => boolean;
};

export type PetFocusBridge = {
  tick: () => void;
  stop: () => void;
};

export function startPetFocusBridge(opts: PetFocusBridgeOpts): PetFocusBridge {
  let prev: PetFocus | null = null;
  let prevTasks: PetTask[] = [];
  let held: HeldPetTask[] = [];
  let stopped = false;
  let expireTimer: ReturnType<typeof setInterval> | null = null;

  const dismissMs = () => {
    const n = opts.getDismissMs?.();
    return typeof n === "number" && n > 0 ? n : PET_BUBBLE_DISMISS_DEFAULT * 1000;
  };

  const stopExpire = () => {
    if (expireTimer != null) {
      clearInterval(expireTimer);
      expireTimer = null;
    }
  };

  const tick = () => {
    if (stopped || !opts.isEnabled()) return;
    const liveMap = opts.getLiveMap();
    for (const [id, snap] of Object.entries(liveMap)) {
      if (snap?.startedAt && petStageSnippetStore.pruneStale(id, snap.startedAt)) {
        held = held.filter((h) => h.sessionId !== id);
      }
    }
    const input = {
      liveMap,
      unreadIds: opts.getUnreadIds(),
      finishedTurns: opts.getFinishedTurns(),
      sessions: opts.getSessions(),
      snippets: opts.getSnippets?.() ?? petStageSnippetStore.getMap(),
    };
    const next: PetFocus = {
      ...resolvePetFocus(prev, input),
      composing: opts.getComposing?.() === true,
    };
    const live = collectPetTasks(input);
    held = mergeHeldPetTasks({
      held,
      live,
      now: Date.now(),
      dismissMs: dismissMs(),
    });
    if (held.some((h) => h.expireAt != null)) {
      if (expireTimer == null) {
        expireTimer = setInterval(() => tick(), 500);
      }
    } else {
      stopExpire();
    }
    const tasks = stripHeldPetTasks(held);
    if (opts.pushTasks && !samePetTasks(prevTasks, tasks)) {
      prevTasks = tasks;
      opts.pushTasks(tasks);
    }
    if (
      prev &&
      prev.kind === next.kind &&
      prev.sessionId === next.sessionId &&
      prev.toolTitle === next.toolTitle &&
      !!prev.composing === !!next.composing
    ) {
      prev = next;
      return;
    }
    prev = next;
    opts.push(next);
  };

  const unsubMap = opts.subscribeLiveMap(tick);
  const unsubFin = opts.subscribeFinishedTurns(tick);
  const unsubUnread = opts.onUnreadChange?.(tick);

  tick();

  return {
    tick,
    stop() {
      if (stopped) return;
      stopped = true;
      stopExpire();
      unsubMap();
      unsubFin();
      unsubUnread?.();
    },
  };
}
