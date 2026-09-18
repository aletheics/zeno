// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { MarqueeText } from "./MarqueeText.tsx";

/* jsdom performs no layout, so every element reports zero width and the component would
 * always look like it fits. The measurements are supplied by hand and the component is
 * nudged with a resize to re-read them, which covers the wiring between measuring and
 * publishing; the arithmetic is covered directly in lib/marquee.test.ts. */

const GAP_PX = 40;

function parts(text: string) {
  const copies = screen.queryAllByText(text);
  const track = copies[0]!.parentElement as HTMLElement;
  const host = track.parentElement as HTMLElement;
  return { copies, track, host };
}

/** Give the first copy a measured width and let the component re-read it. */
function measure(p: ReturnType<typeof parts>, sizes: { copy: number; available: number }): void {
  for (const copy of screen.queryAllByText(p.copies[0]!.textContent ?? "")) {
    Object.defineProperty(copy, "offsetWidth", { value: sizes.copy, configurable: true });
  }
  Object.defineProperty(p.host, "clientWidth", { value: sizes.available, configurable: true });
  fireEvent(window, new Event("resize"));
}

afterEach(cleanup);

describe("MarqueeText", () => {
  it("renders the title once while it fits", () => {
    render(<MarqueeText text="short" />);
    // No duplicate until there is something to scroll — the copy is for the seam, not a
    // permanent doubling of every row's DOM.
    expect(screen.getAllByText("short")).toHaveLength(1);
  });

  it("duplicates the title once it overflows, hiding the copy from assistive tech", async () => {
    render(<MarqueeText text="a title far too long for the sidebar" />);
    const p = parts("a title far too long for the sidebar");
    measure(p, { copy: 400, available: 120 });

    await waitFor(() =>
      expect(screen.getAllByText("a title far too long for the sidebar")).toHaveLength(2),
    );
    const [first, second] = screen.getAllByText("a title far too long for the sidebar");
    // The seam copy is never announced.
    expect(first).not.toHaveAttribute("aria-hidden");
    expect(second).toHaveAttribute("aria-hidden", "true");
  });

  it("folds the copy's gap into the duration", async () => {
    // The gap lives in CSS, so this test supplies it; without a stylesheet jsdom reports
    // no margin at all and the advance would be the text width alone.
    const computed = vi.spyOn(window, "getComputedStyle").mockReturnValue({
      marginRight: `${GAP_PX}px`,
    } as CSSStyleDeclaration);
    try {
      render(<MarqueeText text="a title far too long for the sidebar" />);
      const p = parts("a title far too long for the sidebar");
      measure(p, { copy: 260, available: 120 });

      await waitFor(() => expect(p.host).toHaveAttribute("data-overflow", "true"));
      // 260 + a 40px gap = a 300px advance, at 30px/s.
      expect(p.host.style.getPropertyValue("--marquee-duration")).toBe("10000ms");
    } finally {
      computed.mockRestore();
    }
  });

  it("treats an unreadable gap as zero rather than producing NaN", async () => {
    // No stylesheet here, so the computed margin parses to nothing — the duration must
    // still be a usable number rather than NaNms.
    render(<MarqueeText text="a title far too long for the sidebar" />);
    const p = parts("a title far too long for the sidebar");
    measure(p, { copy: 300, available: 120 });

    await waitFor(() => expect(p.host).toHaveAttribute("data-overflow", "true"));
    expect(p.host.style.getPropertyValue("--marquee-duration")).toBe("10000ms");
  });

  it("drops the duplicate again when the row gets wider", async () => {
    render(<MarqueeText text="a title that just fits" />);
    const p = parts("a title that just fits");

    measure(p, { copy: 260, available: 120 });
    await waitFor(() => expect(p.host).toHaveAttribute("data-overflow", "true"));

    measure(parts("a title that just fits"), { copy: 260, available: 400 });
    await waitFor(() => expect(p.host).not.toHaveAttribute("data-overflow"));
    expect(screen.getAllByText("a title that just fits")).toHaveLength(1);
  });

  it("does not start scrolling over a fractional overflow", async () => {
    render(<MarqueeText text="almost fits" />);
    const p = parts("almost fits");
    measure(p, { copy: 120.5, available: 120 });

    await waitFor(() => expect(p.host.style.getPropertyValue("--marquee-duration")).not.toBe(""));
    expect(p.host).not.toHaveAttribute("data-overflow");
    expect(screen.getAllByText("almost fits")).toHaveLength(1);
  });
});
