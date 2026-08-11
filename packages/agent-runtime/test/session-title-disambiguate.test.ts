import { describe, expect, it } from "vite-plus/test";
import type { SessionThreadSummary } from "@zeno/contracts";
import { disambiguateSessionTitles } from "../src/index.ts";

function row(
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

describe("disambiguateSessionTitles", () => {
  it("leaves unique titles unchanged", () => {
    const out = disambiguateSessionTitles([
      row({ id: "a", title: "Alpha" }),
      row({ id: "b", title: "Beta" }),
    ]);
    expect(out.map((t) => t.title)).toEqual(["Alpha", "Beta"]);
  });

  it("appends (2)/(3) by createdAt, oldest keeps bare title", () => {
    const out = disambiguateSessionTitles([
      row({
        id: "new",
        title: "Refactor",
        createdAt: "2026-03-01T00:00:00.000Z",
        parentSessionPath: "/s/old.jsonl",
      }),
      row({
        id: "old",
        title: "Refactor",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      row({
        id: "mid",
        title: "Refactor",
        createdAt: "2026-02-01T00:00:00.000Z",
        parentSessionPath: "/s/old.jsonl",
      }),
    ]);
    const byId = Object.fromEntries(out.map((t) => [t.id, t.title]));
    expect(byId.old).toBe("Refactor");
    expect(byId.mid).toBe("Refactor (2)");
    expect(byId.new).toBe("Refactor (3)");
    expect(out.find((t) => t.id === "mid")?.titleBase).toBe("Refactor");
  });

  it("falls back to modifiedAt when createdAt is missing", () => {
    const out = disambiguateSessionTitles([
      row({
        id: "later",
        title: "Same",
        modifiedAt: "2026-06-01T00:00:00.000Z",
      }),
      row({
        id: "earlier",
        title: "Same",
        modifiedAt: "2026-05-01T00:00:00.000Z",
      }),
    ]);
    const byId = Object.fromEntries(out.map((t) => [t.id, t.title]));
    expect(byId.earlier).toBe("Same");
    expect(byId.later).toBe("Same (2)");
  });
});
