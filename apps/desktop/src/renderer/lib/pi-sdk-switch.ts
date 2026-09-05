/**
 * Pure decision logic for the Pi SDK source-switch confirmation dialog.
 * Extracted from PiSdkSection so the subtle force/retry semantics are testable.
 */
import type { PiSdkSource } from "@zeno/contracts";

export type SwitchConfirm =
  | { kind: "pre"; source: PiSdkSource; message: string; isBusy: boolean }
  | { kind: "retry"; source: PiSdkSource; message: string };

/** Errors tagged by the main process when a switch is refused because Pi is busy. */
export function isBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith("PI_SDK_BUSY:");
}

/** Whether to force the switch past the busy check. A retry is always forced. */
export function forceForSwitch(pending: SwitchConfirm): boolean {
  return pending.kind === "pre" ? pending.isBusy : true;
}

/** A busy refusal on the first ("pre") attempt should re-open the dialog as a retry. */
export function shouldRetryOnBusy(pending: SwitchConfirm, error: unknown): boolean {
  return pending.kind === "pre" && isBusyError(error);
}
