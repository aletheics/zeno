/**
 * Top-layer popup menu portaled to document.body with explicit fixed coordinates.
 * Avoids Radix Popover + sticky/transform ancestors (composer dock) which misplace menus.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { nextMenuIndex, type MenuNavKey } from "../lib/context-menu.ts";
import { cn } from "../lib/utils.ts";

/** Keys that move the highlight inside an open menu. */
const NAV_KEYS = new Set<string>(["ArrowDown", "ArrowUp", "Home", "End"]);

/** Focusable rows, in DOM order, skipping disabled ones — a disabled button cannot take focus. */
function menuItems(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));
}

export interface AnchorRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function anchorFromEvent(target: EventTarget | null): AnchorRect | null {
  if (!(target instanceof HTMLElement)) return null;
  const r = target.getBoundingClientRect();
  return {
    top: r.top,
    left: r.left,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
  };
}

export function anchorFromElement(el: HTMLElement | null): AnchorRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top,
    left: r.left,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
  };
}

export type FloatingMenuPlacement = "bottom" | "top" | "right" | "left";

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function FloatingMenu(props: {
  open: boolean;
  anchor: AnchorRect | null;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
  /** Preferred min width in px */
  minWidth?: number;
  className?: string;
  /** Open below (default), above, or to the right of the anchor. */
  placement?: FloatingMenuPlacement;
  /** Stacking order — flyouts should sit above the parent menu. */
  zIndex?: number;
  /** Close on pointer events outside the menu. Default true; Escape always closes. */
  closeOnOutside?: boolean;
  /** Close when the page or an ancestor scrolls. Defaults to closeOnOutside. */
  closeOnScroll?: boolean;
  /** When true, menu width matches the anchor rect (e.g. composer card). */
  matchAnchorWidth?: boolean;
  /**
   * When false, no drop shadow / elevated chrome (composer / and @ panels).
   * Default true keeps project-context-menu elevation for other menus.
   */
  elevated?: boolean;
  /** Gap in px between menu and anchor (default 6 above / 4 below). */
  offsetPx?: number;
  /**
   * Arrow/Home/End cruising between `role="menuitem"` rows, plus focus moving into the menu
   * when it opens and back to whatever was focused when it closes.
   *
   * Opt-in, and off by default: the composer's `/` and `@` panels are also `FloatingMenu`s and
   * drive their own highlight from the textarea's keydown. A capture-phase listener here would
   * pull focus out of the textarea and fight them for every arrow press.
   */
  keyboardNav?: boolean;
}) {
  const minWidth = props.minWidth ?? 200;
  const placement = props.placement ?? "bottom";
  const zIndex = props.zIndex ?? 10_000;
  const closeOnOutside = props.closeOnOutside !== false;
  const closeOnScroll = props.closeOnScroll ?? closeOnOutside;
  const matchAnchorWidth = props.matchAnchorWidth === true;
  const elevated = props.elevated !== false;
  const gap = props.offsetPx ?? (placement === "top" ? 6 : 4);
  const open = props.open && Boolean(props.anchor);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuSize, setMenuSize] = useState({ w: minWidth, h: 0 });
  /** What was focused before a keyboard-navigable menu took focus, for Escape to hand back. */
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const el = menuRef.current;
    const measure = () => {
      setMenuSize({
        w: Math.ceil(el.offsetWidth),
        h: Math.ceil(el.offsetHeight),
      });
    };
    measure();
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : undefined;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [open, props.children, props.anchor?.width, props.anchor?.height]);

  // Close on outside click / Escape / scroll / resize.
  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        props.onClose();
        // Hand focus back to whatever opened the menu. Only on Escape: dismissing by clicking
        // outside or choosing an item already sends focus where the user aimed it.
        if (props.keyboardNav) returnFocusRef.current?.focus();
      }
    };
    const onPointerDown = (ev: PointerEvent) => {
      if (!closeOnOutside) return;
      const target = ev.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-floating-menu]")) return;
      props.onClose();
    };
    const onScroll = (ev: Event) => {
      if (!closeOnScroll) return;
      const target = ev.target;
      if (target instanceof Element && target.closest("[data-floating-menu]")) return;
      // Ignore ResizeObserver-driven noise on the menu itself.
      if (target === menuRef.current) return;
      props.onClose();
    };
    const onResize = () => {
      if (closeOnOutside) props.onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, closeOnOutside, closeOnScroll, props.onClose, props.keyboardNav]);

  // Arrow / Home / End cruising between rows, for menus that opt in.
  useEffect(() => {
    if (!open || !props.keyboardNav) return;
    const onKey = (ev: KeyboardEvent) => {
      if (!NAV_KEYS.has(ev.key)) return;
      const items = menuItems(menuRef.current);
      if (!items.length) return;
      // Capture phase: stop the arrow reaching the page behind the menu (scrolling the
      // timeline, moving a caret) now that the key means "move the highlight".
      ev.preventDefault();
      ev.stopPropagation();
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next = nextMenuIndex(current, items.length, ev.key as MenuNavKey);
      items[next]?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, props.keyboardNav]);

  // Move focus into the menu when it opens, so a keyboard user can arrow straight into it and
  // Escape has somewhere to hand focus back to. Guarded against re-focusing: a parent re-render
  // while the menu is open must not yank the highlight back to the first row.
  useEffect(() => {
    if (!open || !props.keyboardNav) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const root = menuRef.current;
      if (!root || root.contains(document.activeElement)) return;
      menuItems(root)[0]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, props.keyboardNav, props.children]);

  if (!open || !props.anchor || typeof document === "undefined") return null;

  const anchor = props.anchor;
  const width = matchAnchorWidth
    ? Math.max(minWidth, Math.round(anchor.width))
    : Math.max(minWidth, menuSize.w || minWidth);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 8;

  let left = anchor.left;
  let top = anchor.bottom + gap;

  if (placement === "top") {
    top = anchor.top - gap - (menuSize.h || 0);
    // Before first measure, park above anchor with a safe fallback height.
    if (!menuSize.h) top = Math.max(pad, anchor.top - gap - 240);
  } else if (placement === "bottom") {
    top = anchor.bottom + gap;
  } else if (placement === "right") {
    left = anchor.right + gap;
    top = anchor.top;
  } else if (placement === "left") {
    left = anchor.left - gap - width;
    top = anchor.top;
  }

  // Keep fully on-screen.
  left = clamp(left, pad, Math.max(pad, vw - width - pad));
  if (menuSize.h > 0) {
    top = clamp(top, pad, Math.max(pad, vh - menuSize.h - pad));
  } else {
    top = clamp(top, pad, vh - pad);
  }

  // If top placement would go off-screen above, flip below when possible.
  if (placement === "top" && menuSize.h > 0 && anchor.top - gap - menuSize.h < pad) {
    const below = anchor.bottom + gap;
    if (below + menuSize.h <= vh - pad) top = below;
  }

  const style: CSSProperties = {
    position: "fixed",
    top,
    left,
    zIndex,
    minWidth: matchAnchorWidth ? width : minWidth,
    width: matchAnchorWidth ? width : "auto",
    maxWidth: `min(100vw - ${pad * 2}px, 28rem)`,
    maxHeight: "min(70vh, 480px)",
    boxSizing: "border-box",
    ...(elevated ? {} : { boxShadow: "none", filter: "none", WebkitFilter: "none" }),
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      data-testid={props.testId}
      data-floating-menu=""
      data-elevated={elevated ? "true" : "false"}
      data-placement={placement}
      className={cn(
        "surface-panel overflow-x-hidden overflow-y-auto p-0 py-1 text-popover-foreground outline-none",
        elevated
          ? "project-context-menu shadow-2xl"
          : "composer-suggest-menu overflow-hidden shadow-none",
        props.className,
      )}
      style={style}
    >
      {props.children}
    </div>,
    document.body,
  );
}
