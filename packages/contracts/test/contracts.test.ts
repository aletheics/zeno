import { describe, expect, it } from "vite-plus/test";
import { IPC_PROTOCOL_VERSION, isHostCommand, isHostEvent } from "../src/index.ts";

describe("host contract validation", () => {
  it("accepts a valid start command", () => {
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "host.start",
        requestId: "request-1",
        cwd: "/tmp/project",
      }),
    ).toBe(true);
  });

  it("rejects unknown commands and protocol versions", () => {
    expect(
      isHostCommand({ protocolVersion: 2, type: "host.start", requestId: "r", cwd: "/tmp" }),
    ).toBe(false);
    expect(
      isHostCommand({ protocolVersion: IPC_PROTOCOL_VERSION, type: "host.exec", requestId: "r" }),
    ).toBe(false);
  });

  it("accepts prompt commands and projected runtime events", () => {
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "agent.prompt",
        requestId: "request-2",
        message: "hello",
        streamingBehavior: "steer",
        imagePaths: ["/tmp/image.png"],
      }),
    ).toBe(true);
    expect(
      isHostEvent({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "runtime.event",
        runtimeId: "runtime-1",
        sequence: 3,
        event: { type: "message.delta", delta: "hello" },
      }),
    ).toBe(true);
    expect(
      isHostEvent({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "runtime.event",
        runtimeId: "runtime-1",
        sequence: 4,
        event: { type: "compaction.completed", reason: "manual", aborted: false },
      }),
    ).toBe(true);
    expect(
      isHostEvent({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "runtime.event",
        runtimeId: "runtime-1",
        sequence: 4,
        event: { type: "thinking.delta", delta: "reasoning" },
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "agent.queue.clear",
        requestId: "request-clear",
      }),
    ).toBe(true);
    expect(
      isHostEvent({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "runtime.event",
        runtimeId: "runtime-1",
        sequence: 5,
        event: { type: "queue.updated", steering: ["guide"], followUp: ["later"] },
      }),
    ).toBe(true);
  });

  it("accepts persistent starts and crash lifecycle diagnostics", () => {
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "host.start",
        requestId: "request-persist",
        cwd: "/tmp/project",
        persistSession: true,
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "test.photonProbe",
        requestId: "request-photon",
        imagePath: "/tmp/input.png",
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "test.sequenceGap",
        requestId: "request-gap",
      }),
    ).toBe(true);
    expect(
      isHostEvent({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "test.photonResult",
        requestId: "request-photon",
        result: {
          extensions: 1,
          extensionDiagnostics: 0,
          input: { width: 2, height: 2 },
          output: { width: 1, height: 1, bytes: 70 },
        },
      }),
    ).toBe(true);
    expect(
      isHostEvent({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "host.crashed",
        hostId: "host-1",
        runtimeId: "runtime-1",
        exitCode: 1,
        message: "Agent Host exited unexpectedly with code 1",
      }),
    ).toBe(true);
  });

  it("accepts Extension UI requests and correlated responses", () => {
    expect(
      isHostEvent({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "extensionUi.request",
        runtimeId: "runtime-ui",
        requestId: "ui-1",
        method: "confirm",
        args: { title: "Confirm", message: "Continue?" },
        timeoutMs: 1000,
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "extensionUi.respond",
        requestId: "command-ui-1",
        runtimeId: "runtime-ui",
        response: { runtimeId: "runtime-ui", requestId: "ui-1", ok: true, value: true },
      }),
    ).toBe(true);
  });

  it("accepts hello and rejects malformed errors", () => {
    expect(
      isHostEvent({ protocolVersion: IPC_PROTOCOL_VERSION, type: "host.hello", hostPid: 42 }),
    ).toBe(true);
    expect(
      isHostEvent({ protocolVersion: IPC_PROTOCOL_VERSION, type: "host.error", code: "FAILED" }),
    ).toBe(false);
  });

  it("accepts session parity commands and settings expansion", () => {
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "session.tree",
        requestId: "tree-1",
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "session.navigateTree",
        requestId: "nav-1",
        targetId: "entry-1",
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "session.compact",
        requestId: "c-1",
        instructions: "summarize",
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "session.setName",
        requestId: "n-1",
        name: "demo",
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "session.export",
        requestId: "e-1",
        format: "jsonl",
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "session.import",
        requestId: "i-1",
        inputPath: "/tmp/session.jsonl",
        cwdOverride: "/tmp/replacement",
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "session.bash",
        requestId: "b-1",
        command: "echo hi",
        excludeFromContext: true,
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "runtime.reload",
        requestId: "r-1",
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "settings.patch",
        requestId: "s-1",
        patch: { steeringMode: "one-at-a-time", followUpMode: "all" },
      }),
    ).toBe(true);
    expect(
      isHostEvent({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "session.tree",
        tree: {
          sessionId: "s",
          filterMode: "default",
          nodes: [
            {
              id: "a",
              role: "user",
              preview: "hi",
              depth: 0,
              leaf: true,
              active: true,
            },
          ],
        },
      }),
    ).toBe(true);
    expect(
      isHostEvent({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "settings.view",
        settings: {
          agentDir: "/tmp/agent",
          defaultProjectTrust: "ask",
          compactionEnabled: true,
          compactionReserveTokens: 16384,
          compactionKeepRecentTokens: 20000,
          retryEnabled: true,
          retryMaxRetries: 3,
          retryBaseDelayMs: 2000,
          hideThinkingBlock: false,
          quietStartup: false,
          enableSkillCommands: true,
          availableThinkingLevels: ["off", "low"],
          availableServiceTiers: [],
          steeringMode: "all",
          followUpMode: "one-at-a-time",
          doubleEscapeAction: "fork",
          treeFilterMode: "default",
          enableInstallTelemetry: false,
          enableAnalytics: false,
          httpIdleTimeoutMs: 60000,
          enabledModels: ["claude-*", "gpt-4o"],
          inventory: [],
          readOnlyFields: ["thinkingBudgets"],
          degradedCapabilities: ["tui"],
        },
      }),
    ).toBe(true);
  });

  it("accepts providers list command and non-secret events", () => {
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "providers.list",
        requestId: "prov-1",
      }),
    ).toBe(true);
    expect(
      isHostEvent({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "providers.list",
        providers: [
          {
            provider: "zeno-fake",
            displayName: "Zeno",
            configured: true,
            source: "models_json_key",
            modelCount: 1,
            oauthSupported: false,
            oauthActive: false,
          },
        ],
      }),
    ).toBe(true);
    expect(
      isHostEvent({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "providers.list",
        providers: [
          {
            provider: "x",
            displayName: "x",
            configured: true,
            modelCount: 1,
            oauthSupported: false,
            oauthActive: false,
            apiKey: "sk-leak",
          },
        ],
      }),
    ).toBe(false);
  });

  it("accepts live provider usage and rejects nested credential leakage", () => {
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "providers.usage",
        requestId: "usage-1",
      }),
    ).toBe(true);
    const usageEvent = {
      protocolVersion: IPC_PROTOCOL_VERSION,
      type: "providers.usage",
      usage: [
        {
          provider: "zai",
          displayName: "Z.AI",
          updatedAt: "2026-07-22T00:00:00.000Z",
          status: "ok",
          planName: "GLM Coding Max",
          limits: [
            {
              label: "Weekly",
              usedPercent: 42,
              resetsAt: "2026-07-29T00:00:00.000Z",
              windowDurationMins: 10_080,
            },
          ],
          usageLines: [{ label: "Balance", value: "$12.50 remaining" }],
        },
      ],
    };
    expect(isHostEvent(usageEvent)).toBe(true);
    expect(
      isHostEvent({
        ...usageEvent,
        usage: [
          {
            ...usageEvent.usage[0],
            usageLines: [{ label: "Balance", value: "$12.50", token: "secret" }],
          },
        ],
      }),
    ).toBe(false);
  });

  it("validates provider OAuth commands and safe interaction events", () => {
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "providers.oauth.start",
        requestId: "oauth-1",
        provider: "openai-codex",
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "providers.oauth.respond",
        requestId: "respond-1",
        operationId: "oauth-1",
        promptId: "prompt-1",
        value: "device",
      }),
    ).toBe(true);
    expect(
      isHostEvent({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "providers.oauth",
        requestId: "oauth-1",
        provider: "openai-codex",
        update: {
          stage: "prompt",
          promptId: "prompt-1",
          prompt: {
            type: "select",
            message: "Choose a login method",
            options: [{ id: "device", label: "Device code" }],
          },
        },
      }),
    ).toBe(true);
    expect(
      isHostEvent({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "providers.oauth",
        requestId: "oauth-1",
        provider: "openai-codex",
        update: {
          stage: "info",
          message: "Continue in the browser",
          token: "must-not-cross-ipc",
        },
      }),
    ).toBe(false);
  });

  it("accepts packages/resources list commands and events", () => {
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "packages.install",
        requestId: "pkg-install",
        source: "./vendor/pkg",
        scope: "project",
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "packages.remove",
        requestId: "pkg-remove",
        source: "./vendor/pkg",
        scope: "global",
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "packages.update",
        requestId: "pkg-update",
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "packages.list",
        requestId: "pkg-1",
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "resources.list",
        requestId: "res-1",
      }),
    ).toBe(true);
    expect(
      isHostEvent({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "packages.list",
        packages: [
          {
            source: "./vendor/pkg",
            scope: "project",
            kind: "local",
            filtered: false,
            enabled: true,
            installedPath: "/tmp/vendor/pkg",
          },
        ],
      }),
    ).toBe(true);
    expect(
      isHostEvent({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "resources.list",
        resources: [{ kind: "skill", name: "demo", path: "/tmp/SKILL.md", source: "local" }],
      }),
    ).toBe(true);
  });

  it("accepts session fork command", () => {
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "session.fork",
        requestId: "fork-1",
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "session.fork",
        requestId: "fork-2",
        entryId: "entry-user-1",
      }),
    ).toBe(true);
  });

  it("accepts session list/new/switch commands and opened events", () => {
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "session.list",
        requestId: "list-1",
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "session.new",
        requestId: "new-1",
      }),
    ).toBe(true);
    expect(
      isHostCommand({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "session.switch",
        requestId: "switch-1",
        sessionPath: "/tmp/session.jsonl",
      }),
    ).toBe(true);
    expect(
      isHostEvent({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "session.list",
        requestId: "list-1",
        threads: [
          {
            id: "s1",
            path: "/tmp/s1.jsonl",
            cwd: "/tmp/project",
            title: "Hello",
            modifiedAt: "2026-07-16T00:00:00.000Z",
            messageCount: 2,
            active: true,
          },
        ],
        activeSessionId: "s1",
      }),
    ).toBe(true);
  });

  it("accepts catalog metadata on model list events", () => {
    expect(
      isHostEvent({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "model.list",
        models: [
          {
            provider: "openai",
            id: "gpt-5",
            name: "GPT-5",
            reasoning: true,
            api: "openai-responses",
            input: ["text", "image"],
            contextWindow: 400_000,
            maxTokens: 128_000,
            cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
            source: "builtin",
          },
        ],
      }),
    ).toBe(true);
    expect(
      isHostEvent({
        protocolVersion: IPC_PROTOCOL_VERSION,
        type: "model.list",
        models: [
          {
            provider: "openai",
            id: "gpt-5",
            name: "GPT-5",
            reasoning: true,
            input: ["text", "audio"],
            source: "builtin",
          },
        ],
      }),
    ).toBe(false);
  });
});
