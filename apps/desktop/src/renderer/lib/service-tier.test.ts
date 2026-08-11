import { describe, expect, it } from "vite-plus/test";
import {
  clampToAvailableServiceTier,
  migrateLegacySpeedToServiceTier,
  modelSupportsServiceTier,
  resolveDisplayServiceTiers,
} from "./service-tier.ts";

describe("service-tier UI helpers", () => {
  it("returns empty when model has no tiers", () => {
    expect(resolveDisplayServiceTiers(undefined)).toEqual([]);
    expect(resolveDisplayServiceTiers([])).toEqual([]);
    expect(modelSupportsServiceTier([])).toBe(false);
  });

  it("clamps to available tiers", () => {
    expect(clampToAvailableServiceTier("priority", ["flex", "default", "priority"])).toBe(
      "priority",
    );
    expect(clampToAvailableServiceTier("priority", ["default"])).toBe("default");
  });

  it("maps legacy speed labels to service_tier", () => {
    expect(migrateLegacySpeedToServiceTier("fast")).toBe("priority");
    expect(migrateLegacySpeedToServiceTier("balanced")).toBe("default");
    expect(migrateLegacySpeedToServiceTier("quality")).toBe("flex");
  });
});
