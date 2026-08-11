import { describe, expect, it } from "vite-plus/test";
import {
  ENV_PANEL_CONTENT_IDEAL_PX,
  ENV_PANEL_EDGE_GAP_PX,
  ENV_PANEL_MIN_CONTENT_PX,
  ENV_PANEL_WIDTH_PX,
  envPanelLayoutForWidth,
} from "./EnvPanel.tsx";

describe("envPanelLayoutForWidth", () => {
  const panelBudget = ENV_PANEL_WIDTH_PX + ENV_PANEL_EDGE_GAP_PX;

  it("floats when right gutter can hold the panel without covering 760px content", () => {
    // sideGutter = (W - 760) / 2 >= panelBudget → W >= 760 + 2 * panelBudget
    const minFloat = ENV_PANEL_CONTENT_IDEAL_PX + 2 * panelBudget;
    expect(envPanelLayoutForWidth(minFloat)).toBe("float");
    expect(envPanelLayoutForWidth(minFloat + 100)).toBe("float");
  });

  it("docks (squeezes) when panel would cover content but min widths still fit", () => {
    const minDock = ENV_PANEL_MIN_CONTENT_PX + panelBudget;
    expect(envPanelLayoutForWidth(minDock)).toBe("dock");
    // Mid width: not enough side gutter for float, enough for dock
    expect(envPanelLayoutForWidth(1100)).toBe("dock");
  });

  it("returns none when conversation + panel cannot both fit", () => {
    const minDock = ENV_PANEL_MIN_CONTENT_PX + panelBudget;
    expect(envPanelLayoutForWidth(minDock - 1)).toBe("none");
    expect(envPanelLayoutForWidth(400)).toBe("none");
  });
});
