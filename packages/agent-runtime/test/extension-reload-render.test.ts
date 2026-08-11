import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createPortableExtensionUiBridge } from "../src/extension-ui-bridge.ts";
import {
  projectCustomEntry,
  projectCustomMessage,
  projectToolPresentation,
  sanitizeSerializable,
} from "../src/generic-renderers.ts";
import type { HostSnapshot } from "@zeno/contracts";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

function isolatedEnvironment(home: string, agentDir: string): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/(_API_KEY|_TOKEN|_SECRET|_CREDENTIALS?)$/i.test(key)) delete environment[key];
  }
  return {
    ...environment,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    PI_CODING_AGENT_DIR: agentDir,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("U03 Extension UI reload cleanup", () => {
  it("cancels pending dialogs, clears portable state, and rejects late responses", async () => {
    const requests: Array<{ requestId: string; method: string; args: unknown }> = [];
    const bridge = createPortableExtensionUiBridge({
      runtimeId: "runtime-reload",
      onRequest: (request) => requests.push(request),
    });

    const pending = bridge.uiContext.select("Pending", ["one", "two"]);
    const pendingRequest = requests.find((request) => request.method === "select");
    expect(pendingRequest).toBeTruthy();

    bridge.uiContext.setStatus("fixture", "ready");
    bridge.uiContext.setWidget("fixture", ["line"]);
    bridge.uiContext.setTitle("Fixture title");
    bridge.uiContext.setWorkingMessage("Working");
    bridge.uiContext.setWorkingVisible(true);
    bridge.uiContext.setEditorText("draft");

    const beforeReload = requests.length;
    bridge.reload();

    await expect(pending).resolves.toBeUndefined();
    const after = requests.slice(beforeReload);
    expect(after.some((request) => request.method === "setStatus")).toBe(true);
    expect(after.some((request) => request.method === "setWidget")).toBe(true);
    expect(after.some((request) => request.method === "setTitle")).toBe(true);
    expect(after.some((request) => request.method === "setWorkingMessage")).toBe(true);
    expect(after.some((request) => request.method === "setWorkingVisible")).toBe(true);
    expect(after.some((request) => request.method === "setEditorText")).toBe(true);
    expect(bridge.uiContext.getEditorText()).toBe("");

    if (!pendingRequest) throw new Error("missing select request");
    expect(
      bridge.respond({
        runtimeId: "runtime-reload",
        requestId: pendingRequest.requestId,
        ok: true,
        value: "one",
      }),
    ).toBe(false);

    // Unsupported diagnostics reset after reload so a new cycle can report once.
    await expect(bridge.uiContext.custom(() => undefined as never)).resolves.toBeUndefined();
    expect(requests.filter((request) => request.method === "unsupported")).toHaveLength(1);
    bridge.dispose();
  });

  it("clears pending UI through session.reload without killing the runtime", async () => {
    const root = await mkdtemp(join(tmpdir(), "zeno-ext-reload-"));
    temporaryDirectories.push(root);
    const home = join(root, "home");
    const agentDir = join(home, ".pi", "agent");
    const project = join(root, "project");
    await Promise.all([
      mkdir(join(agentDir, "extensions"), { recursive: true }),
      mkdir(join(home, ".agents"), { recursive: true }),
      mkdir(project, { recursive: true }),
    ]);
    await writeFile(
      join(agentDir, "extensions", "reload-pending.ts"),
      `export default function (pi: any) {
  pi.on("session_start", async (_event: unknown, ctx: any) => {
    if (_event?.reason === "reload") {
      ctx.ui.setStatus("after-reload", "ok");
      return;
    }
    // Leave a pending dialog open until host reloads.
    void ctx.ui.select("U03 pending", ["alpha", "beta"], { timeout: 60_000 });
    ctx.ui.setStatus("before-reload", "pending");
    ctx.ui.setWidget("before-reload", ["widget"]);
  });
}
`,
    );

    const probe = join(import.meta.dirname, "reload-probe.mjs");
    const { stdout, stderr } = await execFileAsync(process.execPath, [probe, project, agentDir], {
      cwd: project,
      env: isolatedEnvironment(home, agentDir),
      timeout: 30_000,
    });
    const result = JSON.parse(stdout.trim()) as {
      pendingResolved: boolean;
      lateRejected: boolean;
      clearMethods: string[];
      afterReloadStatus: boolean;
      snapshot: HostSnapshot;
    };

    expect(stderr).toBe("");
    expect(result.pendingResolved).toBe(true);
    expect(result.lateRejected).toBe(true);
    expect(result.clearMethods).toEqual(expect.arrayContaining(["setStatus", "setWidget"]));
    expect(result.afterReloadStatus).toBe(true);
    expect(result.snapshot.runtimeId).toBeTruthy();
    expect(result.snapshot.resources.extensions).toBe(1);
  }, 40_000);
});

describe("U05 generic custom renderers", () => {
  it("hides display:false messages and never needs TUI factories", () => {
    let messageFactoryCalls = 0;
    let entryFactoryCalls = 0;
    let toolFactoryCalls = 0;
    const messageFactory = () => {
      messageFactoryCalls += 1;
      return { kind: "tui-component" };
    };
    const entryFactory = () => {
      entryFactoryCalls += 1;
      return { kind: "tui-component" };
    };
    const toolFactory = () => {
      toolFactoryCalls += 1;
      return { kind: "tui-component" };
    };

    expect(
      projectCustomMessage({
        role: "custom",
        customType: "hidden",
        content: "secret",
        display: false,
        details: { factory: messageFactory },
      }),
    ).toBeNull();

    const visible = projectCustomMessage({
      role: "custom",
      customType: "status-update",
      content: [{ type: "text", text: "hello" }],
      display: true,
      details: { level: "info", factory: messageFactory },
    });
    expect(visible).toEqual({
      kind: "custom.message",
      customType: "status-update",
      content: "hello",
      display: true,
      details: { level: "info" },
    });

    const entry = projectCustomEntry({
      type: "custom",
      customType: "bookmark",
      data: { path: "src/a.ts", factory: entryFactory },
    });
    expect(entry).toEqual({
      kind: "custom.entry",
      customType: "bookmark",
      data: { path: "src/a.ts" },
    });

    const tool = projectToolPresentation({
      toolName: "boom",
      toolCallId: "call-1",
      args: { q: "x", factory: toolFactory },
      content: [{ type: "text", text: "result text" }],
      details: { code: 1, factory: toolFactory },
      isError: true,
    });
    expect(tool).toEqual({
      kind: "tool",
      toolName: "boom",
      toolCallId: "call-1",
      args: { q: "x" },
      content: "result text",
      details: { code: 1 },
      isError: true,
    });

    // Projection never executes renderer factories.
    expect(messageFactoryCalls).toBe(0);
    expect(entryFactoryCalls).toBe(0);
    expect(toolFactoryCalls).toBe(0);
    expect(sanitizeSerializable({ a: () => 1, b: "ok" })).toEqual({ b: "ok" });
  });

  it("projects custom messages from a live extension without executing renderers", async () => {
    const root = await mkdtemp(join(tmpdir(), "zeno-ext-render-"));
    temporaryDirectories.push(root);
    const home = join(root, "home");
    const agentDir = join(home, ".pi", "agent");
    const project = join(root, "project");
    await Promise.all([
      mkdir(join(agentDir, "extensions"), { recursive: true }),
      mkdir(join(home, ".agents"), { recursive: true }),
      mkdir(project, { recursive: true }),
    ]);
    await writeFile(
      join(agentDir, "extensions", "probe-renderers.ts"),
      `export default function (pi: any) {
  let messageRendererCalls = 0;
  let entryRendererCalls = 0;
  pi.registerMessageRenderer("zeno-u05", () => {
    messageRendererCalls += 1;
    throw new Error("message renderer must not run");
  });
  pi.registerEntryRenderer("zeno-ext-entry", () => {
    entryRendererCalls += 1;
    throw new Error("entry renderer must not run");
  });
  pi.registerCommand("probe-emit", {
    description: "Emit custom message/entry for generic fallback",
    handler: async () => {
      pi.appendEntry("zeno-ext-entry", { note: "entry-data" });
      pi.sendMessage({
        customType: "zeno-u05",
        content: "visible custom message",
        display: true,
        details: { level: "info" },
      });
      pi.sendMessage({
        customType: "zeno-ext-hidden",
        content: "hidden",
        display: false,
      });
      globalThis.__pixU05Counts = { messageRendererCalls, entryRendererCalls };
    },
  });
}
`,
    );

    const probe = join(import.meta.dirname, "render-probe.mjs");
    const { stdout, stderr } = await execFileAsync(process.execPath, [probe, project, agentDir], {
      cwd: project,
      env: isolatedEnvironment(home, agentDir),
      timeout: 30_000,
    });
    const result = JSON.parse(stdout.trim()) as {
      visible: ReturnType<typeof projectCustomMessage>;
      hidden: ReturnType<typeof projectCustomMessage>;
      entry: ReturnType<typeof projectCustomEntry>;
      rendererCounts: { messageRendererCalls: number; entryRendererCalls: number };
      snapshot: HostSnapshot;
    };

    expect(stderr).toBe("");
    expect(result.visible).toMatchObject({
      kind: "custom.message",
      customType: "zeno-u05",
      content: "visible custom message",
      display: true,
    });
    expect(result.hidden).toBeNull();
    expect(result.entry).toMatchObject({
      kind: "custom.entry",
      customType: "zeno-ext-entry",
      data: { note: "entry-data" },
    });
    expect(result.rendererCounts.messageRendererCalls).toBe(0);
    expect(result.rendererCounts.entryRendererCalls).toBe(0);
    expect(result.snapshot.resources.extensions).toBe(1);
  }, 40_000);
});

describe("U06 Extension runtime errors", () => {
  it("records event/tool/command/UI callback errors without terminating the runtime", async () => {
    const root = await mkdtemp(join(tmpdir(), "zeno-ext-errors-"));
    temporaryDirectories.push(root);
    const home = join(root, "home");
    const agentDir = join(home, ".pi", "agent");
    const project = join(root, "project");
    const toolPath = join(project, "fixture.txt");
    await Promise.all([
      mkdir(join(agentDir, "extensions"), { recursive: true }),
      mkdir(join(home, ".agents"), { recursive: true }),
      mkdir(project, { recursive: true }),
    ]);
    await writeFile(toolPath, "U06 fixture\n");
    await writeFile(
      join(agentDir, "extensions", "probe-errors.ts"),
      `import { Type } from "typebox";
export default function (pi: any) {
  pi.on("session_start", async (event: any) => {
    if (event?.reason === "startup") {
      throw new Error("zeno-ext-event-handler-error");
    }
  });
  pi.registerCommand("probe-boom", {
    description: "Throw from command handler",
    handler: async () => {
      throw new Error("zeno-ext-command-error");
    },
  });
  pi.registerTool({
    name: "u06_boom_tool",
    label: "U06 Boom",
    description: "Throw from tool execute",
    parameters: Type.Object({}),
    async execute() {
      throw new Error("zeno-ext-tool-error");
    },
  });
  pi.on("agent_start", async (_event: unknown, ctx: any) => {
    // Force a UI request so Host can observe UI callback failure path if configured.
    await ctx.ui.notify("probe-notify", "info");
  });
}
`,
    );

    const probe = join(import.meta.dirname, "error-probe.mjs");
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [probe, project, agentDir, toolPath],
      {
        cwd: project,
        env: isolatedEnvironment(home, agentDir),
        timeout: 40_000,
      },
    );
    const result = JSON.parse(stdout.trim()) as {
      alive: boolean;
      diagnostics: HostSnapshot["diagnostics"];
      toolIsError: boolean;
      toolOutput: string;
      uiCallbackError: boolean;
      snapshot: HostSnapshot;
    };

    expect(stderr).toBe("");
    expect(result.alive).toBe(true);
    expect(result.snapshot.runtimeId).toBeTruthy();
    const messages = result.diagnostics.map((item) => item.message).join("\n");
    expect(messages).toContain("zeno-ext-event-handler-error");
    expect(messages).toContain("zeno-ext-command-error");
    expect(result.toolIsError).toBe(true);
    expect(result.toolOutput.toLowerCase()).toContain("zeno-ext-tool-error");
    expect(result.uiCallbackError).toBe(true);
    expect(JSON.stringify(result.diagnostics)).not.toContain(home);
  }, 50_000);
});
