import { describe, expect, it } from "vite-plus/test";
import {
  formatResetCountdown,
  formatWindowDuration,
  remainingPercent,
  usageTone,
} from "./auth-usage-limits.ts";

describe("live provider usage display", () => {
  it("derives clamped remaining quota and warning tones", () => {
    expect(remainingPercent({ usedPercent: 27.4 })).toBeCloseTo(72.6);
    expect(remainingPercent({ usedPercent: 120 })).toBe(0);
    expect(usageTone({ usedPercent: 69 })).toBe("healthy");
    expect(usageTone({ usedPercent: 70 })).toBe("warning");
    expect(usageTone({ usedPercent: 90 })).toBe("danger");
  });

  it("formats real reset times instead of static period descriptions", () => {
    const now = Date.parse("2026-07-22T00:00:00.000Z");
    expect(formatResetCountdown("2026-07-24T03:00:00.000Z", "zh", now)).toBe("2天 3小时后重置");
    expect(formatResetCountdown("2026-07-22T01:30:00.000Z", "en", now)).toBe("Resets in 1h 30m");
    expect(formatResetCountdown("2026-07-21T23:59:00.000Z", "zh", now)).toBe("即将重置");
    expect(formatResetCountdown("invalid", "en", now)).toBeUndefined();
  });

  it("uses a provider window only when no reset timestamp is available", () => {
    expect(formatWindowDuration(300, "zh")).toBe("5小时窗口");
    expect(formatWindowDuration(10_080, "en")).toBe("7d window");
    expect(formatWindowDuration(undefined, "en")).toBeUndefined();
  });
});
