import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { marqueeDurationMs, shouldMarquee } from "@/lib/marquee";

/* A label that scrolls left, without a seam, when the text does not fit.
 *
 * The text is rendered twice and the pair slides by exactly one copy, so the restart is
 * indistinguishable from a continuing scroll — no snap, no pause.
 *
 * This component only *measures* and publishes: it sets `data-overflow` and
 * `--marquee-duration`, and `styles.css` decides when to run. Two reasons for that split:
 *
 * - The trigger has to be the whole row. The title is one span inside a button, so hovering
 *   the row's padding or reaching it by keyboard must count too, and CSS cannot select an
 *   ancestor. The consuming row carries a host class the stylesheet keys off.
 * - The arithmetic needs no layout engine, so it lives in lib/marquee.ts where it is tested
 *   directly. This component supplies the numbers.
 *
 * The first copy is the real text — selectable and announced by a screen reader. The second
 * is `aria-hidden`, so the title is not read twice, and it is clipped away when the text fits.
 */

type Metrics = {
  /** A single copy's width, unclipped. */
  copyWidth: number;
  /** A single copy's advance: its own width plus the gap before the next copy. */
  copyAdvance: number;
  /** Width available in the row. */
  availableWidth: number;
};

function readMetrics(host: HTMLSpanElement | null): Metrics | undefined {
  const track = host?.firstElementChild as HTMLElement | null;
  const copy = track?.firstElementChild as HTMLElement | null;
  if (!host || !track || !copy) return undefined;
  return {
    copyWidth: copy.offsetWidth,
    // The track holds exactly two copies, so half of it is one copy plus its gap.
    copyAdvance: track.offsetWidth / 2,
    availableWidth: host.clientWidth,
  };
}

/** Re-measure on layout changes; ResizeObserver gives no callback until then. */
function useMeasured(hostRef: React.RefObject<HTMLSpanElement | null>, text: string): Metrics {
  const [metrics, setMetrics] = useState<Metrics>({
    copyWidth: 0,
    copyAdvance: 0,
    availableWidth: 0,
  });

  // Layout effect, so the first paint already carries the right data-overflow rather than
  // starting to scroll a frame late.
  useLayoutEffect(() => {
    const measure = () => {
      const next = readMetrics(hostRef.current);
      if (!next) return;
      setMetrics((prev) =>
        prev.copyWidth === next.copyWidth &&
        prev.copyAdvance === next.copyAdvance &&
        prev.availableWidth === next.availableWidth
          ? prev
          : next,
      );
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [hostRef, text]);

  // The row can change width without this element's box changing (sidebar resize, a
  // scrollbar appearing), which observing the host alone would miss.
  useEffect(() => {
    const onResize = () => {
      const next = readMetrics(hostRef.current);
      if (next) setMetrics(next);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [hostRef]);

  return metrics;
}

export function MarqueeText({
  text,
  className,
  testId,
}: {
  text: string;
  className?: string;
  testId?: string;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const { copyWidth, copyAdvance, availableWidth } = useMeasured(hostRef, text);
  const overflows = shouldMarquee({ scrollWidth: copyWidth, clientWidth: availableWidth });

  return (
    <span
      ref={hostRef}
      className={cn("marquee min-w-0 flex-1 overflow-hidden whitespace-nowrap", className)}
      data-overflow={overflows ? "true" : undefined}
      data-testid={testId}
      style={{ "--marquee-duration": `${marqueeDurationMs(copyAdvance)}ms` } as CSSProperties}
    >
      <span className="marquee-track inline-flex">
        <span className="marquee-copy">{text}</span>
        <span className="marquee-copy" aria-hidden="true">
          {text}
        </span>
      </span>
    </span>
  );
}
