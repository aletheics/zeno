/**
 * Model thinking levels — mirror of pi-ai getSupportedThinkingLevels / clampThinkingLevel.
 *
 * Official capability is entirely model-driven:
 * - model.reasoning === false → only "off"
 * - model.thinkingLevelMap → null hides a level; xhigh/max require a non-null entry
 * - Transmission is pi agent-core → streamSimple({ reasoning }) → provider wire format
 *
 * Custom models.json often sets only reasoning:true and omits thinkingLevelMap.
 * When that happens we copy the map from an official catalog peer with the same
 * model id AND same api (never cross APIs). That is catalog capability, not a
 * user preference. Unknown ids keep pi's default (off…high, no xhigh/max).
 */

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export type ThinkingLevelModel = {
  id?: string;
  provider?: string;
  api?: string;
  reasoning?: boolean;
  thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
};

/** Prefer first-party catalog providers when several same-api peers share an id. */
const CATALOG_THINKING_PROVIDER_PRIORITY = [
  "openai",
  "openai-codex",
  "azure-openai-responses",
  "anthropic",
  "google",
  "google-vertex",
  "xai",
] as const;

export function isThinkingLevel(value: string): value is ThinkingLevel {
  return (THINKING_LEVELS as readonly string[]).includes(value);
}

function providerRank(provider: string | undefined): number {
  if (!provider) return CATALOG_THINKING_PROVIDER_PRIORITY.length + 1;
  const index = (CATALOG_THINKING_PROVIDER_PRIORITY as readonly string[]).indexOf(provider);
  return index === -1 ? CATALOG_THINKING_PROVIDER_PRIORITY.length : index;
}

/**
 * Official thinkingLevelMap for modelId from catalog peers.
 * Requires same api when selfApi is set — maps are API-specific.
 */
export function findCatalogThinkingLevelMap(
  modelId: string,
  peers: readonly ThinkingLevelModel[],
  selfProvider?: string,
  selfApi?: string,
): ThinkingLevelModel["thinkingLevelMap"] | undefined {
  const id = modelId.trim();
  if (!id) return undefined;

  const api = selfApi?.trim();
  const candidates = peers.filter((peer) => {
    if (peer.id !== id) return false;
    if (peer.thinkingLevelMap === undefined) return false;
    if (selfProvider && peer.provider === selfProvider) return false;
    if (api) return peer.api === api;
    return true;
  });
  if (candidates.length === 0) return undefined;

  const scored = candidates.map((peer) => ({
    peer,
    score: providerRank(peer.provider),
  }));
  scored.sort((a, b) => a.score - b.score);
  return scored[0]?.peer.thinkingLevelMap;
}

/**
 * Attach official catalog thinkingLevelMap when the model has reasoning but no map.
 * Explicit maps (including {}) are never overridden.
 */
export function enrichModelThinkingFromCatalog<T extends ThinkingLevelModel>(
  model: T | undefined,
  peers: readonly ThinkingLevelModel[],
): T | undefined {
  if (!model) return model;
  if (!model.reasoning) return model;
  if (model.thinkingLevelMap !== undefined) return model;
  if (!model.id) return model;

  const map = findCatalogThinkingLevelMap(model.id, peers, model.provider, model.api);
  if (!map) return model;
  return { ...model, thinkingLevelMap: { ...map } };
}

/** Official supported levels for this model (pi getSupportedThinkingLevels). */
export function availableThinkingLevelsForModel(
  model: ThinkingLevelModel | undefined,
): ThinkingLevel[] {
  if (!model?.reasoning) return ["off"];
  return THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    if (level === "xhigh" || level === "max") return mapped !== undefined;
    return true;
  });
}

/** pi nearest-level clamp when a stored default is unsupported by this model. */
export function clampThinkingLevelForModel(
  model: ThinkingLevelModel | undefined,
  level: ThinkingLevel,
): ThinkingLevel {
  const available = availableThinkingLevelsForModel(model);
  if (available.includes(level)) return level;
  const requestedIndex = THINKING_LEVELS.indexOf(level);
  if (requestedIndex === -1) return available[0] ?? "off";
  for (let index = requestedIndex; index < THINKING_LEVELS.length; index += 1) {
    const candidate = THINKING_LEVELS[index];
    if (candidate && available.includes(candidate)) return candidate;
  }
  for (let index = requestedIndex - 1; index >= 0; index -= 1) {
    const candidate = THINKING_LEVELS[index];
    if (candidate && available.includes(candidate)) return candidate;
  }
  return available[0] ?? "off";
}
