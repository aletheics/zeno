import { describe, expect, it } from "vite-plus/test";
import { sessionMarkerFromThread } from "./session-markers.ts";

describe("sessionMarkerFromThread", () => {
  it("resolves path and id keys and falls back to runningSessions", () => {
    expect(
      sessionMarkerFromThread(
        { path: "/tmp/A.jsonl", id: "sid-1" },
        { "/tmp/a.jsonl": { state: "waiting" } },
        { keyOf: (raw) => (raw ?? "").replace(/\\/g, "/").toLowerCase() },
      )?.state,
    ).toBe("waiting");

    expect(
      sessionMarkerFromThread(
        { path: "/tmp/missing.jsonl", id: "sid-2", active: true },
        {},
        {
          keyOf: (raw) => (raw ?? "").toLowerCase(),
          runningSessions: { "/tmp/missing.jsonl": true },
        },
      )?.state,
    ).toBe("running");

    expect(
      sessionMarkerFromThread(
        { path: "/tmp/x.jsonl", id: "x", active: true },
        {},
        { keyOf: (raw) => (raw ?? "").toLowerCase(), foregroundState: "recovering" },
      )?.state,
    ).toBe("recovering");
  });
});
