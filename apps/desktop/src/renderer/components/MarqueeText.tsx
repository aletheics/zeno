import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { marqueeDistancePx, marqueeDurationMs, shouldMarquee } from "@/lib/marquee";

/* A label that slides to reveal its end when the text does not fit.
 *
 * This component only *measures* and publishes: it sets `data-overflow` and two custom
 * properties, and `styles.css` decides when to animate. The trigger has to be the row
 * being hovered or focused rather than the text itself — the text is one span inside a
 * button, so hovering the row's padding or focusing it by keyboard must count too, and CSS
 * cannot select an ancestor. The consuming row therefore carries a host class that the
 * stylesheet keys off.
 *
 * The full text stays in the DOM, only clipped, so it is still announced by screen readers
 * and still selectable — unlike an ellipsis, which is why the reveal is a scroll.
 */

/** Re-measure on layout changes; ResizeObserver gives no callback until then. */
function useMeasuredOverflow<T extends HTMLElement>(ref: React.RefObject<T | null>, text: string) {
  const [metrics, setMetrics] = useState({ scrollWidth: 0, clientWidth: 0 });

  // Layout effect, so the first paint already carries the right data-overflow and the
  // clamp does not visibly snap after mount.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      setMetrics({ scrollWidth: 0, clientWidth: 0 });
      return;
    }
    const measure = () => {
      const next = { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      setMetrics((prev) =>
        prev.scrollWidth === next.scrollWidth && prev.clientWidth === next.clientWidth
          ? prev
          : next,
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, text]);

  // The row can widen without this element's own box changing (sidebar resize, a scrollbar
  // appearing), which ResizeObserver on the text alone would miss.
  useEffect(() => {
    const onResize = () => {
      const el = ref.current;
      if (!el) return;
      setMetrics({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [ref]);

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
  const metrics = useMeasuredOverflow(hostRef, text);
  const distance = marqueeDistancePx(metrics);
  const overflows = shouldMarquee(metrics);

  return (
    <span
      ref={hostRef}
      className={cn("marquee min-w-0 flex-1 overflow-hidden whitespace-nowrap", className)}
      data-overflow={overflows ? "true" : undefined}
      data-testid={testId}
      style={
        {
          "--marquee-distance": `-${distance}px`,
          "--marquee-duration": `${marqueeDurationMs(distance)}ms`,
        } as CSSProperties
      }
    >
      <span className="marquee-inner inline-block">{text}</span>
    </span>
  );
}
