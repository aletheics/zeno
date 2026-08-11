/**
 * Shared model grouping for Settings → Models and composer model picker.
 * Custom and builtin providers both use the same display labels
 * (`formatProviderGroupLabel`); custom groups are listed first.
 *
 * Order is stable from the input list (pi catalog / models.json order):
 * first-seen provider order, and first-seen model order within each group.
 * Do not alphabetically re-sort — that scrambles catalog and user-defined order.
 */

export type ModelGroupSource = string;

export interface GroupableModel {
  provider: string;
  id: string;
  name: string;
  source?: ModelGroupSource;
}

export interface ModelGroup<T extends GroupableModel = GroupableModel> {
  /** Stable key: provider id (custom and builtin use the same key space per list). */
  key: string;
  /** Display label (brand-cased / title-cased provider id). */
  label: string;
  models: T[];
  /** True when every model in the group is custom (settings lists these first). */
  custom?: boolean;
}

/** Known provider ids → canonical display casing. */
const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  "openai-codex": "OpenAI Codex",
  "azure-openai-responses": "Azure OpenAI",
  google: "Google",
  "google-vertex": "Google Vertex",
  "amazon-bedrock": "Amazon Bedrock",
  baseten: "Baseten",
  deepseek: "DeepSeek",
  nvidia: "NVIDIA",
  "ant-ling": "Ant Ling",
  radius: "Radius",
  groq: "Groq",
  mistral: "Mistral",
  xai: "xAI",
  openrouter: "OpenRouter",
  together: "Together",
  fireworks: "Fireworks",
  cohere: "Cohere",
  perplexity: "Perplexity",
  "qwen-token-plan": "Qwen Token Plan",
  "qwen-token-plan-cn": "Qwen Token Plan Cn",
  "qwen-token-plan-individual": "Qwen Token Plan Individual",
  "kimi-coding": "Kimi Coding",
  "github-copilot": "GitHub Copilot",
  "vercel-ai-gateway": "Vercel AI Gateway",
  "zai-coding-cn": "ZAI Coding Cn",
  "minimax-cn": "MiniMax Cn",
  "moonshotai-cn": "Moonshot AI Cn",
  "xiaomi-token-plan-cn": "Xiaomi Token Plan Cn",
  "xiaomi-token-plan-ams": "Xiaomi Token Plan Ams",
  "xiaomi-token-plan-sgp": "Xiaomi Token Plan Sgp",
  "cloudflare-workers-ai": "Cloudflare Workers AI",
  "cloudflare-ai-gateway": "Cloudflare AI Gateway",
  "opencode-go": "OpenCode Go",
};

/**
 * Display name for a provider group.
 * - known ids → brand casing (Anthropic, OpenAI, …)
 * - otherwise Title-Case each hyphen/underscore segment
 * - mixed-case custom ids (e.g. XTJ) preserved as-is
 */
export function formatProviderGroupLabel(provider: string): string {
  const id = provider.trim();
  if (!id) return provider;
  const lower = id.toLowerCase();
  if (PROVIDER_LABELS[lower]) return PROVIDER_LABELS[lower]!;
  // Preserve intentional mixed-case custom provider ids that already look titled.
  if (/[A-Z]/.test(id) && id !== lower) return id;
  return id
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function mapToGroups<T extends GroupableModel>(
  map: Map<string, T[]>,
  custom: boolean,
): Array<ModelGroup<T>> {
  // Map insertion order = first-seen provider order from the input list.
  return [...map.entries()].map(([provider, list]) => ({
    key: custom ? `custom:${provider}` : provider,
    label: formatProviderGroupLabel(provider),
    // list already preserves push order (catalog / models.json model order).
    models: list,
    custom,
  }));
}

/**
 * Same grouping as Settings → Models:
 * 1. each custom provider (first-seen order from input)
 * 2. each built-in provider (first-seen order from input)
 *
 * Models inside a group keep input order (pi catalog or models.json array).
 *
 * `customLabel` is kept for API compatibility (empty custom section title in settings)
 * but is no longer used to lump all custom models under one group.
 */
export function groupModelsByProvider<T extends GroupableModel>(
  models: T[],
  _customLabel?: string,
): Array<ModelGroup<T>> {
  const customByProvider = new Map<string, T[]>();
  const builtinByProvider = new Map<string, T[]>();

  for (const model of models) {
    const key = model.provider.trim() || "unknown";
    const target = model.source === "custom" ? customByProvider : builtinByProvider;
    const list = target.get(key) ?? [];
    list.push(model);
    target.set(key, list);
  }

  return [...mapToGroups(customByProvider, true), ...mapToGroups(builtinByProvider, false)];
}
