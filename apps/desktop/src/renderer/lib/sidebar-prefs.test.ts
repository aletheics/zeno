import { describe, expect, it } from "vite-plus/test";
import {
  OPENCOWORK_DARK,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_DEFAULT_TRANSLUCENT,
  SIDEBAR_TRANSLUCENT_MIX_PERCENT,
  clampSidebarWidth,
  composerLeftOffsetInMainColumn,
  mainColumnLeftForRail,
  shellMainWidth,
  sidebarRailWidth,
} from "./sidebar-prefs.ts";

describe("sidebar prefs helpers", () => {
  it("clamps width and reports full collapse (width 0, not icon rail)", () => {
    expect(clampSidebarWidth(100)).toBe(232);
    expect(clampSidebarWidth(400)).toBe(360);
    expect(clampSidebarWidth(280)).toBe(280);
    expect(SIDEBAR_COLLAPSED_WIDTH).toBe(0);
    expect(sidebarRailWidth(true, 280)).toBe(0);
    expect(sidebarRailWidth(false, 280)).toBe(280);
    expect(SIDEBAR_DEFAULT_TRANSLUCENT).toBe(true);
    expect(SIDEBAR_TRANSLUCENT_MIX_PERCENT).toBe(0);
  });

  it("matches OpenCowork dark hex references", () => {
    expect(OPENCOWORK_DARK.background).toBe("#191919");
    expect(OPENCOWORK_DARK.sidebar).toBe("#151515");
    expect(OPENCOWORK_DARK.sidebarAccent).toBe("#252525");
    expect(OPENCOWORK_DARK.sidebarBorder).toBe("#303030");
  });

  it("composer left inside main-column is 0 (no double-count of sidebar)", () => {
    // Grid places main column after the rail; absolute composer must not add rail width again.
    expect(composerLeftOffsetInMainColumn()).toBe(0);
    expect(mainColumnLeftForRail(272)).toBe(272);
    expect(mainColumnLeftForRail(SIDEBAR_COLLAPSED_WIDTH)).toBe(0);
    // Bug regression: left = mainLeft + rail would be 544 for a 272 rail.
    const rail = 272;
    const wrongDoubleCount = mainColumnLeftForRail(rail) + rail;
    expect(wrongDoubleCount).toBe(544);
    expect(mainColumnLeftForRail(rail) + composerLeftOffsetInMainColumn()).toBe(272);
  });

  it("shell-main fills remaining width after the rail (full width when collapsed)", () => {
    expect(shellMainWidth(1440, 272)).toBe(1168);
    expect(shellMainWidth(1440, SIDEBAR_COLLAPSED_WIDTH)).toBe(1440);
    // Must not leave a residual strip: rail + main === shell
    const rail = 280;
    expect(mainColumnLeftForRail(rail) + shellMainWidth(1440, rail)).toBe(1440);
    expect(mainColumnLeftForRail(0) + shellMainWidth(1440, 0)).toBe(1440);
  });
});
