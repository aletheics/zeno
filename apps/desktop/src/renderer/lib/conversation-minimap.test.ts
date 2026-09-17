import { describe, expect, it } from "vite-plus/test";
import {
  buildConversationMinimapMarkers,
  CONVERSATION_MINIMAP_PREVIEW_MAX_CHARS,
  shouldRenderConversationMinimap,
} from "./conversation-minimap.ts";
import type { TimelineItem } from "./timeline.ts";

const user = (id: string, text: string): TimelineItem => ({ id, kind: "user", text });
const assistant = (id: string, text: string): TimelineItem => ({ id, kind: "assistant", text });
const thinking = (id: string, text: string): TimelineItem => ({ id, kind: "thinking", text });
const tool = (id: string): TimelineItem => ({
  id,
  kind: "tool",
  toolName: "read",
  status: "completed",
});
const system = (id: string, text: string): TimelineItem => ({ id, kind: "system", text });

describe("buildConversationMinimapMarkers", () => {
  it("anchors a turn's assistant marker to the final rendered row, not the first assistant", () => {
    // The turn's intermediate assistant text is folded into the process block as a
    // `narrative` step, so only `a2` ends up with a data-message-id. A marker carrying
    // `a1` would render and preview fine but never scroll anywhere.
    const markers = buildConversationMinimapMarkers([
      user("u1", "do the thing"),
      assistant("a1", "let me look"),
      tool("t1"),
      assistant("a2", "done"),
    ]);

    expect(markers).toEqual([
      { id: "u1", role: "user", preview: "do the thing" },
      { id: "a2", role: "assistant", preview: "done" },
    ]);
    expect(markers.map((m) => m.id)).not.toContain("a1");
    expect(markers.map((m) => m.id)).not.toContain("t1");
  });

  it("merges assistant rows that each got their own block and lands on the last", () => {
    // No thinking/tool steps in an open turn, so every assistant keeps its own row.
    const markers = buildConversationMinimapMarkers([
      user("u1", "go"),
      assistant("a1", "first"),
      assistant("a2", "second"),
      system("s1", "notice"),
    ]);

    expect(markers).toHaveLength(2);
    expect(markers[1]).toEqual({
      id: "a2",
      role: "assistant",
      preview: "first\n\nsecond",
    });
  });

  it("emits one user and one assistant marker per turn, in order", () => {
    const markers = buildConversationMinimapMarkers([
      user("u1", "one"),
      tool("t1"),
      assistant("a1", "reply one"),
      user("u2", "two"),
      assistant("a2", "reply two"),
    ]);

    expect(markers).toEqual([
      { id: "u1", role: "user", preview: "one" },
      { id: "a1", role: "assistant", preview: "reply one" },
      { id: "u2", role: "user", preview: "two" },
      { id: "a2", role: "assistant", preview: "reply two" },
    ]);
  });

  it("drops thinking, tool, and system rows", () => {
    const markers = buildConversationMinimapMarkers([
      user("u1", "go"),
      thinking("th1", "hmm"),
      system("s1", "notice"),
    ]);

    expect(markers).toEqual([{ id: "u1", role: "user", preview: "go" }]);
  });

  it("emits no assistant marker when the turn has no assistant text", () => {
    expect(buildConversationMinimapMarkers([user("u1", "go"), tool("t1")])).toEqual([
      { id: "u1", role: "user", preview: "go" },
    ]);
  });

  it("returns nothing for an empty timeline", () => {
    expect(buildConversationMinimapMarkers([])).toEqual([]);
  });

  it("clips previews to the maximum length and trims surrounding whitespace", () => {
    const long = "x".repeat(CONVERSATION_MINIMAP_PREVIEW_MAX_CHARS + 120);
    const markers = buildConversationMinimapMarkers([user("u1", `  ${long}  `)]);

    expect(markers[0]?.preview).toHaveLength(CONVERSATION_MINIMAP_PREVIEW_MAX_CHARS);
    expect(markers[0]?.preview).toBe("x".repeat(CONVERSATION_MINIMAP_PREVIEW_MAX_CHARS));
  });
});

describe("shouldRenderConversationMinimap", () => {
  it("needs both scroll range and at least two turns", () => {
    expect(shouldRenderConversationMinimap({ markerCount: 3, overflows: true })).toBe(true);
    expect(shouldRenderConversationMinimap({ markerCount: 1, overflows: true })).toBe(false);
    expect(shouldRenderConversationMinimap({ markerCount: 3, overflows: false })).toBe(false);
    expect(shouldRenderConversationMinimap({ markerCount: 2, overflows: true })).toBe(true);
  });
});
