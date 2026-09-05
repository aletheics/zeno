import type { ProviderUsageLimit, ProviderUsageLine } from "@zeno/contracts";

export interface ParsedProviderUsage {
  limits: ProviderUsageLimit[];
  usageLines: ProviderUsageLine[];
  planName?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function isoFromEpoch(value: unknown, unit: "seconds" | "milliseconds"): string | undefined {
  const raw = asNumber(value);
  if (raw === undefined || raw <= 0) return undefined;
  const date = new Date(unit === "seconds" ? raw * 1000 : raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function isoFromString(value: unknown): string | undefined {
  const raw = asString(value);
  if (!raw) return undefined;
  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function resetFromWindow(window: Record<string, unknown>, nowMs: number): string | undefined {
  const explicit = isoFromEpoch(window.reset_at, "seconds");
  if (explicit) return explicit;
  const after = asNumber(window.reset_after_seconds);
  return after !== undefined && after > 0
    ? new Date(nowMs + after * 1000).toISOString()
    : undefined;
}

export function parseCodexUsage(
  json: unknown,
  nowMs: number,
  headers: Record<string, string | undefined> = {},
): ParsedProviderUsage {
  const root = asRecord(json);
  const rateLimit = asRecord(root?.rate_limit);
  const limits: ProviderUsageLimit[] = [];

  const pushWindow = (
    label: string,
    value: unknown,
    fallbackDurationMins: number,
    headerName: string,
  ): void => {
    const window = asRecord(value);
    if (!window) return;
    const used = asNumber(headers[headerName]) ?? asNumber(window.used_percent);
    const resetsAt = resetFromWindow(window, nowMs);
    if (used === undefined) return;
    const seconds = asNumber(window.limit_window_seconds);
    limits.push({
      label,
      usedPercent: clampPercent(used),
      windowDurationMins:
        seconds !== undefined ? Math.max(0, Math.round(seconds / 60)) : fallbackDurationMins,
      ...(resetsAt ? { resetsAt } : {}),
    });
  };

  pushWindow("5h", rateLimit?.primary_window, 300, "x-codex-primary-used-percent");
  pushWindow("Weekly", rateLimit?.secondary_window, 10_080, "x-codex-secondary-used-percent");

  const usageLines: ProviderUsageLine[] = [];
  const credits = asRecord(root?.credits);
  const balance = asNumber(headers["x-codex-credits-balance"]) ?? asNumber(credits?.balance);
  if (balance !== undefined && (credits?.has_credits !== false || balance > 0)) {
    usageLines.push({ label: "Credits", value: `${formatUsd(balance)} remaining` });
  }

  const planType = asString(root?.plan_type);
  return {
    limits,
    usageLines,
    ...(planType ? { planName: titleCase(planType) } : {}),
  };
}

export function parseClaudeUsage(json: unknown): ParsedProviderUsage {
  const root = asRecord(json);
  const limits: ProviderUsageLimit[] = [];

  const pushWindow = (label: string, value: unknown, windowDurationMins: number): void => {
    const window = asRecord(value);
    if (!window) return;
    const used = asNumber(window.utilization);
    const resetsAt = isoFromString(window.resets_at);
    if (used === undefined) return;
    limits.push({
      label,
      usedPercent: clampPercent(used),
      windowDurationMins,
      ...(resetsAt ? { resetsAt } : {}),
    });
  };

  pushWindow("5h", root?.five_hour, 300);
  pushWindow("Weekly", root?.seven_day, 10_080);
  pushWindow("Sonnet", root?.seven_day_sonnet, 10_080);
  pushWindow("Opus", root?.seven_day_opus, 10_080);

  const usageLines: ProviderUsageLine[] = [];
  const extra = asRecord(root?.extra_usage);
  const usedCredits = asNumber(extra?.used_credits);
  const monthlyLimit = asNumber(extra?.monthly_limit);
  if (extra?.is_enabled !== false && usedCredits !== undefined) {
    const used = formatUsd(usedCredits / 100);
    usageLines.push({
      label: "Extra usage",
      value:
        monthlyLimit !== undefined && monthlyLimit > 0
          ? `${used} of ${formatUsd(monthlyLimit / 100)}`
          : `${used} spent`,
    });
  }

  return { limits, usageLines };
}

function zaiWindowDurationMins(entry: Record<string, unknown>): number | undefined {
  const unit = asNumber(entry.unit);
  const count = asNumber(entry.number);
  if (unit === undefined || count === undefined || count <= 0) return undefined;
  const unitMins =
    unit === 3 ? 60 : unit === 4 ? 1_440 : unit === 5 ? 43_200 : unit === 6 ? 10_080 : 0;
  return unitMins > 0 ? Math.round(unitMins * count) : undefined;
}

export function parseZaiUsage(quota: unknown, subscription?: unknown): ParsedProviderUsage {
  const root = asRecord(quota);
  const container = asRecord(root?.data) ?? root;
  const entries = Array.isArray(container?.limits)
    ? container.limits.flatMap((value) => {
        const record = asRecord(value);
        return record ? [record] : [];
      })
    : [];
  const limits: ProviderUsageLimit[] = [];

  for (const entry of entries) {
    const type = asString(entry.type) ?? asString(entry.name);
    const duration = zaiWindowDurationMins(entry);
    const resetsAt = isoFromEpoch(entry.nextResetTime, "milliseconds");
    if (type === "TOKENS_LIMIT" && duration !== undefined) {
      const used = asNumber(entry.percentage);
      if (used === undefined) continue;
      limits.push({
        label: duration < 1_440 ? "Session" : "Weekly",
        usedPercent: clampPercent(used),
        windowDurationMins: duration,
        ...(resetsAt ? { resetsAt } : {}),
      });
    } else if (type === "TIME_LIMIT") {
      const used = asNumber(entry.currentValue);
      const total = asNumber(entry.usage);
      if (used === undefined || total === undefined || total <= 0) continue;
      limits.push({
        label: "Web searches",
        usedPercent: clampPercent((used / total) * 100),
        detail: `${Math.max(0, used)} / ${total}`,
        ...(duration !== undefined ? { windowDurationMins: duration } : {}),
        ...(resetsAt ? { resetsAt } : {}),
      });
    }
  }

  const subscriptionRoot = asRecord(subscription);
  const subscriptions = Array.isArray(subscriptionRoot?.data) ? subscriptionRoot.data : [];
  const firstSubscription = asRecord(subscriptions[0]);
  const planName = asString(firstSubscription?.productName);
  return { limits, usageLines: [], ...(planName ? { planName } : {}) };
}

export function parseOpenRouterUsage(creditsJson: unknown, keyJson?: unknown): ParsedProviderUsage {
  const credits = asRecord(asRecord(creditsJson)?.data);
  const key = asRecord(asRecord(keyJson)?.data);
  const limits: ProviderUsageLimit[] = [];
  const usageLines: ProviderUsageLine[] = [];
  const totalUsage = asNumber(credits?.total_usage);
  const totalCredits = asNumber(credits?.total_credits);

  if (totalUsage !== undefined && totalCredits !== undefined) {
    const used = Math.max(0, totalUsage);
    const total = Math.max(0, totalCredits);
    if (total > 0) {
      limits.push({
        label: "Credits",
        usedPercent: clampPercent((used / total) * 100),
        detail: `${formatUsd(used)} / ${formatUsd(total)}`,
      });
    }
    usageLines.push({
      label: "Balance",
      value: `${formatUsd(Math.max(0, total - used))} remaining`,
    });
  }

  for (const [field, label] of [
    ["usage_daily", "Today"],
    ["usage_weekly", "This week"],
    ["usage_monthly", "This month"],
  ] as const) {
    const value = asNumber(key?.[field]);
    if (value !== undefined) usageLines.push({ label, value: formatUsd(Math.max(0, value)) });
  }

  const keyLimit = asNumber(key?.limit);
  const keyUsage = asNumber(key?.usage);
  if (keyLimit !== undefined && keyLimit > 0 && keyUsage !== undefined) {
    const used = Math.max(0, keyUsage);
    limits.push({
      label: "Key limit",
      usedPercent: clampPercent((used / keyLimit) * 100),
      detail: `${formatUsd(used)} / ${formatUsd(keyLimit)}`,
    });
  }

  const freeTier = key?.is_free_tier;
  const planName =
    typeof freeTier === "boolean" ? (freeTier ? "Free tier" : "Pay as you go") : undefined;
  return { limits, usageLines, ...(planName ? { planName } : {}) };
}

function parseCopilotReset(value: unknown): string | undefined {
  const text = asString(value);
  if (!text) return undefined;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text;
  return isoFromString(normalized);
}

export function parseCopilotUsage(json: unknown): ParsedProviderUsage {
  const root = asRecord(json);
  const snapshots = asRecord(root?.quota_snapshots);
  const resetsAt = parseCopilotReset(root?.quota_reset_date ?? root?.limited_user_reset_date);
  const limits: ProviderUsageLimit[] = [];
  const usageLines: ProviderUsageLine[] = [];

  const pushSnapshot = (label: string, value: unknown): void => {
    const snapshot = asRecord(value);
    if (!snapshot || snapshot.unlimited === true) return;
    const entitlement = asNumber(snapshot.entitlement);
    const remaining = asNumber(snapshot.remaining);
    if (entitlement === -1 || remaining === -1 || entitlement === undefined || entitlement <= 0) {
      return;
    }
    const remainingPercent = asNumber(snapshot.percent_remaining);
    const usedPercent =
      remainingPercent !== undefined
        ? 100 - remainingPercent
        : remaining !== undefined
          ? 100 - (remaining / entitlement) * 100
          : undefined;
    if (usedPercent === undefined) return;
    const used = remaining !== undefined ? Math.max(0, entitlement - remaining) : undefined;
    limits.push({
      label,
      usedPercent: clampPercent(usedPercent),
      windowDurationMins: 43_200,
      ...(used !== undefined ? { detail: `${used} / ${entitlement}` } : {}),
      ...(resetsAt ? { resetsAt } : {}),
    });
  };

  pushSnapshot("Credits", snapshots?.premium_interactions);
  pushSnapshot("Chat", snapshots?.chat);
  pushSnapshot("Completions", snapshots?.completions);

  const premium = asRecord(snapshots?.premium_interactions);
  const overage = asNumber(premium?.overage_count);
  if (premium?.overage_permitted === true && overage !== undefined) {
    usageLines.push({ label: "Extra usage", value: String(Math.max(0, overage)) });
  }

  const rawPlan = asString(root?.copilot_plan);
  return {
    limits,
    usageLines,
    ...(rawPlan ? { planName: titleCase(rawPlan) } : {}),
  };
}

export function parseDeepSeekUsage(json: unknown): ParsedProviderUsage {
  const root = asRecord(json);
  const infos = Array.isArray(root?.balance_infos) ? root.balance_infos : [];
  const first = asRecord(infos[0]);
  const total = asNumber(first?.total_balance);
  const usageLines: ProviderUsageLine[] = [];
  if (total !== undefined) {
    const currency = asString(first?.currency) ?? "CNY";
    usageLines.push({ label: "Balance", value: `${formatCurrency(total, currency)} remaining` });
  }
  return { limits: [], usageLines };
}

export function parseMoonshotUsage(json: unknown): ParsedProviderUsage {
  const root = asRecord(json);
  const data = asRecord(root?.data);
  const available = asNumber(data?.available_balance);
  const voucher = asNumber(data?.voucher_balance);
  const cash = asNumber(data?.cash_balance);
  const usageLines: ProviderUsageLine[] = [];
  if (available !== undefined) {
    const breakdown =
      voucher !== undefined && cash !== undefined
        ? ` (cash ${formatUsd(cash)} + voucher ${formatUsd(voucher)})`
        : "";
    usageLines.push({
      label: "Balance",
      value: `${formatUsd(available)} remaining${breakdown}`,
    });
  }
  return { limits: [], usageLines };
}
