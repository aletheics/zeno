import { describe, expect, it } from "vite-plus/test";
import {
  parseClaudeUsage,
  parseCodexUsage,
  parseCopilotUsage,
  parseOpenRouterUsage,
  parseZaiUsage,
} from "../src/provider-usage-parsers.ts";

describe("provider usage parsers", () => {
  it("maps Codex rolling windows, reset timestamps, credits and plan", () => {
    const now = Date.parse("2026-07-22T00:00:00.000Z");
    const usage = parseCodexUsage(
      {
        plan_type: "chatgpt_plus",
        rate_limit: {
          primary_window: {
            used_percent: 21.5,
            limit_window_seconds: 18_000,
            reset_after_seconds: 900,
          },
          secondary_window: {
            used_percent: 118,
            reset_at: 1_774_396_800,
          },
        },
        credits: { has_credits: true, balance: 12.345 },
      },
      now,
    );

    expect(usage.planName).toBe("Chatgpt Plus");
    expect(usage.limits).toEqual([
      {
        label: "5h",
        usedPercent: 21.5,
        windowDurationMins: 300,
        resetsAt: "2026-07-22T00:15:00.000Z",
      },
      {
        label: "Weekly",
        usedPercent: 100,
        windowDurationMins: 10_080,
        resetsAt: "2026-03-25T00:00:00.000Z",
      },
    ]);
    expect(usage.usageLines).toEqual([{ label: "Credits", value: "$12.35 remaining" }]);
  });

  it("does not invent zero-percent Codex or Claude meters from reset metadata", () => {
    expect(
      parseCodexUsage(
        { rate_limit: { primary_window: { reset_after_seconds: 60 } } },
        Date.parse("2026-07-22T00:00:00.000Z"),
      ).limits,
    ).toEqual([]);
    expect(
      parseClaudeUsage({ five_hour: { resets_at: "2026-07-22T01:00:00.000Z" } }).limits,
    ).toEqual([]);
  });

  it("uses Codex quota headers when the endpoint omits body percentages", () => {
    const usage = parseCodexUsage(
      {
        rate_limit: { primary_window: { reset_after_seconds: 60 } },
        credits: { has_credits: true },
      },
      Date.parse("2026-07-22T00:00:00.000Z"),
      {
        "x-codex-primary-used-percent": "37.5",
        "x-codex-credits-balance": "9.25",
      },
    );
    expect(usage.limits[0]).toEqual(expect.objectContaining({ label: "5h", usedPercent: 37.5 }));
    expect(usage.usageLines).toEqual([{ label: "Credits", value: "$9.25 remaining" }]);
  });

  it("maps Claude subscription windows and extra-usage credits", () => {
    const usage = parseClaudeUsage({
      five_hour: { utilization: 12, resets_at: "2026-07-22T02:00:00Z" },
      seven_day: { utilization: -3, resets_at: "2026-07-29T00:00:00Z" },
      seven_day_sonnet: { utilization: 44 },
      seven_day_opus: { utilization: 101 },
      extra_usage: { is_enabled: true, used_credits: 1234, monthly_limit: 5000 },
    });

    expect(usage.limits.map((limit) => [limit.label, limit.usedPercent])).toEqual([
      ["5h", 12],
      ["Weekly", 0],
      ["Sonnet", 44],
      ["Opus", 100],
    ]);
    expect(usage.usageLines).toEqual([{ label: "Extra usage", value: "$12.34 of $50.00" }]);
  });

  it("maps both Z.AI Coding Plan token windows and count quotas", () => {
    const usage = parseZaiUsage(
      {
        success: true,
        data: {
          limits: [
            {
              type: "TOKENS_LIMIT",
              unit: 3,
              number: 5,
              percentage: 26,
              nextResetTime: 1_777_000_000_000,
            },
            {
              name: "TOKENS_LIMIT",
              unit: 6,
              number: 1,
              percentage: 63,
              nextResetTime: 1_777_500_000_000,
            },
            {
              type: "TIME_LIMIT",
              unit: 5,
              number: 1,
              currentValue: 37,
              usage: 100,
            },
          ],
        },
      },
      { data: [{ productName: "GLM Coding Max" }] },
    );

    expect(usage.planName).toBe("GLM Coding Max");
    expect(usage.limits).toEqual([
      expect.objectContaining({
        label: "Session",
        usedPercent: 26,
        windowDurationMins: 300,
      }),
      expect.objectContaining({
        label: "Weekly",
        usedPercent: 63,
        windowDurationMins: 10_080,
      }),
      expect.objectContaining({
        label: "Web searches",
        usedPercent: 37,
        detail: "37 / 100",
        windowDurationMins: 43_200,
      }),
    ]);
  });

  it("maps OpenRouter account balance, spend windows and key limits", () => {
    const usage = parseOpenRouterUsage(
      { data: { total_credits: 80, total_usage: 25.5 } },
      {
        data: {
          is_free_tier: false,
          usage: 10,
          limit: 20,
          usage_daily: 1.25,
          usage_weekly: 5,
          usage_monthly: 10,
        },
      },
    );

    expect(usage.planName).toBe("Pay as you go");
    expect(usage.limits[0]).toEqual(
      expect.objectContaining({ label: "Credits", detail: "$25.50 / $80.00" }),
    );
    expect(usage.limits[0]?.usedPercent).toBeCloseTo(31.875);
    expect(usage.limits[1]).toEqual({
      label: "Key limit",
      usedPercent: 50,
      detail: "$10.00 / $20.00",
    });
    expect(usage.usageLines).toContainEqual({ label: "Balance", value: "$54.50 remaining" });
    expect(usage.usageLines).toContainEqual({ label: "Today", value: "$1.25" });
  });

  it("does not invent OpenRouter key usage when only a cap is returned", () => {
    const usage = parseOpenRouterUsage(undefined, { data: { limit: 20 } });
    expect(usage.limits).toEqual([]);
  });

  it("maps Copilot monthly quotas, resets and unlimited buckets", () => {
    const usage = parseCopilotUsage({
      copilot_plan: "business_plus",
      quota_reset_date: "2026-08-01",
      quota_snapshots: {
        premium_interactions: {
          entitlement: 300,
          remaining: 225,
          percent_remaining: 75,
          overage_permitted: true,
          overage_count: 4,
        },
        chat: { unlimited: true, entitlement: -1, remaining: -1 },
        completions: { entitlement: 1000, remaining: 600 },
      },
    });

    expect(usage.planName).toBe("Business Plus");
    expect(usage.limits).toEqual([
      {
        label: "Credits",
        usedPercent: 25,
        windowDurationMins: 43_200,
        detail: "75 / 300",
        resetsAt: "2026-08-01T00:00:00.000Z",
      },
      {
        label: "Completions",
        usedPercent: 40,
        windowDurationMins: 43_200,
        detail: "400 / 1000",
        resetsAt: "2026-08-01T00:00:00.000Z",
      },
    ]);
    expect(usage.usageLines).toEqual([{ label: "Extra usage", value: "4" }]);
  });
});
