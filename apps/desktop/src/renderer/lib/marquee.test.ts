import { describe, expect, it } from "vite-plus/test";
import {
  marqueeDurationMs,
  MARQUEE_MAX_DURATION_MS,
  MARQUEE_MIN_DURATION_MS,
  MARQUEE_OVERFLOW_EPSILON_PX,
  MARQUEE_SPEED_PX_PER_SECOND,
  shouldMarquee,
} from "./marquee.ts";

describe("shouldMarquee", () => {
  it("is false when the text fits", () => {
    expect(shouldMarquee({ scrollWidth: 80, clientWidth: 120 })).toBe(false);
    expect(shouldMarquee({ scrollWidth: 120, clientWidth: 120 })).toBe(false);
  });

  it("ignores a fractional difference but not a whole pixel", () => {
    // Layout reports fractional widths; a label that visibly fits must not start scrolling
    // over a half pixel.
    expect(shouldMarquee({ scrollWidth: 120.5, clientWidth: 120 })).toBe(false);
    expect(
      shouldMarquee({ scrollWidth: 120 + MARQUEE_OVERFLOW_EPSILON_PX, clientWidth: 120 }),
    ).toBe(false);
    expect(shouldMarquee({ scrollWidth: 121, clientWidth: 120 })).toBe(true);
  });

  it("is false rather than NaN-poisoned when a measurement is missing", () => {
    // Both read as 0 before layout, and an unmeasured label must simply not scroll.
    expect(shouldMarquee({ scrollWidth: Number.NaN, clientWidth: 120 })).toBe(false);
    expect(shouldMarquee({ scrollWidth: 400, clientWidth: Number.NaN })).toBe(false);
  });

  it("is true once the text genuinely overflows", () => {
    expect(shouldMarquee({ scrollWidth: 400, clientWidth: 120 })).toBe(true);
  });
});

describe("marqueeDurationMs", () => {
  it("is one traversal at the stated speed", () => {
    // The loop is seamless, so a cycle is exactly one copy's advance — no return leg and no
    // pause to account for.
    expect(marqueeDurationMs(300)).toBe((300 / MARQUEE_SPEED_PX_PER_SECOND) * 1000);
    expect(marqueeDurationMs(600)).toBe(20_000);
  });

  it("scales with distance", () => {
    expect(marqueeDurationMs(300)).toBeGreaterThan(marqueeDurationMs(150));
  });

  it("holds a floor so a tiny overflow does not flicker", () => {
    expect(marqueeDurationMs(5)).toBe(MARQUEE_MIN_DURATION_MS);
    expect(marqueeDurationMs(0)).toBe(MARQUEE_MIN_DURATION_MS);
  });

  it("holds a ceiling so a very long title does not take forever", () => {
    expect(marqueeDurationMs(50_000)).toBe(MARQUEE_MAX_DURATION_MS);
  });

  it("is a whole number of milliseconds, suitable for a CSS custom property", () => {
    expect(Number.isInteger(marqueeDurationMs(137))).toBe(true);
  });
});
