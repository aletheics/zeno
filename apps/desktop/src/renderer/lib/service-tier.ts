/**
 * OpenAI-family request priority (service_tier).
 * Distinct from thinking level — latency/cost priority, not reasoning depth.
 * Host only exposes tiers for OpenAI / Codex / Azure Responses models.
 */

export type ServiceTierId = "flex" | "default" | "priority";

export const SERVICE_TIER_IDS: readonly ServiceTierId[] = ["flex", "default", "priority"];

export function resolveDisplayServiceTiers(
  available: readonly string[] | undefined,
): ServiceTierId[] {
  if (!available || available.length === 0) return [];
  return available.filter((tier): tier is ServiceTierId =>
    (SERVICE_TIER_IDS as readonly string[]).includes(tier),
  );
}

export function clampToAvailableServiceTier(
  tier: string,
  available: readonly string[],
): ServiceTierId {
  const normalized = tier.trim().toLowerCase();
  if (
    available.includes(normalized) &&
    (SERVICE_TIER_IDS as readonly string[]).includes(normalized)
  ) {
    return normalized as ServiceTierId;
  }
  if (available.includes("default")) return "default";
  return (available[0] as ServiceTierId | undefined) ?? "default";
}

export function modelSupportsServiceTier(available: readonly string[]): boolean {
  return available.length > 0;
}

/** Migrate legacy localStorage speed values to service_tier. */
export function migrateLegacySpeedToServiceTier(value: string | null | undefined): ServiceTierId {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "fast" || v === "priority") return "priority";
  if (v === "quality" || v === "flex") return "flex";
  if (v === "balanced" || v === "default") return "default";
  return "default";
}
