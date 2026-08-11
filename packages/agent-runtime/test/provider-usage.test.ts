import { describe, expect, it, vi } from "vite-plus/test";
import {
  listProviderUsage,
  type ListProviderUsageOptions,
  type ProviderUsageServices,
} from "../src/provider-usage.ts";

function services(options: {
  providers: string[];
  oauth?: string[];
  tokens?: Record<string, string>;
}): ProviderUsageServices {
  const known = new Set(options.providers);
  const oauth = new Set(options.oauth ?? []);
  return {
    agentDir: "/tmp/pix-provider-usage-test",
    modelRuntime: {
      getProvider(provider) {
        return known.has(provider) ? { name: `Name ${provider}` } : undefined;
      },
      hasConfiguredAuth(provider) {
        return known.has(provider);
      },
      isUsingOAuth(provider) {
        return oauth.has(provider);
      },
      async getAuth(provider) {
        const apiKey = options.tokens?.[provider];
        return apiKey ? { auth: { apiKey } } : undefined;
      },
    },
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

describe("live provider usage queries", () => {
  it("shows Z.AI Coding Plan usage authenticated by API key", async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = requestUrl(input);
      const headers = new Headers(init?.headers);
      requests.push({ url, authorization: headers.get("authorization") });
      if (url.endsWith("/quota/limit")) {
        return jsonResponse({
          data: {
            limits: [
              { type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 32 },
              { type: "TOKENS_LIMIT", unit: 6, number: 1, percentage: 64 },
            ],
          },
        });
      }
      return jsonResponse({ data: [{ productName: "GLM Coding Pro" }] });
    }) as typeof fetch;

    const result = await listProviderUsage(
      services({ providers: ["zai"], tokens: { zai: "zai-secret-key" } }),
      { fetchImpl, nowMs: 1_775_000_000_000 },
    );

    expect(result).toEqual([
      expect.objectContaining({
        provider: "zai",
        displayName: "Name zai",
        status: "ok",
        planName: "GLM Coding Pro",
        limits: [
          expect.objectContaining({ label: "Session", usedPercent: 32 }),
          expect.objectContaining({ label: "Weekly", usedPercent: 64 }),
        ],
      }),
    ]);
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.authorization === "Bearer zai-secret-key")).toBe(
      true,
    );
    expect(JSON.stringify(result)).not.toContain("zai-secret-key");
  });

  it("does not treat ordinary Codex or Anthropic API keys as subscription quota auth", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await listProviderUsage(
      services({
        providers: ["openai-codex", "anthropic", "unsupported-provider"],
        tokens: {
          "openai-codex": "sk-openai",
          anthropic: "sk-ant",
          "unsupported-provider": "sk-other",
        },
      }),
      { fetchImpl },
    );

    expect(result).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses refreshed Codex OAuth auth without projecting the credential", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer codex-access-token");
      expect(headers.get("chatgpt-account-id")).toBe("account-123");
      return jsonResponse({
        plan_type: "plus",
        rate_limit: { primary_window: { used_percent: 20 } },
      });
    }) as typeof fetch;
    const readCredential = vi.fn(() => ({
      type: "oauth",
      access: "codex-access-token",
      refresh: "codex-refresh-token",
      expires: 1_900_000_000_000,
      accountId: "account-123",
    })) as unknown as NonNullable<ListProviderUsageOptions["readCredential"]>;

    const result = await listProviderUsage(
      services({
        providers: ["openai-codex"],
        oauth: ["openai-codex"],
        tokens: { "openai-codex": "codex-access-token" },
      }),
      { fetchImpl, readCredential, nowMs: 1_775_000_000_000 },
    );

    expect(result[0]).toEqual(
      expect.objectContaining({
        provider: "openai-codex",
        status: "ok",
        planName: "Plus",
      }),
    );
    expect(JSON.stringify(result)).not.toMatch(/codex-(?:access|refresh)-token/);
  });

  it("isolates endpoint failures so other provider quotas still render", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = requestUrl(input);
      if (url.includes("api.z.ai")) throw new Error("network down");
      if (url.endsWith("/credits")) {
        return jsonResponse({ data: { total_credits: 20, total_usage: 5 } });
      }
      return jsonResponse({ data: { is_free_tier: false, usage: 5, limit: 10 } });
    }) as typeof fetch;

    const result = await listProviderUsage(
      services({
        providers: ["zai", "openrouter"],
        tokens: { zai: "zai-key", openrouter: "openrouter-key" },
      }),
      { fetchImpl, nowMs: 1_775_000_000_000 },
    );

    expect(result).toHaveLength(2);
    expect(result.find((entry) => entry.provider === "zai")?.status).toBe("error");
    expect(result.find((entry) => entry.provider === "openrouter")?.status).toBe("ok");
    expect(JSON.stringify(result)).not.toMatch(/zai-key|openrouter-key/);
  });

  it("turns provider auth failures into a re-authentication state", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "unauthorized" }, 401),
    ) as typeof fetch;
    const result = await listProviderUsage(
      services({ providers: ["openrouter"], tokens: { openrouter: "expired-key" } }),
      { fetchImpl, nowMs: 1_775_000_000_000 },
    );

    expect(result).toEqual([
      expect.objectContaining({ provider: "openrouter", status: "needs-auth" }),
    ]);
  });
});
