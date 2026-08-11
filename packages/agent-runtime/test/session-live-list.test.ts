import { describe, expect, it } from "vite-plus/test";
import type { SessionThreadSummary } from "@zeno/contracts";
import { mergeLiveSessionThread, threadSummaryFromLiveSession } from "../src/index.ts";

function diskRow(
  partial: Pick<SessionThreadSummary, "id" | "title"> & Partial<SessionThreadSummary>,
): SessionThreadSummary {
  return {
    path: `/s/${partial.id}.jsonl`,
    cwd: "/proj",
    modifiedAt: partial.modifiedAt ?? "2026-01-01T00:00:00.000Z",
    messageCount: 1,
    active: false,
    titleBase: partial.titleBase ?? partial.title,
    ...partial,
  };
}

describe("threadSummaryFromLiveSession", () => {
  it("builds a row from an unflushed empty session", () => {
    const row = threadSummaryFromLiveSession(
      {
        getSessionId: () => "live-1",
        getSessionFile: () => "/s/live-1.jsonl",
        getCwd: () => "/proj",
        getSessionName: () => undefined,
        getHeader: () => ({
          id: "live-1",
          timestamp: "2026-04-01T12:00:00.000Z",
          cwd: "/proj",
        }),
        getEntries: () => [],
      },
      { active: true },
    );
    expect(row).toMatchObject({
      id: "live-1",
      path: "/s/live-1.jsonl",
      cwd: "/proj",
      title: "(no messages)",
      messageCount: 0,
      active: true,
      createdAt: "2026-04-01T12:00:00.000Z",
    });
  });

  it("uses the first user message as title before any assistant reply", () => {
    const row = threadSummaryFromLiveSession({
      getSessionId: () => "live-2",
      getSessionFile: () => "/s/live-2.jsonl",
      getCwd: () => "/docs/Zeno/conversations",
      getHeader: () => ({
        id: "live-2",
        timestamp: "2026-04-01T12:00:00.000Z",
        cwd: "/docs/Zeno/conversations",
      }),
      getEntries: () => [
        {
          type: "message",
          timestamp: "2026-04-01T12:00:01.000Z",
          message: { role: "user", content: "帮我写一个排序算法\n第二行" },
        },
      ],
    });
    expect(row?.title).toBe("帮我写一个排序算法");
    expect(row?.messageCount).toBe(1);
    expect(row?.modifiedAt).toBe("2026-04-01T12:00:01.000Z");
  });

  it("prefers session_info name over first message", () => {
    const row = threadSummaryFromLiveSession({
      getSessionId: () => "live-3",
      getSessionFile: () => "/s/live-3.jsonl",
      getCwd: () => "/proj",
      getSessionName: () => "My rename",
      getHeader: () => ({ id: "live-3", timestamp: "2026-04-01T12:00:00.000Z", cwd: "/proj" }),
      getEntries: () => [
        {
          type: "message",
          message: { role: "user", content: "ignored when named" },
        },
      ],
    });
    expect(row?.title).toBe("My rename");
  });
});

describe("mergeLiveSessionThread", () => {
  it("inserts a live session missing from disk list", () => {
    const live = diskRow({
      id: "new",
      title: "Fresh chat",
      modifiedAt: "2026-04-02T00:00:00.000Z",
      active: true,
    });
    const out = mergeLiveSessionThread(
      [diskRow({ id: "old", title: "Older", modifiedAt: "2026-04-01T00:00:00.000Z" })],
      live,
    );
    expect(out.map((t) => t.id)).toEqual(["new", "old"]);
    expect(out[0]?.active).toBe(true);
    expect(out[1]?.active).toBe(false);
  });

  it("replaces a same-id disk row with live title/recency", () => {
    const live = diskRow({
      id: "a",
      title: "From first user msg",
      modifiedAt: "2026-04-03T00:00:00.000Z",
      active: true,
      messageCount: 1,
    });
    const out = mergeLiveSessionThread(
      [
        diskRow({
          id: "a",
          title: "(no messages)",
          modifiedAt: "2026-04-01T00:00:00.000Z",
          messageCount: 0,
          active: true,
        }),
      ],
      live,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe("From first user msg");
    expect(out[0]?.modifiedAt).toBe("2026-04-03T00:00:00.000Z");
  });

  it("does not regress recency when the live projection lags disk", () => {
    const out = mergeLiveSessionThread(
      [diskRow({ id: "a", title: "Disk title", modifiedAt: "2026-04-05T00:00:00.000Z" })],
      diskRow({
        id: "a",
        title: "Live title",
        modifiedAt: "2026-04-03T00:00:00.000Z",
        active: true,
      }),
    );
    expect(out[0]).toMatchObject({
      title: "Live title",
      modifiedAt: "2026-04-05T00:00:00.000Z",
      active: true,
    });
  });

  it("returns disk list unchanged when live is undefined", () => {
    const disk = [diskRow({ id: "a", title: "A" })];
    expect(mergeLiveSessionThread(disk, undefined)).toBe(disk);
  });
});
