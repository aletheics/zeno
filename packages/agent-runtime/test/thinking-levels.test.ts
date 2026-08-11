import { describe, expect, it } from "vite-plus/test";
import {
  availableThinkingLevelsForModel,
  clampThinkingLevelForModel,
  enrichModelThinkingFromCatalog,
  findCatalogThinkingLevelMap,
  isThinkingLevel,
} from "../src/thinking-levels.ts";

describe("model thinking levels", () => {
  it("exposes only off for non-reasoning models", () => {
    expect(availableThinkingLevelsForModel(undefined)).toEqual(["off"]);
    expect(availableThinkingLevelsForModel({ reasoning: false })).toEqual(["off"]);
  });

  it("honors model map holes and opt-in extended levels", () => {
    expect(
      availableThinkingLevelsForModel({
        reasoning: true,
        thinkingLevelMap: {
          minimal: null,
          xhigh: null,
          max: "max",
        },
      }),
    ).toEqual(["off", "low", "medium", "high", "max"]);
  });

  it("matches real catalog shapes (openai gpt-5.6-sol)", () => {
    expect(
      availableThinkingLevelsForModel({
        reasoning: true,
        thinkingLevelMap: {
          off: "none",
          minimal: null,
          low: "low",
          medium: "medium",
          high: "high",
          xhigh: "xhigh",
          max: "max",
        },
      }),
    ).toEqual(["off", "low", "medium", "high", "xhigh", "max"]);
  });

  it("inherits same-api catalog map for custom models (not a different API peer)", () => {
    const openaiMap = {
      off: "none",
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    } as const;
    const codexMap = {
      xhigh: "xhigh",
      max: "max",
      minimal: "low",
    } as const;

    const peers = [
      {
        id: "gpt-5.6-sol",
        provider: "openai-codex",
        api: "openai-codex-responses",
        reasoning: true,
        thinkingLevelMap: codexMap,
      },
      {
        id: "gpt-5.6-sol",
        provider: "openai",
        api: "openai-responses",
        reasoning: true,
        thinkingLevelMap: openaiMap,
      },
      {
        id: "gpt-5.6-sol",
        provider: "XTJ",
        api: "openai-responses",
        reasoning: true,
      },
    ];

    expect(findCatalogThinkingLevelMap("gpt-5.6-sol", peers, "XTJ", "openai-responses")).toEqual(
      openaiMap,
    );

    const custom: {
      id: string;
      provider: string;
      api: string;
      reasoning: boolean;
      thinkingLevelMap?: Partial<Record<string, string | null>>;
    } = {
      id: "gpt-5.6-sol",
      provider: "XTJ",
      api: "openai-responses",
      reasoning: true,
    };
    const enriched = enrichModelThinkingFromCatalog(custom, peers);
    expect(enriched?.thinkingLevelMap).toEqual(openaiMap);
    expect(availableThinkingLevelsForModel(enriched)).toEqual([
      "off",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });

  it("never inherits a map from a different API", () => {
    const peers = [
      {
        id: "claude-opus-4-7",
        provider: "anthropic",
        api: "anthropic-messages",
        thinkingLevelMap: { xhigh: "xhigh", max: "max" },
      },
    ];
    // Custom OpenAI-shaped proxy must not pick up Anthropic's map.
    expect(
      findCatalogThinkingLevelMap("claude-opus-4-7", peers, "XTJ", "openai-responses"),
    ).toBeUndefined();
  });

  it("prefers first-party provider among same-api peers", () => {
    const peers = [
      {
        id: "gpt-5.6-sol",
        provider: "cloudflare-ai-gateway",
        api: "openai-responses",
        thinkingLevelMap: { off: null, max: "max" },
      },
      {
        id: "gpt-5.6-sol",
        provider: "openai",
        api: "openai-responses",
        thinkingLevelMap: { off: "none", max: "max" },
      },
    ];
    expect(findCatalogThinkingLevelMap("gpt-5.6-sol", peers, "XTJ", "openai-responses")).toEqual({
      off: "none",
      max: "max",
    });
  });

  it("does not override an explicit thinkingLevelMap on the custom model", () => {
    const custom = {
      id: "gpt-5.6-sol",
      provider: "XTJ",
      api: "openai-responses",
      reasoning: true,
      thinkingLevelMap: { high: "high" as string | null },
    };
    const peers = [
      {
        id: "gpt-5.6-sol",
        provider: "openai",
        api: "openai-responses",
        reasoning: true,
        thinkingLevelMap: {
          off: "none",
          max: "max",
        },
      },
    ];
    expect(enrichModelThinkingFromCatalog(custom, peers)).toBe(custom);
  });

  it("clamps stored defaults with pi's nearest supported-level rule", () => {
    const model = {
      reasoning: true,
      thinkingLevelMap: { minimal: null, low: null, medium: null, xhigh: null } as const,
    };
    expect(clampThinkingLevelForModel(model, "medium")).toBe("high");
    expect(clampThinkingLevelForModel(model, "minimal")).toBe("high");
    expect(isThinkingLevel("max")).toBe(true);
    expect(isThinkingLevel("ultra")).toBe(false);
  });
});
