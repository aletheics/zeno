/**
 * Read/write pi-native `models.json` under agentDir.
 * Format matches pi-coding-agent docs/models.md (providers → baseUrl/api/models).
 * Secrets are never projected outward.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import type {
  CustomModelApi,
  ModelsJsonConfigView,
  ModelsJsonModelView,
  ModelsJsonProviderView,
  UpsertCustomProviderInput,
} from "@zeno/contracts";
import { normalizeProviderBaseUrl } from "./provider-base-url.ts";

const MODELS_FILE = "models.json";

/**
 * Default User-Agent for custom providers written via Zeno settings.
 * OpenAI JS SDK defaults to `OpenAI/JS …`, which some gateways (e.g. Cloudflare
 * in front of Grok proxies) block with HTTP 403. A product UA avoids that.
 */
export function defaultCustomProviderUserAgent(version?: string): string {
  const raw =
    (typeof version === "string" && version.trim()) || process.env.npm_package_version || "0.0.0";
  const v = raw.replace(/^v/i, "").trim() || "0.0.0";
  return `ZenoDesktop/${v}`;
}

/** @deprecated Prefer defaultCustomProviderUserAgent(appVersion). */
export const DEFAULT_CUSTOM_PROVIDER_USER_AGENT = defaultCustomProviderUserAgent();

const EMPTY_TEMPLATE = `{
  "providers": {}
}
`;

/** Full pi custom-provider API set (docs/custom-provider.md). */
const CUSTOM_APIS = new Set<string>([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
  "azure-openai-responses",
  "openai-codex-responses",
  "mistral-conversations",
  "google-vertex",
  "bedrock-converse-stream",
]);

/** pi models.md defaults for full model entries. */
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;

export function modelsJsonPath(agentDir: string): string {
  return join(agentDir, MODELS_FILE);
}

/**
 * Provider ids declared in agentDir/models.json (Settings custom models).
 * Sync so listModels() can classify without async.
 */
export function listModelsJsonProviderIds(agentDir: string): Set<string> {
  const path = modelsJsonPath(agentDir);
  if (!existsSync(path)) return new Set();
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(parsed) || !isRecord(parsed.providers)) return new Set();
    return new Set(
      Object.keys(parsed.providers)
        .map((id) => id.trim())
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function projectModel(raw: unknown): ModelsJsonModelView | undefined {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id.trim()) return undefined;
  const model: ModelsJsonModelView = { id: raw.id };
  if (typeof raw.name === "string" && raw.name.trim()) model.name = raw.name;
  if (typeof raw.reasoning === "boolean") model.reasoning = raw.reasoning;
  if (Array.isArray(raw.input)) {
    const hasImage = raw.input.includes("image");
    model.input = hasImage ? "text-image" : "text";
  }
  if (typeof raw.contextWindow === "number" && Number.isFinite(raw.contextWindow)) {
    model.contextWindow = raw.contextWindow;
  }
  if (typeof raw.maxTokens === "number" && Number.isFinite(raw.maxTokens)) {
    model.maxTokens = raw.maxTokens;
  }
  if (isRecord(raw.cost)) {
    if (typeof raw.cost.input === "number" && Number.isFinite(raw.cost.input)) {
      model.costInput = raw.cost.input;
    }
    if (typeof raw.cost.output === "number" && Number.isFinite(raw.cost.output)) {
      model.costOutput = raw.cost.output;
    }
    if (typeof raw.cost.cacheRead === "number" && Number.isFinite(raw.cost.cacheRead)) {
      model.costCacheRead = raw.cost.cacheRead;
    }
    if (typeof raw.cost.cacheWrite === "number" && Number.isFinite(raw.cost.cacheWrite)) {
      model.costCacheWrite = raw.cost.cacheWrite;
    }
  }
  return model;
}

function projectProvider(providerId: string, raw: unknown): ModelsJsonProviderView {
  const row = isRecord(raw) ? raw : {};
  const modelsRaw = Array.isArray(row.models) ? row.models : [];
  const models: ModelsJsonModelView[] = [];
  for (const item of modelsRaw) {
    const model = projectModel(item);
    if (model) models.push(model);
  }
  const view: ModelsJsonProviderView = {
    provider: providerId,
    models,
    hasApiKeyField: typeof row.apiKey === "string" && row.apiKey.length > 0,
  };
  if (typeof row.baseUrl === "string" && row.baseUrl.trim()) view.baseUrl = row.baseUrl;
  if (typeof row.api === "string" && row.api.trim()) view.api = row.api;
  if (row.authHeader === true) view.authHeader = true;
  if (isRecord(row.headers)) {
    for (const [key, value] of Object.entries(row.headers)) {
      if (key.toLowerCase() === "user-agent" && typeof value === "string" && value.trim()) {
        view.userAgent = value.trim();
        break;
      }
    }
  }
  return view;
}

export async function readModelsJsonConfig(agentDir: string): Promise<ModelsJsonConfigView> {
  const path = modelsJsonPath(agentDir);
  const exists = await fileExists(path);
  if (!exists) {
    return { path, exists: false, providers: [] };
  }
  try {
    const text = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) {
      return { path, exists: true, providers: [], error: "models.json root must be an object" };
    }
    const providersRaw = isRecord(parsed.providers) ? parsed.providers : {};
    // Preserve models.json key order (do not alphabetically re-sort).
    const providers = Object.keys(providersRaw).map((id) => projectProvider(id, providersRaw[id]));
    return { path, exists: true, providers };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read models.json";
    return { path, exists: true, providers: [], error: message };
  }
}

async function loadRoot(path: string): Promise<Record<string, unknown>> {
  if (!(await fileExists(path))) {
    return { providers: {} };
  }
  const text = await readFile(path, "utf8");
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error("models.json root must be an object");
  return { ...parsed };
}

function asProvidersMap(root: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(root.providers)) {
    root.providers = {};
  }
  return root.providers as Record<string, unknown>;
}

export async function ensureModelsJsonTemplate(agentDir: string): Promise<string> {
  const path = modelsJsonPath(agentDir);
  await mkdir(agentDir, { recursive: true });
  if (!(await fileExists(path))) {
    await writeFile(path, EMPTY_TEMPLATE, "utf8");
  }
  return path;
}

function positiveInt(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function nonNegNumber(value: number | undefined, fallback = 0): number {
  if (value == null || !Number.isFinite(value) || value < 0) return fallback;
  return value;
}

function removeModelFromProvidersMap(
  providers: Record<string, unknown>,
  providerId: string,
  modelId: string,
): void {
  const existing = providers[providerId];
  if (!isRecord(existing) || !Array.isArray(existing.models)) return;
  const nextModels = existing.models.filter((item) => !(isRecord(item) && item.id === modelId));
  if (nextModels.length === 0) {
    delete providers[providerId];
    return;
  }
  providers[providerId] = { ...existing, models: nextModels };
}

/**
 * Upsert a custom provider/model block per pi models.md full example.
 * Does not write apiKey into models.json — use AuthStorage / setProviderApiKey.
 * When previousProvider/previousModelId are set, renames/moves remove the old entry.
 */
/**
 * Rewrite provider baseUrl values in models.json so OpenAI / Anthropic / …
 * SDKs join paths correctly whether the user typed a trailing `/v1` or not.
 * Returns true when the file was modified.
 */
export async function normalizeModelsJsonBaseUrls(agentDir: string): Promise<boolean> {
  const path = modelsJsonPath(agentDir);
  if (!(await fileExists(path))) return false;
  let root: Record<string, unknown>;
  try {
    root = await loadRoot(path);
  } catch {
    return false;
  }
  const providers = asProvidersMap(root);
  let changed = false;
  for (const [providerId, raw] of Object.entries(providers)) {
    if (!isRecord(raw)) continue;
    const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl : "";
    const api = typeof raw.api === "string" ? raw.api : "";
    if (!baseUrl.trim() || !api.trim()) continue;
    const next = normalizeProviderBaseUrl(baseUrl, api);
    if (next !== baseUrl) {
      providers[providerId] = { ...raw, baseUrl: next };
      changed = true;
    }
  }
  if (!changed) return false;
  root.providers = providers;
  await writeFile(path, `${JSON.stringify(root, null, 2)}\n`, "utf8");
  return true;
}

export async function upsertCustomProviderInModelsJson(
  agentDir: string,
  input: UpsertCustomProviderInput,
): Promise<ModelsJsonConfigView> {
  const providerId = input.provider.trim();
  const baseUrl = normalizeProviderBaseUrl(input.baseUrl, input.api);
  const modelId = input.modelId.trim();
  if (!providerId) throw new Error("Provider id is required");
  if (!baseUrl) throw new Error("Base URL is required");
  if (!modelId) throw new Error("Model id is required");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(providerId)) {
    throw new Error(
      "Provider id must start with a letter or digit and use only letters, digits, . _ -",
    );
  }
  if (!CUSTOM_APIS.has(input.api)) {
    throw new Error(`Unsupported API type: ${input.api}`);
  }

  const path = modelsJsonPath(agentDir);
  await mkdir(agentDir, { recursive: true });
  const root = await loadRoot(path);
  const providers = asProvidersMap(root);

  const previousProvider = input.previousProvider?.trim();
  const previousModelId = input.previousModelId?.trim();
  if (
    previousProvider &&
    previousModelId &&
    (previousProvider !== providerId || previousModelId !== modelId)
  ) {
    removeModelFromProvidersMap(providers, previousProvider, previousModelId);
  }

  const existing = isRecord(providers[providerId]) ? { ...providers[providerId] } : {};
  const modelsArr = Array.isArray(existing.models) ? [...existing.models] : [];
  const modelEntry: Record<string, unknown> = {
    id: modelId,
    name: input.modelName?.trim() || modelId,
    reasoning: Boolean(input.reasoning),
    input: input.input === "text-image" ? ["text", "image"] : ["text"],
    contextWindow: positiveInt(input.contextWindow, DEFAULT_CONTEXT_WINDOW),
    maxTokens: positiveInt(input.maxTokens, DEFAULT_MAX_TOKENS),
    cost: {
      input: nonNegNumber(input.costInput),
      output: nonNegNumber(input.costOutput),
      cacheRead: nonNegNumber(input.costCacheRead),
      cacheWrite: nonNegNumber(input.costCacheWrite),
    },
  };

  let replaced = false;
  const nextModels = modelsArr.map((item) => {
    if (isRecord(item) && item.id === modelId) {
      replaced = true;
      return { ...item, ...modelEntry };
    }
    return item;
  });
  if (!replaced) nextModels.push(modelEntry);

  const providerBlock: Record<string, unknown> = {
    ...existing,
    baseUrl,
    api: input.api as CustomModelApi,
    models: nextModels,
  };
  if (input.authHeader === true) {
    providerBlock.authHeader = true;
  } else if (input.authHeader === false) {
    delete providerBlock.authHeader;
  }

  // User-Agent: form value, else keep existing, else product default (avoid OpenAI/JS 403s).
  const existingHeaders = isRecord(existing.headers)
    ? { ...(existing.headers as Record<string, unknown>) }
    : {};
  let previousUa = "";
  for (const [key, value] of Object.entries(existingHeaders)) {
    if (key.toLowerCase() === "user-agent") {
      if (!previousUa && typeof value === "string") previousUa = value.trim();
      delete existingHeaders[key];
    }
  }
  const ua = input.userAgent?.trim() || previousUa || defaultCustomProviderUserAgent();
  existingHeaders["User-Agent"] = ua;
  providerBlock.headers = existingHeaders;

  providers[providerId] = providerBlock;
  root.providers = providers;

  await writeFile(path, `${JSON.stringify(root, null, 2)}\n`, "utf8");
  return readModelsJsonConfig(agentDir);
}

export async function removeCustomProviderFromModelsJson(
  agentDir: string,
  provider: string,
): Promise<ModelsJsonConfigView> {
  const providerId = provider.trim();
  if (!providerId) throw new Error("Provider is required");
  const path = modelsJsonPath(agentDir);
  if (!(await fileExists(path))) {
    return { path, exists: false, providers: [] };
  }
  const root = await loadRoot(path);
  const providers = asProvidersMap(root);
  if (!(providerId in providers)) {
    return readModelsJsonConfig(agentDir);
  }
  delete providers[providerId];
  root.providers = providers;
  await writeFile(path, `${JSON.stringify(root, null, 2)}\n`, "utf8");
  return readModelsJsonConfig(agentDir);
}

/** Remove a single model; drops the provider when no models remain. */
export async function removeCustomModelFromModelsJson(
  agentDir: string,
  provider: string,
  modelId: string,
): Promise<ModelsJsonConfigView> {
  const providerId = provider.trim();
  const id = modelId.trim();
  if (!providerId || !id) throw new Error("Provider and model id are required");
  const path = modelsJsonPath(agentDir);
  if (!(await fileExists(path))) {
    return { path, exists: false, providers: [] };
  }
  const root = await loadRoot(path);
  const providers = asProvidersMap(root);
  removeModelFromProvidersMap(providers, providerId, id);
  root.providers = providers;
  await writeFile(path, `${JSON.stringify(root, null, 2)}\n`, "utf8");
  return readModelsJsonConfig(agentDir);
}
