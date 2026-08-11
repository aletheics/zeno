import "./proxy-bootstrap.ts";
import {
  createPixRuntime,
  projectCustomEntry,
  projectCustomMessage,
  projectToolPresentation,
  type CreatePixRuntimeOptions,
  type PixRuntimeHandle,
} from "@zeno/agent-runtime";
import {
  IPC_PROTOCOL_VERSION,
  type HostCommand,
  type HostEvent,
  isHostCommand,
  isHostEvent,
  type RuntimeEvent,
} from "@zeno/contracts";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { ProviderOAuthCoordinator, type OAuthModelRuntime } from "./provider-oauth.ts";

interface ElectronParentPort {
  postMessage(message: unknown): void;
  on(event: "message", listener: (event: { data: unknown }) => void): this;
  start(): void;
}

const parentPort = (process as NodeJS.Process & { parentPort?: ElectronParentPort }).parentPort;
if (!parentPort) throw new Error("Zeno Agent Host must run as an Electron utility process");

let handle: PixRuntimeHandle | undefined;
let unsubscribe: (() => void) | undefined;
let sequence = 0;

function post(event: HostEvent): void {
  parentPort.postMessage(event);
}

const providerOAuth = new ProviderOAuthCoordinator(post);
const testOAuthProviders = new Set<string>();

const PROMPT_IMAGE_MIME_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function loadPromptImages(paths: string[]) {
  return Promise.all(
    paths.map(async (path) => {
      const mimeType = PROMPT_IMAGE_MIME_TYPES[extname(path).toLowerCase()];
      if (!mimeType) throw new Error(`Unsupported prompt image type: ${path}`);
      const bytes = await readFile(path);
      if (bytes.byteLength === 0) throw new Error(`Prompt image is empty: ${path}`);
      return { type: "image" as const, data: bytes.toString("base64"), mimeType };
    }),
  );
}

function testOAuthRuntime(provider: string): OAuthModelRuntime | undefined {
  if (process.env.PIX_ENABLE_TEST_COMMANDS !== "1") return undefined;
  if (process.env.PIX_TEST_PROVIDER_OAUTH !== provider) return undefined;
  return {
    getProvider: (providerId) =>
      providerId === provider ? { auth: { oauth: { testOnly: true } } } : undefined,
    async login(_providerId, _type, interaction) {
      const method = await interaction.prompt({
        type: "select",
        message: "Choose a test OAuth flow",
        options: [
          { id: "browser", label: "Browser login" },
          { id: "device", label: "Device code login" },
        ],
      });
      if (method === "browser") {
        interaction.notify({
          type: "auth_url",
          url: "https://example.com/pix-oauth-test",
          instructions: "Complete the test authorization in your browser",
        });
      } else {
        interaction.notify({
          type: "device_code",
          userCode: "PIX-E2E",
          verificationUri: "https://example.com/device",
        });
      }
      await interaction.prompt({
        type: "manual_code",
        message: "Enter any value to complete the test login",
      });
      testOAuthProviders.add(provider);
      return {};
    },
  };
}

function listProvidersForHost(): ReturnType<NonNullable<typeof handle>["listProviders"]> {
  if (!handle) return [];
  const providers = handle.listProviders();
  const fixtureProvider = process.env.PIX_TEST_PROVIDER_OAUTH;
  if (process.env.PIX_ENABLE_TEST_COMMANDS !== "1" || !fixtureProvider) return providers;
  const active = testOAuthProviders.has(fixtureProvider);
  const index = providers.findIndex((entry) => entry.provider === fixtureProvider);
  const existing = index >= 0 ? providers[index] : undefined;
  if (existing) {
    providers[index] = {
      ...existing,
      configured: active || existing.configured,
      oauthSupported: true,
      oauthActive: active || existing.oauthActive,
      ...(active ? { source: "stored" as const } : {}),
    };
    return providers;
  }
  providers.push({
    provider: fixtureProvider,
    displayName: "OpenAI Codex",
    configured: active,
    modelCount: 0,
    oauthSupported: true,
    oauthActive: active,
    ...(active ? { source: "stored" as const } : {}),
  });
  return providers;
}

function testProviderUsageEvent(requestId: string): HostEvent | undefined {
  if (process.env.PIX_ENABLE_TEST_COMMANDS !== "1") return undefined;
  const fixture = process.env.PIX_TEST_PROVIDER_USAGE;
  if (!fixture) return undefined;
  try {
    const event: unknown = {
      protocolVersion: IPC_PROTOCOL_VERSION,
      type: "providers.usage",
      requestId,
      usage: JSON.parse(fixture) as unknown,
    };
    return isHostEvent(event) && event.type === "providers.usage" ? event : undefined;
  } catch {
    return undefined;
  }
}

function errorEvent(error: unknown, requestId?: string): HostEvent {
  const event: HostEvent = {
    protocolVersion: IPC_PROTOCOL_VERSION,
    type: "host.error",
    code:
      error instanceof Error && error.name === "MissingSessionCwdError"
        ? "SESSION_IMPORT_CWD_MISSING"
        : error instanceof Error && error.name === "SessionImportFileNotFoundError"
          ? "SESSION_IMPORT_FILE_NOT_FOUND"
          : "HOST_COMMAND_FAILED",
    message: error instanceof Error ? error.message : "Unknown Agent Host error",
  };
  if (requestId) event.requestId = requestId;
  return event;
}

function toolOutput(result: unknown): string {
  if (typeof result === "string") return result.slice(0, 16_000);
  if (typeof result !== "object" || result === null || !("content" in result)) return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      typeof part === "object" && part !== null && "text" in part && typeof part.text === "string"
        ? part.text
        : "",
    )
    .join("\n")
    .slice(0, 16_000);
}

function userMessageText(message: unknown): string | undefined {
  if (typeof message !== "object" || message === null || !("role" in message)) return undefined;
  if (message.role !== "user" || !("content" in message)) return undefined;
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return undefined;
  return message.content
    .map((part) =>
      typeof part === "object" &&
      part !== null &&
      "type" in part &&
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string"
        ? part.text
        : "",
    )
    .filter(Boolean)
    .join("\n");
}

function projectRuntimeEvent(event: AgentSessionEvent): RuntimeEvent | undefined {
  switch (event.type) {
    case "agent_start":
      return { type: "agent.started" };
    case "agent_settled":
      return { type: "agent.settled" };
    case "queue_update":
      return {
        type: "queue.updated",
        steering: [...event.steering],
        followUp: [...event.followUp],
      };
    case "compaction_start":
      return { type: "compaction.started", reason: event.reason };
    case "compaction_end": {
      const completed: RuntimeEvent = {
        type: "compaction.completed",
        reason: event.reason,
        aborted: event.aborted,
      };
      if (event.errorMessage) completed.errorMessage = event.errorMessage;
      return completed;
    }
    case "auto_retry_start":
      return {
        type: "retry.started",
        attempt: event.attempt,
        maxAttempts: event.maxAttempts,
        delayMs: event.delayMs,
        errorMessage: event.errorMessage,
      };
    case "auto_retry_end": {
      const ended: RuntimeEvent = {
        type: "retry.ended",
        success: event.success,
        attempt: event.attempt,
      };
      if (event.finalError) ended.finalError = event.finalError;
      return ended;
    }
    case "message_start": {
      const content = userMessageText(event.message);
      return content === undefined ? undefined : { type: "user.message", content };
    }
    case "message_update": {
      const update = event.assistantMessageEvent;
      if (update.type === "text_delta") return { type: "message.delta", delta: update.delta };
      if (update.type === "thinking_delta") {
        return { type: "thinking.delta", delta: update.delta };
      }
      return undefined;
    }
    case "message_end": {
      if (event.message.role === "custom") {
        const projected = projectCustomMessage(event.message);
        if (!projected) return undefined;
        const result: RuntimeEvent = {
          type: "custom.message",
          customType: projected.customType,
          content: projected.content,
        };
        if (projected.details !== undefined) result.details = projected.details;
        return result;
      }
      if (event.message.role !== "assistant") return undefined;
      const { stopReason } = event.message;
      if (stopReason === "stop" || stopReason === "length" || stopReason === "toolUse") {
        return { type: "message.completed", reason: stopReason };
      }
      // Pass through pi StopReason as-is (pending/deferred/aborted/error).
      if (
        stopReason === "aborted" ||
        stopReason === "error" ||
        stopReason === "pending" ||
        stopReason === "deferred"
      ) {
        return {
          type: "message.failed",
          reason: stopReason,
          message: event.message.errorMessage ?? `Model response ${stopReason}`,
        };
      }
      return undefined;
    }
    case "entry_appended": {
      const { entry } = event;
      if (!entry || typeof entry !== "object" || !("type" in entry) || entry.type !== "custom") {
        return undefined;
      }
      const projected = projectCustomEntry(
        entry as { type: string; customType?: string; data?: unknown },
      );
      if (!projected) return undefined;
      const result: RuntimeEvent = {
        type: "custom.entry",
        customType: projected.customType,
      };
      if (projected.data !== undefined) result.data = projected.data;
      return result;
    }
    case "tool_execution_start": {
      const projected = projectToolPresentation({
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        args: event.args,
      });
      return {
        type: "tool.started",
        toolCallId: event.toolCallId,
        toolName: projected.toolName,
        args: projected.args,
      };
    }
    case "tool_execution_end": {
      const projected = projectToolPresentation({
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        content: toolOutput(event.result),
        details:
          typeof event.result === "object" && event.result !== null && "details" in event.result
            ? (event.result as { details?: unknown }).details
            : undefined,
        isError: event.isError,
      });
      return {
        type: "tool.completed",
        toolCallId: event.toolCallId,
        toolName: projected.toolName,
        output: projected.content,
        isError: projected.isError,
        ...(projected.details !== undefined ? { details: projected.details } : {}),
      };
    }
    default:
      return undefined;
  }
}

function bindRuntimeEvents(runtimeHandle: PixRuntimeHandle): void {
  unsubscribe?.();
  unsubscribe = runtimeHandle.runtime.session.subscribe((event) => {
    const projected = projectRuntimeEvent(event);
    if (!projected) return;
    post({
      protocolVersion: IPC_PROTOCOL_VERSION,
      type: "runtime.event",
      runtimeId: runtimeHandle.runtimeId,
      sequence: ++sequence,
      event: projected,
    });
  });
}

async function handleCommand(command: HostCommand): Promise<void> {
  try {
    switch (command.type) {
      case "host.start": {
        providerOAuth.cancel();
        testOAuthProviders.clear();
        unsubscribe?.();
        unsubscribe = undefined;
        await handle?.dispose();
        const options: CreatePixRuntimeOptions = { cwd: command.cwd };
        if (command.agentDir) options.agentDir = command.agentDir;
        if (command.model) options.model = command.model;
        if (command.tools) options.tools = command.tools;
        if (command.persistSession !== undefined) options.persistSession = command.persistSession;
        if (command.sessionFile) options.sessionFile = command.sessionFile;
        if (command.resumeRecent !== undefined) options.resumeRecent = command.resumeRecent;
        if (command.projectTrusted !== undefined) options.projectTrusted = command.projectTrusted;
        options.onExtensionUiRequest = post;
        handle = await createPixRuntime(options);
        sequence = 0;
        bindRuntimeEvents(handle);
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "host.ready",
          requestId: command.requestId,
          snapshot: handle.snapshot(sequence),
        });
        break;
      }
      case "host.snapshot": {
        if (!handle) throw new Error("Agent Host is not ready");
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "runtime.snapshot",
          requestId: command.requestId,
          snapshot: handle.snapshot(++sequence),
        });
        break;
      }
      case "agent.prompt": {
        if (!handle) throw new Error("Agent Host is not ready");
        const promptOptions: {
          streamingBehavior?: "steer" | "followUp";
          images?: Awaited<ReturnType<typeof loadPromptImages>>;
        } = {};
        if (command.streamingBehavior) promptOptions.streamingBehavior = command.streamingBehavior;
        if (command.imagePaths?.length) {
          promptOptions.images = await loadPromptImages(command.imagePaths);
        }
        await handle.runtime.session.prompt(
          command.message,
          Object.keys(promptOptions).length > 0 ? promptOptions : undefined,
        );
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "runtime.snapshot",
          requestId: command.requestId,
          snapshot: handle.snapshot(++sequence),
        });
        break;
      }
      case "agent.queue.clear": {
        if (!handle) throw new Error("Agent Host is not ready");
        handle.runtime.session.clearQueue();
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "runtime.snapshot",
          requestId: command.requestId,
          snapshot: handle.snapshot(++sequence),
        });
        break;
      }
      case "agent.abort": {
        if (!handle) throw new Error("Agent Host is not ready");
        const session = handle.runtime.session;
        // session.abort() only signals the agent loop + waits for idle. Ancillary
        // work (bash / compaction / branch summary) can keep the process busy
        // unless we tear it down explicitly (mirrors session.dispose()).
        try {
          session.abortCompaction();
          session.abortBranchSummary();
          session.abortBash();
        } catch {
          // best-effort — still signal the agent loop below
        }
        // waitForIdle can hang when tools ignore AbortSignal or agent_settled
        // extension handlers stall. Bound the wait so the IPC reply always lands
        // before main's hostCommandTimeout for agent.abort (avoids orphaning the
        // UI as idle while the host is still mid-turn → "already processing").
        const ABORT_IDLE_BUDGET_MS = 10_000;
        await Promise.race([
          session.abort().catch(() => undefined),
          new Promise<void>((resolve) => setTimeout(resolve, ABORT_IDLE_BUDGET_MS)),
        ]);
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "runtime.snapshot",
          requestId: command.requestId,
          snapshot: handle.snapshot(++sequence),
        });
        break;
      }
      case "session.list": {
        if (!handle) throw new Error("Agent Host is not ready");
        const threads = await handle.listSessions();
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "session.list",
          requestId: command.requestId,
          threads,
          activeSessionId: handle.runtime.session.sessionId,
        });
        break;
      }
      case "session.new": {
        if (!handle) throw new Error("Agent Host is not ready");
        const result = await handle.newSession();
        if (result.cancelled) throw new Error("New session was cancelled");
        sequence = 0;
        bindRuntimeEvents(handle);
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "session.opened",
          requestId: command.requestId,
          snapshot: handle.snapshot(sequence),
          threads: await handle.listSessions(),
          history: handle.historyMessages(),
        });
        break;
      }
      case "session.current": {
        // Re-project the live session without teardown (host promote / tab re-focus).
        if (!handle) throw new Error("Agent Host is not ready");
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "session.opened",
          requestId: command.requestId,
          snapshot: handle.snapshot(sequence),
          threads: await handle.listSessions(),
          history: handle.historyMessages(),
        });
        break;
      }
      case "session.switch": {
        if (!handle) throw new Error("Agent Host is not ready");
        const result = await handle.switchSession(command.sessionPath);
        if (result.cancelled) throw new Error("Session switch was cancelled");
        sequence = 0;
        bindRuntimeEvents(handle);
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "session.opened",
          requestId: command.requestId,
          snapshot: handle.snapshot(sequence),
          threads: await handle.listSessions(),
          history: handle.historyMessages(),
        });
        break;
      }
      case "session.fork": {
        if (!handle) throw new Error("Agent Host is not ready");
        // Default: fork at the current leaf so the branched JSONL includes an assistant
        // message and is flushed to disk (pi defers write when the branch has no assistant).
        // Explicit entryId: "before" only for user messages (pi re-prompt semantics);
        // assistant/tool/etc. use "at" (include that entry in the new session).
        let entryId = command.entryId;
        let position: "before" | "at" = "before";
        if (!entryId) {
          const leafId = handle.runtime.session.sessionManager.getLeafId();
          if (!leafId) throw new Error("No session leaf available to fork from");
          entryId = leafId;
          position = "at";
        } else {
          const selected = handle.runtime.session.sessionManager.getEntry(entryId);
          if (!selected) throw new Error("Invalid entry ID for forking");
          const isUserMessage =
            selected.type === "message" &&
            selected.message &&
            typeof selected.message === "object" &&
            "role" in selected.message &&
            selected.message.role === "user";
          position = isUserMessage ? "before" : "at";
        }
        const result = await handle.fork(entryId, { position });
        if (result.cancelled) throw new Error("Session fork was cancelled");
        sequence = 0;
        bindRuntimeEvents(handle);
        const opened: HostEvent = {
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "session.opened",
          requestId: command.requestId,
          snapshot: handle.snapshot(sequence),
          threads: await handle.listSessions(),
          history: handle.historyMessages(),
        };
        if (result.selectedText !== undefined) opened.selectedText = result.selectedText;
        post(opened);
        break;
      }
      case "session.tree": {
        if (!handle) throw new Error("Agent Host is not ready");
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "session.tree",
          requestId: command.requestId,
          tree: handle.getSessionTree(),
        });
        break;
      }
      case "session.navigateTree": {
        if (!handle) throw new Error("Agent Host is not ready");
        const nav = await handle.navigateTree(command.targetId, {
          ...(command.summarize !== undefined ? { summarize: command.summarize } : {}),
          ...(command.customInstructions ? { customInstructions: command.customInstructions } : {}),
        });
        sequence = 0;
        const opened: HostEvent = {
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "session.opened",
          requestId: command.requestId,
          snapshot: { ...nav.snapshot, sequence },
          threads: await handle.listSessions(),
          history: handle.historyMessages(),
          cancelled: nav.cancelled,
        };
        // pi returns editorText when target is a user message (rewinds to parent).
        if (typeof nav.editorText === "string") opened.selectedText = nav.editorText;
        post(opened);
        break;
      }
      case "session.compact": {
        if (!handle) throw new Error("Agent Host is not ready");
        const snapshot = await handle.compact(command.instructions);
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "runtime.snapshot",
          requestId: command.requestId,
          snapshot: { ...snapshot, sequence: ++sequence },
        });
        break;
      }
      case "session.setName": {
        if (!handle) throw new Error("Agent Host is not ready");
        const snapshot = handle.setSessionName(command.name);
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "runtime.snapshot",
          requestId: command.requestId,
          snapshot: { ...snapshot, sequence: ++sequence },
        });
        break;
      }
      case "session.clone": {
        if (!handle) throw new Error("Agent Host is not ready");
        const result = await handle.cloneSession();
        if (result.cancelled) throw new Error("Session clone was cancelled");
        sequence = 0;
        bindRuntimeEvents(handle);
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "session.opened",
          requestId: command.requestId,
          snapshot: handle.snapshot(sequence),
          threads: await handle.listSessions(),
          history: handle.historyMessages(),
        });
        break;
      }
      case "session.info": {
        if (!handle) throw new Error("Agent Host is not ready");
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "session.info",
          requestId: command.requestId,
          info: handle.getSessionInfo(),
        });
        break;
      }
      case "session.export": {
        if (!handle) throw new Error("Agent Host is not ready");
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "session.export",
          requestId: command.requestId,
          result: await handle.exportSession(command.format, command.outputPath),
        });
        break;
      }
      case "session.share": {
        if (!handle) throw new Error("Agent Host is not ready");
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "session.share",
          requestId: command.requestId,
          result: await handle.shareSession(),
        });
        break;
      }
      case "session.import": {
        if (!handle) throw new Error("Agent Host is not ready");
        const result = await handle.importSession(command.inputPath, command.cwdOverride);
        if (result.cancelled) throw new Error("Session import was cancelled");
        sequence = 0;
        bindRuntimeEvents(handle);
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "session.opened",
          requestId: command.requestId,
          snapshot: handle.snapshot(sequence),
          threads: await handle.listSessions(),
          history: handle.historyMessages(),
        });
        break;
      }
      case "session.bash": {
        if (!handle) throw new Error("Agent Host is not ready");
        const bashOpts =
          command.excludeFromContext !== undefined
            ? { excludeFromContext: command.excludeFromContext }
            : undefined;
        const bash = await handle.executeBash(command.command, bashOpts);
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "session.bash",
          requestId: command.requestId,
          result: bash.result,
          snapshot: { ...bash.snapshot, sequence: ++sequence },
        });
        break;
      }
      case "session.copyLast": {
        if (!handle) throw new Error("Agent Host is not ready");
        const text = handle.getLastAssistantText();
        const event: HostEvent = {
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "session.copyLast",
          requestId: command.requestId,
        };
        if (text !== undefined) event.text = text;
        post(event);
        break;
      }
      case "runtime.reload": {
        if (!handle) throw new Error("Agent Host is not ready");
        await handle.reload();
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "runtime.snapshot",
          requestId: command.requestId,
          snapshot: handle.snapshot(++sequence),
        });
        break;
      }
      case "models.scoped.list": {
        if (!handle) throw new Error("Agent Host is not ready");
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "models.scoped",
          requestId: command.requestId,
          models: handle.listScopedModels(),
        });
        break;
      }
      case "models.refresh": {
        if (!handle) throw new Error("Agent Host is not ready");
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "model.list",
          requestId: command.requestId,
          models: await handle.refreshModelCatalog(),
        });
        break;
      }
      case "trust.get": {
        if (!handle) throw new Error("Agent Host is not ready");
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "trust.info",
          requestId: command.requestId,
          trust: handle.getTrust(),
        });
        break;
      }
      case "trust.set": {
        if (!handle) throw new Error("Agent Host is not ready");
        const snapshot = await handle.setTrust(command.trusted);
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "runtime.snapshot",
          requestId: command.requestId,
          snapshot: { ...snapshot, sequence: ++sequence },
        });
        break;
      }
      case "model.list": {
        if (!handle) throw new Error("Agent Host is not ready");
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "model.list",
          requestId: command.requestId,
          models: handle.listModels(),
        });
        break;
      }
      case "model.set": {
        if (!handle) throw new Error("Agent Host is not ready");
        const snapshot = await handle.setModel(command.provider, command.id);
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "runtime.snapshot",
          requestId: command.requestId,
          snapshot: { ...snapshot, sequence: ++sequence },
        });
        break;
      }
      case "models.config.get": {
        if (!handle) throw new Error("Agent Host is not ready");
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "models.config",
          requestId: command.requestId,
          config: await handle.getModelsJsonConfig(),
        });
        break;
      }
      case "models.config.upsert": {
        if (!handle) throw new Error("Agent Host is not ready");
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "models.config",
          requestId: command.requestId,
          config: await handle.upsertCustomProvider(command.input),
        });
        break;
      }
      case "models.config.remove": {
        if (!handle) throw new Error("Agent Host is not ready");
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "models.config",
          requestId: command.requestId,
          config: await handle.removeCustomProvider(command.provider),
        });
        break;
      }
      case "models.config.remove-model": {
        if (!handle) throw new Error("Agent Host is not ready");
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "models.config",
          requestId: command.requestId,
          config: await handle.removeCustomModel(command.provider, command.modelId),
        });
        break;
      }
      case "thinking.set": {
        if (!handle) throw new Error("Agent Host is not ready");
        const snapshot = handle.setThinkingLevel(command.level);
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "runtime.snapshot",
          requestId: command.requestId,
          snapshot: { ...snapshot, sequence: ++sequence },
        });
        break;
      }
      case "serviceTier.set": {
        if (!handle) throw new Error("Agent Host is not ready");
        const snapshot = handle.setServiceTier(command.tier);
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "runtime.snapshot",
          requestId: command.requestId,
          snapshot: { ...snapshot, sequence: ++sequence },
        });
        break;
      }
      case "providers.list": {
        if (!handle) throw new Error("Agent Host is not ready");
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "providers.list",
          requestId: command.requestId,
          providers: listProvidersForHost(),
        });
        break;
      }
      case "providers.usage": {
        if (!handle) throw new Error("Agent Host is not ready");
        const fixture = testProviderUsageEvent(command.requestId);
        if (fixture) post(fixture);
        else {
          post({
            protocolVersion: IPC_PROTOCOL_VERSION,
            type: "providers.usage",
            requestId: command.requestId,
            usage: await handle.listProviderUsage(),
          });
        }
        break;
      }
      case "providers.setApiKey": {
        if (!handle) throw new Error("Agent Host is not ready");
        const providers = await handle.setProviderApiKey(command.provider, command.apiKey);
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "providers.list",
          requestId: command.requestId,
          providers,
        });
        break;
      }
      case "providers.clearAuth": {
        if (!handle) throw new Error("Agent Host is not ready");
        const providers = await handle.clearProviderAuth(command.provider);
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "providers.list",
          requestId: command.requestId,
          providers,
        });
        break;
      }
      case "providers.oauth.start": {
        if (!handle) throw new Error("Agent Host is not ready");
        await providerOAuth.start(
          command.requestId,
          command.provider,
          testOAuthRuntime(command.provider) ?? handle.runtime.services.modelRuntime,
        );
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "providers.list",
          requestId: command.requestId,
          providers: listProvidersForHost(),
        });
        break;
      }
      case "providers.oauth.respond": {
        providerOAuth.respond(
          command.operationId,
          command.promptId,
          command.value,
          command.cancelled ?? false,
        );
        break;
      }
      case "providers.oauth.cancel": {
        providerOAuth.cancel(command.operationId);
        break;
      }
      case "settings.get": {
        if (!handle) throw new Error("Agent Host is not ready");
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "settings.view",
          requestId: command.requestId,
          settings: handle.getPiSettings(),
        });
        break;
      }
      case "settings.patch": {
        if (!handle) throw new Error("Agent Host is not ready");
        const settings = await handle.patchPiSettings(command.patch);
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "settings.view",
          requestId: command.requestId,
          settings,
          snapshot: handle.snapshot(++sequence),
        });
        break;
      }
      case "packages.list": {
        if (!handle) throw new Error("Agent Host is not ready");
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "packages.list",
          requestId: command.requestId,
          packages: handle.listPackages(),
        });
        break;
      }
      case "packages.install": {
        if (!handle) throw new Error("Agent Host is not ready");
        const packages = await handle.installPackage(
          command.source,
          command.scope,
          (event) => {
            const progress: HostEvent = {
              protocolVersion: IPC_PROTOCOL_VERSION,
              type: "packages.progress",
              requestId: command.requestId,
              action: event.action,
              source: event.source,
              phase: event.phase,
            };
            if (event.message) progress.message = event.message;
            post(progress);
          },
          command.temporary ? { temporary: true } : undefined,
        );
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "packages.changed",
          requestId: command.requestId,
          packages,
          action: "install",
          source: command.source,
        });
        break;
      }
      case "packages.setEnabled": {
        if (!handle) throw new Error("Agent Host is not ready");
        const packages = await handle.setPackageEnabled(
          command.source,
          command.scope,
          command.enabled,
        );
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "packages.changed",
          requestId: command.requestId,
          packages,
          action: "update",
          source: command.source,
        });
        break;
      }
      case "packages.remove": {
        if (!handle) throw new Error("Agent Host is not ready");
        const packages = await handle.removePackage(command.source, command.scope, (event) => {
          const progress: HostEvent = {
            protocolVersion: IPC_PROTOCOL_VERSION,
            type: "packages.progress",
            requestId: command.requestId,
            action: event.action,
            source: event.source,
            phase: event.phase,
          };
          if (event.message) progress.message = event.message;
          post(progress);
        });
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "packages.changed",
          requestId: command.requestId,
          packages,
          action: "remove",
          source: command.source,
        });
        break;
      }
      case "packages.checkUpdates": {
        if (!handle) throw new Error("Agent Host is not ready");
        const updates = await handle.checkPackageUpdates();
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "packages.updates",
          requestId: command.requestId,
          updates,
        });
        break;
      }
      case "packages.update": {
        if (!handle) throw new Error("Agent Host is not ready");
        const packages = await handle.updatePackage(command.source, (event) => {
          const progress: HostEvent = {
            protocolVersion: IPC_PROTOCOL_VERSION,
            type: "packages.progress",
            requestId: command.requestId,
            action: event.action,
            source: event.source,
            phase: event.phase,
          };
          if (event.message) progress.message = event.message;
          post(progress);
        });
        const changed: HostEvent = {
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "packages.changed",
          requestId: command.requestId,
          packages,
          action: "update",
        };
        if (command.source) changed.source = command.source;
        post(changed);
        break;
      }
      case "resources.list": {
        if (!handle) throw new Error("Agent Host is not ready");
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "resources.list",
          requestId: command.requestId,
          resources: handle.listResources(),
        });
        break;
      }
      case "util.complete-text": {
        if (!handle) throw new Error("Agent Host is not ready");
        const text = await handle.completeText(command.prompt, {
          ...(command.systemPrompt ? { systemPrompt: command.systemPrompt } : {}),
          ...(command.model ? { model: command.model } : {}),
        });
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "util.text",
          requestId: command.requestId,
          text,
        });
        break;
      }
      case "extensionUi.respond": {
        if (!handle || command.runtimeId !== handle.runtimeId) break;
        handle.respondExtensionUi(command.response);
        break;
      }
      case "test.photonProbe": {
        if (!handle) throw new Error("Agent Host is not ready");
        if (process.env.PIX_ENABLE_TEST_COMMANDS !== "1") {
          throw new Error("Photon probe command is disabled");
        }
        const photon = await import("@silvia-odwyer/photon-node");
        const inputImage = photon.PhotonImage.new_from_byteslice(await readFile(command.imagePath));
        let outputImage: InstanceType<typeof photon.PhotonImage> | undefined;
        try {
          outputImage = photon.resize(inputImage, 1, 1, photon.SamplingFilter.Lanczos3);
          post({
            protocolVersion: IPC_PROTOCOL_VERSION,
            type: "test.photonResult",
            requestId: command.requestId,
            result: {
              extensions: handle.runtime.services.resourceLoader.getExtensions().extensions.length,
              extensionDiagnostics: handle.runtime.services.diagnostics.length,
              input: { width: inputImage.get_width(), height: inputImage.get_height() },
              output: {
                width: outputImage.get_width(),
                height: outputImage.get_height(),
                bytes: outputImage.get_bytes().byteLength,
              },
            },
          });
        } finally {
          outputImage?.free();
          inputImage.free();
        }
        break;
      }
      case "test.sequenceGap": {
        if (!handle) throw new Error("Agent Host is not ready");
        if (process.env.PIX_ENABLE_TEST_COMMANDS !== "1") {
          throw new Error("Sequence gap command is disabled");
        }
        sequence += 1;
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "runtime.event",
          runtimeId: handle.runtimeId,
          sequence: ++sequence,
          event: { type: "agent.started" },
        });
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "runtime.snapshot",
          requestId: command.requestId,
          snapshot: handle.snapshot(++sequence),
        });
        break;
      }
      case "host.shutdown": {
        providerOAuth.cancel();
        unsubscribe?.();
        unsubscribe = undefined;
        await handle?.dispose();
        handle = undefined;
        post({
          protocolVersion: IPC_PROTOCOL_VERSION,
          type: "host.stopped",
          requestId: command.requestId,
        });
        break;
      }
    }
  } catch (error) {
    post(errorEvent(error, command.requestId));
  }
}

parentPort.on("message", (event) => {
  if (!isHostCommand(event.data)) {
    post(errorEvent(new Error("Rejected invalid Agent Host command")));
    return;
  }
  void handleCommand(event.data);
});
parentPort.start();

post({
  protocolVersion: IPC_PROTOCOL_VERSION,
  type: "host.hello",
  hostPid: process.pid,
});
