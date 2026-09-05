import type { PetKind } from "./petFocus";
import type { PetTask } from "./petTasks";

/** Done-chip ids currently on the overlay. */
export function petDoneTaskIds(tasks: readonly PetTask[]): string[] {
  const ids: string[] = [];
  for (const row of tasks) {
    if (row.phase === "done" && row.sessionId) ids.push(row.sessionId);
  }
  return ids;
}

/**
 * Fire the colorful spin once when a turn actually finishes.
 * Skip the first snapshot so opening the pet on an already-ready chat
 * does not replay the celebration. Mid-turn chips and peer completions
 * while another session is still live must not retrigger ribbons.
 *
 * `working → idle` still celebrates: the workbench may already have the
 * chat in view, so focus never becomes unread-ready.
 */
export function shouldTriggerPetSpin(input: {
  primed: boolean;
  prevKind: PetKind | null;
  nextKind: PetKind;
  prevDoneIds?: ReadonlySet<string>;
  nextDoneIds?: ReadonlySet<string>;
}): boolean {
  if (!input.primed) return false;
  if (
    input.nextKind === "working" ||
    input.nextKind === "needs_you" ||
    input.nextKind === "connecting" ||
    input.nextKind === "error"
  ) {
    return false;
  }
  if (input.nextKind === "ready" && input.prevKind !== "ready") return true;
  if (
    (input.prevKind === "working" || input.prevKind === "needs_you") &&
    input.nextKind === "idle"
  ) {
    return true;
  }
  const prevDone = input.prevDoneIds;
  const nextDone = input.nextDoneIds;
  if (prevDone && nextDone) {
    for (const id of nextDone) {
      if (!prevDone.has(id)) return true;
    }
  }
  return false;
}
