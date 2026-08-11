import { describe, expect, it } from "vite-plus/test";
import {
  OVERLAY_SCROLL_SELECTOR,
  scrollTopFromThumbDrag,
  thumbOffsetInTrack,
} from "./overlay-scroll.ts";

describe("overlay-scroll", () => {
  it("covers all unified scrollport surfaces", () => {
    expect(OVERLAY_SCROLL_SELECTOR).toContain(".pix-scroll");
    expect(OVERLAY_SCROLL_SELECTOR).toContain(".page-body");
    expect(OVERLAY_SCROLL_SELECTOR).toContain(".settings-page-body");
    expect(OVERLAY_SCROLL_SELECTOR).toContain(".timeline-scroll");
    expect(OVERLAY_SCROLL_SELECTOR).toContain(".composer-suggest-scroll");
  });

  it("maps thumb movement directly onto the full scroll range", () => {
    expect(
      scrollTopFromThumbDrag({
        startScrollTop: 200,
        deltaY: 80,
        clientHeight: 200,
        scrollHeight: 1_000,
        thumbHeight: 40,
      }),
    ).toBe(600);
  });

  it("clamps thumb dragging at both scroll boundaries", () => {
    const metrics = { clientHeight: 200, scrollHeight: 1_000, thumbHeight: 40 };
    expect(scrollTopFromThumbDrag({ ...metrics, startScrollTop: 100, deltaY: -500 })).toBe(0);
    expect(scrollTopFromThumbDrag({ ...metrics, startScrollTop: 700, deltaY: 500 })).toBe(800);
  });

  it("snaps thumb to the track bottom when content is scrolled to the end", () => {
    const clientHeight = 400;
    const scrollHeight = 2000;
    const thumbHeight = 80;
    const maxTop = clientHeight - thumbHeight;
    expect(
      thumbOffsetInTrack({
        scrollTop: scrollHeight - clientHeight,
        clientHeight,
        scrollHeight,
        thumbHeight,
      }),
    ).toBe(maxTop);
    expect(
      thumbOffsetInTrack({
        scrollTop: scrollHeight - clientHeight - 0.5,
        clientHeight,
        scrollHeight,
        thumbHeight,
      }),
    ).toBe(maxTop);
    expect(
      thumbOffsetInTrack({
        scrollTop: 0,
        clientHeight,
        scrollHeight,
        thumbHeight,
      }),
    ).toBe(0);
  });
});
