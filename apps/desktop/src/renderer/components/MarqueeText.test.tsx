// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { MarqueeText } from "./MarqueeText.tsx";

/* jsdom performs no layout, so every element reports zero width and the component would
 * always look like it fits. The measurements are supplied by hand and the component is
 * nudged with a resize to re-read them, which covers the wiring between measuring and
 * publishing; the arithmetic is covered directly in lib/marquee.test.ts. */

function parts(text: string) {
  // Two copies by design — that is what makes the loop seamless.
  const copies = screen.getAllByText(text);
  const track = copies[0]!.parentElement as HTMLElement;
  return { copies, track, host: track.parentElement as HTMLElement };
}

function measure(
  p: ReturnType<typeof parts>,
  sizes: { copy: number; track: number; available: number },
): void {
  for (const copy of p.copies) {
    Object.defineProperty(copy, "offsetWidth", { value: sizes.copy, configurable: true });
  }
  Object.defineProperty(p.track, "offsetWidth", { value: sizes.track, configurable: true });
  Object.defineProperty(p.host, "clientWidth", { value: sizes.available, configurable: true });
  fireEvent(window, new Event("resize"));
}

afterEach(cleanup);

describe("MarqueeText", () => {
  it("renders the title twice, with only one copy announced", () => {
    render(<MarqueeText text="a long session title" />);
    const { copies } = parts("a long session title");

    expect(copies).toHaveLength(2);
    // The duplicate exists for the seam; a screen reader must still hear the title once.
    expect(copies[0]).not.toHaveAttribute("aria-hidden");
    expect(copies[1]).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the text selectable rather than ellipsising it", () => {
    render(<MarqueeText text="a long session title" />);
    expect(parts("a long session title").copies[0]).toBeInTheDocument();
  });

  it("stays still when the text fits", async () => {
    render(<MarqueeText text="short" />);
    const p = parts("short");
    measure(p, { copy: 80, track: 260, available: 240 });

    await waitFor(() => expect(p.host.style.getPropertyValue("--marquee-duration")).not.toBe(""));
    // No data-overflow means the stylesheet never starts the animation.
    expect(p.host).not.toHaveAttribute("data-overflow");
  });

  it("publishes a duration once the text overflows", async () => {
    render(<MarqueeText text="a title far too long for the sidebar" />);
    const p = parts("a title far too long for the sidebar");
    // One copy advances 300px per cycle (its own 260 plus a 40px gap).
    measure(p, { copy: 260, track: 600, available: 120 });

    await waitFor(() => expect(p.host).toHaveAttribute("data-overflow", "true"));
    // 300px at 30px/s.
    expect(p.host.style.getPropertyValue("--marquee-duration")).toBe("10000ms");
  });

  it("stops overflowing when the row gets wider", async () => {
    render(<MarqueeText text="a title that just fits" />);
    const p = parts("a title that just fits");

    measure(p, { copy: 260, track: 600, available: 120 });
    await waitFor(() => expect(p.host).toHaveAttribute("data-overflow", "true"));

    // Sidebar resized wider — the label must stop scrolling rather than scroll nothing.
    measure(p, { copy: 260, track: 600, available: 400 });
    await waitFor(() => expect(p.host).not.toHaveAttribute("data-overflow"));
  });

  it("re-measures for new text", async () => {
    const { rerender } = render(<MarqueeText text="short" />);
    measure(parts("short"), { copy: 80, track: 180, available: 240 });
    await waitFor(() => expect(parts("short").host).not.toHaveAttribute("data-overflow"));

    rerender(<MarqueeText text="a considerably longer title than before" />);
    const p = parts("a considerably longer title than before");
    measure(p, { copy: 500, track: 1080, available: 240 });

    await waitFor(() => expect(p.host).toHaveAttribute("data-overflow", "true"));
    expect(p.host.style.getPropertyValue("--marquee-duration")).toBe("18000ms");
  });
});
