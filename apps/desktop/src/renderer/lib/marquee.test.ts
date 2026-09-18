import { describe, expect, it } from "vite-plus/test";
import {
  marqueeDistancePx,
  marqueeDurationMs,
  MARQUEE_MAX_DURATION_MS,
  MARQUEE_MIN_DURATION_MS,
  MARQUEE_OVERFLOW_EPSILON_PX,
  MARQUEE_SPEED_PX_PER_SECOND,
  MARQUEE_TRAVEL_FRACTION,
  shouldMarquee,
} from "./marquee.ts";

describe("shouldMarquee", () => {
  it("is false when the text fits", () => {
    expect(shouldMarquee({ scrollWidth: 80, clientWidth: 120 })).toBe(false);
    expect(shouldMarquee({ scrollWidth: 120, clientWidth: 120 })).toBe(false);
  });

  it("ignores a fractional difference but not a whole pixel", () => {
    // scrollWidth comes back fractional from layout; text that visibly fits must not
    // animate because of a half pixel.
    expect(shouldMarquee({ scrollWidth: 120.5, clientWidth: 120 })).toBe(false);
    expect(
      shouldMarquee({ scrollWidth: 120 + MARQUEE_OVERFLOW_EPSILON_PX, clientWidth: 120 }),
    ).toBe(false);
    // A whole pixel of clipping is real, if barely visible.
    expect(shouldMarquee({ scrollWidth: 121, clientWidth: 120 })).toBe(true);
  });

  it("is true once the text genuinely overflows", () => {
    expect(shouldMarquee({ scrollWidth: 400, clientWidth: 120 })).toBe(true);
  });
});

describe("marqueeDistancePx", () => {
  it("is the amount hidden, and never negative", () => {
    expect(marqueeDistancePx({ scrollWidth: 400, clientWidth: 120 })).toBe(280);
    expect(marqueeDistancePx({ scrollWidth: 80, clientWidth: 120 })).toBe(0);
  });

  it("is 0 rather than NaN when a measurement is unavailable", () => {
    // scrollWidth/clientWidth are 0 before layout; NaN would poison the CSS variable.
    expect(marqueeDistancePx({ scrollWidth: Number.NaN, clientWidth: 120 })).toBe(0);
    expect(marqueeDistancePx({ scrollWidth: 400, clientWidth: Number.NaN })).toBe(0);
  });
});

describe("marqueeDurationMs", () => {
  it("is one traversal, not a round trip", () => {
    // 300px at 30px/s travels in 10s; stretched to fill the travelling share of the cycle.
    expect(marqueeDurationMs(300)).toBe(
      Math.round(((300 / MARQUEE_SPEED_PX_PER_SECOND) * 1000) / MARQUEE_TRAVEL_FRACTION),
    );
  });

  it("scales with distance", () => {
    const short = marqueeDurationMs(60);
    const long = marqueeDurationMs(600);
    expect(long).toBeGreaterThan(short);
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
