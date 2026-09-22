/**
 * pi-ai `builtinProviders()` catalog — the provider ids that ship with pi.
 *
 * Providers outside this set (models.json custom names, extension-registered providers)
 * are treated as user-defined.
 *
 * This list exists twice in the tree’s history: once for model-source tagging and once to
 * decide whether a host is first-party. Two copies of a catalog that says "keep in sync with
 * pi-ai" on it is a drift hazard — the 0.87.0 bump updated one copy and not the other, which
 * would have classified Meta as a user-defined provider on the service-tier path. It lives in
 * this leaf module now so both callers share one list. `pi-ai` is the source of truth:
 * `Object.keys(MODELS)` from `@earendil-works/pi-ai`.
 */
export const PI_BUILTIN_PROVIDERS = new Set<string>([
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
  "meta",
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
