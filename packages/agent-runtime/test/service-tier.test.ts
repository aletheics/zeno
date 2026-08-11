import { describe, expect, it } from "vite-plus/test";
import {
  applyServiceTierToPayload,
  availableServiceTiersForModel,
  catalogModelIsOpenAIServiceTierProduct,
  installServiceTierPayloadHook,
  isServiceTier,
  modelSupportsServiceTier,
} from "../src/service-tier.ts";

const openaiCatalog = [
  {
    id: "gpt-5.6-sol",
    provider: "openai",
    api: "openai-responses",
  },
  {
    id: "gpt-5.5",
    provider: "openai-codex",
    api: "openai-codex-responses",
  },
  {
    id: "grok-4.5",
    provider: "xai",
    api: "openai-responses",
  },
] as const;

describe("service-tier (official model capability)", () => {
  it("enables tiers for OpenAI-family first parties", () => {
    expect(
      modelSupportsServiceTier({
        id: "gpt-5.6-sol",
        api: "openai-responses",
        provider: "openai",
      }),
    ).toBe(true);
    expect(
      modelSupportsServiceTier({
        id: "gpt-5.5",
        api: "openai-codex-responses",
        provider: "openai-codex",
      }),
    ).toBe(true);
    expect(
      modelSupportsServiceTier({
        id: "gpt-5",
        api: "azure-openai-responses",
        provider: "azure-openai-responses",
      }),
    ).toBe(true);
  });

  it("disables tiers for builtins that only reuse the Responses shape", () => {
    expect(
      modelSupportsServiceTier({
        id: "grok-4.5",
        api: "openai-responses",
        provider: "xai",
      }),
    ).toBe(false);
    expect(
      modelSupportsServiceTier({
        id: "gpt-5.4",
        api: "openai-responses",
        provider: "github-copilot",
      }),
    ).toBe(false);
    expect(
      modelSupportsServiceTier({
        id: "gpt-5.4",
        api: "openai-responses",
        provider: "opencode",
      }),
    ).toBe(false);
    expect(
      availableServiceTiersForModel({
        id: "grok-4.5",
        api: "openai-responses",
        provider: "xai",
      }),
    ).toEqual([]);
  });

  it("enables custom proxies only when model id is an OpenAI catalog product", () => {
    expect(
      modelSupportsServiceTier(
        { id: "gpt-5.6-sol", api: "openai-responses", provider: "XTJ" },
        openaiCatalog,
      ),
    ).toBe(true);
    expect(
      modelSupportsServiceTier(
        { id: "gpt-5.5", api: "openai-codex-responses", provider: "MyCodex" },
        openaiCatalog,
      ),
    ).toBe(true);
    // Grok product via custom proxy — not an OpenAI service_tier product.
    expect(
      modelSupportsServiceTier(
        { id: "grok-4.5", api: "openai-responses", provider: "XTJ" },
        openaiCatalog,
      ),
    ).toBe(false);
    // Unknown id — no official support claim.
    expect(
      modelSupportsServiceTier(
        { id: "my-local-model", api: "openai-responses", provider: "XTJ" },
        openaiCatalog,
      ),
    ).toBe(false);
    // Custom without catalog peers cannot prove OpenAI product identity.
    expect(
      modelSupportsServiceTier({
        id: "gpt-5.6-sol",
        api: "openai-responses",
        provider: "XTJ",
      }),
    ).toBe(false);

    expect(catalogModelIsOpenAIServiceTierProduct("gpt-5.6-sol", openaiCatalog)).toBe(true);
    expect(catalogModelIsOpenAIServiceTierProduct("grok-4.5", openaiCatalog)).toBe(false);
  });

  it("rejects non-Responses APIs", () => {
    expect(
      modelSupportsServiceTier({
        id: "gpt-5",
        api: "openai-completions",
        provider: "openai",
      }),
    ).toBe(false);
    expect(
      modelSupportsServiceTier({
        id: "claude-opus-4-7",
        api: "anthropic-messages",
        provider: "anthropic",
      }),
    ).toBe(false);
  });

  it("validates tier ids", () => {
    expect(isServiceTier("priority")).toBe(true);
    expect(isServiceTier("fast")).toBe(false);
  });

  it("injects service_tier only for officially supported models", () => {
    const body = { model: "gpt-5.6-sol", input: [] };
    expect(
      applyServiceTierToPayload(
        body,
        { id: "gpt-5.6-sol", api: "openai-responses", provider: "XTJ" },
        "priority",
        openaiCatalog,
      ),
    ).toEqual({ ...body, service_tier: "priority" });

    expect(
      applyServiceTierToPayload(
        body,
        { id: "grok-4.5", api: "openai-responses", provider: "xai" },
        "priority",
        openaiCatalog,
      ),
    ).toEqual(body);

    expect(
      applyServiceTierToPayload(
        body,
        { id: "gpt-5.6-sol", api: "openai-responses", provider: "openai" },
        "default",
        openaiCatalog,
      ),
    ).toEqual(body);
  });

  it("wires catalog peers into the payload hook", async () => {
    let tier: "priority" | "flex" = "priority";
    const agent: {
      onPayload?: (payload: unknown, model?: unknown) => Promise<object> | object;
    } = {
      onPayload: (payload: unknown) => ({
        ...(payload as object),
        extension_field: true,
      }),
    };
    installServiceTierPayloadHook(
      agent,
      () => tier,
      () => openaiCatalog,
    );

    const onPayload = agent.onPayload!;
    await expect(
      onPayload(
        { model: "gpt-5.6-sol" },
        { id: "gpt-5.6-sol", api: "openai-responses", provider: "XTJ" },
      ),
    ).resolves.toEqual({
      model: "gpt-5.6-sol",
      extension_field: true,
      service_tier: "priority",
    });

    await expect(
      onPayload({ model: "grok" }, { id: "grok-4.5", api: "openai-responses", provider: "xai" }),
    ).resolves.toEqual({ model: "grok", extension_field: true });

    await expect(
      onPayload({ model: "local" }, { id: "unknown", api: "openai-responses", provider: "XTJ" }),
    ).resolves.toEqual({ model: "local", extension_field: true });
  });
});
