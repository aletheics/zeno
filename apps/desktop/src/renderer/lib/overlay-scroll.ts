/**
 * Floating overlay scrollbars — zero layout width, auto-hide, hover + drag.
 * Applies to main named scrollports (thread, settings, sidebars, / and @ menus).
 * Session tree / session info modals are excluded (no floating thumb).
 */

export const OVERLAY_SCROLL_SELECTOR =
  ".pix-scroll, .timeline-scroll, .page-body, .settings-page-body, .composer-suggest-scroll, .composer-prompt-scroll, .command-palette-scroll";

const HIDE_MS = 900;
const THUMB_CLASS = "pix-scroll-thumb";
const MIN_THUMB_PX = 28;
const THUMB_HITBOX_PX = 12;

let nextId = 0;

interface ThumbDragState {
  host: HTMLElement;
  thumb: HTMLDivElement;
  pointerId: number;
  startY: number;
  startScrollTop: number;
  thumbHeight: number;
  previousScrollBehavior: string;
}

function isScrollport(el: Element): el is HTMLElement {
  return el instanceof HTMLElement && el.matches(OVERLAY_SCROLL_SELECTOR);
}

function hostId(host: HTMLElement): string {
  let id = host.dataset.pixScrollId;
  if (!id) {
    id = `ps${++nextId}`;
    host.dataset.pixScrollId = id;
  }
  return id;
}

/**
 * Thumb lives on document.body (position:fixed) so React re-renders never strip it,
 * and so it never participates in the scrollport's layout width.
 */
function ensureThumb(host: HTMLElement): HTMLDivElement {
  const id = hostId(host);
  let thumb = document.querySelector<HTMLDivElement>(
    `.${THUMB_CLASS}[data-for="${CSS.escape(id)}"]`,
  );
  if (!thumb) {
    thumb = document.createElement("div");
    thumb.className = THUMB_CLASS;
    thumb.dataset.for = id;
    thumb.setAttribute("aria-hidden", "true");
    document.body.appendChild(thumb);
  }
  return thumb;
}

function removeThumb(host: HTMLElement): void {
  const id = host.dataset.pixScrollId;
  if (!id) return;
  document.querySelector(`.${THUMB_CLASS}[data-for="${CSS.escape(id)}"]`)?.remove();
}

function thumbForHost(host: HTMLElement): HTMLDivElement | null {
  const id = host.dataset.pixScrollId;
  if (!id) return null;
  return document.querySelector<HTMLDivElement>(`.${THUMB_CLASS}[data-for="${CSS.escape(id)}"]`);
}

function hostForThumb(thumb: Element): HTMLElement | null {
  const id = thumb.getAttribute("data-for");
  if (!id) return null;
  const host = document.querySelector<HTMLElement>(`[data-pix-scroll-id="${CSS.escape(id)}"]`);
  return host && isScrollport(host) ? host : null;
}

function eventThumb(target: EventTarget | null): HTMLDivElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLDivElement>(`.${THUMB_CLASS}`);
}

export function scrollTopFromThumbDrag(input: {
  startScrollTop: number;
  deltaY: number;
  clientHeight: number;
  scrollHeight: number;
  thumbHeight: number;
}): number {
  const scrollRange = Math.max(0, input.scrollHeight - input.clientHeight);
  const thumbRange = Math.max(1, input.clientHeight - input.thumbHeight);
  const next = input.startScrollTop + (input.deltaY / thumbRange) * scrollRange;
  return Math.min(scrollRange, Math.max(0, next));
}

/** Visual offset of the thumb within the host track (0 = top, maxTop = bottom). */
export function thumbOffsetInTrack(input: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  thumbHeight: number;
}): number {
  const maxTop = Math.max(0, input.clientHeight - input.thumbHeight);
  const maxScroll = Math.max(0, input.scrollHeight - input.clientHeight);
  if (maxScroll <= 0) return 0;
  if (input.scrollTop >= maxScroll - 1) return maxTop;
  if (input.scrollTop <= 1) return 0;
  return maxTop * (input.scrollTop / maxScroll);
}

/**
 * Right edge for the floating thumb — prefer shell main pane when the host fills it.
 */
function thumbRightEdge(host: HTMLElement, hostRect: DOMRect): number {
  // Nested menus / panels: always stick to the host's own right edge.
  if (host.classList.contains("composer-suggest-scroll") || host.closest("[data-floating-menu]")) {
    return hostRect.right;
  }
  const shell = document.querySelector<HTMLElement>('[data-testid="shell-main"]');
  if (shell?.isConnected) {
    const shellRect = shell.getBoundingClientRect();
    if (shellRect.width > 0 && Math.abs(hostRect.right - shellRect.right) <= 2) {
      return shellRect.right;
    }
  }
  return hostRect.right;
}

/**
 * Position a floating thumb over the scrollport. Native scrollbar stays fully
 * suppressed so content width never shrinks/expands.
 */
export function updateOverlayThumb(host: HTMLElement, visible: boolean): void {
  if (!host.isConnected) {
    removeThumb(host);
    return;
  }
  const thumb = ensureThumb(host);
  const { scrollTop, scrollHeight, clientHeight } = host;
  if (scrollHeight <= clientHeight + 1) {
    thumb.dataset.visible = "false";
    return;
  }

  const rect = host.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    thumb.dataset.visible = "false";
    return;
  }

  const track = Math.max(0, clientHeight);
  const thumbH = Math.max(MIN_THUMB_PX, Math.min(track, (clientHeight / scrollHeight) * track));
  const visualTop = thumbOffsetInTrack({
    scrollTop,
    clientHeight,
    scrollHeight,
    thumbHeight: thumbH,
  });

  thumb.style.height = `${thumbH}px`;
  thumb.style.top = `${rect.top + visualTop}px`;
  thumb.style.left = `${thumbRightEdge(host, rect) - THUMB_HITBOX_PX}px`;
  const pinned = thumb.dataset.hovered === "true" || thumb.dataset.dragging === "true";
  thumb.dataset.visible = visible || pinned ? "true" : "false";
}

/**
 * Call after programmatic scrollTop / layout changes so the floating thumb
 * matches content position.
 */
export function syncOverlayScroll(
  host: HTMLElement | null | undefined,
  options?: { show?: boolean },
): void {
  if (!host || !host.isConnected || !isScrollport(host)) return;
  const showThumb = options?.show !== false;
  if (showThumb) host.setAttribute("data-scrolling", "true");
  updateOverlayThumb(host, showThumb || host.getAttribute("data-scrolling") === "true");
}

/**
 * Install floating auto-hide scrollbars for all unified scrollports.
 */
export function installOverlayScroll(root: ParentNode = document): () => void {
  const timers = new Map<HTMLElement, number>();
  let drag: ThumbDragState | undefined;

  const clearHide = (host: HTMLElement) => {
    const timer = timers.get(host);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.delete(host);
  };

  const scheduleHide = (host: HTMLElement) => {
    clearHide(host);
    const id = window.setTimeout(() => {
      timers.delete(host);
      const thumb = thumbForHost(host);
      if (thumb?.dataset.hovered === "true" || thumb?.dataset.dragging === "true") return;
      host.removeAttribute("data-scrolling");
      updateOverlayThumb(host, false);
    }, HIDE_MS);
    timers.set(host, id);
  };

  const show = (host: HTMLElement) => {
    host.setAttribute("data-scrolling", "true");
    updateOverlayThumb(host, true);
  };

  const onScroll = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || !isScrollport(target)) return;
    show(target);
    const thumb = thumbForHost(target);
    if (thumb?.dataset.hovered !== "true" && thumb?.dataset.dragging !== "true") {
      scheduleHide(target);
    }
  };

  const refreshHost = (host: HTMLElement) => {
    const thumb = thumbForHost(host);
    const visible =
      host.getAttribute("data-scrolling") === "true" ||
      thumb?.dataset.hovered === "true" ||
      thumb?.dataset.dragging === "true";
    if (host.scrollHeight > host.clientHeight + 1) updateOverlayThumb(host, visible);
    else removeThumb(host);
  };

  const onResize = () => {
    document.querySelectorAll(OVERLAY_SCROLL_SELECTOR).forEach((node) => {
      if (node instanceof HTMLElement) refreshHost(node);
    });
  };

  const resizeObserver =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver((entries) => {
          for (const entry of entries) {
            if (entry.target instanceof HTMLElement && isScrollport(entry.target)) {
              refreshHost(entry.target);
            }
          }
        })
      : undefined;

  const observeHosts = () => {
    if (!resizeObserver) return;
    document.querySelectorAll(OVERLAY_SCROLL_SELECTOR).forEach((node) => {
      if (node instanceof HTMLElement) resizeObserver.observe(node);
    });
  };
  observeHosts();
  const mo =
    typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => observeHosts())
      : undefined;
  mo?.observe(document.documentElement, { childList: true, subtree: true });

  const onPointerOver = (event: PointerEvent) => {
    const thumb = eventThumb(event.target);
    if (!thumb || (event.relatedTarget instanceof Node && thumb.contains(event.relatedTarget))) {
      return;
    }
    const host = hostForThumb(thumb);
    if (!host) return;
    thumb.dataset.hovered = "true";
    clearHide(host);
    show(host);
  };

  const onPointerOut = (event: PointerEvent) => {
    const thumb = eventThumb(event.target);
    if (!thumb || (event.relatedTarget instanceof Node && thumb.contains(event.relatedTarget))) {
      return;
    }
    const host = hostForThumb(thumb);
    if (!host) return;
    delete thumb.dataset.hovered;
    if (thumb.dataset.dragging !== "true") scheduleHide(host);
  };

  const finishDrag = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const { host, thumb, pointerId, previousScrollBehavior } = drag;
    drag = undefined;
    host.style.scrollBehavior = previousScrollBehavior;
    delete thumb.dataset.dragging;
    if (thumb.hasPointerCapture?.(pointerId)) thumb.releasePointerCapture(pointerId);
    if (thumb.matches(":hover")) {
      thumb.dataset.hovered = "true";
      show(host);
    } else {
      delete thumb.dataset.hovered;
      scheduleHide(host);
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const thumb = eventThumb(event.target);
    if (!thumb || thumb.dataset.visible !== "true") return;
    const host = hostForThumb(thumb);
    if (!host) return;

    clearHide(host);
    const previousScrollBehavior = host.style.scrollBehavior;
    host.style.scrollBehavior = "auto";
    drag = {
      host,
      thumb,
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: host.scrollTop,
      thumbHeight: thumb.getBoundingClientRect().height,
      previousScrollBehavior,
    };
    thumb.dataset.dragging = "true";
    show(host);
    thumb.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.host.isConnected) {
      finishDrag(event);
      return;
    }
    drag.host.scrollTop = scrollTopFromThumbDrag({
      startScrollTop: drag.startScrollTop,
      deltaY: event.clientY - drag.startY,
      clientHeight: drag.host.clientHeight,
      scrollHeight: drag.host.scrollHeight,
      thumbHeight: drag.thumbHeight,
    });
    updateOverlayThumb(drag.host, true);
    event.preventDefault();
  };

  // Hover near the right edge of a scrollport can reveal the thumb without scrolling.
  const onPointerMoveHost = (event: PointerEvent) => {
    if (drag) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const host = target.closest(OVERLAY_SCROLL_SELECTOR);
    if (!(host instanceof HTMLElement) || !isScrollport(host)) return;
    if (host.scrollHeight <= host.clientHeight + 1) return;
    const rect = host.getBoundingClientRect();
    const nearRight = event.clientX >= rect.right - 16;
    if (nearRight) {
      show(host);
      scheduleHide(host);
    }
  };

  root.addEventListener("scroll", onScroll, { capture: true, passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("pointerover", onPointerOver);
  document.addEventListener("pointerout", onPointerOut);
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointermove", onPointerMoveHost, { passive: true });
  document.addEventListener("pointerup", finishDrag);
  document.addEventListener("pointercancel", finishDrag);

  return () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers.clear();
    if (drag) drag.host.style.scrollBehavior = drag.previousScrollBehavior;
    drag = undefined;
    resizeObserver?.disconnect();
    mo?.disconnect();
    root.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("pointerover", onPointerOver);
    document.removeEventListener("pointerout", onPointerOut);
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointermove", onPointerMoveHost);
    document.removeEventListener("pointerup", finishDrag);
    document.removeEventListener("pointercancel", finishDrag);
    document.querySelectorAll(`.${THUMB_CLASS}`).forEach((n) => n.remove());
  };
}
