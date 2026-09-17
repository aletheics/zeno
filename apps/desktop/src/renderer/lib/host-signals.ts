/**
 * Interpreting what the host and agent host tell us.
 *
 * These read opaque strings rather than structured errors, so they are coupled to wording
 * produced elsewhere — and that coupling is deliberately not greppable in one case:
 * `main/index.ts` builds the abort-timeout message as
 * `` `Agent Host timed out handling ${command.type}` ``, so the string
 * "timed out handling agent.abort" appears nowhere in the source. Grepping for it finds
 * nothing and invites deleting a live branch. The tests pin the strings as they are
 * actually produced at runtime; change the producer and they will fail.
 */

export function unknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "";
}

/** Host still mid-turn while UI thought it was idle (stale running flag / prior IPC orphan). */
export function isAlreadyProcessingError(error: unknown): boolean {
  const message = unknownErrorMessage(error);
  return /already processing/i.test(message);
}

/** Abort timed out and main recycled the host — in-flight prompt IPC is expected to die. */
export function isAbortRecycleError(error: unknown): boolean {
  const message = unknownErrorMessage(error);
  return /recycled after abort|timed out handling agent\.abort/i.test(message);
}

export function hostPillState(status: string, running: boolean): string {
  if (running) return "running";
  const lower = status.toLowerCase();
  if (lower.includes("ready") || lower.includes("settled") || lower.includes("restarted"))
    return "ready";
  if (lower.includes("exit") || lower.includes("fail") || lower.includes("crash")) return "error";
  return "idle";
}
