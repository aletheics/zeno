// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { MarqueeText } from "./MarqueeText.tsx";

/* jsdom performs no layout, so every element reports scrollWidth/clientWidth as 0 and the
 * component would always look like it fits. The measurements are therefore supplied by
 * hand and the component is nudged with a resize to re-read them — that way this tests the
 * wiring between measuring and publishing, while the arithmetic itself is covered by
 * lib/marquee.test.ts. */

function hostOf(text: string): HTMLElement {
  // The outer span is the one carrying the class; the text sits in `.marquee-inner`.
  const inner = screen.getByText(text);
  const host = inner.parentElement;
  if (!host) throw new Error("no marquee host");
  return host;
}

function measure(host: HTMLElement, scrollWidth: number, clientWidth: number): void {
  Object.defineProperty(host, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(host, "clientWidth", { value: clientWidth, configurable: true });
  fireEvent(window, new Event("resize"));
}

afterEach(cleanup);

describe("MarqueeText", () => {
  it("renders the whole text, clipped rather than ellipsised", () => {
    render(<MarqueeText text="a very long session title" />);
    // Still a real text node: selectable and announced, unlike a CSS ellipsis.
    expect(screen.getByText("a very long session title")).toBeInTheDocument();
  });

  it("stays still when the text fits", async () => {
    render(<MarqueeText text="short" />);
    const host = hostOf("short");
    measure(host, 80, 240);

    await waitFor(() => expect(host.style.getPropertyValue("--marquee-distance")).toBe("-0px"));
    // No data-overflow means the stylesheet never starts the animation.
    expect(host).not.toHaveAttribute("data-overflow");
  });

  it("publishes the distance and duration once the text overflows", async () => {
    render(<MarqueeText text="a title far too long for the sidebar" />);
    const host = hostOf("a title far too long for the sidebar");
    measure(host, 400, 120);

    await waitFor(() => expect(host).toHaveAttribute("data-overflow", "true"));
    expect(host.style.getPropertyValue("--marquee-distance")).toBe("-280px");
    // One traversal at 30px/s (280/30 -> 9.33s), stretched to fill 85% of the cycle.
    expect(host.style.getPropertyValue("--marquee-duration")).toBe("10980ms");
  });

  it("stops overflowing when the row gets wider", async () => {
    render(<MarqueeText text="a title that just fits" />);
    const host = hostOf("a title that just fits");

    measure(host, 400, 120);
    await waitFor(() => expect(host).toHaveAttribute("data-overflow", "true"));

    // Sidebar resized wider — the row must stop animating, not keep scrolling nothing.
    measure(host, 200, 240);
    await waitFor(() => expect(host).not.toHaveAttribute("data-overflow"));
  });

  it("re-measures for new text", async () => {
    const { rerender } = render(<MarqueeText text="short" />);
    const host = hostOf("short");
    measure(host, 80, 240);
    await waitFor(() => expect(host).not.toHaveAttribute("data-overflow"));

    rerender(<MarqueeText text="a considerably longer title than before" />);
    const next = hostOf("a considerably longer title than before");
    measure(next, 500, 240);

    await waitFor(() => expect(next).toHaveAttribute("data-overflow", "true"));
    expect(next.style.getPropertyValue("--marquee-distance")).toBe("-260px");
  });
});
