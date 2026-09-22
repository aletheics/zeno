// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { useContextMenu, type PointerTriggerEvent } from "./useContextMenu.ts";

/* @testing-library/react auto-cleanup relies on global afterEach (vitest globals=false). */
afterEach(cleanup);

/**
 * Stands in for whatever triggered a menu — mouse or keyboard; the hook only reads these five
 * members. The spies are returned as plain locals rather than read back off the event, so
 * asserting on them cannot trip the unbound-method lint rule.
 */
function pointerEvent(x: number, y: number, currentTarget: EventTarget | null = null) {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const event: PointerTriggerEvent = {
    clientX: x,
    clientY: y,
    currentTarget,
    preventDefault,
    stopPropagation,
  };
  return { event, preventDefault, stopPropagation };
}

describe("useContextMenu", () => {
  it("starts closed", () => {
    const { result } = renderHook(() => useContextMenu());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.key).toBeNull();
    expect(result.current.anchor).toBeNull();
  });

  it("opens at the pointer when the surface is right-clicked", () => {
    const { result } = renderHook(() => useContextMenu());
    const { event, preventDefault, stopPropagation } = pointerEvent(120, 340);

    act(() => result.current.openAtPoint("message:1", event));

    expect(result.current.key).toBe("message:1");
    expect(result.current.anchor).toMatchObject({ left: 120, bottom: 340, width: 0, height: 0 });
    // Chromium's own menu has to be suppressed for ours to be the one that shows.
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
  });

  it("re-opens rather than toggling when the same row is right-clicked again", () => {
    const { result } = renderHook(() => useContextMenu());

    act(() => result.current.openAtPoint("message:1", pointerEvent(10, 10).event));
    act(() => result.current.openAtPoint("message:1", pointerEvent(20, 20).event));

    // A second right-click is a request to move the menu, not to close it.
    expect(result.current.isOpen).toBe(true);
    expect(result.current.anchor).toMatchObject({ left: 20, bottom: 20 });
  });

  it("anchors a … button menu to the button, not the pointer", () => {
    const button = document.createElement("button");
    button.getBoundingClientRect = () =>
      ({ top: 50, left: 60, right: 100, bottom: 78, width: 40, height: 28 }) as DOMRect;
    const { result } = renderHook(() => useContextMenu());

    act(() => result.current.openAtElement("row:1", pointerEvent(5, 5, button).event));

    expect(result.current.key).toBe("row:1");
    expect(result.current.anchor).toMatchObject({ left: 60, top: 50, width: 40, height: 28 });
  });

  it("toggles closed when the … button that opened it is clicked again", () => {
    const button = document.createElement("button");
    const { result } = renderHook(() => useContextMenu());

    act(() => result.current.openAtElement("row:1", pointerEvent(5, 5, button).event));
    act(() => result.current.openAtElement("row:1", pointerEvent(5, 5, button).event));

    expect(result.current.isOpen).toBe(false);
  });

  it("moves between targets instead of closing", () => {
    const { result } = renderHook(() => useContextMenu());

    act(() => result.current.openAtPoint("message:1", pointerEvent(10, 10).event));
    act(() => result.current.openAtPoint("message:2", pointerEvent(10, 10).event));

    expect(result.current.key).toBe("message:2");
  });

  it("still opens when the target is not an element", () => {
    // anchorFromEvent yields null for a non-HTMLElement; the pointer is the fallback so the
    // gesture does not silently do nothing.
    const { result } = renderHook(() => useContextMenu());

    act(() => result.current.openAtElement("row:1", pointerEvent(7, 9, null).event));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.anchor).toMatchObject({ left: 7, bottom: 9 });
  });

  it("closes on demand", () => {
    const { result } = renderHook(() => useContextMenu());

    act(() => result.current.openAtPoint("message:1", pointerEvent(10, 10).event));
    act(() => result.current.close());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.key).toBeNull();
  });
});
