/**
 * OpenAI `service_tier` (flex | default | priority).
 *
 * Official surface (OpenAI + pi-ai):
 * - Only Responses-family APIs can put `service_tier` on the request body.
 * - Only OpenAI-family backends implement it (openai / openai-codex / azure).
 * - pi has no session field and no per-model flag; capability is derived from
 *   the model identity in the official catalog.
 *
 * Rules used here (model-driven, not user preference):
 * 1. api must be openai-responses | openai-codex-responses | azure-openai-responses
 * 2. provider is openai | openai-codex | azure-openai-responses → supported
 * 3. other pi builtins (xai, github-copilot, opencode, …) → not supported
 * 4. custom providers (models.json / extensions): supported only when the same
 *    model id exists on an OpenAI-family catalog peer with a Responses API —
 *    i.e. the product is an OpenAI model, even if reached via a proxy.
 * 5. unknown custom ids with no OpenAI catalog peer → not supported
 *
 * streamSimple does not accept serviceTier; Zeno injects via agent.onPayload.
 */

export type ServiceTier = "flex" | "default" | "priority";

export const SERVICE_TIERS: readonly ServiceTier[] = ["flex", "default", "priority"];

/** pi-ai APIs that can serialize service_tier onto the request body. */
const SERVICE_TIER_APIS = new Set([
  "openai-responses",
  "openai-codex-responses",
  "azure-openai-responses",
]);

/** First-party providers that implement OpenAI service_tier. */
const OPENAI_SERVICE_TIER_PROVIDERS = new Set(["openai", "openai-codex", "azure-openai-responses"]);

/**
 * pi-ai builtin provider ids (keep in sync with agent-runtime model source tagging).
 * Used to distinguish first-party hosts from custom models.json providers.
 */
const PI_BUILTIN_PROVIDERS = new Set<string>([
  "amazon-bedrock",
  "ant-ling",
  "anthropic",
  "azure-openai-responses",
  "baseten",
  "cerebras",
  "cloudflare-ai-gateway",
  "cloudflare-workers-ai",
  "deepseek",
  "fireworks",
  "github-copilot",
  "google",
  "google-vertex",
  "groq",
  "huggingface",
  "kimi-coding",
  "minimax",
  "minimax-cn",
  "mistral",
  "moonshotai",
  "moonshotai-cn",
  "nvidia",
  "openai",
  "openai-codex",
  "opencode",
  "opencode-go",
  "openrouter",
  "qwen-token-plan",
  "qwen-token-plan-cn",
  "qwen-token-plan-individual",
  "radius",
  "together",
  "vercel-ai-gateway",
  "xai",
  "xiaomi",
  "xiaomi-token-plan-ams",
  "xiaomi-token-plan-cn",
  "xiaomi-token-plan-sgp",
  "zai",
  "zai-coding-cn",
]);

export type ServiceTierModel = {
  id?: string;
  api?: string;
  provider?: string;
};

export function isServiceTier(value: string): value is ServiceTier {
  return (SERVICE_TIERS as readonly string[]).includes(value);
}

function isOpenAIServiceTierProvider(provider: string | undefined): boolean {
  return Boolean(provider && OPENAI_SERVICE_TIER_PROVIDERS.has(provider));
}

function isBuiltinProvider(provider: string | undefined): boolean {
  return Boolean(provider && PI_BUILTIN_PROVIDERS.has(provider));
}

/** True when catalog lists this model id under an OpenAI-family Responses host. */
export function catalogModelIsOpenAIServiceTierProduct(
  modelId: string | undefined,
  catalogPeers: readonly ServiceTierModel[] | undefined,
): boolean {
  const id = modelId?.trim();
  if (!id || !catalogPeers?.length) return false;
  return catalogPeers.some((peer) => {
    if (peer.id !== id) return false;
    if (!isOpenAIServiceTierProvider(peer.provider)) return false;
    const peerApi = peer.api?.trim();
    return Boolean(peerApi && SERVICE_TIER_APIS.has(peerApi));
  });
}

/**
 * Whether this model officially supports OpenAI service_tier.
 * Pass the live model registry as catalogPeers for custom-proxy resolution.
 */
export function modelSupportsServiceTier(
  model: ServiceTierModel | undefined,
  catalogPeers?: readonly ServiceTierModel[],
): boolean {
  const api = model?.api?.trim();
  if (!api || !SERVICE_TIER_APIS.has(api)) return false;

  const provider = model?.provider?.trim();

  // OpenAI-family first parties: always (api already checked).
  if (isOpenAIServiceTierProvider(provider)) return true;

  // Codex / Azure API types without provider id (rare) — still OpenAI surface.
  if (!provider) {
    return api === "openai-codex-responses" || api === "azure-openai-responses";
  }

  // Other pi builtins (xai, copilot, opencode, …): not OpenAI service_tier.
  if (isBuiltinProvider(provider)) return false;

  // Custom provider: only if this model id is an OpenAI catalog product.
  return catalogModelIsOpenAIServiceTierProduct(model?.id, catalogPeers);
}

export function availableServiceTiersForModel(
  model: ServiceTierModel | undefined,
  catalogPeers?: readonly ServiceTierModel[],
): ServiceTier[] {
  return modelSupportsServiceTier(model, catalogPeers) ? [...SERVICE_TIERS] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type ServiceTierPayloadAgent = {
  onPayload?: (payload: unknown, model: unknown) => unknown;
};

const hookedAgents = new WeakSet<object>();

/**
 * Install the request-body hook once while preserving any SDK/extension payload hook.
 * getCatalogPeers is read on each request so registry refreshes are visible.
 */
export function installServiceTierPayloadHook(
  agent: unknown,
  getTier: () => ServiceTier,
  getCatalogPeers?: () => readonly ServiceTierModel[],
): void {
  if (!agent || typeof agent !== "object") return;
  if (hookedAgents.has(agent)) return;
  hookedAgents.add(agent);
  const target = agent as ServiceTierPayloadAgent;
  const previous = target.onPayload;
  target.onPayload = async (payload, model) => {
    const transformed = previous ? await previous(payload, model) : payload;
    return applyServiceTierToPayload(
      transformed === undefined ? payload : transformed,
      model as ServiceTierModel | undefined,
      getTier(),
      getCatalogPeers?.(),
    );
  };
}

/**
 * Inject service_tier into an OpenAI Responses-style request payload.
 * Omits the field for default tier and for models outside official support.
 */
export function applyServiceTierToPayload(
  payload: unknown,
  model: ServiceTierModel | undefined,
  tier: ServiceTier | undefined,
  catalogPeers?: readonly ServiceTierModel[],
): unknown {
  if (!tier || tier === "default") return payload;
  if (!modelSupportsServiceTier(model, catalogPeers)) return payload;
  if (!isRecord(payload)) return payload;
  return { ...payload, service_tier: tier };
}
