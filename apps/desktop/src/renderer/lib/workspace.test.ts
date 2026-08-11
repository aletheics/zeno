import { describe, expect, it } from "vite-plus/test";
import {
  belongsInConversationsSection,
  filterRecentWorkspaces,
  isAutoDefaultWorkspacePath,
  isConversationWorkspacePath,
  isEphemeralWorkspacePath,
  isNonProjectWorkspacePath,
  mergeRecentWithOpenProject,
  prependRecentPath,
  projectThreadIdsFromCwdMap,
  threadsForWorkspaceBucket,
  unionRecentWorkspaces,
  workspaceLabel,
} from "./workspace.ts";

describe("workspace helpers", () => {
  it("labels paths for the sidebar chip", () => {
    expect(workspaceLabel("/Users/me/code/zeno")).toEqual({ name: "zeno", detail: "code" });
    expect(workspaceLabel(undefined).name).toBe("");
  });

  it("prepends and dedupes recent workspace paths", () => {
    expect(prependRecentPath(["/a", "/b"], "/c")).toEqual(["/c", "/a", "/b"]);
    expect(prependRecentPath(["/a", "/b"], "/b")).toEqual(["/b", "/a"]);
    expect(prependRecentPath(["/1", "/2", "/3"], "/4", 3)).toEqual(["/4", "/1", "/2"]);
    // Normalized key dedupe (trailing slash).
    expect(prependRecentPath(["/a/b", "/c"], "/a/b/")).toEqual(["/a/b/", "/c"]);
  });

  it("merges listed recent with selection without resurrecting removed paths", () => {
    // Prefs list is source of truth — do not pull /Users/me/a back from previous.
    expect(
      unionRecentWorkspaces(["/Users/me/b", "/Users/me/c"], ["/Users/me/a", "/Users/me/c"], {
        selected: "/Users/me/b",
        max: 12,
      }),
    ).toEqual(["/Users/me/b", "/Users/me/c"]);
    // Selected wins even when missing from listed briefly.
    expect(
      unionRecentWorkspaces(["/Users/me/c"], ["/Users/me/c"], {
        selected: "/Users/me/b",
        max: 12,
      }),
    ).toEqual(["/Users/me/b", "/Users/me/c"]);
    // Explicit exclude (just-removed) stays out even if still in listed/previous.
    expect(
      unionRecentWorkspaces(["/Users/me/a", "/Users/me/b"], ["/Users/me/a"], {
        selected: "/Users/me/b",
        exclude: ["/Users/me/a"],
        max: 12,
      }),
    ).toEqual(["/Users/me/b"]);
  });

  it("filters e2e/tmp workspaces and current cwd from recent list", () => {
    expect(isEphemeralWorkspacePath("/var/folders/xx/T/zeno-e2e-abc/workspace")).toBe(true);
    expect(isEphemeralWorkspacePath("/Users/me/code/zeno")).toBe(false);
    const paths = [
      "/Users/me/code/zeno",
      "/var/folders/xx/T/zeno-e2e-abc/workspace",
      "/Users/me/code/other",
      "/Users/me/code/zeno",
      "/tmp/zeno-fake-xyz/workspace",
    ];
    expect(filterRecentWorkspaces(paths, { current: "/Users/me/code/zeno", max: 5 })).toEqual([
      "/Users/me/code/other",
    ]);
    expect(prependRecentPath(["/Users/me/a"], "/tmp/zeno-e2e-x/workspace")).toEqual([
      "/Users/me/a",
    ]);
  });

  it("treats Documents/Zeno date folders and conversation home as non-projects", () => {
    expect(isAutoDefaultWorkspacePath("/Users/me/Documents/Zeno/2026-07-21")).toBe(true);
    expect(isAutoDefaultWorkspacePath("/Users/me/Documents/Zeno/2026-07-21-2")).toBe(true);
    expect(isAutoDefaultWorkspacePath("/Users/me/Documents/Zeno/worktrees/repo")).toBe(false);
    expect(isAutoDefaultWorkspacePath("/Users/me/code/zeno")).toBe(false);
    expect(isConversationWorkspacePath("/Users/me/Documents/Zeno/conversations")).toBe(true);
    expect(isConversationWorkspacePath("/Users/me/Documents/Zeno/conversations/x")).toBe(true);
    expect(isNonProjectWorkspacePath("/Users/me/Documents/Zeno/conversations")).toBe(true);
    expect(isNonProjectWorkspacePath("/Users/me/code/zeno")).toBe(false);
    expect(
      filterRecentWorkspaces(
        [
          "/Users/me/code/zeno",
          "/Users/me/Documents/Zeno/2026-07-21",
          "/Users/me/Documents/Zeno/conversations",
          "/Users/me/code/other",
        ],
        { max: 5 },
      ),
    ).toEqual(["/Users/me/code/zeno", "/Users/me/code/other"]);
    expect(prependRecentPath(["/Users/me/a"], "/Users/me/Documents/Zeno/2026-07-21")).toEqual([
      "/Users/me/a",
    ]);
    expect(prependRecentPath(["/Users/me/a"], "/Users/me/Documents/Zeno/conversations")).toEqual([
      "/Users/me/a",
    ]);
  });

  it("keeps the open project on recent so selection clear cannot empty projectKeys", () => {
    expect(mergeRecentWithOpenProject(["/Users/me/code/other"], "/Users/me/code/zeno", 12)).toEqual(
      ["/Users/me/code/zeno", "/Users/me/code/other"],
    );
    expect(mergeRecentWithOpenProject(["/Users/me/code/zeno"], "/Users/me/code/zeno", 12)).toEqual([
      "/Users/me/code/zeno",
    ]);
    expect(
      mergeRecentWithOpenProject(
        ["/Users/me/code/zeno"],
        "/Users/me/Documents/Zeno/conversations",
        12,
      ),
    ).toEqual(["/Users/me/code/zeno"]);
  });

  it("never classifies project-bound sessions into the 对话 section", () => {
    const byCwd = {
      "/Users/me/code/zeno": [
        { id: "proj-1", cwd: "/Users/me/code/zeno" },
        { id: "proj-2", cwd: "/Users/me/code/zeno" },
        // Leaked conversation row under a project key must not join projectThreadIds.
        { id: "conv-leaked", cwd: "/Users/me/Documents/Zeno/conversations" },
      ],
      "/Users/me/Documents/Zeno/conversations": [
        { id: "conv-1", cwd: "/Users/me/Documents/Zeno/conversations" },
      ],
    };
    const projectIds = projectThreadIdsFromCwdMap(byCwd);
    expect(projectIds.has("proj-1")).toBe(true);
    expect(projectIds.has("conv-1")).toBe(false);
    expect(projectIds.has("conv-leaked")).toBe(false);

    // Even if projectKeys is empty (selection/recent race), cwd type decides.
    expect(
      belongsInConversationsSection(
        { id: "proj-1", cwd: "/Users/me/code/zeno" },
        { projectThreadIds: new Set() },
      ),
    ).toBe(false);
    expect(
      belongsInConversationsSection(
        { id: "conv-1", cwd: "/Users/me/Documents/Zeno/conversations" },
        { projectThreadIds: projectIds },
      ),
    ).toBe(true);
    // Conversation cwd wins even if the id was also written into a project map.
    expect(
      belongsInConversationsSection(
        { id: "conv-leaked", cwd: "/Users/me/Documents/Zeno/conversations" },
        { projectThreadIds: new Set(["conv-leaked", "proj-1"]) },
      ),
    ).toBe(true);
    // Bucket membership wins when cwd is briefly missing.
    expect(
      belongsInConversationsSection({ id: "proj-2", cwd: "" }, { projectThreadIds: projectIds }),
    ).toBe(false);
  });

  it("filters host list rows into the correct workspace bucket", () => {
    const rows = [
      { id: "a", cwd: "/Users/me/code/zeno" },
      { id: "b", cwd: "/Users/me/code/other" },
      { id: "c", cwd: "/Users/me/Documents/Zeno/conversations" },
      { id: "live", cwd: "" },
    ];
    expect(threadsForWorkspaceBucket(rows, "/Users/me/code/zeno").map((r) => r.id)).toEqual([
      "a",
      "live",
    ]);
    expect(
      threadsForWorkspaceBucket(rows, "/Users/me/Documents/Zeno/conversations").map((r) => r.id),
    ).toEqual(["c", "live"]);
  });
});
