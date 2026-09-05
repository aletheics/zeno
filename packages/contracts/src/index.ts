export const IPC_PROTOCOL_VERSION = 1 as const;

export interface ResourceCounts {
  extensions: number;
  skills: number;
  prompts: number;
  themes: number;
  contextFiles: number;
}

/** Non-secret per-million-token rates from pi-ai's model catalog. */
export interface ModelCostSummary {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ModelSummary {
  provider: string;
  id: string;
  name: string;
  reasoning: boolean;
  /** pi-ai request API (for example, `openai-responses`). */
  api?: string;
  /** Input modalities advertised by pi-ai for this model. */
  input?: Array<"text" | "image">;
  /** Maximum context length advertised by pi-ai. */
  contextWindow?: number;
  /** Maximum generated-token count advertised by pi-ai. */
  maxTokens?: number;
  /** Non-secret catalog pricing, in USD per million tokens. */
  cost?: ModelCostSummary;
  /**
   * `builtin` — pi/pi-ai catalog providers.
   * `custom` — user models.json / extension-registered providers.
   */
  source: "builtin" | "custom";
}

/**
 * pi-supported streaming API types for custom providers in models.json.
 * Full set from pi `docs/custom-provider.md` (API Types).
 */
export type CustomModelApi =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generative-ai"
  | "azure-openai-responses"
  | "openai-codex-responses"
  | "mistral-conversations"
  | "google-vertex"
  | "bedrock-converse-stream";

/** Credential-blind projection of one model entry inside models.json. */
export interface ModelsJsonModelView {
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: "text" | "text-image";
  contextWindow?: number;
  maxTokens?: number;
  costInput?: number;
  costOutput?: number;
  costCacheRead?: number;
  costCacheWrite?: number;
}

/** Credential-blind projection of one provider block from models.json. */
export interface ModelsJsonProviderView {
  provider: string;
  baseUrl?: string;
  api?: string;
  authHeader?: boolean;
  /** HTTP User-Agent from models.json headers (if set). */
  userAgent?: string;
  models: ModelsJsonModelView[];
  /** True when models.json declares an apiKey field (value is never exposed). */
  hasApiKeyField: boolean;
}

/**
 * Safe view of `~/.pi/agent/models.json` (or PI_CODING_AGENT_DIR).
 * Never includes apiKey / header secret values.
 */
export interface ModelsJsonConfigView {
  path: string;
  exists: boolean;
  providers: ModelsJsonProviderView[];
  error?: string;
}

/**
 * Upsert a custom provider/model into models.json (pi models.md shape).
 * `apiKey` is applied via AuthStorage (never projected back to the renderer).
 */
export interface UpsertCustomProviderInput {
  provider: string;
  baseUrl: string;
  api: CustomModelApi;
  /** Optional; stored through setRuntimeApiKey, not echoed in config views. */
  apiKey?: string;
  /** When true, pi sends `Authorization: Bearer <apiKey>`. */
  authHeader?: boolean;
  /**
   * HTTP User-Agent for this provider (written to models.json headers).
   * Prefer a product UA (e.g. ZenoDesktop/0.2.0) — OpenAI SDK defaults are often blocked by proxies.
   */
  userAgent?: string;
  modelId: string;
  modelName?: string;
  reasoning?: boolean;
  /** pi model `input`: text only or text+image. Default text. */
  input?: "text" | "text-image";
  /** Default 128000 per pi models.md. */
  contextWindow?: number;
  /** Default 16384 per pi models.md. */
  maxTokens?: number;
  /** $/M tokens — default 0. */
  costInput?: number;
  costOutput?: number;
  costCacheRead?: number;
  costCacheWrite?: number;
  /** Edit mode: previous provider id when renaming/moving a model. */
  previousProvider?: string;
  /** Edit mode: previous model id when renaming within or across providers. */
  previousModelId?: string;
}

/** Request the OpenAI-compatible `GET {baseUrl}/models` list from a custom provider. */
export interface FetchModelListInput {
  baseUrl: string;
  api: CustomModelApi;
  apiKey?: string;
}

/** Non-secret provider credential status (never includes API keys or tokens). */
export interface ProviderAuthSummary {
  provider: string;
  displayName: string;
  configured: boolean;
  source?:
    | "stored"
    | "runtime"
    | "environment"
    | "fallback"
    | "models_json_key"
    | "models_json_command";
  label?: string;
  modelCount: number;
  /** Provider exposes an OAuth login flow. */
  oauthSupported: boolean;
  /** The currently stored credential is OAuth. */
  oauthActive: boolean;
}

export type ProviderOAuthPrompt =
  | {
      type: "text" | "secret" | "manual_code";
      message: string;
      placeholder?: string;
    }
  | {
      type: "select";
      message: string;
      options: Array<{ id: string; label: string; description?: string }>;
    };

export type ProviderOAuthUpdate =
  | { stage: "prompt"; promptId: string; prompt: ProviderOAuthPrompt }
  | { stage: "auth_url"; url: string; instructions?: string }
  | {
      stage: "device_code";
      userCode: string;
      verificationUri: string;
      intervalSeconds?: number;
      expiresInSeconds?: number;
    }
  | { stage: "info"; message: string; links?: Array<{ url: string; label?: string }> }
  | { stage: "progress"; message: string }
  | { stage: "complete" }
  | { stage: "error"; message: string }
  | { stage: "cancelled" };

export interface ProviderOAuthEvent {
  operationId: string;
  provider: string;
  update: ProviderOAuthUpdate;
}

export type ProviderUsageStatus = "ok" | "needs-auth" | "error";

export interface ProviderUsageLimit {
  label: string;
  usedPercent: number;
  resetsAt?: string;
  windowDurationMins?: number;
  detail?: string;
}

export interface ProviderUsageLine {
  label: string;
  value: string;
  subtitle?: string;
}

/** Live account quota returned by a provider endpoint; never contains credentials. */
export interface ProviderUsageSnapshot {
  provider: string;
  displayName: string;
  updatedAt: string;
  status: ProviderUsageStatus;
  limits: ProviderUsageLimit[];
  usageLines: ProviderUsageLine[];
  planName?: string;
  detail?: string;
}

export interface ProjectTrustSummary {
  required: boolean;
  trusted: boolean;
  savedDecision: boolean | null;
  fallback: "ask" | "always" | "never";
}

/** Session usage projection from pi `getSessionStats` / `getContextUsage`. */
export interface SessionUsageSummary {
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
  context?: {
    tokens: number | null;
    contextWindow: number;
    percent: number | null;
  };
}

/** Executable command exposed by the active pi session. */
export interface SlashCommandSummary {
  name: string;
  description: string;
  source: "extension" | "prompt" | "skill" | "builtin";
  argumentHint?: string;
}

export interface QueuedMessages {
  steering: string[];
  followUp: string[];
}

export interface HostSnapshot {
  runtimeId: string;
  sequence: number;
  cwd: string;
  agentDir: string;
  sessionId: string;
  sessionFile?: string;
  /** pi session display name (shared with CLI `/name`). */
  sessionName?: string;
  model?: {
    provider: string;
    id: string;
    /** pi-ai model.api (e.g. openai-responses, anthropic-messages). */
    api?: string;
    /** Whether the model supports extended thinking / reasoning. */
    reasoning?: boolean;
  };
  thinkingLevel?: string;
  availableThinkingLevels?: string[];
  /**
   * OpenAI `service_tier` (flex | default | priority) when the active model
   * officially supports it (OpenAI/Codex/Azure product; custom proxy only if
   * model id matches such a catalog product). Empty = unsupported.
   * Not a pi session field — Zeno preference applied via request payload hook.
   */
  serviceTier?: "flex" | "default" | "priority";
  availableServiceTiers?: Array<"flex" | "default" | "priority">;
  usage?: SessionUsageSummary;
  slashCommands: SlashCommandSummary[];
  /** Built-in pi-aligned slash commands available on desktop. */
  builtinSlashCommands?: BuiltinSlashCommand[];
  queuedMessages: QueuedMessages;
  activeTools: string[];
  projectTrusted: boolean;
  trust?: ProjectTrustSummary;
  resources: ResourceCounts;
  configuredPackages: {
    global: number;
    project: number;
  };
  /** Current queue delivery modes from session/settings. */
  steeringMode?: QueueDeliveryMode;
  followUpMode?: QueueDeliveryMode;
  hideThinkingBlock?: boolean;
  doubleEscapeAction?: DoubleEscapeAction;
  diagnostics: Array<{
    type: "info" | "warning" | "error";
    message: string;
  }>;
}

export type RuntimeEvent =
  | { type: "agent.started" | "agent.settled" }
  | { type: "user.message"; content: string }
  | { type: "queue.updated"; steering: string[]; followUp: string[] }
  | { type: "message.delta"; delta: string }
  | { type: "thinking.delta"; delta: string }
  | { type: "message.completed"; reason: "stop" | "length" | "toolUse" }
  /**
   * Non-success assistant stop reasons from pi (`StopReason` minus completed ones).
   * Preserve the upstream reason — do not collapse pending/deferred into "error".
   */
  | {
      type: "message.failed";
      reason: "aborted" | "error" | "pending" | "deferred";
      message: string;
    }
  | { type: "tool.started"; toolCallId: string; toolName: string; args: unknown }
  | {
      type: "tool.completed";
      toolCallId: string;
      toolName: string;
      output: string;
      isError: boolean;
      /** Tool-specific payload (e.g. edit `details.diff` with file line numbers). */
      details?: unknown;
    }
  | {
      type: "shell.completed";
      command: string;
      output: string;
      exitCode: number;
      excludeFromContext: boolean;
    }
  | { type: "compaction.started"; reason: "manual" | "threshold" | "overflow" }
  | {
      type: "compaction.completed";
      reason: "manual" | "threshold" | "overflow";
      aborted: boolean;
      errorMessage?: string;
    }
  | {
      /** Auto-retry after a retryable model error (rate limit / overloaded / 5xx). */
      type: "retry.started";
      attempt: number;
      maxAttempts: number;
      delayMs: number;
      errorMessage: string;
    }
  | {
      type: "retry.ended";
      success: boolean;
      attempt: number;
      finalError?: string;
    }
  | {
      type: "custom.message";
      customType: string;
      content: string;
      details?: unknown;
    }
  | {
      type: "custom.entry";
      customType: string;
      data?: unknown;
    };

export interface PhotonProbeResult {
  extensions: number;
  extensionDiagnostics: number;
  input: { width: number; height: number };
  output: { width: number; height: number; bytes: number };
}

export type ExtensionUiMethod =
  | "select"
  | "confirm"
  | "input"
  | "editor"
  | "notify"
  | "setStatus"
  | "setWorkingMessage"
  | "setWorkingVisible"
  | "setWorkingIndicator"
  | "setHiddenThinkingLabel"
  | "setWidget"
  | "setTitle"
  | "setEditorText"
  | "unsupported";

export interface ExtensionUiResponse {
  runtimeId: string;
  requestId: string;
  ok: boolean;
  value?: unknown;
  error?: string;
}

/** Serializable thread row for the sidebar (pi session metadata). */
export interface SessionThreadSummary {
  id: string;
  path: string;
  cwd: string;
  title: string;
  /** Base title before same-cwd duplicate disambiguation (` (2)`, …). */
  titleBase?: string;
  modifiedAt: string;
  /** Session header created time when known (stable fork/order key). */
  createdAt?: string;
  messageCount: number;
  active: boolean;
  /**
   * Absolute path of the parent session JSONL when this session was forked
   * (`header.parentSession` from pi). Omitted for root / non-fork sessions.
   */
  parentSessionPath?: string;
}

/** History used to rebuild the timeline after open/switch/new/fork. */
export interface SessionHistoryMessage {
  role: "user" | "assistant" | "thinking" | "tool" | "system" | "shell";
  text: string;
  toolName?: string;
  isError?: boolean;
  command?: string;
  /** Tool call args when persisted on the session message (for process-row previews). */
  args?: unknown;
  /**
   * Tool result payload from pi (e.g. edit `details.diff` / `details.patch` with real file line numbers).
   * Must be preserved so history reload does not fall back to fake 1-based snippet line numbers.
   */
  details?: unknown;
  exitCode?: number;
  excludeFromContext?: boolean;
  title?: string;
  /** pi session entry id when available (fork target). */
  entryId?: string;
  /**
   * ISO timestamp when known.
   * For tools: prefer toolCall start when paired; otherwise the result entry time.
   */
  timestamp?: string;
  /** ISO end time for tool rows (toolResult entry), when start was taken from toolCall. */
  endedAt?: string;
}

/** Configured pi package row for Installed view. */
export interface PackageSummary {
  source: string;
  scope: "global" | "project";
  kind: "npm" | "git" | "local" | "unknown";
  /** True when package entry is object form (path filters / autoload options). */
  filtered: boolean;
  /**
   * Whether package resources autoload (pi `autoload !== false`).
   * When false, entry is kept in settings but resources are not loaded.
   */
  enabled: boolean;
  installedPath?: string;
}

/** Result of packages.checkUpdates (pi DefaultPackageManager.checkForAvailableUpdates). */
export interface PackageUpdateInfo {
  source: string;
  displayName: string;
  type: "npm" | "git";
  scope: "global" | "project";
}

/** Loaded pi resource row for Resources view. */
export interface ResourceSummary {
  kind: "extension" | "skill" | "prompt" | "theme" | "context" | "system";
  name: string;
  path: string;
  source?: string;
}

/** One MCP server entry in mcp.json. */
export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  /** When true the adapter skips this server (soft remove). */
  disabled?: boolean;
  /** npm package name this server was installed from (for updates). */
  packageName?: string;
  /** Working directory for the MCP server process (package root). */
  cwd?: string;
}

/** Full mcp.json shape. */
export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

/** Composer chrome: current git branch / worktree summary. */
export interface GitContextInfo {
  branch?: string;
  /** Display label (e.g. 本地 / worktree folder name). */
  worktree?: string;
  /** True when cwd is the primary worktree (`.git` is a directory). */
  isMainWorktree?: boolean;
  /** Absolute path of the primary worktree root when known. */
  mainWorktreePath?: string;
  /** Absolute path of the current worktree root. */
  worktreePath?: string;
}

export interface GitBranchInfo {
  name: string;
  current: boolean;
  /** True when name is a remote-tracking ref (e.g. origin/main). */
  remote?: boolean;
}

export interface GitWorktreeInfo {
  path: string;
  branch?: string;
  bare?: boolean;
  /** Primary worktree for the repository. */
  main?: boolean;
}

/** Working-tree change row (no file content / diff preview). */
export interface GitChangeItem {
  path: string;
  /** Short git status code, e.g. M, A, D, ?? */
  status: string;
  staged: boolean;
}

export interface GitStatusSummary {
  branch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  changes: GitChangeItem[];
  clean: boolean;
  /** Aggregate line stats from `git diff --numstat` (unstaged+staged). */
  insertions?: number;
  deletions?: number;
}

/** Detected local app for "Open in…". */
export interface DetectedApp {
  id: string;
  name: string;
  kind: "ide" | "terminal" | "finder";
  /** Platform-specific launch target (app name / path). */
  target: string;
  /** OS file icon as data URL (data:image/png;base64,…) when available. */
  iconDataUrl?: string;
}

/** Official gallery entry (npm packages tagged `pi-package`). */
export interface CatalogPackage {
  name: string;
  description: string;
  version: string;
  /** Install source, e.g. npm:@scope/name */
  source: string;
  publisher?: string;
  weeklyDownloads?: number;
  updatedAt?: string;
  keywords?: string[];
}

/** Paginated result from npm registry search for the Discover tab. */
export interface CatalogSearchResult {
  packages: CatalogPackage[];
  /** Total hits reported by the registry (may exceed returned page). */
  total: number;
}

export type QueueDeliveryMode = "all" | "one-at-a-time";
export type DoubleEscapeAction = "fork" | "tree" | "none";
export type TreeFilterMode = "default" | "no-tools" | "user-only" | "labeled-only" | "all";

export interface PiSettingsInventoryItem {
  key: string;
  value: string;
  source: "default" | "global" | "project" | "merged";
  configuredScopes: Array<"global" | "project">;
  writable: boolean;
}

/** Visual projection of pi global settings.json (safe fields only). */
export interface PiSettingsView {
  agentDir: string;
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: string;
  defaultProjectTrust: "ask" | "always" | "never";
  theme?: string;
  compactionEnabled: boolean;
  /** Tokens reserved for the model response when auto-compacting (pi default 16384). */
  compactionReserveTokens: number;
  /** Recent tokens kept verbatim after compaction (pi default 20000). */
  compactionKeepRecentTokens: number;
  retryEnabled: boolean;
  /** Max auto-retries for failed model requests (pi default 3). */
  retryMaxRetries: number;
  /** Base delay between retries in ms (pi default 2000). */
  retryBaseDelayMs: number;
  hideThinkingBlock: boolean;
  /** Read-only thinking budget map when present in settings.json. */
  thinkingBudgets?: {
    minimal?: number;
    low?: number;
    medium?: number;
    high?: number;
  };
  quietStartup: boolean;
  enableSkillCommands: boolean;
  /** Thinking levels for the configured default model (pi thinkingLevelMap). */
  availableThinkingLevels: string[];
  /** OpenAI-family service_tier options for the default model; empty if unsupported. */
  availableServiceTiers: Array<"flex" | "default" | "priority">;
  steeringMode: QueueDeliveryMode;
  followUpMode: QueueDeliveryMode;
  doubleEscapeAction: DoubleEscapeAction;
  treeFilterMode: TreeFilterMode;
  enableInstallTelemetry: boolean;
  enableAnalytics: boolean;
  httpIdleTimeoutMs: number;
  /**
   * pi `enabledModels` patterns for scoped model cycling (`--models` / `/scoped-models`).
   * Empty/undefined = no scope (all models available for cycling).
   */
  enabledModels: string[];
  /** Complete known/future settings inventory with effective scope provenance. */
  inventory: PiSettingsInventoryItem[];
  /** Labels for fields that are projected but not writable via desktop setters. */
  readOnlyFields: string[];
  /** Labels for capabilities deferred / degraded (TUI-only, upstream, etc.). */
  degradedCapabilities: string[];
}

/** Partial update for pi global settings (writes settings.json via SettingsManager). */
export type PiSettingsPatch = Partial<{
  defaultProvider: string;
  defaultModel: string;
  defaultThinkingLevel: string;
  defaultProjectTrust: "ask" | "always" | "never";
  theme: string;
  compactionEnabled: boolean;
  compactionReserveTokens: number;
  compactionKeepRecentTokens: number;
  retryEnabled: boolean;
  retryMaxRetries: number;
  retryBaseDelayMs: number;
  hideThinkingBlock: boolean;
  quietStartup: boolean;
  enableSkillCommands: boolean;
  steeringMode: QueueDeliveryMode;
  followUpMode: QueueDeliveryMode;
  doubleEscapeAction: DoubleEscapeAction;
  treeFilterMode: TreeFilterMode;
  enableInstallTelemetry: boolean;
  enableAnalytics: boolean;
  httpIdleTimeoutMs: number;
  /**
   * Replace `enabledModels` patterns. Empty array clears scope (all models).
   * When applied, session scoped models are re-resolved from the catalog.
   */
  enabledModels: string[];
}>;

export interface PiSettingsPatchResult {
  settings: PiSettingsView;
  snapshot: HostSnapshot;
}

/** Semantic kind for localized badges (not raw pi entry types). */
export type SessionTreeRoleKind =
  | "user"
  | "assistant"
  | "tool"
  | "compaction"
  | "branch_summary"
  | "system"
  | "other";

/** Flattened projection of one session tree node for UI navigation. */
export interface SessionTreeNodeView {
  id: string;
  parentId?: string;
  /** @deprecated use roleKind — kept for older callers */
  role: string;
  roleKind: SessionTreeRoleKind;
  preview: string;
  depth: number;
  leaf: boolean;
  /** This node is the active leaf. */
  active: boolean;
  /** Node lies on the path from root to the active leaf. */
  onActivePath: boolean;
  /** Visible node has more than one visible child. */
  isBranchPoint: boolean;
  /** Sibling connector among *visible* children. */
  connector: "none" | "mid" | "last";
  label?: string;
  timestamp?: string;
}

export interface SessionTreeView {
  sessionId: string;
  sessionFile?: string;
  leafId?: string;
  filterMode: TreeFilterMode;
  nodes: SessionTreeNodeView[];
}

export interface SessionInfoView {
  sessionId: string;
  sessionFile?: string;
  sessionName?: string;
  path?: string;
  messageCount: number;
  tokens: SessionUsageSummary["tokens"];
  cost: number;
  context?: SessionUsageSummary["context"];
}

export interface SessionBashResult {
  command: string;
  output: string;
  exitCode: number;
  excludeFromContext: boolean;
}

export interface SessionExportResult {
  format: "html" | "jsonl";
  path: string;
}

/** Result of `/share` (secret GitHub gist via `gh`, same strategy as pi CLI). */
export interface SessionShareResult {
  /** pi share viewer URL (preferred link to open). */
  url: string;
  /** Raw gist URL from `gh gist create`. */
  gistUrl: string;
  gistId: string;
}

export interface ScopedModelView {
  provider: string;
  id: string;
  name?: string;
}

/** Built-in slash command that maps to a desktop/host action (not extension/skill/prompt). */
export interface BuiltinSlashCommand {
  name: string;
  description: string;
  source: "builtin";
  /** When true, command is listed but not yet wired (avoid fake completion). */
  upcoming?: boolean;
  argumentHint?: string;
}

export type HostCommand =
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "host.start";
      requestId: string;
      cwd: string;
      agentDir?: string;
      model?: { provider: string; id: string };
      tools?: string[];
      persistSession?: boolean;
      sessionFile?: string;
      /** Open most recent session for cwd when no sessionFile is given. */
      resumeRecent?: boolean;
      projectTrusted?: boolean;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "agent.prompt";
      requestId: string;
      message: string;
      streamingBehavior?: "steer" | "followUp";
      imagePaths?: string[];
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "agent.queue.clear";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.list";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.new";
      requestId: string;
    }
  | {
      /** Re-project the currently bound session (no replacement). Used after host promote. */
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.current";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.switch";
      requestId: string;
      sessionPath: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.fork";
      requestId: string;
      /** When omitted, Host forks from the latest user message entry. */
      entryId?: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.tree";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.navigateTree";
      requestId: string;
      targetId: string;
      summarize?: boolean;
      customInstructions?: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.compact";
      requestId: string;
      instructions?: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.setName";
      requestId: string;
      name: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.clone";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.info";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.export";
      requestId: string;
      format: "html" | "jsonl";
      outputPath?: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.import";
      requestId: string;
      inputPath: string;
      cwdOverride?: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.bash";
      requestId: string;
      command: string;
      /** When true, matches pi `!!` (exclude output from model context). */
      excludeFromContext?: boolean;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.copyLast";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "runtime.reload";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "models.scoped.list";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "models.refresh";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "trust.get";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "trust.set";
      requestId: string;
      trusted: boolean;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "model.list";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "model.set";
      requestId: string;
      provider: string;
      id: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "models.config.get";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "models.config.upsert";
      requestId: string;
      input: UpsertCustomProviderInput;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "models.config.remove";
      requestId: string;
      provider: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "models.config.remove-model";
      requestId: string;
      provider: string;
      modelId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "thinking.set";
      requestId: string;
      level: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "serviceTier.set";
      requestId: string;
      /** OpenAI service_tier: flex | default | priority */
      tier: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "providers.list";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "providers.usage";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "providers.setApiKey";
      requestId: string;
      provider: string;
      apiKey: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "providers.clearAuth";
      requestId: string;
      provider: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "providers.oauth.start";
      requestId: string;
      provider: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "providers.oauth.respond";
      requestId: string;
      operationId: string;
      promptId: string;
      value?: string;
      cancelled?: boolean;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "providers.oauth.cancel";
      requestId: string;
      operationId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "settings.get";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "settings.patch";
      requestId: string;
      patch: PiSettingsPatch;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "packages.list";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "packages.install";
      requestId: string;
      source: string;
      scope: "global" | "project";
      /** When true, install/load for this session only (pi `-e` style); do not write settings. */
      temporary?: boolean;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "packages.remove";
      requestId: string;
      source: string;
      scope: "global" | "project";
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "packages.update";
      requestId: string;
      source?: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "packages.checkUpdates";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "packages.setEnabled";
      requestId: string;
      source: string;
      scope: "global" | "project";
      enabled: boolean;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.share";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "resources.list";
      requestId: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "test.photonProbe";
      requestId: string;
      imagePath: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "extensionUi.respond";
      requestId: string;
      runtimeId: string;
      response: ExtensionUiResponse;
    }
  | {
      /** One-shot text completion (no session pollution). Used for AI commit messages etc. */
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "util.complete-text";
      requestId: string;
      systemPrompt?: string;
      prompt: string;
      model?: { provider: string; id: string };
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "host.snapshot" | "host.shutdown" | "agent.abort" | "test.sequenceGap";
      requestId: string;
    };

export type HostEvent =
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "host.hello";
      hostPid: number;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "host.ready" | "runtime.snapshot";
      requestId?: string;
      snapshot: HostSnapshot;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "runtime.event";
      runtimeId: string;
      sequence: number;
      event: RuntimeEvent;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "extensionUi.request";
      runtimeId: string;
      requestId: string;
      method: ExtensionUiMethod;
      args: unknown;
      timeoutMs?: number;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "test.photonResult";
      requestId: string;
      result: PhotonProbeResult;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "host.crashed";
      hostId: string;
      runtimeId?: string;
      exitCode: number;
      message: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "host.restarted";
      hostId: string;
      previousRuntimeId: string;
      snapshot: HostSnapshot;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "host.stopped";
      requestId?: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "host.error";
      requestId?: string;
      code: string;
      message: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.list";
      requestId?: string;
      threads: SessionThreadSummary[];
      activeSessionId?: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.opened";
      requestId?: string;
      snapshot: HostSnapshot;
      threads: SessionThreadSummary[];
      history: SessionHistoryMessage[];
      cancelled?: boolean;
      /** User text for the composer after fork, or after navigateTree to a user message. */
      selectedText?: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.tree";
      requestId?: string;
      tree: SessionTreeView;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.info";
      requestId?: string;
      info: SessionInfoView;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.export";
      requestId?: string;
      result: SessionExportResult;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.share";
      requestId?: string;
      result: SessionShareResult;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.bash";
      requestId?: string;
      result: SessionBashResult;
      snapshot: HostSnapshot;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "session.copyLast";
      requestId?: string;
      text?: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "models.scoped";
      requestId?: string;
      models: ScopedModelView[];
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "packages.list";
      requestId?: string;
      packages: PackageSummary[];
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "packages.changed";
      requestId?: string;
      packages: PackageSummary[];
      action: "install" | "remove" | "update";
      source?: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "packages.progress";
      requestId?: string;
      action: string;
      source: string;
      phase: "start" | "progress" | "complete" | "error";
      message?: string;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "packages.updates";
      requestId?: string;
      updates: PackageUpdateInfo[];
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "resources.list";
      requestId?: string;
      resources: ResourceSummary[];
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "trust.info";
      requestId?: string;
      trust: ProjectTrustSummary;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "model.list";
      requestId?: string;
      models: ModelSummary[];
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "models.config";
      requestId?: string;
      config: ModelsJsonConfigView;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "providers.list";
      requestId?: string;
      providers: ProviderAuthSummary[];
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "providers.usage";
      requestId?: string;
      usage: ProviderUsageSnapshot[];
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "providers.oauth";
      requestId: string;
      provider: string;
      update: ProviderOAuthUpdate;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "settings.view";
      requestId?: string;
      settings: PiSettingsView;
      snapshot?: HostSnapshot;
    }
  | {
      protocolVersion: typeof IPC_PROTOCOL_VERSION;
      type: "util.text";
      requestId?: string;
      text: string;
    };

/** Progress events while ensuring the global `pi` CLI is present. */
export type PiCliProgressPhase =
  | "checking"
  | "installing"
  | "progress"
  | "complete"
  | "error"
  | "skipped";

export interface PiCliProgressEvent {
  phase: PiCliProgressPhase;
  message: string;
  path?: string;
  version?: string;
  installedNow?: boolean;
}

/** Result of detecting (or explicitly installing) the global `pi` CLI. */
export interface PiCliEnsureResult {
  installed: boolean;
  alreadyPresent: boolean;
  installedNow: boolean;
  skipped: boolean;
  path?: string;
  version?: string;
  error?: string;
}

/**
 * Which `@earendil-works/pi-coding-agent` install powers Agent Host + terminal.
 * Desktop preference only (userData) — not written into ~/.pi/agent.
 */
export type PiSdkSource = "builtin" | "global";

export interface PiSdkCandidate {
  source: PiSdkSource;
  available: boolean;
  version?: string;
  /** Absolute package root (directory containing package.json). */
  packageRoot?: string;
  /** Absolute path to the `pi` CLI entry (bin / dist/cli.js). */
  cliPath?: string;
  /** Why this candidate is unavailable. */
  error?: string;
}

/** Work that would be interrupted by an SDK switch (host recycle + TUI dispose). */
export interface PiSdkActivity {
  /** Foreground agent is mid-prompt / streaming. */
  agentBusy: boolean;
  /** Parked hosts still generating in the background. */
  parkedBusyCount: number;
  /** Embedded terminal has a live (non-suspended) pi PTY. */
  terminalLive: boolean;
  /** Convenience: any of the above. */
  busy: boolean;
}

export interface PiSdkStatus {
  /** User preference from desktop prefs. */
  activeSource: PiSdkSource;
  /**
   * Source last applied to a spawned Agent Host / TUI resolver.
   * May lag `activeSource` until host recycle completes.
   */
  appliedSource: PiSdkSource;
  needsRestart: boolean;
  activeVersion?: string;
  candidates: PiSdkCandidate[];
  /** pi agent dir (`~/.pi/agent` or PI_CODING_AGENT_DIR). */
  agentDir: string;
  /** Current interruptible work — UI should confirm before force switch. */
  activity: PiSdkActivity;
  /** Latest version on npm (`@earendil-works/pi-coding-agent`). */
  latestVersion?: string;
  /** ISO time of the last registry check. */
  latestCheckedAt?: string;
  /** Registry/network error when latest could not be fetched. */
  latestError?: string;
  /** Global install exists and is older than `latestVersion`. */
  globalUpdateAvailable?: boolean;
  /** Builtin package is older than `latestVersion` (needs a Zeno app update). */
  builtinBehindLatest?: boolean;
}

export interface PiSdkSetSourceOptions {
  /**
   * When true, abort in-flight generation, dispose terminal, and recycle host
   * even if activity.busy. Without force, setSource refuses while busy.
   */
  force?: boolean;
}

export interface PiConfigFileInfo {
  /** Stable id: settings | models | auth | trust | sessions | mcp | bin | … */
  id: string;
  /** Absolute path. */
  path: string;
  kind: "file" | "directory";
  exists: boolean;
  sizeBytes?: number;
  mtimeMs?: number;
  /** When false, UI may only reveal in folder (e.g. auth.json). */
  openable: boolean;
}

/** Independent proxy channels (desktop prefs). */
export type DesktopProxyMode = "off" | "system" | "custom";

export interface DesktopProxyChannel {
  mode: DesktopProxyMode;
  /** e.g. http://127.0.0.1:7890 when mode is custom. */
  server?: string;
  /** Comma-separated bypass hosts (NO_PROXY) when mode is custom. */
  bypass?: string;
}

export interface DesktopProxyPrefs {
  /** Agent-host / models / OAuth (Node fetch). */
  ai: DesktopProxyChannel;
  /** Electron session / main-process Chromium network. */
  app: DesktopProxyChannel;
}

/** Result of probing common local proxy ports / env (settings auto-discover). */
export interface DesktopLocalProxyCandidate {
  url: string;
  port: number;
  label: string;
  source: "probe" | "env";
}

/** PTY output is tagged so a queued event from a previous session cannot paint a new surface. */
export type TerminalDataEvent = {
  data: string;
  sessionFile: string;
};

export type TerminalExitEvent = {
  exitCode: number;
  signal?: number;
  sessionFile: string;
};

/** Desktop app auto-update state (electron-updater + GitHub Releases). */
export type AppUpdateState =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  /** Archive is on disk; quit-and-install / mac replace is in progress. */
  | "installing"
  | "error";

export type AppUpdateStatus = {
  state: AppUpdateState;
  /** Running app version (semver). */
  currentVersion: string;
  /** True only for packaged builds — unpackaged/dev cannot auto-update. */
  canCheck: boolean;
  availableVersion?: string;
  /** Download progress 0–100 when state is downloading/downloaded. */
  percent?: number;
  error?: string;
  /** ISO timestamp of the last successful check. */
  checkedAt?: string;
};

/** Native desktop skin appearance policy. */
export type ThemeSkinAppearance = "auto" | "light" | "dark";

/** Named colors accepted by the native skin renderer. */
export type ThemeSkinColors = Partial<{
  background: string;
  panel: string;
  panelAlt: string;
  accent: string;
  accentAlt: string;
  secondary: string;
  highlight: string;
  text: string;
  muted: string;
  line: string;
}>;

/** Per-light/dark overrides for a skin. */
export type ThemeSkinVariant = {
  background?: string;
  colors?: ThemeSkinColors;
  /** Compatibility bridge for Zeno's original token-only theme packs. */
  tokens?: Record<string, string>;
};

/** How the wallpaper image is fitted into the shell canvas. */
export type ThemeWallpaperFit = "cover" | "contain" | "stretch";

/** Wallpaper framing and the stronger task-page readability treatment. */
export type ThemeSkinArt = Partial<{
  focusX: number;
  focusY: number;
  zoom: number;
  dim: number;
  safeArea: "left" | "center" | "right";
  taskIntensity: number;
  /**
   * Wallpaper fit:
   * - cover: fill the canvas, crop overflow (default)
   * - contain: show the full image, letterbox as needed
   * - stretch: distort to fill width and height
   */
  wallpaperFit: ThemeWallpaperFit;
}>;

/** Glass/material controls shared by Zeno chrome. */
export type ThemeSkinMaterials = Partial<{
  sidebarOpacity: number;
  pageOpacity: number;
  panelOpacity: number;
  blur: number;
  radius: number;
  borderAlpha: number;
  shadow: "none" | "soft" | "strong";
  density: "compact" | "standard" | "comfortable";
}>;

/** Portable Zeno skin data. Background bytes are stored separately by the desktop shell. */
export type ThemeSkinConfig = {
  schemaVersion: 1;
  id?: string;
  name: string;
  description?: string;
  appearance?: ThemeSkinAppearance;
  /** File name in an exported skin directory. Never interpreted as an arbitrary path. */
  image?: string;
  colors?: ThemeSkinColors;
  light?: ThemeSkinVariant;
  dark?: ThemeSkinVariant;
  art?: ThemeSkinArt;
  materials?: ThemeSkinMaterials;
  /** Scoped, resource-free CSS validated by the desktop shell before persistence. */
  customCss?: string;
};

/** A saved user skin plus the renderer-safe URL for its managed background asset. */
export type ThemeSkinRecord = {
  id: string;
  config: ThemeSkinConfig;
  createdAt: string;
  updatedAt: string;
  backgroundUrl?: string;
  /** Bundled wallpaper retained by a custom copy of an editable built-in skin. */
  backgroundBuiltinId?: string;
};

export type ThemeLibrarySnapshot = {
  activeId: string;
  skins: ThemeSkinRecord[];
};

export type ThemeSkinSaveInput = {
  /**
   * Existing custom skin id (`skin-<uuid>`), or a built-in preset id to edit that
   * preset in place. Omit to create a brand-new custom skin.
   */
  id?: string;
  config: ThemeSkinConfig;
  /** Absolute source selected through Electron's file picker; copied into userData by main. */
  backgroundPath?: string;
  /** Built-in wallpaper retained when a skin keeps factory art (including in-place built-in edits). */
  backgroundBuiltinId?: string;
  /** Removes the managed background instead of retaining it. */
  removeBackground?: boolean;
};

export type ThemeSkinExportResult = {
  outputPath?: string;
};

/** Desktop prefs: use Node/Python shipped under Resources/runtimes (default ON). */
export type BundledRuntimePrefs = {
  useBundledNode: boolean;
  useBundledPython: boolean;
};

export type BundledRuntimeStatus = {
  prefs: BundledRuntimePrefs;
  available: boolean;
  root?: string;
  node?: {
    version?: string;
    path?: string;
    enabled: boolean;
  };
  python?: {
    version?: string;
    path?: string;
    enabled: boolean;
  };
};

/** Authoritative agent run state shared by renderer, preload, and the desktop pet. */
export type ZenoRunState =
  | "idle"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "aborted"
  | "crashed"
  | "recovering";

/**
 * Desktop pet (bloub) focus kinds, priority order (lowest rank wins):
 *   needs_you < error < working < ready < connecting < idle.
 */
export type PetKind = "idle" | "connecting" | "working" | "needs_you" | "ready" | "error";

export type PetFocus = {
  kind: PetKind;
  sessionId: string | null;
  title: string | null;
  toolTitle: string | null;
  rank: number;
  updatedAt: number;
  /** True while the main composer has a non-empty draft. */
  composing?: boolean;
};

export type PetTaskPhase = "active" | "done";

export type PetTask = {
  sessionId: string;
  title: string | null;
  snippet: string | null;
  toolTitle: string | null;
  kind: PetKind;
  phase: PetTaskPhase;
  /** 0..1 phase progress. */
  progress: number;
  updatedAt: number;
};

export type PetPrefs = {
  enabled: boolean;
  visible: boolean;
  shape: string;
  color: string;
  eyeColor?: string;
  expression?: string;
  bubblesEnabled?: boolean;
  progressBarEnabled?: boolean;
  bubbleDismissSec?: number;
  bubbleShape?: string;
  bubbleStyle?: string;
  sizePx: number;
  x?: number | null;
  y?: number | null;
  overlayW?: number | null;
  overlayH?: number | null;
};

export type PetOverlayPolicy = {
  compactIdle: boolean;
  cursorClickThrough: boolean;
};

export type PetHitChrome = {
  markCx: number;
  markCy: number;
  markR: number;
  bubbleX: number;
  bubbleY: number;
  bubbleW: number;
  bubbleH: number;
  windowW: number;
  windowH: number;
};

export type PetWorkRect = { x: number; y: number; w: number; h: number };

export type PetOverlayFrame = {
  winX: number;
  winY: number;
  overlayW: number;
  overlayH: number;
  work: PetWorkRect;
};

/** Command relayed from the pet overlay back to the main renderer. */
export type PetCommand =
  | { type: "open-settings" }
  | { type: "focus-session"; sessionId: string }
  | { type: "show-main" };

export interface ZenoDesktopApi {
  app: {
    /** OS platform + packaging flags for chrome layout / dev tools. */
    getRuntime(): Promise<{
      platform: string;
      isPackaged: boolean;
      enableTestCommands: boolean;
      /** Desktop app version (package / electron-builder). */
      appVersion: string;
      /**
       * When true, renderer should paint min/max/close (Linux custom titlebar).
       * Windows uses native titleBarOverlay; macOS uses traffic lights.
       */
      customWindowControls: boolean;
    }>;
    /** Current auto-update status snapshot. */
    getUpdateStatus(): Promise<AppUpdateStatus>;
    /** Check GitHub Releases for a newer version (also runs once at startup when packaged). */
    checkForUpdates(): Promise<AppUpdateStatus>;
    /** Download the available update in the background. */
    downloadUpdate(): Promise<AppUpdateStatus>;
    /** Quit and install a downloaded update (restarts the app). */
    quitAndInstall(): Promise<void>;
    /** Subscribe to update status changes from main. */
    onUpdateStatus(listener: (status: AppUpdateStatus) => void): () => void;
  };
  /** System proxy prefs: AI traffic vs app network, independently. */
  proxy: {
    get(): Promise<DesktopProxyPrefs>;
    set(prefs: DesktopProxyPrefs): Promise<DesktopProxyPrefs>;
    /** Probe loopback ports + env for running local proxies (Clash, V2RayN, …). */
    discoverLocal(): Promise<DesktopLocalProxyCandidate[]>;
  };
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<boolean>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onStateChange(listener: (state: { isMaximized: boolean }) => void): () => void;
  };
  /**
   * Always-on-top desktop pet (bloub) — a living SVG companion driven by
   * per-session focus + task bubbles. Enabled from Settings → 宠物.
   */
  pet: {
    getPrefs(): Promise<PetPrefs>;
    setPrefs(prefs: PetPrefs): Promise<PetPrefs>;
    show(): Promise<PetPrefs>;
    hide(): Promise<PetPrefs>;
    /** Flip visibility: hide when shown, show (and enable) otherwise. */
    toggle(): Promise<PetPrefs>;
    getFocus(): Promise<PetFocus | null>;
    getTasks(): Promise<PetTask[]>;
    /** Main renderer pushes computed focus/tasks; main relays to the pet window. */
    pushFocus(focus: PetFocus): Promise<void>;
    pushTasks(tasks: PetTask[]): Promise<void>;
    /** Pet → main relay: open the 宠物 settings section. */
    openSettings(): Promise<void>;
    /** Pet → main relay: bring a session to the foreground. */
    focusSession(sessionId: string): Promise<void>;
    /** Pet → main relay: show/focus the main window. */
    showMain(): Promise<void>;
    /** Pet reports its painted hit regions (mark + bubbles) to main. */
    setHitChrome(chrome: PetHitChrome): Promise<void>;
    /** Pet reads its window origin/size + monitor work area (logical px). */
    readFrame(): Promise<PetOverlayFrame | null>;
    /** Resize + reposition the overlay in one step (logical px). */
    syncSize(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
    setDragging(dragging: boolean): Promise<void>;
    setMenuOpen(open: boolean): Promise<void>;
    setIgnoreCursor(ignore: boolean): Promise<void>;
    startDragging(): Promise<void>;
    /** Move the overlay by logical CSS pixels (manual drag). */
    nudge(dx: number, dy: number): Promise<void>;
    policy(): Promise<PetOverlayPolicy>;
    /** Pet renderer subscriptions (relayed from main renderer pushes). */
    onPrefs(listener: (prefs: PetPrefs) => void): () => void;
    onFocus(listener: (focus: PetFocus) => void): () => void;
    onTasks(listener: (tasks: PetTask[]) => void): () => void;
    /** Main renderer subscription for pet → main command relay. */
    onCommand(listener: (command: PetCommand) => void): () => void;
  };
  /**
   * Global `pi` CLI detection (no auto-install).
   * Default runtime is the builtin SDK; install global only via Settings → Pi.
   */
  pi: {
    /** Detect global `pi` if present; does not run npm install. */
    ensure(): Promise<PiCliEnsureResult>;
    onProgress(listener: (event: PiCliProgressEvent) => void): () => void;
  };
  /**
   * Settings → Pi: SDK source (builtin vs global), active version, config files.
   * Preference is desktop-only; agent config stays under ~/.pi/agent.
   */
  piSdk: {
    getStatus(): Promise<PiSdkStatus>;
    /**
     * Switch SDK source. Refuses while agent/terminal is busy unless
     * `options.force` (aborts generation and recycles host).
     */
    setSource(source: PiSdkSource, options?: PiSdkSetSourceOptions): Promise<PiSdkStatus>;
    listConfigFiles(): Promise<PiConfigFileInfo[]>;
    revealConfig(id: string): Promise<void>;
    openConfig(id: string): Promise<void>;
    /**
     * Install or update the global `pi` CLI to npm `@latest`
     * (`npm install -g @earendil-works/pi-coding-agent@latest`).
     */
    installGlobal(): Promise<PiCliEnsureResult>;
    /** Re-check npm registry for the latest package version (bypasses short cache). */
    checkLatest(): Promise<PiSdkStatus>;
  };
  /**
   * Bundled Node.js + Python (Resources/runtimes). Default ON — prepended to PATH
   * for terminal mode and agent tools without requiring a system install.
   */
  runtimes: {
    getStatus(): Promise<BundledRuntimeStatus>;
    setPrefs(prefs: Partial<BundledRuntimePrefs>): Promise<BundledRuntimeStatus>;
  };
  /**
   * Embedded pi TUI (terminal mode): real PTY running `pi --session <file>`.
   * Mutually exclusive with host chat prompts on the active session.
   */
  terminal: {
    /** Open or resume interactive pi TUI for the given session file + cwd. */
    open(options: {
      sessionFile: string;
      cwd: string;
      cols?: number;
      rows?: number;
    }): Promise<{ sessionFile: string; cwd: string; resumed?: boolean }>;
    write(data: string): Promise<void>;
    resize(cols: number, rows: number): Promise<void>;
    /**
     * Keep the pi process alive but hide the UI (fast re-enter).
     * Releases exclusive lock so chat can prompt; next host prompt kills suspended TUI.
     */
    suspend(): Promise<{ sessionFile?: string }>;
    /** Kill PTY; returns the sessionFile that was bound (for history re-projection). */
    dispose(): Promise<{ sessionFile?: string }>;
    status(): Promise<{
      open: boolean;
      suspended?: boolean;
      sessionFile?: string;
      /** Warm background TUI processes, oldest first. */
      parkedSessionFiles: string[];
      /** Live/suspended foreground plus parked processes. */
      sessionCount: number;
    }>;
    /** Stream bytes tagged with the owning session to reject queued stale output. */
    onData(listener: (event: TerminalDataEvent) => void): () => void;
    /** Exit events are tagged for the same stale-event protection. */
    onExit(listener: (event: TerminalExitEvent) => void): () => void;
  };
  appearance: {
    /** Keep native window materials aligned with the renderer theme. */
    setThemeSource(source: "light" | "dark" | "system"): Promise<void>;
    /** Whole-app scale as a percentage, persisted by the desktop shell. */
    getAppScale(): Promise<number>;
    /** Apply and persist a whole-app scale percentage. */
    setAppScale(scale: number): Promise<number>;
  };
  /** User-owned desktop skins and their managed wallpaper assets. */
  themes: {
    list(): Promise<ThemeLibrarySnapshot>;
    activate(id: string): Promise<ThemeLibrarySnapshot>;
    save(input: ThemeSkinSaveInput): Promise<ThemeLibrarySnapshot>;
    remove(id: string): Promise<ThemeLibrarySnapshot>;
    /** Choose a directory containing theme.json and an optional background image. */
    importPick(): Promise<ThemeLibrarySnapshot | undefined>;
    /** Export the selected skin into a new portable directory. */
    exportPick(id: string): Promise<ThemeSkinExportResult>;
  };
  host: {
    start(options?: {
      cwd?: string;
      sessionFile?: string;
      resumeRecent?: boolean;
      force?: boolean;
    }): Promise<HostSnapshot>;
    stop(): Promise<void>;
    snapshot(): Promise<HostSnapshot>;
    onEvent(listener: (event: HostEvent) => void): () => void;
  };
  workspace: {
    getCwd(): Promise<string | undefined>;
    listRecent(): Promise<string[]>;
    openPath(
      cwd: string,
      options?: { resumeRecent?: boolean; sessionFile?: string },
    ): Promise<HostSnapshot>;
    pickFolder(): Promise<string | undefined>;
    /**
     * Select files and/or folders to pass to pi as path context.
     * On Windows/Linux, Electron cannot combine file + directory pickers in one
     * dialog — pass `mode: "files"` or `"folders"` explicitly (default `"files"`).
     */
    pickAttachments(options?: { mode?: "files" | "folders" }): Promise<string[]>;
    /** Resolve a dropped browser File to its native path without exposing file contents. */
    pathForFile(file: File): string;
    /**
     * Search project files/folders for the `@` mention menu.
     * Returns absolute paths; empty when cwd missing or nothing matches.
     */
    searchPaths(
      query: string,
      options?: { cwd?: string; limit?: number },
    ): Promise<Array<{ path: string; relative: string; kind: "file" | "folder" }>>;
    /**
     * Persist an image from the system clipboard (or provided PNG bytes) into a temp file
     * so Composer can attach it like a picked image.
     */
    saveClipboardImage(options?: { bytes?: number[]; ext?: string }): Promise<string | undefined>;
    /**
     * Thumbnail data URL for local image attachments (composer / timeline preview).
     * Returns undefined for non-images or unreadable paths.
     */
    readAttachmentPreview(path: string): Promise<string | undefined>;
    /**
     * Ensure a default project folder under Documents/Zeno/YYYY-MM-DD
     * (reuse today's folder if it already exists). Returns absolute path.
     */
    ensureDefault(): Promise<string>;
    /**
     * Ensure pure-conversation home under Documents/Zeno/conversations.
     * Never listed as a sidebar project. Used by global「新建会话」.
     */
    ensureConversation(): Promise<string>;
    /** Remove a path from desktop recent list (does not delete files). */
    removeRecent(cwd: string): Promise<string[]>;
    /** Reveal path in Finder / Explorer. */
    revealInFolder(cwd: string): Promise<void>;
    /** Open a file referenced by rendered conversation content. */
    openFile(path: string, location?: { line?: number; column?: number }): Promise<void>;
    /** Open a safe external link outside the Electron renderer. */
    openExternal(url: string): Promise<void>;
    /**
     * Detach from the active project (stop host, clear cwd).
     * Does not remove recent list. Next send may auto-create a default workspace.
     */
    clearActive(): Promise<void>;
    /** Lightweight git branch / worktree labels for the composer chrome. */
    getGitContext(cwd?: string): Promise<GitContextInfo>;
    /** Local + remote branches (local first). */
    listGitBranches(cwd?: string): Promise<GitBranchInfo[]>;
    /** Checkout an existing branch in cwd. */
    checkoutGitBranch(branch: string, cwd?: string): Promise<GitContextInfo>;
    /** Create a branch and optionally check it out (default true). */
    createGitBranch(
      branch: string,
      options?: { checkout?: boolean; cwd?: string },
    ): Promise<GitContextInfo>;
    /** List worktrees for the repo containing cwd. */
    listGitWorktrees(cwd?: string): Promise<GitWorktreeInfo[]>;
    /**
     * All linked worktrees managed by Zeno (under worktree root / Documents/Zeno/worktrees),
     * across projects — not limited to the currently open workspace.
     */
    listManagedWorktrees(): Promise<GitWorktreeInfo[]>;
    /**
     * Create a linked worktree at `path`.
     * - `newBranch`: create and check out a new branch in the worktree
     * - `branch`: existing branch to check out, or start-point when `newBranch` is set
     * - `name`: folder base under worktree root (defaults to newBranch / branch / date)
     */
    createGitWorktree(options: {
      /** Optional absolute path; when omitted, uses worktree root prefs + name/branch/date. */
      path?: string;
      branch?: string;
      newBranch?: string;
      /** Directory name under the worktree root (not the git branch prefix). */
      name?: string;
      cwd?: string;
    }): Promise<{ path: string; context: GitContextInfo }>;
    /** Remove a linked worktree (never the main worktree). */
    removeGitWorktree(worktreePath: string, cwd?: string): Promise<{ removed: string }>;
    getWorktreePrefs(cwd?: string): Promise<{
      root: string;
      rootConfigured: string;
      autoDelete: boolean;
      autoDeleteLimit: number;
      defaultRoot: string;
    }>;
    setWorktreePrefs(patch: {
      rootConfigured?: string;
      autoDelete?: boolean;
      autoDeleteLimit?: number;
    }): Promise<{
      root: string;
      rootConfigured: string;
      autoDelete: boolean;
      autoDeleteLimit: number;
      defaultRoot: string;
    }>;
    getGitPrefs(): Promise<{
      branchPrefix: string;
      pullMode: "merge" | "squash";
      forcePush: boolean;
      draftPr: boolean;
      customCommitCommand: string;
      customPrCommand: string;
      /** Empty = use session / pi default model for AI-assisted git ops. */
      modelProvider: string;
      modelId: string;
    }>;
    setGitPrefs(patch: {
      branchPrefix?: string;
      pullMode?: "merge" | "squash";
      forcePush?: boolean;
      draftPr?: boolean;
      customCommitCommand?: string;
      customPrCommand?: string;
      modelProvider?: string;
      modelId?: string;
    }): Promise<{
      branchPrefix: string;
      pullMode: "merge" | "squash";
      forcePush: boolean;
      draftPr: boolean;
      customCommitCommand: string;
      customPrCommand: string;
      modelProvider: string;
      modelId: string;
    }>;
    /** Working tree status (paths only — no diff preview). */
    gitStatus(cwd?: string): Promise<GitStatusSummary>;
    gitCommit(message: string, cwd?: string): Promise<GitStatusSummary>;
    gitPull(cwd?: string): Promise<GitStatusSummary>;
    gitPush(cwd?: string): Promise<GitStatusSummary>;
    /** Stage all + commit + push. */
    gitCommitAndPush(message: string, cwd?: string): Promise<GitStatusSummary>;
    /** AI commit message from custom commit instruction + git status/diff. */
    gitGenerateCommitMessage(cwd?: string): Promise<string>;
    /** Open browser to create a PR (GitHub/GitLab heuristically). */
    openCreatePullRequest(cwd?: string): Promise<void>;
    /** Detect IDE / terminal / Finder-style apps for "Open in…". */
    listOpenTargets(cwd?: string): Promise<DetectedApp[]>;
    /** Launch a detected app against cwd. */
    openInApp(appId: string, cwd?: string): Promise<void>;
  };
  trust: {
    get(): Promise<ProjectTrustSummary>;
    set(trusted: boolean): Promise<HostSnapshot>;
  };
  models: {
    list(): Promise<ModelSummary[]>;
    set(provider: string, id: string): Promise<HostSnapshot>;
    /** Credential-blind view of pi models.json. */
    getConfig(): Promise<ModelsJsonConfigView>;
    /** Upsert a custom provider/model into models.json (pi-native format). */
    upsertCustomProvider(input: UpsertCustomProviderInput): Promise<ModelsJsonConfigView>;
    /** Remove a provider block from models.json. */
    removeCustomProvider(provider: string): Promise<ModelsJsonConfigView>;
    /** Remove one custom model from models.json. */
    removeCustomModel(provider: string, modelId: string): Promise<ModelsJsonConfigView>;
    /** Open models.json in the OS default editor (creates a template if missing). */
    openConfig(): Promise<void>;
    /** Reveal models.json in the file manager. */
    revealConfig(): Promise<void>;
    /** List scoped models currently active on the session (pi /scoped-models). */
    listScoped(): Promise<ScopedModelView[]>;
    /** Reload model catalog from models.json + extensions. */
    refreshCatalog(): Promise<ModelSummary[]>;
    /** Fetch the live model list from an OpenAI-compatible provider (`GET {baseUrl}/models`). */
    fetchModelList(input: FetchModelListInput): Promise<{ models: string[] }>;
  };
  thinking: {
    set(level: string): Promise<HostSnapshot>;
  };
  /**
   * OpenAI-family request priority (`service_tier`).
   * Zeno-only preference (not pi session state); retained across models.
   * Unsupported models never receive a service_tier request field.
   */
  serviceTier: {
    set(tier: string): Promise<HostSnapshot>;
  };
  providers: {
    list(): Promise<ProviderAuthSummary[]>;
    /** Fetches live plan limits without exposing provider credentials. */
    usage(): Promise<ProviderUsageSnapshot[]>;
    /** Stores API key via pi ModelRuntime; never returned by list(). */
    setApiKey(provider: string, apiKey: string): Promise<ProviderAuthSummary[]>;
    clearAuth(provider: string): Promise<ProviderAuthSummary[]>;
    startOAuth(provider: string, operationId?: string): Promise<string>;
    respondOAuth(
      operationId: string,
      promptId: string,
      value?: string,
      cancelled?: boolean,
    ): Promise<void>;
    cancelOAuth(operationId: string): Promise<void>;
    onOAuthEvent(listener: (event: ProviderOAuthEvent) => void): () => void;
  };
  /** Visual editor for pi settings.json (global). */
  settings: {
    get(): Promise<PiSettingsView>;
    patch(patch: PiSettingsPatch): Promise<PiSettingsPatchResult>;
  };
  agent: {
    prompt(
      message: string,
      streamingBehavior?: "steer" | "followUp",
      imagePaths?: string[],
    ): Promise<HostSnapshot>;
    clearQueue(): Promise<HostSnapshot>;
    abort(): Promise<HostSnapshot>;
  };
  session: {
    list(): Promise<{ threads: SessionThreadSummary[]; activeSessionId?: string }>;
    /** List sessions for any project cwd without switching the live host runtime. */
    listForCwd(cwd: string): Promise<SessionThreadSummary[]>;
    create(): Promise<{
      snapshot: HostSnapshot;
      threads: SessionThreadSummary[];
      history: SessionHistoryMessage[];
    }>;
    /**
     * Atomic global「新建会话」: ensure conversation host + create session.
     * Serializes against concurrent host lifecycle (safe under rapid clicks).
     */
    createBlankConversation(): Promise<{
      snapshot: HostSnapshot;
      threads: SessionThreadSummary[];
      history: SessionHistoryMessage[];
    }>;
    switch(sessionPath: string): Promise<{
      snapshot: HostSnapshot;
      threads: SessionThreadSummary[];
      history: SessionHistoryMessage[];
    }>;
    fork(entryId?: string): Promise<{
      snapshot: HostSnapshot;
      threads: SessionThreadSummary[];
      history: SessionHistoryMessage[];
      selectedText?: string;
    }>;
    /** Session tree for /tree navigation (same JSONL file). */
    tree(): Promise<SessionTreeView>;
    navigateTree(
      targetId: string,
      options?: { summarize?: boolean; customInstructions?: string },
    ): Promise<{
      snapshot: HostSnapshot;
      threads: SessionThreadSummary[];
      history: SessionHistoryMessage[];
      cancelled: boolean;
      /** When navigating to a user message, pi rewinds and returns text for the composer. */
      selectedText?: string;
    }>;
    compact(instructions?: string): Promise<HostSnapshot>;
    setName(name: string): Promise<HostSnapshot>;
    /** Clone active branch into a new session file (pi /clone = fork at leaf). */
    clone(): Promise<{
      snapshot: HostSnapshot;
      threads: SessionThreadSummary[];
      history: SessionHistoryMessage[];
    }>;
    info(): Promise<SessionInfoView>;
    export(format: "html" | "jsonl", outputPath?: string): Promise<SessionExportResult>;
    /** Save dialog then export (visual path). */
    exportPick(format: "html" | "jsonl"): Promise<SessionExportResult | undefined>;
    import(inputPath: string): Promise<
      | {
          snapshot: HostSnapshot;
          threads: SessionThreadSummary[];
          history: SessionHistoryMessage[];
        }
      | undefined
    >;
    /** Open dialog then import JSONL (visual path). */
    importPick(): Promise<
      | {
          snapshot: HostSnapshot;
          threads: SessionThreadSummary[];
          history: SessionHistoryMessage[];
        }
      | undefined
    >;
    /** pi `!cmd` / `!!cmd` shell injection. */
    bash(
      command: string,
      options?: { excludeFromContext?: boolean },
    ): Promise<{
      result: SessionBashResult;
      snapshot: HostSnapshot;
    }>;
    copyLastAssistant(): Promise<string | undefined>;
    /**
     * Share session as a secret GitHub gist (uses `gh` CLI auth, same as pi `/share`).
     * Returns viewer URL + gist URL.
     */
    share(): Promise<SessionShareResult>;
  };
  runtime: {
    /** Reload extensions/resources without full app restart. */
    reload(): Promise<HostSnapshot>;
  };
  packages: {
    list(): Promise<PackageSummary[]>;
    install(
      source: string,
      scope: "global" | "project",
      options?: { temporary?: boolean },
    ): Promise<PackageSummary[]>;
    remove(source: string, scope: "global" | "project"): Promise<PackageSummary[]>;
    update(source?: string): Promise<PackageSummary[]>;
    /** Check npm/git packages for available updates without installing. */
    checkUpdates(): Promise<PackageUpdateInfo[]>;
    /** Toggle package autoload (pi object-form `autoload: false` when disabled). */
    setEnabled(
      source: string,
      scope: "global" | "project",
      enabled: boolean,
    ): Promise<PackageSummary[]>;
    /**
     * Search official pi packages from the npm registry (`keywords:pi-package`).
     * Used by the Discover tab for one-click install. Supports pagination via `from`.
     */
    searchCatalog(query?: string, size?: number, from?: number): Promise<CatalogSearchResult>;
  };
  resources: {
    list(): Promise<ResourceSummary[]>;
  };
  mcp: {
    getConfig(): Promise<McpConfig>;
    installServer(name: string, packageName: string): Promise<void>;
    removeServer(name: string): Promise<void>;
    setEnabled(name: string, enabled: boolean): Promise<void>;
    updateServer(name: string): Promise<void>;
    getPath(): Promise<string>;
    searchCatalog(query?: string, size?: number, from?: number): Promise<CatalogSearchResult>;
  };
  extensionUi: {
    respond(response: ExtensionUiResponse): Promise<void>;
  };
  test: {
    crashHost(): Promise<void>;
  };
  notifications: {
    /**
     * Show an OS notification.
     * - `force`: ignore unfocused-only preference / always attempt to post.
     * - `requireUnfocused`: skip when the main window is focused (main-process check).
     * Returns whether the OS accepted the notification (not merely that IPC ran).
     */
    show(payload: {
      title: string;
      body?: string;
      silent?: boolean;
      force?: boolean;
      requireUnfocused?: boolean;
    }): Promise<boolean>;
    /** Open the OS notification settings UI (macOS/Windows). */
    openSystemSettings(): Promise<void>;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasEnvelope(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    value.protocolVersion === IPC_PROTOCOL_VERSION &&
    typeof value.type === "string"
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isModelSelector(value: unknown): boolean {
  return isRecord(value) && typeof value.provider === "string" && typeof value.id === "string";
}

function isExtensionUiMethod(value: unknown): value is ExtensionUiMethod {
  return (
    typeof value === "string" &&
    [
      "select",
      "confirm",
      "input",
      "editor",
      "notify",
      "setStatus",
      "setWorkingMessage",
      "setWorkingVisible",
      "setWorkingIndicator",
      "setHiddenThinkingLabel",
      "setWidget",
      "setTitle",
      "setEditorText",
      "unsupported",
    ].includes(value)
  );
}

function isResourceCounts(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ["extensions", "skills", "prompts", "themes", "contextFiles"].every(
    (key) => typeof value[key] === "number" && Number.isSafeInteger(value[key]) && value[key] >= 0,
  );
}

function isProjectTrustSummary(value: unknown): value is ProjectTrustSummary {
  return (
    isRecord(value) &&
    typeof value.required === "boolean" &&
    typeof value.trusted === "boolean" &&
    (value.savedDecision === null || typeof value.savedDecision === "boolean") &&
    (value.fallback === "ask" || value.fallback === "always" || value.fallback === "never")
  );
}

const CUSTOM_MODEL_APIS: readonly CustomModelApi[] = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
  "azure-openai-responses",
  "openai-codex-responses",
  "mistral-conversations",
  "google-vertex",
  "bedrock-converse-stream",
];

function isCustomModelApi(value: unknown): value is CustomModelApi {
  return typeof value === "string" && (CUSTOM_MODEL_APIS as readonly string[]).includes(value);
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isUpsertCustomProviderInput(value: unknown): value is UpsertCustomProviderInput {
  if (!isRecord(value)) return false;
  if (typeof value.provider !== "string" || !value.provider.trim()) return false;
  if (typeof value.baseUrl !== "string" || !value.baseUrl.trim()) return false;
  if (!isCustomModelApi(value.api)) return false;
  if (typeof value.modelId !== "string" || !value.modelId.trim()) return false;
  if (value.apiKey !== undefined && typeof value.apiKey !== "string") return false;
  if (value.authHeader !== undefined && typeof value.authHeader !== "boolean") return false;
  if (value.userAgent !== undefined && typeof value.userAgent !== "string") return false;
  if (value.modelName !== undefined && typeof value.modelName !== "string") return false;
  if (value.reasoning !== undefined && typeof value.reasoning !== "boolean") return false;
  if (value.input !== undefined && value.input !== "text" && value.input !== "text-image") {
    return false;
  }
  if (!isOptionalFiniteNumber(value.contextWindow)) return false;
  if (!isOptionalFiniteNumber(value.maxTokens)) return false;
  if (!isOptionalFiniteNumber(value.costInput)) return false;
  if (!isOptionalFiniteNumber(value.costOutput)) return false;
  if (!isOptionalFiniteNumber(value.costCacheRead)) return false;
  if (!isOptionalFiniteNumber(value.costCacheWrite)) return false;
  if (value.previousProvider !== undefined && typeof value.previousProvider !== "string") {
    return false;
  }
  if (value.previousModelId !== undefined && typeof value.previousModelId !== "string") {
    return false;
  }
  return true;
}

function isModelsJsonModelView(value: unknown): value is ModelsJsonModelView {
  if (!isRecord(value) || typeof value.id !== "string") return false;
  if (value.name !== undefined && typeof value.name !== "string") return false;
  if (value.reasoning !== undefined && typeof value.reasoning !== "boolean") return false;
  if (value.input !== undefined && value.input !== "text" && value.input !== "text-image") {
    return false;
  }
  if (!isOptionalFiniteNumber(value.contextWindow)) return false;
  if (!isOptionalFiniteNumber(value.maxTokens)) return false;
  if (!isOptionalFiniteNumber(value.costInput)) return false;
  if (!isOptionalFiniteNumber(value.costOutput)) return false;
  if (!isOptionalFiniteNumber(value.costCacheRead)) return false;
  if (!isOptionalFiniteNumber(value.costCacheWrite)) return false;
  return true;
}

function isModelsJsonConfigView(value: unknown): value is ModelsJsonConfigView {
  if (!isRecord(value) || typeof value.path !== "string" || typeof value.exists !== "boolean") {
    return false;
  }
  if (value.error !== undefined && typeof value.error !== "string") return false;
  if (!Array.isArray(value.providers)) return false;
  return value.providers.every((row) => {
    if (!isRecord(row) || typeof row.provider !== "string") return false;
    if (row.baseUrl !== undefined && typeof row.baseUrl !== "string") return false;
    if (row.api !== undefined && typeof row.api !== "string") return false;
    if (row.authHeader !== undefined && typeof row.authHeader !== "boolean") return false;
    if (row.userAgent !== undefined && typeof row.userAgent !== "string") return false;
    if (typeof row.hasApiKeyField !== "boolean") return false;
    if (!Array.isArray(row.models)) return false;
    return row.models.every(isModelsJsonModelView);
  });
}

function isModelSummary(value: unknown): value is ModelSummary {
  if (!isRecord(value)) return false;
  if (
    typeof value.provider !== "string" ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.reasoning !== "boolean" ||
    (value.source !== "builtin" && value.source !== "custom")
  ) {
    return false;
  }
  if (value.api !== undefined && typeof value.api !== "string") return false;
  if (
    value.input !== undefined &&
    (!Array.isArray(value.input) ||
      !value.input.every((item) => item === "text" || item === "image"))
  ) {
    return false;
  }
  if (
    (value.contextWindow !== undefined &&
      (typeof value.contextWindow !== "number" || !Number.isFinite(value.contextWindow))) ||
    (value.maxTokens !== undefined &&
      (typeof value.maxTokens !== "number" || !Number.isFinite(value.maxTokens)))
  ) {
    return false;
  }
  if (value.cost !== undefined) {
    if (
      !isRecord(value.cost) ||
      typeof value.cost.input !== "number" ||
      !Number.isFinite(value.cost.input) ||
      typeof value.cost.output !== "number" ||
      !Number.isFinite(value.cost.output) ||
      typeof value.cost.cacheRead !== "number" ||
      !Number.isFinite(value.cost.cacheRead) ||
      typeof value.cost.cacheWrite !== "number" ||
      !Number.isFinite(value.cost.cacheWrite)
    ) {
      return false;
    }
  }
  return true;
}

function isProviderAuthSummary(value: unknown): value is ProviderAuthSummary {
  if (!isRecord(value)) return false;
  if (typeof value.provider !== "string" || typeof value.displayName !== "string") return false;
  if (typeof value.configured !== "boolean" || typeof value.modelCount !== "number") return false;
  if (typeof value.oauthSupported !== "boolean" || typeof value.oauthActive !== "boolean") {
    return false;
  }
  if (value.label !== undefined && typeof value.label !== "string") return false;
  if (value.source !== undefined) {
    if (typeof value.source !== "string") return false;
    if (
      ![
        "stored",
        "runtime",
        "environment",
        "fallback",
        "models_json_key",
        "models_json_command",
      ].includes(value.source)
    ) {
      return false;
    }
  }
  // Reject accidental secret leakage in projection
  if ("key" in value || "apiKey" in value || "token" in value) return false;
  return true;
}

function isProviderOAuthPrompt(value: unknown): value is ProviderOAuthPrompt {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.message !== "string") {
    return false;
  }
  if (value.type === "select") {
    return (
      Array.isArray(value.options) &&
      value.options.every(
        (option) =>
          isRecord(option) &&
          typeof option.id === "string" &&
          typeof option.label === "string" &&
          (option.description === undefined || typeof option.description === "string"),
      )
    );
  }
  return (
    (value.type === "text" || value.type === "secret" || value.type === "manual_code") &&
    (value.placeholder === undefined || typeof value.placeholder === "string")
  );
}

function isProviderOAuthUpdate(value: unknown): value is ProviderOAuthUpdate {
  if (!isRecord(value) || typeof value.stage !== "string" || containsSecretField(value))
    return false;
  switch (value.stage) {
    case "prompt":
      return typeof value.promptId === "string" && isProviderOAuthPrompt(value.prompt);
    case "auth_url":
      return (
        typeof value.url === "string" &&
        (value.instructions === undefined || typeof value.instructions === "string")
      );
    case "device_code":
      return (
        typeof value.userCode === "string" &&
        typeof value.verificationUri === "string" &&
        (value.intervalSeconds === undefined || typeof value.intervalSeconds === "number") &&
        (value.expiresInSeconds === undefined || typeof value.expiresInSeconds === "number")
      );
    case "info":
      return (
        typeof value.message === "string" &&
        (value.links === undefined ||
          (Array.isArray(value.links) &&
            value.links.every(
              (link) =>
                isRecord(link) &&
                typeof link.url === "string" &&
                (link.label === undefined || typeof link.label === "string"),
            )))
      );
    case "progress":
    case "error":
      return typeof value.message === "string";
    case "complete":
    case "cancelled":
      return true;
    default:
      return false;
  }
}

function isProviderUsageLimit(value: unknown): value is ProviderUsageLimit {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    typeof value.usedPercent === "number" &&
    Number.isFinite(value.usedPercent) &&
    value.usedPercent >= 0 &&
    value.usedPercent <= 100 &&
    (value.resetsAt === undefined || typeof value.resetsAt === "string") &&
    (value.windowDurationMins === undefined ||
      (typeof value.windowDurationMins === "number" && value.windowDurationMins >= 0)) &&
    (value.detail === undefined || typeof value.detail === "string")
  );
}

function isProviderUsageLine(value: unknown): value is ProviderUsageLine {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    typeof value.value === "string" &&
    (value.subtitle === undefined || typeof value.subtitle === "string")
  );
}

function containsSecretField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecretField);
  if (!isRecord(value)) return false;
  for (const [key, nested] of Object.entries(value)) {
    if (
      /^(?:api[-_]?key|key|token|access[-_]?token|refresh[-_]?token|authorization|credentials?|secret)$/i.test(
        key,
      )
    ) {
      return true;
    }
    if (containsSecretField(nested)) return true;
  }
  return false;
}

function isProviderUsageSnapshot(value: unknown): value is ProviderUsageSnapshot {
  return (
    isRecord(value) &&
    typeof value.provider === "string" &&
    typeof value.displayName === "string" &&
    typeof value.updatedAt === "string" &&
    (value.status === "ok" || value.status === "needs-auth" || value.status === "error") &&
    Array.isArray(value.limits) &&
    value.limits.every(isProviderUsageLimit) &&
    Array.isArray(value.usageLines) &&
    value.usageLines.every(isProviderUsageLine) &&
    (value.planName === undefined || typeof value.planName === "string") &&
    (value.detail === undefined || typeof value.detail === "string") &&
    !containsSecretField(value)
  );
}

function isSessionUsageSummary(value: unknown): value is SessionUsageSummary {
  if (!isRecord(value) || !isRecord(value.tokens) || typeof value.cost !== "number") return false;
  const tokens = value.tokens;
  for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"] as const) {
    if (typeof tokens[key] !== "number") return false;
  }
  if (value.context !== undefined) {
    if (!isRecord(value.context) || typeof value.context.contextWindow !== "number") return false;
    if (value.context.tokens !== null && typeof value.context.tokens !== "number") return false;
    if (value.context.percent !== null && typeof value.context.percent !== "number") return false;
  }
  return true;
}

function isHostSnapshot(value: unknown): value is HostSnapshot {
  if (!isRecord(value) || !isRecord(value.configuredPackages)) return false;
  return (
    typeof value.runtimeId === "string" &&
    typeof value.sequence === "number" &&
    typeof value.cwd === "string" &&
    typeof value.agentDir === "string" &&
    typeof value.sessionId === "string" &&
    (value.sessionFile === undefined || typeof value.sessionFile === "string") &&
    (value.model === undefined || isModelSelector(value.model)) &&
    (value.thinkingLevel === undefined || typeof value.thinkingLevel === "string") &&
    (value.availableThinkingLevels === undefined || isStringArray(value.availableThinkingLevels)) &&
    (value.serviceTier === undefined ||
      value.serviceTier === "flex" ||
      value.serviceTier === "default" ||
      value.serviceTier === "priority") &&
    (value.availableServiceTiers === undefined ||
      (Array.isArray(value.availableServiceTiers) &&
        value.availableServiceTiers.every(
          (tier) => tier === "flex" || tier === "default" || tier === "priority",
        ))) &&
    (value.usage === undefined || isSessionUsageSummary(value.usage)) &&
    Array.isArray(value.slashCommands) &&
    value.slashCommands.every(
      (command) =>
        isRecord(command) &&
        typeof command.name === "string" &&
        typeof command.description === "string" &&
        (command.source === "extension" ||
          command.source === "prompt" ||
          command.source === "skill" ||
          command.source === "builtin") &&
        (command.argumentHint === undefined || typeof command.argumentHint === "string"),
    ) &&
    isRecord(value.queuedMessages) &&
    isStringArray(value.queuedMessages.steering) &&
    isStringArray(value.queuedMessages.followUp) &&
    isStringArray(value.activeTools) &&
    typeof value.projectTrusted === "boolean" &&
    (value.trust === undefined || isProjectTrustSummary(value.trust)) &&
    isResourceCounts(value.resources) &&
    typeof value.configuredPackages.global === "number" &&
    typeof value.configuredPackages.project === "number" &&
    Array.isArray(value.diagnostics)
  );
}

function isRuntimeEvent(value: unknown): value is RuntimeEvent {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "agent.started":
    case "agent.settled":
      return true;
    case "user.message":
      return typeof value.content === "string";
    case "queue.updated":
      return isStringArray(value.steering) && isStringArray(value.followUp);
    case "message.delta":
    case "thinking.delta":
      return typeof value.delta === "string";
    case "message.completed":
      return value.reason === "stop" || value.reason === "length" || value.reason === "toolUse";
    case "message.failed":
      return (
        (value.reason === "aborted" ||
          value.reason === "error" ||
          value.reason === "pending" ||
          value.reason === "deferred") &&
        typeof value.message === "string"
      );
    case "tool.started":
      return typeof value.toolCallId === "string" && typeof value.toolName === "string";
    case "tool.completed":
      return (
        typeof value.toolCallId === "string" &&
        typeof value.toolName === "string" &&
        typeof value.output === "string" &&
        typeof value.isError === "boolean"
        // details is optional free-form tool payload
      );
    case "shell.completed":
      return (
        typeof value.command === "string" &&
        typeof value.output === "string" &&
        typeof value.exitCode === "number" &&
        typeof value.excludeFromContext === "boolean"
      );
    case "compaction.started":
      return (
        value.reason === "manual" || value.reason === "threshold" || value.reason === "overflow"
      );
    case "compaction.completed":
      return (
        (value.reason === "manual" ||
          value.reason === "threshold" ||
          value.reason === "overflow") &&
        typeof value.aborted === "boolean" &&
        (value.errorMessage === undefined || typeof value.errorMessage === "string")
      );
    case "retry.started":
      return (
        typeof value.attempt === "number" &&
        typeof value.maxAttempts === "number" &&
        typeof value.delayMs === "number" &&
        typeof value.errorMessage === "string"
      );
    case "retry.ended":
      return (
        typeof value.success === "boolean" &&
        typeof value.attempt === "number" &&
        (value.finalError === undefined || typeof value.finalError === "string")
      );
    case "custom.message":
      return typeof value.customType === "string" && typeof value.content === "string";
    case "custom.entry":
      return typeof value.customType === "string";
    default:
      return false;
  }
}

export function isHostCommand(value: unknown): value is HostCommand {
  if (!hasEnvelope(value) || typeof value.requestId !== "string") return false;

  if (value.type === "host.start") {
    return (
      typeof value.cwd === "string" &&
      (value.agentDir === undefined || typeof value.agentDir === "string") &&
      (value.model === undefined || isModelSelector(value.model)) &&
      (value.tools === undefined || isStringArray(value.tools)) &&
      (value.persistSession === undefined || typeof value.persistSession === "boolean") &&
      (value.sessionFile === undefined || typeof value.sessionFile === "string") &&
      (value.resumeRecent === undefined || typeof value.resumeRecent === "boolean") &&
      (value.projectTrusted === undefined || typeof value.projectTrusted === "boolean")
    );
  }
  if (value.type === "agent.prompt") {
    return (
      typeof value.message === "string" &&
      (value.streamingBehavior === undefined ||
        value.streamingBehavior === "steer" ||
        value.streamingBehavior === "followUp") &&
      (value.imagePaths === undefined || isStringArray(value.imagePaths))
    );
  }
  if (value.type === "util.complete-text") {
    return (
      typeof value.prompt === "string" &&
      (value.systemPrompt === undefined || typeof value.systemPrompt === "string") &&
      (value.model === undefined || isModelSelector(value.model))
    );
  }
  if (
    value.type === "session.list" ||
    value.type === "session.new" ||
    value.type === "session.current"
  ) {
    return true;
  }
  if (value.type === "session.switch") return typeof value.sessionPath === "string";
  if (value.type === "session.fork") {
    return value.entryId === undefined || typeof value.entryId === "string";
  }
  if (
    value.type === "session.tree" ||
    value.type === "session.clone" ||
    value.type === "session.info"
  ) {
    return true;
  }
  if (value.type === "session.navigateTree") {
    return (
      typeof value.targetId === "string" &&
      (value.summarize === undefined || typeof value.summarize === "boolean") &&
      (value.customInstructions === undefined || typeof value.customInstructions === "string")
    );
  }
  if (value.type === "session.compact") {
    return value.instructions === undefined || typeof value.instructions === "string";
  }
  if (value.type === "session.setName") return typeof value.name === "string";
  if (value.type === "session.export") {
    return (
      (value.format === "html" || value.format === "jsonl") &&
      (value.outputPath === undefined || typeof value.outputPath === "string")
    );
  }
  if (value.type === "session.import") {
    return (
      typeof value.inputPath === "string" &&
      (value.cwdOverride === undefined || typeof value.cwdOverride === "string")
    );
  }
  if (value.type === "session.bash") {
    return (
      typeof value.command === "string" &&
      (value.excludeFromContext === undefined || typeof value.excludeFromContext === "boolean")
    );
  }
  if (value.type === "session.copyLast") return true;
  if (value.type === "runtime.reload") return true;
  if (value.type === "models.scoped.list" || value.type === "models.refresh") return true;
  if (value.type === "trust.get" || value.type === "model.list") return true;
  if (value.type === "trust.set") return typeof value.trusted === "boolean";
  if (value.type === "model.set") {
    return typeof value.provider === "string" && typeof value.id === "string";
  }
  if (value.type === "models.config.get") return true;
  if (value.type === "models.config.upsert") return isUpsertCustomProviderInput(value.input);
  if (value.type === "models.config.remove") return typeof value.provider === "string";
  if (value.type === "models.config.remove-model") {
    return typeof value.provider === "string" && typeof value.modelId === "string";
  }
  if (value.type === "thinking.set") return typeof value.level === "string";
  if (value.type === "serviceTier.set") return typeof value.tier === "string";
  if (value.type === "providers.list" || value.type === "providers.usage") return true;
  if (value.type === "providers.setApiKey") {
    return typeof value.provider === "string" && typeof value.apiKey === "string";
  }
  if (value.type === "providers.clearAuth") return typeof value.provider === "string";
  if (value.type === "providers.oauth.start") return typeof value.provider === "string";
  if (value.type === "providers.oauth.respond") {
    return (
      typeof value.operationId === "string" &&
      typeof value.promptId === "string" &&
      (value.value === undefined || typeof value.value === "string") &&
      (value.cancelled === undefined || typeof value.cancelled === "boolean")
    );
  }
  if (value.type === "providers.oauth.cancel") return typeof value.operationId === "string";
  if (value.type === "settings.get") return true;
  if (value.type === "settings.patch") {
    return isRecord(value.patch);
  }
  if (value.type === "packages.list" || value.type === "resources.list") return true;
  if (value.type === "packages.checkUpdates") return true;
  if (value.type === "packages.install" || value.type === "packages.remove") {
    return (
      typeof value.source === "string" &&
      (value.scope === "global" || value.scope === "project") &&
      (value.temporary === undefined || typeof value.temporary === "boolean")
    );
  }
  if (value.type === "packages.update") {
    return value.source === undefined || typeof value.source === "string";
  }
  if (value.type === "packages.setEnabled") {
    return (
      typeof value.source === "string" &&
      (value.scope === "global" || value.scope === "project") &&
      typeof value.enabled === "boolean"
    );
  }
  if (value.type === "session.share") return true;
  if (value.type === "test.photonProbe") return typeof value.imagePath === "string";
  if (value.type === "extensionUi.respond") {
    return (
      typeof value.runtimeId === "string" &&
      isRecord(value.response) &&
      typeof value.response.runtimeId === "string" &&
      typeof value.response.requestId === "string" &&
      typeof value.response.ok === "boolean" &&
      (value.response.error === undefined || typeof value.response.error === "string")
    );
  }

  return (
    value.type === "host.snapshot" ||
    value.type === "host.shutdown" ||
    value.type === "agent.abort" ||
    value.type === "agent.queue.clear" ||
    value.type === "test.sequenceGap"
  );
}

function isSessionThreadSummary(value: unknown): value is SessionThreadSummary {
  if (
    !(
      isRecord(value) &&
      typeof value.id === "string" &&
      typeof value.path === "string" &&
      typeof value.cwd === "string" &&
      typeof value.title === "string" &&
      typeof value.modifiedAt === "string" &&
      typeof value.messageCount === "number" &&
      typeof value.active === "boolean"
    )
  ) {
    return false;
  }
  if (value.titleBase !== undefined && typeof value.titleBase !== "string") return false;
  if (value.createdAt !== undefined && typeof value.createdAt !== "string") return false;
  if (value.parentSessionPath !== undefined && typeof value.parentSessionPath !== "string") {
    return false;
  }
  return true;
}

function isSessionHistoryMessage(value: unknown): value is SessionHistoryMessage {
  if (!isRecord(value) || typeof value.text !== "string") return false;
  if (!["user", "assistant", "thinking", "tool", "system", "shell"].includes(String(value.role))) {
    return false;
  }
  if (value.toolName !== undefined && typeof value.toolName !== "string") return false;
  if (value.isError !== undefined && typeof value.isError !== "boolean") return false;
  if (value.command !== undefined && typeof value.command !== "string") return false;
  if (value.exitCode !== undefined && typeof value.exitCode !== "number") return false;
  if (value.excludeFromContext !== undefined && typeof value.excludeFromContext !== "boolean") {
    return false;
  }
  if (value.title !== undefined && typeof value.title !== "string") return false;
  if (value.entryId !== undefined && typeof value.entryId !== "string") return false;
  if (value.timestamp !== undefined && typeof value.timestamp !== "string") return false;
  return true;
}

function isPackageUpdateInfo(value: unknown): value is PackageUpdateInfo {
  if (!isRecord(value)) return false;
  return (
    typeof value.source === "string" &&
    typeof value.displayName === "string" &&
    (value.type === "npm" || value.type === "git") &&
    (value.scope === "global" || value.scope === "project")
  );
}

function isPackageSummary(value: unknown): value is PackageSummary {
  return (
    isRecord(value) &&
    typeof value.source === "string" &&
    (value.scope === "global" || value.scope === "project") &&
    (value.kind === "npm" ||
      value.kind === "git" ||
      value.kind === "local" ||
      value.kind === "unknown") &&
    typeof value.filtered === "boolean" &&
    typeof value.enabled === "boolean" &&
    (value.installedPath === undefined || typeof value.installedPath === "string")
  );
}

function isResourceSummary(value: unknown): value is ResourceSummary {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.path === "string" &&
    ["extension", "skill", "prompt", "theme", "context", "system"].includes(String(value.kind)) &&
    (value.source === undefined || typeof value.source === "string")
  );
}

export function isHostEvent(value: unknown): value is HostEvent {
  if (!hasEnvelope(value)) return false;

  switch (value.type) {
    case "host.hello":
      return typeof value.hostPid === "number";
    case "host.ready":
    case "runtime.snapshot":
      return isHostSnapshot(value.snapshot);
    case "runtime.event":
      return (
        typeof value.runtimeId === "string" &&
        typeof value.sequence === "number" &&
        isRuntimeEvent(value.event)
      );
    case "extensionUi.request":
      return (
        typeof value.runtimeId === "string" &&
        typeof value.requestId === "string" &&
        isExtensionUiMethod(value.method) &&
        value.args !== undefined &&
        (value.timeoutMs === undefined || typeof value.timeoutMs === "number")
      );
    case "test.photonResult":
      return (
        typeof value.requestId === "string" &&
        isRecord(value.result) &&
        typeof value.result.extensions === "number" &&
        typeof value.result.extensionDiagnostics === "number" &&
        isRecord(value.result.input) &&
        typeof value.result.input.width === "number" &&
        typeof value.result.input.height === "number" &&
        isRecord(value.result.output) &&
        typeof value.result.output.width === "number" &&
        typeof value.result.output.height === "number" &&
        typeof value.result.output.bytes === "number"
      );
    case "host.crashed":
      return (
        typeof value.hostId === "string" &&
        (value.runtimeId === undefined || typeof value.runtimeId === "string") &&
        typeof value.exitCode === "number" &&
        typeof value.message === "string"
      );
    case "host.restarted":
      return (
        typeof value.hostId === "string" &&
        typeof value.previousRuntimeId === "string" &&
        isHostSnapshot(value.snapshot)
      );
    case "host.stopped":
      return value.requestId === undefined || typeof value.requestId === "string";
    case "host.error":
      return typeof value.code === "string" && typeof value.message === "string";
    case "session.list":
      return (
        Array.isArray(value.threads) &&
        value.threads.every(isSessionThreadSummary) &&
        (value.activeSessionId === undefined || typeof value.activeSessionId === "string")
      );
    case "session.opened":
      return (
        isHostSnapshot(value.snapshot) &&
        Array.isArray(value.threads) &&
        value.threads.every(isSessionThreadSummary) &&
        Array.isArray(value.history) &&
        value.history.every(isSessionHistoryMessage) &&
        (value.cancelled === undefined || typeof value.cancelled === "boolean")
      );
    case "session.tree":
      return isSessionTreeView(value.tree);
    case "session.info":
      return isSessionInfoView(value.info);
    case "session.export":
      return (
        isRecord(value.result) &&
        (value.result.format === "html" || value.result.format === "jsonl") &&
        typeof value.result.path === "string"
      );
    case "session.share":
      return (
        isRecord(value.result) &&
        typeof value.result.url === "string" &&
        typeof value.result.gistUrl === "string" &&
        typeof value.result.gistId === "string"
      );
    case "session.bash":
      return (
        isHostSnapshot(value.snapshot) &&
        isRecord(value.result) &&
        typeof value.result.command === "string" &&
        typeof value.result.output === "string" &&
        typeof value.result.exitCode === "number" &&
        typeof value.result.excludeFromContext === "boolean"
      );
    case "session.copyLast":
      return value.text === undefined || typeof value.text === "string";
    case "models.scoped":
      return (
        Array.isArray(value.models) &&
        value.models.every(
          (item) =>
            isRecord(item) &&
            typeof item.provider === "string" &&
            typeof item.id === "string" &&
            (item.name === undefined || typeof item.name === "string"),
        )
      );
    case "packages.list":
      return Array.isArray(value.packages) && value.packages.every(isPackageSummary);
    case "packages.changed":
      return (
        Array.isArray(value.packages) &&
        value.packages.every(isPackageSummary) &&
        (value.action === "install" || value.action === "remove" || value.action === "update") &&
        (value.source === undefined || typeof value.source === "string")
      );
    case "packages.progress":
      return (
        typeof value.action === "string" &&
        typeof value.source === "string" &&
        (value.phase === "start" ||
          value.phase === "progress" ||
          value.phase === "complete" ||
          value.phase === "error") &&
        (value.message === undefined || typeof value.message === "string")
      );
    case "packages.updates":
      return Array.isArray(value.updates) && value.updates.every(isPackageUpdateInfo);
    case "resources.list":
      return Array.isArray(value.resources) && value.resources.every(isResourceSummary);
    case "trust.info":
      return isProjectTrustSummary(value.trust);
    case "model.list":
      return Array.isArray(value.models) && value.models.every(isModelSummary);
    case "models.config":
      return isModelsJsonConfigView(value.config);
    case "providers.list":
      return Array.isArray(value.providers) && value.providers.every(isProviderAuthSummary);
    case "providers.usage":
      return Array.isArray(value.usage) && value.usage.every(isProviderUsageSnapshot);
    case "providers.oauth":
      return (
        typeof value.requestId === "string" &&
        typeof value.provider === "string" &&
        isProviderOAuthUpdate(value.update)
      );
    case "settings.view":
      return (
        isPiSettingsView(value.settings) &&
        (value.snapshot === undefined || isHostSnapshot(value.snapshot))
      );
    case "util.text":
      return typeof value.text === "string";
    default:
      return false;
  }
}

function isQueueDeliveryMode(value: unknown): value is QueueDeliveryMode {
  return value === "all" || value === "one-at-a-time";
}

function isDoubleEscapeAction(value: unknown): value is DoubleEscapeAction {
  return value === "fork" || value === "tree" || value === "none";
}

function isTreeFilterMode(value: unknown): value is TreeFilterMode {
  return (
    value === "default" ||
    value === "no-tools" ||
    value === "user-only" ||
    value === "labeled-only" ||
    value === "all"
  );
}

function isSessionTreeView(value: unknown): value is SessionTreeView {
  if (!isRecord(value) || typeof value.sessionId !== "string") return false;
  if (!isTreeFilterMode(value.filterMode)) return false;
  if (value.sessionFile !== undefined && typeof value.sessionFile !== "string") return false;
  if (value.leafId !== undefined && typeof value.leafId !== "string") return false;
  if (!Array.isArray(value.nodes)) return false;
  return value.nodes.every((node) => {
    if (!isRecord(node)) return false;
    const roleKindOk =
      node.roleKind === undefined ||
      node.roleKind === "user" ||
      node.roleKind === "assistant" ||
      node.roleKind === "tool" ||
      node.roleKind === "compaction" ||
      node.roleKind === "branch_summary" ||
      node.roleKind === "system" ||
      node.roleKind === "other";
    const connectorOk =
      node.connector === undefined ||
      node.connector === "none" ||
      node.connector === "mid" ||
      node.connector === "last";
    return (
      typeof node.id === "string" &&
      typeof node.role === "string" &&
      typeof node.preview === "string" &&
      typeof node.depth === "number" &&
      typeof node.leaf === "boolean" &&
      typeof node.active === "boolean" &&
      roleKindOk &&
      connectorOk &&
      (node.onActivePath === undefined || typeof node.onActivePath === "boolean") &&
      (node.isBranchPoint === undefined || typeof node.isBranchPoint === "boolean") &&
      (node.parentId === undefined || typeof node.parentId === "string") &&
      (node.label === undefined || typeof node.label === "string") &&
      (node.timestamp === undefined || typeof node.timestamp === "string")
    );
  });
}

function isSessionInfoView(value: unknown): value is SessionInfoView {
  if (!isRecord(value) || typeof value.sessionId !== "string") return false;
  if (typeof value.messageCount !== "number" || typeof value.cost !== "number") return false;
  if (!isRecord(value.tokens)) return false;
  for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"] as const) {
    if (typeof value.tokens[key] !== "number") return false;
  }
  return true;
}

function isPiSettingsView(value: unknown): value is PiSettingsView {
  if (!isRecord(value) || typeof value.agentDir !== "string") return false;
  if (
    value.defaultProjectTrust !== "ask" &&
    value.defaultProjectTrust !== "always" &&
    value.defaultProjectTrust !== "never"
  ) {
    return false;
  }
  return (
    typeof value.compactionEnabled === "boolean" &&
    typeof value.compactionReserveTokens === "number" &&
    typeof value.compactionKeepRecentTokens === "number" &&
    typeof value.retryEnabled === "boolean" &&
    typeof value.retryMaxRetries === "number" &&
    typeof value.retryBaseDelayMs === "number" &&
    typeof value.hideThinkingBlock === "boolean" &&
    typeof value.quietStartup === "boolean" &&
    typeof value.enableSkillCommands === "boolean" &&
    isQueueDeliveryMode(value.steeringMode) &&
    isQueueDeliveryMode(value.followUpMode) &&
    isDoubleEscapeAction(value.doubleEscapeAction) &&
    isTreeFilterMode(value.treeFilterMode) &&
    typeof value.enableInstallTelemetry === "boolean" &&
    typeof value.enableAnalytics === "boolean" &&
    typeof value.httpIdleTimeoutMs === "number" &&
    Array.isArray(value.enabledModels) &&
    value.enabledModels.every((item) => typeof item === "string") &&
    Array.isArray(value.inventory) &&
    value.inventory.every(
      (item) =>
        isRecord(item) &&
        typeof item.key === "string" &&
        typeof item.value === "string" &&
        (item.source === "default" ||
          item.source === "global" ||
          item.source === "project" ||
          item.source === "merged") &&
        Array.isArray(item.configuredScopes) &&
        item.configuredScopes.every((scope) => scope === "global" || scope === "project") &&
        typeof item.writable === "boolean",
    ) &&
    Array.isArray(value.readOnlyFields) &&
    value.readOnlyFields.every((item) => typeof item === "string") &&
    Array.isArray(value.degradedCapabilities) &&
    value.degradedCapabilities.every((item) => typeof item === "string") &&
    Array.isArray(value.availableThinkingLevels) &&
    value.availableThinkingLevels.every((item) => typeof item === "string") &&
    Array.isArray(value.availableServiceTiers) &&
    value.availableServiceTiers.every(
      (tier) => tier === "flex" || tier === "default" || tier === "priority",
    ) &&
    (value.defaultProvider === undefined || typeof value.defaultProvider === "string") &&
    (value.defaultModel === undefined || typeof value.defaultModel === "string") &&
    (value.defaultThinkingLevel === undefined || typeof value.defaultThinkingLevel === "string") &&
    (value.theme === undefined || typeof value.theme === "string")
  );
}
