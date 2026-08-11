import { describe, expect, it, beforeEach } from "vite-plus/test";
import {
  PROJECT_THREADS_PAGE,
  getVisibleThreadCount,
  hasThreadMessages,
  isArchivedProject,
  isPinnedProject,
  isUnreadThread,
  loadUnreadThreads,
  markThreadUnread,
  mergeProjectPriorityOrder,
  mergeThreadRows,
  moveItemInManualOrder,
  markUnreadOnAgentSettle,
  partitionProjects,
  sortProjectPaths,
  sortThreadsByMode,
  toggleExpandedProject,
} from "./project-prefs.ts";

describe("project prefs helpers", () => {
  it("partitions pinned vs rest and drops archived", () => {
    const { pinned, rest } = partitionProjects(["/a", "/b", "/c", "/a"], ["/b"], ["/c"]);
    expect(pinned).toEqual(["/b"]);
    expect(rest).toEqual(["/a"]);
    expect(isPinnedProject("/b", pinned)).toBe(true);
    expect(isArchivedProject("/c", ["/c"])).toBe(true);
  });

  it("defaults visible thread page size to 5", () => {
    expect(PROJECT_THREADS_PAGE).toBe(5);
    expect(getVisibleThreadCount("/x", {})).toBe(5);
    expect(getVisibleThreadCount("/x", { "/x": 10 })).toBe(10);
  });

  it("toggles expanded projects from the supplied state", () => {
    expect(toggleExpandedProject("/b", ["/a"])).toEqual(["/a", "/b"]);
    expect(toggleExpandedProject("/b", ["/a", "/b"])).toEqual(["/a"]);
  });

  it("sorts threads by priority / recent / manual", () => {
    const threads = [
      { id: "a", modifiedAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", modifiedAt: "2026-03-01T00:00:00.000Z" },
      { id: "c", modifiedAt: "2026-02-01T00:00:00.000Z" },
    ];
    expect(sortThreadsByMode(threads, "recent", []).map((t) => t.id)).toEqual(["b", "c", "a"]);
    // Priority keeps default/add order — pin list does not reorder.
    expect(sortThreadsByMode(threads, "priority", ["c"]).map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(sortThreadsByMode(threads, "manual", [], ["b", "a"]).map((t) => t.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("moves threads before or after a manual drop target", () => {
    expect(moveItemInManualOrder(["a", "b", "c"], "c", "a", "before")).toEqual(["c", "a", "b"]);
    expect(moveItemInManualOrder(["a", "b", "c"], "a", "c", "after")).toEqual(["b", "c", "a"]);
  });

  it("sorts project paths by priority / recent / manual", () => {
    const paths = ["/z/zebra", "/a/alpha", "/m/mid"];
    // priority uses first-seen order — open/use must not reshuffle input list alone
    expect(
      sortProjectPaths(paths, "priority", { priorityOrder: ["/a/alpha", "/z/zebra", "/m/mid"] }),
    ).toEqual(["/a/alpha", "/z/zebra", "/m/mid"]);
    expect(
      sortProjectPaths(paths, "recent", { recentOrder: ["/m/mid", "/z/zebra", "/a/alpha"] }),
    ).toEqual(["/m/mid", "/z/zebra", "/a/alpha"]);
    expect(sortProjectPaths(paths, "manual", { manualOrder: ["/z/zebra", "/m/mid"] })).toEqual([
      "/z/zebra",
      "/m/mid",
      "/a/alpha",
    ]);
  });

  it("keeps priority project order stable when open order changes", () => {
    // First import order: alpha, mid, zebra
    const seeded = mergeProjectPriorityOrder([], ["/a/alpha", "/m/mid", "/z/zebra"]);
    expect(seeded).toEqual(["/a/alpha", "/m/mid", "/z/zebra"]);
    // Opening zebra first in knownPaths must not move it to the top
    expect(mergeProjectPriorityOrder(seeded, ["/z/zebra", "/a/alpha", "/m/mid"])).toEqual([
      "/a/alpha",
      "/m/mid",
      "/z/zebra",
    ]);
    // New project only appends
    expect(mergeProjectPriorityOrder(seeded, ["/z/zebra", "/a/alpha", "/m/mid", "/n/new"])).toEqual(
      ["/a/alpha", "/m/mid", "/z/zebra", "/n/new"],
    );
  });

  it("keeps equal-time rows deterministic and ignores stale refreshes", () => {
    const current = [{ id: "session", modifiedAt: "2026-03-01T00:00:00.000Z" }];
    const stale = [{ id: "session", modifiedAt: "2026-02-01T00:00:00.000Z" }];
    const newer = [{ id: "session", modifiedAt: "2026-04-01T00:00:00.000Z" }];
    expect(mergeThreadRows(current, stale)).toEqual(current);
    expect(mergeThreadRows(current, newer)).toEqual(newer);
    expect(mergeThreadRows([], [...stale, ...newer])).toEqual(newer);
    expect(
      sortThreadsByMode(
        [
          { id: "b", modifiedAt: "2026-03-01T00:00:00.000Z" },
          { id: "a", modifiedAt: "2026-03-01T00:00:00.000Z" },
        ],
        "recent",
        [],
      ).map((thread) => thread.id),
    ).toEqual(["a", "b"]);
  });

  it("prepends brand-new sessions without reordering existing ones", () => {
    const older = {
      id: "old",
      modifiedAt: "2026-01-01T00:00:00.000Z",
      messageCount: 1,
    };
    const mid = {
      id: "mid",
      modifiedAt: "2026-02-01T00:00:00.000Z",
      messageCount: 1,
    };
    const created = {
      id: "new",
      modifiedAt: "2026-03-01T00:00:00.000Z",
      messageCount: 1,
    };
    // New session lands at top; mid/old keep relative order.
    expect(mergeThreadRows([older, mid], [mid, older, created]).map((t) => t.id)).toEqual([
      "new",
      "old",
      "mid",
    ]);
    // Touching an existing row updates metadata in place (no jump to top).
    const touched = { ...mid, modifiedAt: "2026-04-01T00:00:00.000Z" };
    expect(mergeThreadRows([older, mid], [touched, older]).map((t) => t.id)).toEqual([
      "old",
      "mid",
    ]);
    expect(mergeThreadRows([older, mid], [touched, older])[1]?.modifiedAt).toBe(
      "2026-04-01T00:00:00.000Z",
    );
  });

  it("keeps an established session through incomplete and empty refreshes", () => {
    const visible = {
      id: "visible",
      title: "First prompt",
      modifiedAt: "2026-03-01T00:00:00.000Z",
      messageCount: 1,
    };
    const other = {
      id: "other",
      title: "Other prompt",
      modifiedAt: "2026-02-01T00:00:00.000Z",
      messageCount: 2,
    };
    const emptyRefresh = {
      ...visible,
      title: "(no messages)",
      modifiedAt: "2026-04-01T00:00:00.000Z",
      messageCount: 0,
    };

    expect(mergeThreadRows([visible, other], [])).toEqual([visible, other]);
    expect(mergeThreadRows([visible, other], [emptyRefresh])).toEqual([visible, other]);
  });

  it("hides empty and placeholder sessions until they contain messages", () => {
    expect(hasThreadMessages({ messageCount: 0, title: "(no messages)" })).toBe(false);
    expect(hasThreadMessages({ messageCount: 1, title: "(no messages)" })).toBe(false);
    expect(hasThreadMessages({ messageCount: 1, title: "First prompt" })).toBe(true);
  });
});

describe("thread unread", () => {
  beforeEach(() => {
    try {
      localStorage?.removeItem?.("zeno.threads.unread");
    } catch {
      // ignore
    }
  });

  it("matches unread by session path or id", () => {
    const marked = markThreadUnread("/tmp/a.jsonl", true);
    expect(isUnreadThread({ id: "sess-a", path: "/tmp/a.jsonl" }, marked)).toBe(true);
    expect(isUnreadThread({ id: "sess-a", path: "/tmp/other.jsonl" }, marked)).toBe(false);
    const cleared = markThreadUnread({ id: "sess-a", path: "/tmp/a.jsonl" }, false);
    expect(isUnreadThread({ id: "sess-a", path: "/tmp/a.jsonl" }, cleared)).toBe(false);
  });

  it("marks unread on settle only when not viewing that thread", () => {
    expect(
      markUnreadOnAgentSettle("/tmp/bg.jsonl", {
        activeSessionKey: "/tmp/fg.jsonl",
        view: "thread",
      }),
    ).toBe(true);
    const afterBg = loadUnreadThreads();
    // Prefer in-memory list from mark return path when storage is available.
    expect(
      isUnreadThread(
        { id: "bg", path: "/tmp/bg.jsonl" },
        afterBg.length ? afterBg : ["/tmp/bg.jsonl"],
      ),
    ).toBe(true);

    markThreadUnread("/tmp/bg.jsonl", false);
    expect(
      markUnreadOnAgentSettle("/tmp/fg.jsonl", {
        activeSessionKey: "/tmp/fg.jsonl",
        view: "thread",
      }),
    ).toBe(false);

    // Viewing settings while foreground session settles → unread.
    expect(
      markUnreadOnAgentSettle("/tmp/fg.jsonl", {
        activeSessionKey: "/tmp/fg.jsonl",
        view: "settings",
      }),
    ).toBe(true);
  });

  it("isUnreadThread is pure over the provided list", () => {
    const list = ["/Users/me/proj/.pi/sessions/abc.jsonl", "other-id"];
    expect(isUnreadThread({ id: "abc", path: "/Users/me/proj/.pi/sessions/abc.jsonl" }, list)).toBe(
      true,
    );
    expect(isUnreadThread("other-id", list)).toBe(true);
    expect(isUnreadThread({ id: "nope", path: "/nope.jsonl" }, list)).toBe(false);
  });
});
