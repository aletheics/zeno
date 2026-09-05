/**
 * Place the pet overlay context menu at the right-click, then shift only
 * enough to stay on the *visible* slice of the overlay (screen work area
 * ∩ webview). Do not teleport to the mark or a window corner.
 *
 * The overlay is wider than the mark. A webview-only clamp can still paint
 * the menu in the off-screen half; the work-area intersection prevents that.
 * If that intersection is degenerate (unit mismatch), fall back to the overlay.
 */

export type PetWorkRect = { x: number; y: number; w: number; h: number };

export function placePetContextMenu(input: {
  overlayW: number;
  overlayH: number;
  clickX: number;
  clickY: number;
  menuW: number;
  menuH: number;
  winX: number;
  winY: number;
  work: PetWorkRect;
  pad?: number;
}): { left: number; top: number } {
  const pad = input.pad ?? 8;
  const overlayW = Math.max(1, input.overlayW);
  const overlayH = Math.max(1, input.overlayH);

  let visLeft = Math.max(pad, input.work.x + pad - input.winX);
  let visRight = Math.min(overlayW - pad, input.work.x + input.work.w - pad - input.winX);
  let visTop = Math.max(pad, input.work.y + pad - input.winY);
  let visBottom = Math.min(overlayH - pad, input.work.y + input.work.h - pad - input.winY);

  const menuW = Math.max(1, input.menuW);
  const menuH = Math.max(1, input.menuH);
  if (visRight - visLeft < menuW || visBottom - visTop < menuH) {
    visLeft = pad;
    visRight = overlayW - pad;
    visTop = pad;
    visBottom = overlayH - pad;
  }

  const visW = Math.max(1, visRight - visLeft);
  const visH = Math.max(1, visBottom - visTop);
  const w = Math.min(menuW, visW);
  const h = Math.min(menuH, visH);

  return {
    left: Math.max(visLeft, Math.min(input.clickX, visRight - w)),
    top: Math.max(visTop, Math.min(input.clickY, visBottom - h)),
  };
}
