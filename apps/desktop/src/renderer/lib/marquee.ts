/**
 * When a label is too long for its row, and how fast to slide it.
 *
 * The decision is separated from the measuring because measurement needs a layout engine
 * while the arithmetic does not: the component supplies two numbers, everything that can
 * be got wrong lives here and is tested.
 */

/**
 * Fractional overflow tolerated as layout rounding. Sub-pixel, so a genuine one-pixel
 * overflow still animates — this absorbs the halves that `scrollWidth` reports, not real
 * clipping.
 */
export const MARQUEE_OVERFLOW_EPSILON_PX = 0.5;

/** Slow enough to read while it moves. */
export const MARQUEE_SPEED_PX_PER_SECOND = 30;

/**
 * Share of a cycle spent travelling; the rest is the pause at the end before it loops.
 * The keyframes in `styles.css` encode this same fraction — change one, change both.
 */
export const MARQUEE_TRAVEL_FRACTION = 0.85;

/** Bounds so a two-word overflow does not crawl and a paragraph does not sprint. */
export const MARQUEE_MIN_DURATION_MS = 3_000;
export const MARQUEE_MAX_DURATION_MS = 20_000;

export type MarqueeMetrics = {
  /** Width of the text if it were laid out unclipped. */
  scrollWidth: number;
  /** Width actually available. */
  clientWidth: number;
};

/** True once the text genuinely exceeds its box. */
export function shouldMarquee(metrics: MarqueeMetrics): boolean {
  return marqueeDistancePx(metrics) > MARQUEE_OVERFLOW_EPSILON_PX;
}

/** How far the text has to travel to show its end, in px. Never negative. */
export function marqueeDistancePx(metrics: MarqueeMetrics): number {
  const { scrollWidth, clientWidth } = metrics;
  if (!Number.isFinite(scrollWidth) || !Number.isFinite(clientWidth)) return 0;
  return Math.max(0, scrollWidth - clientWidth);
}

/**
 * One cycle: out to the end, pause, then loop back to the start.
 *
 * Single direction, so a cycle is one traversal rather than a round trip. The travel is
 * stretched to fill `MARQUEE_TRAVEL_FRACTION` of the cycle, which keeps the advertised
 * speed honest even though the animation spends the remaining share holding still.
 */
export function marqueeDurationMs(distancePx: number): number {
  if (!Number.isFinite(distancePx) || distancePx <= 0) return MARQUEE_MIN_DURATION_MS;
  const travelMs = (distancePx / MARQUEE_SPEED_PX_PER_SECOND) * 1000;
  const cycleMs = travelMs / MARQUEE_TRAVEL_FRACTION;
  return Math.min(MARQUEE_MAX_DURATION_MS, Math.max(MARQUEE_MIN_DURATION_MS, Math.round(cycleMs)));
}
