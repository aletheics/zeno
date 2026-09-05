/**
 * Pet overlay paint cadence. The living mark used to sample + React-commit
 * every rAF (~60fps) while Rust broadcast `pet://cursor` ~15Hz to every
 * webview. On Windows WebView2 that transparent always-on-top path stalls
 * after a long day; restarting the app clears the compositor.
 */

export const PET_PAINT_SPIN_MS = 16;
export const PET_PAINT_LIVE_MS = 33;
export const PET_PAINT_IDLE_MS = 50;
export const PET_PAINT_REST_MS = 120;
export const PET_PAINT_REST_AFTER_MS = 20_000;
export const PET_LOOK_LOCAL_HOLD_MS = 280;
/** Screen-space look expires without a fresh event: a parked cursor must let
 * the overlay fall back to the idle/rest paint tier (Rust stops emitting once
 * the quantized cursor delta stops changing). */
export const PET_LOOK_SCREEN_HOLD_MS = 2_000;
export const PET_LOOK_NEAR_SCALE = 1.35;

export function petPaintMinMs(input: {
  spinning: boolean;
  morphing: boolean;
  trackingLook: boolean;
  catalogLive?: boolean;
  idleMs: number;
}): number {
  if (input.spinning || input.morphing) return PET_PAINT_SPIN_MS;
  if (input.trackingLook || input.catalogLive) return PET_PAINT_LIVE_MS;
  if (input.idleMs >= PET_PAINT_REST_AFTER_MS) return PET_PAINT_REST_MS;
  return PET_PAINT_IDLE_MS;
}

/** Look stays valid while events are fresh AND (for screen space) near the mark. */
export function petLookIsNear(input: {
  fromScreen: boolean;
  at: number;
  now: number;
  dx: number;
  dy: number;
  localR: number;
  localHoldMs?: number;
  screenHoldMs?: number;
}): boolean {
  if (!(input.at > 0)) return false;
  if (
    input.now - input.at >=
    (input.fromScreen
      ? (input.screenHoldMs ?? PET_LOOK_SCREEN_HOLD_MS)
      : (input.localHoldMs ?? PET_LOOK_LOCAL_HOLD_MS))
  ) {
    return false;
  }
  if (input.fromScreen) {
    return Math.hypot(input.dx, input.dy) <= Math.max(1, input.localR) * PET_LOOK_NEAR_SCALE;
  }
  return true;
}

export type PetLookBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Radius-normalized look axes while the pointer is inside the local hover
 * ring. `null` when the event is stale or the pointer is outside that ring.
 *
 * Overlay (`fromScreen`): `dx`/`dy` are already mark-relative pixels.
 * In-window: `dx`/`dy` are client coordinates and need `box`.
 */
export function petLocalLookAxes(input: {
  fromScreen: boolean;
  at: number;
  now: number;
  dx: number;
  dy: number;
  localR: number;
  box?: PetLookBox | null;
}): { nx: number; ny: number } | null {
  if (
    !petLookIsNear({
      fromScreen: input.fromScreen,
      at: input.at,
      now: input.now,
      dx: input.dx,
      dy: input.dy,
      localR: input.localR,
    })
  ) {
    return null;
  }
  if (input.fromScreen) {
    const r = Math.max(1, input.localR);
    return { nx: input.dx / r, ny: input.dy / r };
  }
  const box = input.box;
  if (!box || !(box.width > 0) || !(box.height > 0)) return null;
  const radius = Math.max(1, Math.min(box.width, box.height) / 2);
  const nx = (input.dx - (box.left + box.width / 2)) / radius;
  const ny = (input.dy - (box.top + box.height / 2)) / radius;
  if (Math.hypot(nx, ny) > PET_LOOK_NEAR_SCALE) return null;
  return { nx, ny };
}
