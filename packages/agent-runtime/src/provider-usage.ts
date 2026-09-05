import { readStoredCredential } from "@earendil-works/pi-coding-agent";
import type { ProviderUsageSnapshot } from "@zeno/contracts";
import { join } from "node:path";
import {
  parseClaudeUsage,
  parseCodexUsage,
  parseCopilotUsage,
  parseDeepSeekUsage,
  parseMoonshotUsage,
  parseOpenRouterUsage,
  parseZaiUsage,
  type ParsedProviderUsage,
} from "./provider-usage-parsers.ts";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

const ENDPOINTS = {
  codex: "https://chatgpt.com/backend-api/wham/usage",
  claude: "https://api.anthropic.com/api/oauth/usage",
  copilot: "https://api.github.com/copilot_internal/user",
  deepseekBalance: "https://api.deepseek.com/user/balance",
  openRouterCredits: "https://openrouter.ai/api/v1/credits",
  openRouterKey: "https://openrouter.ai/api/v1/key",
  zaiQuota: "https://api.z.ai/api/monitor/usage/quota/limit",
  zaiSubscription: "https://api.z.ai/api/biz/subscription/list",
  zaiCnQuota: "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
  zaiCnSubscription: "https://open.bigmodel.cn/api/biz/subscription/list",
} as const;

interface HostUsageEndpoint {
  host: string;
  endpoint: string;
  parse: (json: unknown) => ParsedProviderUsage;
}

/** Balance endpoints that can be inferred from a custom provider's base URL host. */
const HOST_USAGE_ENDPOINTS: HostUsageEndpoint[] = [
  { host: "api.deepseek.com", endpoint: ENDPOINTS.deepseekBalance, parse: parseDeepSeekUsage },
  {
    host: "api.moonshot.cn",
    endpoint: "https://api.moonshot.cn/v1/users/me/balance",
    parse: parseMoonshotUsage,
  },
  {
    host: "api.moonshot.ai",
    endpoint: "https://api.moonshot.ai/v1/users/me/balance",
    parse: parseMoonshotUsage,
  },
];

function matchUsageEndpoint(baseUrl: string): HostUsageEndpoint | undefined {
  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  return HOST_USAGE_ENDPOINTS.find(
    ({ host }) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

interface ProviderUsageModelRuntime {
  getProvider(provider: string): { name?: string; baseUrl?: string } | undefined;
  getProviders(): ReadonlyArray<{ id: string; name?: string; baseUrl?: string }>;
  hasConfiguredAuth(provider: string): boolean;
  isUsingOAuth(provider: string): boolean;
  getAuth(provider: string): Promise<
    | {
        auth: {
          apiKey?: string;
        };
      }
    | undefined
  >;
}

export interface ProviderUsageServices {
  agentDir: string;
  modelRuntime: ProviderUsageModelRuntime;
}

export interface ListProviderUsageOptions {
  fetchImpl?: typeof fetch;
  nowMs?: number;
  readCredential?: typeof readStoredCredential;
}

interface JsonResponse {
  status: number;
  ok: boolean;
  json: unknown;
  headers: Record<string, string>;
}

function displayName(services: ProviderUsageServices, provider: string): string {
  return services.modelRuntime.getProvider(provider)?.name || provider;
}

function snapshot(
  services: ProviderUsageServices,
  provider: string,
  nowMs: number,
  status: ProviderUsageSnapshot["status"],
  parsed?: ParsedProviderUsage,
  detail?: string,
): ProviderUsageSnapshot {
  return {
    provider,
    displayName: displayName(services, provider),
    updatedAt: new Date(nowMs).toISOString(),
    status,
    limits: parsed?.limits ?? [],
    usageLines: parsed?.usageLines ?? [],
    ...(parsed?.planName ? { planName: parsed.planName } : {}),
    ...(detail ? { detail } : {}),
  };
}

async function readResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("response-too-large");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("response-too-large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<JsonResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers,
      redirect: "error",
      signal: controller.signal,
    });
    if (response.redirected) throw new Error("redirect-not-allowed");
    const text = await readResponseText(response);
    let json: unknown;
    if (text.trim()) {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        if (response.ok) throw new Error("invalid-json");
      }
    }
    return {
      status: response.status,
      ok: response.ok,
      json,
      headers: Object.fromEntries(response.headers.entries()),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isAuthFailure(response: JsonResponse): boolean {
  return response.status === 401 || response.status === 403;
}

function requestFailureDetail(response: JsonResponse): string {
  return `Usage request failed (HTTP ${response.status})`;
}

function extractCodexAccountId(token: string, stored: unknown): string | undefined {
  const storedRecord =
    stored !== null && typeof stored === "object" ? (stored as Record<string, unknown>) : undefined;
  if (typeof storedRecord?.accountId === "string" && storedRecord.accountId) {
    return storedRecord.accountId;
  }
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return undefined;
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    const auth = payload["https://api.openai.com/auth"];
    if (!auth || typeof auth !== "object") return undefined;
    const accountId = (auth as Record<string, unknown>).chatgpt_account_id;
    return typeof accountId === "string" && accountId ? accountId : undefined;
  } catch {
    return undefined;
  }
}

async function resolveToken(
  services: ProviderUsageServices,
  provider: string,
): Promise<string | undefined> {
  const resolved = await services.modelRuntime.getAuth(provider);
  const token = resolved?.auth.apiKey;
  return typeof token === "string" && token ? token : undefined;
}

async function queryCodex(
  services: ProviderUsageServices,
  fetchImpl: typeof fetch,
  readCredential: typeof readStoredCredential,
  nowMs: number,
): Promise<ProviderUsageSnapshot | undefined> {
  const provider = "openai-codex";
  if (!services.modelRuntime.isUsingOAuth(provider)) return undefined;
  const token = await resolveToken(services, provider);
  if (!token) return snapshot(services, provider, nowMs, "needs-auth");

  const stored = readCredential(provider, join(services.agentDir, "auth.json"));
  const accountId = extractCodexAccountId(token, stored);
  const response = await fetchJson(
    ENDPOINTS.codex,
    {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "ZenoDesktop",
      ...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
    },
    fetchImpl,
  );
  if (isAuthFailure(response)) return snapshot(services, provider, nowMs, "needs-auth");
  if (!response.ok) {
    return snapshot(services, provider, nowMs, "error", undefined, requestFailureDetail(response));
  }
  return snapshot(
    services,
    provider,
    nowMs,
    "ok",
    parseCodexUsage(response.json, nowMs, response.headers),
  );
}

async function queryClaude(
  services: ProviderUsageServices,
  fetchImpl: typeof fetch,
  nowMs: number,
): Promise<ProviderUsageSnapshot | undefined> {
  const provider = "anthropic";
  if (!services.modelRuntime.isUsingOAuth(provider)) return undefined;
  const token = await resolveToken(services, provider);
  if (!token) return snapshot(services, provider, nowMs, "needs-auth");

  const response = await fetchJson(
    ENDPOINTS.claude,
    {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "anthropic-beta": "oauth-2025-04-20",
      "User-Agent": "claude-code/2.1.69",
    },
    fetchImpl,
  );
  if (isAuthFailure(response)) return snapshot(services, provider, nowMs, "needs-auth");
  if (!response.ok) {
    return snapshot(services, provider, nowMs, "error", undefined, requestFailureDetail(response));
  }
  return snapshot(services, provider, nowMs, "ok", parseClaudeUsage(response.json));
}

async function queryApiKeyBalance(
  services: ProviderUsageServices,
  provider: string,
  endpoint: string,
  parse: (json: unknown) => ParsedProviderUsage,
  fetchImpl: typeof fetch,
  nowMs: number,
): Promise<ProviderUsageSnapshot> {
  const token = await resolveToken(services, provider);
  if (!token) return snapshot(services, provider, nowMs, "needs-auth");
  const response = await fetchJson(
    endpoint,
    { Authorization: `Bearer ${token}`, Accept: "application/json" },
    fetchImpl,
  );
  if (isAuthFailure(response)) return snapshot(services, provider, nowMs, "needs-auth");
  if (!response.ok) {
    return snapshot(services, provider, nowMs, "error", undefined, requestFailureDetail(response));
  }
  return snapshot(services, provider, nowMs, "ok", parse(response.json));
}

async function queryDeepSeek(
  services: ProviderUsageServices,
  fetchImpl: typeof fetch,
  nowMs: number,
): Promise<ProviderUsageSnapshot> {
  return queryApiKeyBalance(
    services,
    "deepseek",
    ENDPOINTS.deepseekBalance,
    parseDeepSeekUsage,
    fetchImpl,
    nowMs,
  );
}

async function queryCopilot(
  services: ProviderUsageServices,
  fetchImpl: typeof fetch,
  readCredential: typeof readStoredCredential,
  nowMs: number,
): Promise<ProviderUsageSnapshot | undefined> {
  const provider = "github-copilot";
  if (!services.modelRuntime.isUsingOAuth(provider)) return undefined;
  await services.modelRuntime.getAuth(provider);
  const credential = readCredential(provider, join(services.agentDir, "auth.json"));
  const githubToken = credential?.type === "oauth" ? credential.refresh : undefined;
  if (!githubToken) return snapshot(services, provider, nowMs, "needs-auth");

  const response = await fetchJson(
    ENDPOINTS.copilot,
    {
      Authorization: `token ${githubToken}`,
      Accept: "application/json",
      "Editor-Version": "vscode/1.96.2",
      "Editor-Plugin-Version": "copilot-chat/0.26.7",
      "User-Agent": "GitHubCopilotChat/0.26.7",
      "X-Github-Api-Version": "2025-04-01",
    },
    fetchImpl,
  );
  if (isAuthFailure(response)) return snapshot(services, provider, nowMs, "needs-auth");
  if (!response.ok) {
    return snapshot(services, provider, nowMs, "error", undefined, requestFailureDetail(response));
  }
  return snapshot(services, provider, nowMs, "ok", parseCopilotUsage(response.json));
}

async function queryOpenRouter(
  services: ProviderUsageServices,
  fetchImpl: typeof fetch,
  nowMs: number,
): Promise<ProviderUsageSnapshot> {
  const provider = "openrouter";
  const token = await resolveToken(services, provider);
  if (!token) return snapshot(services, provider, nowMs, "needs-auth");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const [creditsResult, keyResult] = await Promise.allSettled([
    fetchJson(ENDPOINTS.openRouterCredits, headers, fetchImpl),
    fetchJson(ENDPOINTS.openRouterKey, headers, fetchImpl),
  ]);
  const credits = creditsResult.status === "fulfilled" ? creditsResult.value : undefined;
  const key = keyResult.status === "fulfilled" ? keyResult.value : undefined;
  const successfulCredits = credits?.ok ? credits.json : undefined;
  const successfulKey = key?.ok ? key.json : undefined;
  if (successfulCredits === undefined && successfulKey === undefined) {
    if ((credits && isAuthFailure(credits)) || (key && isAuthFailure(key))) {
      return snapshot(services, provider, nowMs, "needs-auth");
    }
    const failed = credits ?? key;
    return snapshot(
      services,
      provider,
      nowMs,
      "error",
      undefined,
      failed ? requestFailureDetail(failed) : "Unable to reach the usage endpoint",
    );
  }
  return snapshot(
    services,
    provider,
    nowMs,
    "ok",
    parseOpenRouterUsage(successfulCredits, successfulKey),
  );
}

async function queryZai(
  services: ProviderUsageServices,
  provider: "zai" | "zai-coding-cn",
  fetchImpl: typeof fetch,
  nowMs: number,
): Promise<ProviderUsageSnapshot> {
  const token = await resolveToken(services, provider);
  if (!token) return snapshot(services, provider, nowMs, "needs-auth");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const quotaUrl = provider === "zai" ? ENDPOINTS.zaiQuota : ENDPOINTS.zaiCnQuota;
  const subscriptionUrl =
    provider === "zai" ? ENDPOINTS.zaiSubscription : ENDPOINTS.zaiCnSubscription;
  const [quotaResult, subscriptionResult] = await Promise.allSettled([
    fetchJson(quotaUrl, headers, fetchImpl),
    fetchJson(subscriptionUrl, headers, fetchImpl),
  ]);
  if (quotaResult.status === "rejected") {
    return snapshot(
      services,
      provider,
      nowMs,
      "error",
      undefined,
      "Unable to reach the usage endpoint",
    );
  }
  const quota = quotaResult.value;
  if (isAuthFailure(quota)) return snapshot(services, provider, nowMs, "needs-auth");
  if (!quota.ok) {
    return snapshot(services, provider, nowMs, "error", undefined, requestFailureDetail(quota));
  }
  const subscription =
    subscriptionResult.status === "fulfilled" && subscriptionResult.value.ok
      ? subscriptionResult.value.json
      : undefined;
  return snapshot(services, provider, nowMs, "ok", parseZaiUsage(quota.json, subscription));
}

/** Fetch live provider quotas in the Agent Host, where credentials remain private. */
export async function listProviderUsage(
  services: ProviderUsageServices,
  options: ListProviderUsageOptions = {},
): Promise<ProviderUsageSnapshot[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const readCredential = options.readCredential ?? readStoredCredential;
  const nowMs = options.nowMs ?? Date.now();
  const configured = (provider: string): boolean =>
    Boolean(services.modelRuntime.getProvider(provider)) &&
    services.modelRuntime.hasConfiguredAuth(provider);

  const queries: Array<Promise<ProviderUsageSnapshot | undefined>> = [];
  const add = (provider: string, query: Promise<ProviderUsageSnapshot | undefined>): void => {
    queries.push(
      query.catch(() =>
        snapshot(
          services,
          provider,
          nowMs,
          "error",
          undefined,
          "Unable to reach the usage endpoint",
        ),
      ),
    );
  };
  if (configured("openai-codex")) {
    add("openai-codex", queryCodex(services, fetchImpl, readCredential, nowMs));
  }
  if (configured("anthropic")) {
    add("anthropic", queryClaude(services, fetchImpl, nowMs));
  }
  if (configured("deepseek")) {
    add("deepseek", queryDeepSeek(services, fetchImpl, nowMs));
  }
  if (configured("github-copilot")) {
    add("github-copilot", queryCopilot(services, fetchImpl, readCredential, nowMs));
  }
  if (configured("openrouter")) {
    add("openrouter", queryOpenRouter(services, fetchImpl, nowMs));
  }
  if (configured("zai")) {
    add("zai", queryZai(services, "zai", fetchImpl, nowMs));
  }
  if (configured("zai-coding-cn")) {
    add("zai-coding-cn", queryZai(services, "zai-coding-cn", fetchImpl, nowMs));
  }

  // Custom (and any non-builtin) providers: infer a balance endpoint from the
  // base URL host (e.g. a custom model pointed at api.deepseek.com).
  const handledProviders = new Set([
    "openai-codex",
    "anthropic",
    "github-copilot",
    "openrouter",
    "zai",
    "zai-coding-cn",
    "deepseek",
  ]);
  for (const provider of services.modelRuntime.getProviders()) {
    if (handledProviders.has(provider.id)) continue;
    if (!provider.baseUrl || !services.modelRuntime.hasConfiguredAuth(provider.id)) continue;
    const match = matchUsageEndpoint(provider.baseUrl);
    if (!match) continue;
    add(
      provider.id,
      queryApiKeyBalance(services, provider.id, match.endpoint, match.parse, fetchImpl, nowMs),
    );
  }

  const settled = await Promise.allSettled(queries);
  return settled.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );
}
