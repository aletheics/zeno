/**
 * The state pair every app-styled context menu needs: *which* target is open and *where* to
 * draw it.
 *
 * `ProjectList` spelled this out as two `useState`s plus a closer and two openers, and every
 * new right-click surface would have copied that. The two entry points differ in a way worth
 * naming rather than repeating:
 *
 *   - a right-click opens *at the pointer*, and always opens (there is no toggle, because
 *     right-clicking the same row twice is not a request to close anything);
 *   - a "…" button opens *at the button*, and toggles — clicking it again closes.
 *
 * Suppressing Chromium's own menu belongs here rather than at each call site: opening ours is
 * the only thing `onContextMenu` is ever for, so a caller that forgets `preventDefault` is
 * just a bug waiting to be reported.
 */
import { useCallback, useState } from "react";
import { anchorFromEvent } from "../components/FloatingMenu.tsx";
import { anchorFromPoint, type ContextMenuAnchor } from "../lib/context-menu.ts";

type MenuState = { key: string; anchor: ContextMenuAnchor };

/**
 * The minimum an opener reads off whatever triggered it. Structural rather than
 * `ReactMouseEvent`, so the same hook serves `onContextMenu` *and* the Shift+F10 `onKeyDown`
 * path — a keyboard event has a `currentTarget` to anchor to but no cursor at all, which is
 * why the coordinates are optional here and required in `PointerTriggerEvent` below.
 */
export type MenuTriggerEvent = {
  clientX?: number;
  clientY?: number;
  currentTarget: EventTarget | null;
  preventDefault: () => void;
  stopPropagation: () => void;
};

/** A pointer-triggered open, which is the only kind that knows where the cursor is. */
export type PointerTriggerEvent = MenuTriggerEvent & { clientX: number; clientY: number };

export type ContextMenu = {
  /** Identifies the target, e.g. `message:<entryId>`. `null` when nothing is open. */
  key: string | null;
  anchor: ContextMenuAnchor | null;
  isOpen: boolean;
  /** Open at the pointer. Wire this to `onContextMenu`. */
  openAtPoint: (key: string, event: PointerTriggerEvent) => void;
  /** Open at the activated element. Wire this to a "…" button's `onClick` or a Shift+F10 keydown. */
  openAtElement: (key: string, event: MenuTriggerEvent) => void;
  close: () => void;
};

export function useContextMenu(): ContextMenu {
  const [state, setState] = useState<MenuState | null>(null);

  const close = useCallback(() => setState(null), []);

  const openAtPoint = useCallback((key: string, event: PointerTriggerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setState({ key, anchor: anchorFromPoint(event.clientX, event.clientY) });
  }, []);

  const openAtElement = useCallback((key: string, event: MenuTriggerEvent) => {
    event.stopPropagation();
    // Fall back to the pointer if the target is not an element, so the trigger still opens
    // something rather than appearing to do nothing. A keyboard event has no coordinates, so
    // there it can only fall back to the origin — harmless, since `currentTarget` is an
    // element for both the "…" button and the focused textarea.
    const anchor =
      anchorFromEvent(event.currentTarget) ??
      anchorFromPoint(event.clientX ?? 0, event.clientY ?? 0);
    setState((current) => (current?.key === key ? null : { key, anchor }));
  }, []);

  return {
    key: state?.key ?? null,
    anchor: state?.anchor ?? null,
    isOpen: state !== null,
    openAtPoint,
    openAtElement,
    close,
  };
}
