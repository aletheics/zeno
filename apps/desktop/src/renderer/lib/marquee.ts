/**
 * When a label is too long for its row, and how fast to scroll it.
 *
 * The label is rendered twice and the pair slides left by exactly one copy. Because the
 * second copy is identical, the instant the animation restarts looks the same as the
 * instant before it, so the loop has no seam. That makes the travel one copy's advance and
 * the keyframes a plain `0 → -50%` — there is no measured distance to feed back into CSS.
 *
 * The decision and the timing are separated from the measuring because measurement needs a
 * layout engine while the arithmetic does not: the component supplies numbers, everything
 * that can be got wrong lives here and is tested.
 */

/**
 * Fractional overflow tolerated as layout rounding. Sub-pixel, so a genuine one-pixel
 * overflow still scrolls — this absorbs the halves that layout reports, not real clipping.
 */
export const MARQUEE_OVERFLOW_EPSILON_PX = 0.5;

/** Slow enough to read while it moves. */
export const MARQUEE_SPEED_PX_PER_SECOND = 30;

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
  const { scrollWidth, clientWidth } = metrics;
  if (!Number.isFinite(scrollWidth) || !Number.isFinite(clientWidth)) return false;
  return scrollWidth - clientWidth > MARQUEE_OVERFLOW_EPSILON_PX;
}

/**
 * How long one cycle takes, for a travel of `travelPx`.
 *
 * `travelPx` is a single copy's advance — the text plus the gap that precedes the next
 * copy — since that is how far the pair moves per loop. Constant speed, so it scales
 * linearly with distance, then clamps.
 */
export function marqueeDurationMs(travelPx: number): number {
  if (!Number.isFinite(travelPx) || travelPx <= 0) return MARQUEE_MIN_DURATION_MS;
  const travelMs = (travelPx / MARQUEE_SPEED_PX_PER_SECOND) * 1000;
  return Math.min(MARQUEE_MAX_DURATION_MS, Math.max(MARQUEE_MIN_DURATION_MS, Math.round(travelMs)));
}
