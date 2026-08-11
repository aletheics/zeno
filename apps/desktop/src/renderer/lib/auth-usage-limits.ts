import type { ProviderUsageLimit } from "@zeno/contracts";
import type { Locale } from "./i18n.ts";

export type UsageTone = "healthy" | "warning" | "danger";

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function remainingPercent(limit: Pick<ProviderUsageLimit, "usedPercent">): number {
  return clampPercent(100 - limit.usedPercent);
}

export function usageTone(limit: Pick<ProviderUsageLimit, "usedPercent">): UsageTone {
  const remaining = remainingPercent(limit);
  if (remaining <= 10) return "danger";
  if (remaining <= 30) return "warning";
  return "healthy";
}

function compactDuration(milliseconds: number, locale: Locale): string {
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  const suffix = locale === "zh" ? { day: "天", hour: "小时", minute: "分钟" } : undefined;

  if (days > 0) parts.push(suffix ? `${days}${suffix.day}` : `${days}d`);
  if (hours > 0 && parts.length < 2) {
    parts.push(suffix ? `${hours}${suffix.hour}` : `${hours}h`);
  }
  if (minutes > 0 && parts.length < 2) {
    parts.push(suffix ? `${minutes}${suffix.minute}` : `${minutes}m`);
  }
  return parts.join(" ");
}

export function formatResetCountdown(
  resetsAt: string | undefined,
  locale: Locale,
  nowMs = Date.now(),
): string | undefined {
  if (!resetsAt) return undefined;
  const resetMs = Date.parse(resetsAt);
  if (!Number.isFinite(resetMs)) return undefined;
  if (resetMs <= nowMs) return locale === "zh" ? "即将重置" : "Resetting soon";
  const duration = compactDuration(resetMs - nowMs, locale);
  return locale === "zh" ? `${duration}后重置` : `Resets in ${duration}`;
}

export function formatWindowDuration(
  durationMins: number | undefined,
  locale: Locale,
): string | undefined {
  if (durationMins === undefined || !Number.isFinite(durationMins) || durationMins <= 0) {
    return undefined;
  }
  const duration = compactDuration(durationMins * 60_000, locale);
  return locale === "zh" ? `${duration}窗口` : `${duration} window`;
}

export function formatUsageUpdatedAt(value: string, locale: Locale): string | undefined {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}
