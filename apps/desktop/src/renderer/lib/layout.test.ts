import { describe, expect, it } from "vite-plus/test";
import {
  SHELL_COMPOSER,
  SHELL_DENSITY,
  SHELL_REVIEW,
  SHELL_SIDEBAR,
  SHELL_THREAD,
  SHELL_WINDOW,
  clampThreadContentWidth,
  isValidSidebarWidth,
} from "./layout.ts";

describe("shell layout constants (ui-spec / Codex-like density)", () => {
  it("matches ui-spec window and sidebar metrics", () => {
    expect(SHELL_WINDOW.defaultWidth).toBe(1440);
    expect(SHELL_WINDOW.defaultHeight).toBe(900);
    expect(SHELL_WINDOW.minWidth).toBe(760);
    expect(SHELL_SIDEBAR.defaultPx).toBe(300);
    expect(isValidSidebarWidth(300)).toBe(true);
    expect(isValidSidebarWidth(200)).toBe(false);
    expect(isValidSidebarWidth(400)).toBe(false);
  });

  it("caps thread content and sizes review/composer per ui-spec", () => {
    expect(SHELL_THREAD.contentMaxPx).toBeGreaterThanOrEqual(760);
    expect(SHELL_THREAD.contentMaxPx).toBeLessThanOrEqual(860);
    expect(clampThreadContentWidth(700)).toBe(760);
    expect(clampThreadContentWidth(900)).toBe(860);
    expect(clampThreadContentWidth(820)).toBe(820);
    expect(SHELL_REVIEW.defaultPx).toBe(480);
    expect(SHELL_COMPOSER.maxHeightPx).toBe(220);
    expect(SHELL_DENSITY.sidebarRowHeightPx).toBe(32);
    expect(SHELL_DENSITY.controlHeightPx).toBe(32);
  });
});
