import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
} from "@/components/ui/message-scroller";
import {
  buildConversationMinimapMarkers,
  shouldRenderConversationMinimap,
  type ConversationMinimapMarker,
} from "@/lib/conversation-minimap";
import { t, type Locale } from "@/lib/i18n";
import type { TimelineItem } from "@/lib/timeline";

/* Codex-style conversation minimap: a packed stack of dashes on the left edge of the
 * thread, one per user turn or assistant response. Moving the cursor along the rail
 * magnifies nearby dashes with a macOS-Dock cosine falloff, the nearest turn shows a
 * preview popover, and clicking jumps to that turn. Dashes grow horizontally only, so
 * magnification never shifts the stack layout.
 *
 * Unlike the original, scroll position is not measured here: @shadcn/react's
 * message-scroller owns the scroller and already exposes jump-to-message, overflow, and
 * visibility. Only the rail-local dash geometry is measured, and only because
 * magnification needs it. */

/* Dock magnification: reach of the falloff and peak growth factor. */
const MAGNIFY_RADIUS = 46;
const MAGNIFY_BOOST = 1.3;
/* Cursor must be this close to a dash for the popover to pick it. */
const POPOVER_SNAP = 24;
const POPOVER_HEIGHT = 132;

/** Pixel offset left above a jumped-to row so it does not sit flush against the top. */
const JUMP_SCROLL_MARGIN = 24;

export const ConversationMinimap = memo(function ConversationMinimap({
  items,
  locale,
}: {
  items: TimelineItem[];
  locale: Locale;
}) {
  const { scrollToMessage } = useMessageScroller();
  const scrollable = useMessageScrollerScrollable();
  const { visibleMessageIds } = useMessageScrollerVisibility();

  const [hovered, setHovered] = useState<{
    marker: ConversationMinimapMarker;
    top: number;
  } | null>(null);
  const railRef = useRef<HTMLElement>(null);
  const markerEls = useRef(new Map<string, HTMLButtonElement>());
  const moveRaf = useRef(0);

  const markers = useMemo(() => buildConversationMinimapMarkers(items), [items]);
  const markersRef = useRef(markers);
  markersRef.current = markers;

  /* Ids, not contents: streamed tokens must not invalidate the effects below. */
  const markerIdentity = useMemo(
    () => markers.map((marker) => marker.id).join("\u0000"),
    [markers],
  );

  const overflows = scrollable.start || scrollable.end;

  /* The scroller marks no item as its scroll anchor (`scrollAnchor={false}` throughout),
   * so `currentAnchorId` stays null. Lead the highlight off whichever markers are
   * actually on screen instead. */
  const activeId = useMemo(() => {
    const ids = new Set(markers.map((marker) => marker.id));
    return visibleMessageIds.find((id) => ids.has(id)) ?? null;
  }, [markers, visibleMessageIds]);

  /**
   * Vertical centers of the dashes, in rail-local pixels.
   *
   * Dashes have a CSS-fixed height and magnify horizontally only, so their centers
   * follow the rail's layout, not the cursor. Measuring them once per layout keeps hover
   * off the critical path: `applyMagnify` runs on every mousemove frame, and reading
   * `offsetTop` there — interleaved with the `--magnify` writes it makes in the same loop
   * — would force a synchronous reflow per dash.
   */
  const magnifyCentersRef = useRef<{ id: string; center: number }[]>([]);

  const measureMagnifyCenters = useCallback(() => {
    const centers: { id: string; center: number }[] = [];
    // Read-only pass: no style writes, so layout is computed at most once.
    for (const [id, btn] of markerEls.current) {
      centers.push({ id, center: btn.offsetTop + btn.offsetHeight / 2 });
    }
    centers.sort((a, b) => a.center - b.center);
    magnifyCentersRef.current = centers;
  }, []);

  const jumpTo = useCallback(
    (id: string) => {
      scrollToMessage(id, {
        align: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        scrollMargin: JUMP_SCROLL_MARGIN,
      });
    },
    [scrollToMessage],
  );

  /* Dock magnification, applied imperatively so mousemove never re-renders. */
  const applyMagnify = useCallback(
    (cursorY: number | null) => {
      if (magnifyCentersRef.current.length === 0) {
        // Nothing measured yet (first frame after mount): measure rather than skip the
        // effect the user asked for.
        measureMagnifyCenters();
      }
      let nearest: { id: string; dist: number; center: number } | null = null;
      for (const { id, center } of magnifyCentersRef.current) {
        const btn = markerEls.current.get(id);
        if (!btn) continue;
        let scale = 1;
        if (cursorY != null) {
          const dist = Math.abs(center - cursorY);
          if (dist < MAGNIFY_RADIUS) {
            scale = 1 + MAGNIFY_BOOST * Math.cos((dist / MAGNIFY_RADIUS) * (Math.PI / 2));
          }
          if (dist <= POPOVER_SNAP && (!nearest || dist < nearest.dist)) {
            nearest = { id, dist, center };
          }
        }
        btn.style.setProperty("--magnify", scale.toFixed(3));
      }
      if (nearest) {
        const marker = markersRef.current.find((m) => m.id === nearest!.id);
        const rail = railRef.current;
        if (marker && rail) {
          const top = Math.min(
            Math.max(nearest.center - 36, 0),
            Math.max(rail.clientHeight - POPOVER_HEIGHT, 0),
          );
          setHovered((prev) =>
            prev?.marker.id === marker.id && prev.top === top ? prev : { marker, top },
          );
          return;
        }
      }
      setHovered(null);
    },
    [measureMagnifyCenters],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      const rail = railRef.current;
      if (!rail) return;
      const y = event.clientY - rail.getBoundingClientRect().top;
      cancelAnimationFrame(moveRaf.current);
      moveRaf.current = requestAnimationFrame(() => applyMagnify(y));
    },
    [applyMagnify],
  );

  const handleMouseLeave = useCallback(() => {
    cancelAnimationFrame(moveRaf.current);
    applyMagnify(null);
  }, [applyMagnify]);

  useEffect(() => () => cancelAnimationFrame(moveRaf.current), []);

  /* Dash centers follow the rail's own box, which is driven by the pane height and by the
   * marker-count-dependent gap — not by the marker set alone. Observing the rail catches
   * every cause, so magnification never tracks stale positions. */
  useEffect(() => {
    measureMagnifyCenters();
    const rail = railRef.current;
    if (!rail || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measureMagnifyCenters);
    });
    observer.observe(rail);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // `overflows` gates whether the rail is mounted at all, so the observer has to be
    // reattached when it returns.
  }, [markerIdentity, measureMagnifyCenters, overflows]);

  if (!shouldRenderConversationMinimap({ markerCount: markers.length, overflows })) {
    return null;
  }

  const roleLabel = (role: ConversationMinimapMarker["role"]) =>
    role === "user" ? t(locale, "timeline.minimapUser") : t(locale, "timeline.minimapAssistant");

  return (
    <nav
      className="minimap-rail"
      ref={railRef}
      aria-label={t(locale, "timeline.minimap")}
      style={{ "--minimap-marker-count": markers.length } as CSSProperties}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {markers.map((marker) => (
        <button
          key={marker.id}
          type="button"
          ref={(node) => {
            if (node) markerEls.current.set(marker.id, node);
            else markerEls.current.delete(marker.id);
          }}
          className={`minimap-marker ${marker.role} ${marker.id === activeId ? "active" : ""}`}
          aria-label={roleLabel(marker.role)}
          aria-current={marker.id === activeId ? "true" : undefined}
          onFocus={(event) =>
            setHovered({ marker, top: Math.max(0, event.currentTarget.offsetTop - 36) })
          }
          onBlur={() => setHovered(null)}
          onClick={() => jumpTo(marker.id)}
        />
      ))}
      {hovered && hovered.marker.preview ? (
        <div className="minimap-popover" role="tooltip" style={{ top: `${hovered.top}px` }}>
          <div className="minimap-popover-role">{roleLabel(hovered.marker.role)}</div>
          <div className="minimap-popover-text">{hovered.marker.preview}</div>
        </div>
      ) : null}
    </nav>
  );
});
