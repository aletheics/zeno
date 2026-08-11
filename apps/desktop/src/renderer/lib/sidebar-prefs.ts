import { SHELL_SIDEBAR } from "./layout.ts";

/** Fully tucked away — no icon rail; expand control is fixed after traffic lights. */
export const SIDEBAR_COLLAPSED_WIDTH = 0;
export const SIDEBAR_DEFAULT_TRANSLUCENT = true;

export function clampSidebarWidth(px: number): number {
  if (!Number.isFinite(px)) return SHELL_SIDEBAR.defaultPx;
  return Math.min(SHELL_SIDEBAR.maxPx, Math.max(SHELL_SIDEBAR.minPx, Math.round(px)));
}

export function sidebarRailWidth(collapsed: boolean, widthPx: number): number {
  return collapsed ? SIDEBAR_COLLAPSED_WIDTH : clampSidebarWidth(widthPx);
}

/**
 * Composer sits in-flow at the bottom of the thread column (content area ends above it).
 * Horizontal inset inside that content column is always 0 (sidebar overlay uses paddingLeft).
 */
export function composerLeftOffsetInMainColumn(): number {
  return 0;
}

/** Content column left inset equals overlay rail width (paddingLeft on shell-main). */
export function mainColumnLeftForRail(railWidthPx: number): number {
  return Math.max(0, Math.round(railWidthPx));
}

/** Content column width for a shell of given size (must fill remaining, not shrink-to-content). */
export function shellMainWidth(shellWidthPx: number, railWidthPx: number): number {
  return Math.max(0, Math.round(shellWidthPx) - Math.round(railWidthPx));
}

/** Web-layer tint over native vibrancy (for unit/structural checks). */
export const SIDEBAR_TRANSLUCENT_MIX_PERCENT = 0;

/** OpenCowork-aligned dark shell hex values (for unit/structural checks). */
/** Exact OpenCowork `.dark` shell palette (main.css). */
export const OPENCOWORK_DARK = {
  background: "#191919",
  sidebar: "#151515",
  sidebarAccent: "#252525",
  sidebarBorder: "#303030",
  card: "#242424",
  border: "#3a3a3a",
  muted: "#222222",
  secondary: "#2b2b2b",
} as const;
