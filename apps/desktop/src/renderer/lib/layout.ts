/**
 * Shell layout metrics from docs/ui-spec.md (Codex-desktop-like IA density).
 * Pure constants — unit-tested without Electron.
 */

/** Default application window size (ui-spec §4.1). */
export const SHELL_WINDOW = {
  defaultWidth: 1440,
  defaultHeight: 900,
  minWidth: 760,
  minHeight: 560,
} as const;

/** Sidebar width band (ui-spec §4.1). */
export const SHELL_SIDEBAR = {
  defaultPx: 300,
  minPx: 232,
  maxPx: 360,
} as const;

/** Main thread column (ui-spec §4.1). */
export const SHELL_THREAD = {
  contentMaxPx: 820,
  contentMinPx: 760,
  contentMaxPxCap: 860,
} as const;

/** Review / changes panel (ui-spec §4.1). */
export const SHELL_REVIEW = {
  defaultPx: 480,
  minPx: 380,
  maxPx: 640,
} as const;

/** Composer dock (ui-spec §4.1 / §6). */
export const SHELL_COMPOSER = {
  maxHeightPx: 220,
  emptyWidthPx: 720,
} as const;

/** Control density baseline (ui-spec §16). */
export const SHELL_DENSITY = {
  controlHeightPx: 32,
  primaryButtonHeightPx: 36,
  sidebarRowHeightPx: 32,
  bodyFontPx: 14,
  metaFontPx: 12,
  radiusSmPx: 6,
  radiusMdPx: 8,
  radiusLgPx: 12,
  spacingGridPx: 4,
} as const;

export function isValidSidebarWidth(px: number): boolean {
  return px >= SHELL_SIDEBAR.minPx && px <= SHELL_SIDEBAR.maxPx;
}

export function clampThreadContentWidth(px: number): number {
  if (px < SHELL_THREAD.contentMinPx) return SHELL_THREAD.contentMinPx;
  if (px > SHELL_THREAD.contentMaxPxCap) return SHELL_THREAD.contentMaxPxCap;
  return px;
}
