import { describe, expect, it } from "vite-plus/test";
import {
  addAttachments,
  MAX_ATTACHMENTS,
  removeAttachment,
  restoreAttachments,
} from "./attachments.ts";

/* Four copies of `[...new Set([...a, ...b])].slice(0, 12)` used to sit in `App()`. The two
 * sides were in a different order depending on why paths were added, which reads like an
 * accident inline — and only matters because the cap truncates. */

const paths = (count: number, prefix = "p") =>
  Array.from({ length: count }, (_, i) => `${prefix}${i}`);

describe("addAttachments", () => {
  it("appends picked paths after the existing ones", () => {
    expect(addAttachments(["a"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("dedupes while keeping first-seen order", () => {
    expect(addAttachments(["a", "b"], ["b", "c", "a"])).toEqual(["a", "b", "c"]);
  });

  it("keeps what the list already had when the cap is reached", () => {
    const full = paths(MAX_ATTACHMENTS);
    const next = addAttachments(full, ["extra"]);

    expect(next).toHaveLength(MAX_ATTACHMENTS);
    // The existing entries win; the newest pick is the one dropped.
    expect(next).toEqual(full);
    expect(next).not.toContain("extra");
  });
});

describe("restoreAttachments", () => {
  it("puts restored paths first, ahead of whatever else is listed", () => {
    // A failed send must not lose the paths the user actually tried to send.
    expect(restoreAttachments(["stale"], ["tried"])).toEqual(["tried", "stale"]);
  });

  it("gives restored paths the cap, unlike addAttachments", () => {
    const full = paths(MAX_ATTACHMENTS, "stale");
    const restored = ["tried-1", "tried-2"];
    const next = restoreAttachments(full, restored);

    expect(next.slice(0, 2)).toEqual(restored);
    expect(next).toHaveLength(MAX_ATTACHMENTS);
    expect(next).not.toContain("stale11");
  });

  it("dedupes against the current list", () => {
    expect(restoreAttachments(["a", "b"], ["b"])).toEqual(["b", "a"]);
  });

  it("is the mirror of addAttachments when the cap bites", () => {
    // The whole reason the two functions are separate rather than one with an option.
    const full = paths(MAX_ATTACHMENTS);
    expect(addAttachments(full, ["new"])).not.toContain("new");
    expect(restoreAttachments(full, ["new"])).toContain("new");
  });
});

describe("removeAttachment", () => {
  it("drops one path and leaves the rest in order", () => {
    expect(removeAttachment(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("is a no-op for a path that is not listed", () => {
    expect(removeAttachment(["a"], "z")).toEqual(["a"]);
  });
});

describe("MAX_ATTACHMENTS", () => {
  it("is the cap both merge functions apply", () => {
    expect(addAttachments([], paths(MAX_ATTACHMENTS + 5))).toHaveLength(MAX_ATTACHMENTS);
    expect(restoreAttachments([], paths(MAX_ATTACHMENTS + 5))).toHaveLength(MAX_ATTACHMENTS);
  });
});
