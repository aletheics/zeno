import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { FakeOpenAiServer } from "../../test-utils/src/index.ts";
import {
  createPixRuntime,
  listBuiltinSlashCommands,
  mergeSlashCatalog,
  parseShellInjection,
  projectSessionTree,
} from "../src/index.ts";

const temporaryDirectories: string[] = [];

async function fixture(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(root);
  const agentDir = join(root, "agent");
  const project = join(root, "project");
  await Promise.all([mkdir(agentDir, { recursive: true }), mkdir(project, { recursive: true })]);
  const toolPath = join(project, "tool.txt");
  await writeFile(toolPath, "ok\n");
  return { root, agentDir, project, toolPath };
}

async function writeModels(agentDir: string, baseUrl: string) {
  await writeFile(
    join(agentDir, "models.json"),
    `${JSON.stringify({
      providers: {
        "pix-fake": {
          baseUrl,
          api: "openai-completions",
          apiKey: "test",
          models: [{ id: "pix-fake", name: "pix-fake", reasoning: false }],
        },
      },
    })}\n`,
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("session-parity pure helpers", () => {
  it("projects tree nodes with depth and active leaf", () => {
    const tree = projectSessionTree({
      sessionId: "s1",
      sessionFile: "/tmp/s.jsonl",
      leafId: "b",
      filterMode: "default",
      roots: [
        {
          entry: {
            id: "a",
            type: "message",
            message: { role: "user", content: "hello world" },
            timestamp: "2026-01-01T00:00:00.000Z",
          },
          children: [
            {
              entry: {
                id: "b",
                type: "message",
                parentId: "a",
                message: { role: "assistant", content: "hi" },
              },
              children: [],
            },
          ],
        },
      ],
    });
    expect(tree.nodes).toHaveLength(2);
    expect(tree.nodes[0]?.preview).toContain("hello");
    expect(tree.nodes[0]?.roleKind).toBe("user");
    expect(tree.nodes[1]?.active).toBe(true);
    expect(tree.nodes[1]?.onActivePath).toBe(true);
    expect(tree.nodes[1]?.depth).toBe(1);
  });

  it("hides bookkeeping entries in default filter mode", () => {
    const tree = projectSessionTree({
      sessionId: "s1",
      leafId: "u1",
      filterMode: "default",
      roots: [
        {
          entry: {
            id: "info",
            type: "session_info",
            message: { role: "system", content: "meta" },
          },
          children: [
            {
              entry: {
                id: "u1",
                type: "message",
                parentId: "info",
                message: { role: "user", content: "hi" },
              },
              children: [
                {
                  entry: {
                    id: "tools-only",
                    type: "message",
                    parentId: "u1",
                    message: {
                      role: "assistant",
                      content: [{ type: "toolCall", name: "bash", id: "t1" }],
                    },
                  },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    });
    // session_info hidden; tool-only assistant (not leaf) hidden
    expect(tree.nodes.map((n) => n.id)).toEqual(["u1"]);
    expect(tree.nodes[0]?.roleKind).toBe("user");
  });

  it("merges builtin slash catalog without clobbering extension names", () => {
    const merged = mergeSlashCatalog(
      [{ name: "tree", description: "ext tree", source: "extension" }],
      listBuiltinSlashCommands(),
    );
    const tree = merged.find((item) => item.name === "tree");
    expect(tree?.source).toBe("extension");
    expect(merged.some((item) => item.name === "compact")).toBe(true);
    expect(merged.some((item) => item.name === "reload")).toBe(true);
  });

  it("parses ! and !! shell injection prefixes", () => {
    expect(parseShellInjection("!ls -la").kind).toBe("shell");
    expect(parseShellInjection("!!pwd").kind).toBe("hidden-shell");
    expect(parseShellInjection("hello").kind).toBe("none");
  });
});

describe("session-parity runtime APIs", () => {
  it("round-trips session name, settings queue modes, tree navigate, compact, export", async () => {
    const paths = await fixture("pix-parity-");
    await writeFile(
      join(paths.agentDir, "settings.json"),
      `${JSON.stringify({
        compaction: { enabled: true },
        steeringMode: "all",
        followUpMode: "one-at-a-time",
        hideThinkingBlock: false,
        doubleEscapeAction: "fork",
      })}\n`,
    );

    const server = new FakeOpenAiServer({ toolPath: paths.toolPath });
    await server.start();
    await writeModels(paths.agentDir, server.baseUrl);

    const handle = await createPixRuntime({
      cwd: paths.project,
      agentDir: paths.agentDir,
      model: { provider: "pix-fake", id: "pix-fake" },
      tools: ["read"],
      persistSession: true,
    });

    try {
      await handle.runtime.session.prompt("parity hello");
      const named = handle.setSessionName("parity-session");
      expect(named.sessionName).toBe("parity-session");
      expect(handle.getSessionName()).toBe("parity-session");

      const settings = await handle.patchPiSettings({
        steeringMode: "one-at-a-time",
        followUpMode: "all",
        hideThinkingBlock: true,
        doubleEscapeAction: "tree",
        compactionEnabled: true,
        enableInstallTelemetry: false,
      });
      expect(settings.steeringMode).toBe("one-at-a-time");
      expect(settings.followUpMode).toBe("all");
      expect(settings.hideThinkingBlock).toBe(true);
      expect(settings.doubleEscapeAction).toBe("tree");
      expect(settings.readOnlyFields).toContain("thinkingBudgets");
      expect(settings.degradedCapabilities.length).toBeGreaterThan(0);
      expect(settings.inventory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: "hideThinkingBlock", source: "global", writable: true }),
          expect.objectContaining({ key: "sessionDir", source: "default", writable: false }),
          expect.objectContaining({ key: "websocketConnectTimeoutMs" }),
        ]),
      );

      const withThresholds = await handle.patchPiSettings({
        compactionReserveTokens: 8192,
        compactionKeepRecentTokens: 12000,
        retryMaxRetries: 5,
        retryBaseDelayMs: 500,
      });
      expect(withThresholds.compactionReserveTokens).toBe(8192);
      expect(withThresholds.compactionKeepRecentTokens).toBe(12000);
      expect(withThresholds.retryMaxRetries).toBe(5);
      expect(withThresholds.retryBaseDelayMs).toBe(500);
      const persistedAfter = JSON.parse(
        await readFile(join(paths.agentDir, "settings.json"), "utf8"),
      ) as {
        compaction?: { reserveTokens?: number; keepRecentTokens?: number };
        retry?: { maxRetries?: number; baseDelayMs?: number };
      };
      expect(persistedAfter.compaction?.reserveTokens).toBe(8192);
      expect(persistedAfter.compaction?.keepRecentTokens).toBe(12000);
      expect(persistedAfter.retry?.maxRetries).toBe(5);
      expect(persistedAfter.retry?.baseDelayMs).toBe(500);

      const persisted = JSON.parse(
        await readFile(join(paths.agentDir, "settings.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(persisted.steeringMode).toBe("one-at-a-time");
      expect(persisted.followUpMode).toBe("all");
      expect(persisted.hideThinkingBlock).toBe(true);
      expect(persisted.doubleEscapeAction).toBe("tree");

      const tree = handle.getSessionTree();
      expect(tree.nodes.length).toBeGreaterThan(0);
      expect(handle.snapshot().builtinSlashCommands?.some((c) => c.name === "tree")).toBe(true);
      expect(handle.snapshot().slashCommands).toBeDefined();

      const leaf = handle.runtime.session.sessionManager.getLeafId();
      expect(leaf).toBeTruthy();
      if (leaf) {
        const nav = await handle.navigateTree(leaf);
        expect(nav.cancelled).toBe(false);
        expect(nav.snapshot.sessionId).toBeTruthy();
      }

      const events: string[] = [];
      const unsub = handle.runtime.session.subscribe((event) => {
        events.push(event.type);
      });
      try {
        await handle.compact("summarize parity");
      } catch {
        // short sessions may still emit start/end
      }
      unsub();
      expect(
        events.some((event) => event === "compaction_start" || event === "compaction_end"),
      ).toBe(true);

      const info = handle.getSessionInfo();
      expect(info.sessionName).toBe("parity-session");
      expect(info.sessionFile || info.path).toBeTruthy();
      expect(typeof info.cost).toBe("number");
      expect(typeof info.tokens.total).toBe("number");
      expect(info.messageCount).toBe(handle.runtime.session.getSessionStats().totalMessages);

      const exported = await handle.exportSession("jsonl");
      expect(exported.format).toBe("jsonl");
      expect(exported.path.length).toBeGreaterThan(0);
      const exportBody = await readFile(exported.path, "utf8");
      expect(exportBody.length).toBeGreaterThan(0);

      const importedRows = exportBody.trim().split("\n");
      const importedHeader = JSON.parse(importedRows[0] ?? "{}") as Record<string, unknown>;
      importedHeader.cwd = join(paths.root, "removed-project");
      importedRows[0] = JSON.stringify(importedHeader);
      const importPath = join(paths.root, "missing-cwd-session.jsonl");
      await writeFile(importPath, `${importedRows.join("\n")}\n`);

      await expect(handle.importSession(importPath)).rejects.toMatchObject({
        name: "MissingSessionCwdError",
      });
      const replacementCwd = join(paths.root, "replacement-project");
      await mkdir(replacementCwd, { recursive: true });
      const imported = await handle.importSession(importPath, replacementCwd);
      expect(imported.cancelled).toBe(false);
      expect(handle.snapshot().cwd).toBe(replacementCwd);

      await handle.reload();
      const afterReload = handle.snapshot();
      expect(afterReload.sessionId).toBeTruthy();
      expect(afterReload.resources).toBeDefined();

      const models = await handle.refreshModelCatalog();
      expect(Array.isArray(models)).toBe(true);
      expect(handle.listScopedModels()).toEqual(expect.any(Array));
    } finally {
      await handle.dispose();
      await server.stop();
    }
  }, 90_000);
});
