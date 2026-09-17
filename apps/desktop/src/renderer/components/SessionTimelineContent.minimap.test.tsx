// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { SessionTimelineScroller } from "./SessionTimelineContent.tsx";
import type { TimelineItem } from "@/lib/timeline";

/* jsdom has no layout, so the rail's geometry (magnify, jump) cannot be exercised here.
 * What this guards is the mount contract: the minimap must resolve the message-scroller
 * hooks through the provider, and stay hidden when there is nothing to navigate. */

const item = (id: string, kind: "user" | "assistant", text: string): TimelineItem =>
  kind === "user" ? { id, kind: "user", text } : { id, kind: "assistant", text };

function renderScroller(items: TimelineItem[]) {
  return render(
    <SessionTimelineScroller
      autoScroll={false}
      items={items}
      events={[]}
      running={false}
      waiting={false}
      locale="zh"
    />,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("conversation minimap mount", () => {
  it("stays hidden when the thread has nothing to navigate", () => {
    renderScroller([]);
    expect(screen.queryByRole("navigation", { name: "对话导航" })).not.toBeInTheDocument();
  });

  it("stays hidden when there is no scroll range, however many turns exist", () => {
    // jsdom reports no overflow, so even a multi-turn thread must not paint the rail.
    renderScroller([
      item("u1", "user", "one"),
      item("a1", "assistant", "reply one"),
      item("u2", "user", "two"),
      item("a2", "assistant", "reply two"),
    ]);
    expect(screen.queryByRole("navigation", { name: "对话导航" })).not.toBeInTheDocument();
  });
});
