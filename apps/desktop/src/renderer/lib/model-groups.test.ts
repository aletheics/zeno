import { describe, expect, it } from "vite-plus/test";
import { formatProviderGroupLabel, groupModelsByProvider } from "./model-groups.ts";

describe("model-groups", () => {
  it("uses brand casing for known providers", () => {
    expect(formatProviderGroupLabel("anthropic")).toBe("Anthropic");
    expect(formatProviderGroupLabel("openai")).toBe("OpenAI");
    expect(formatProviderGroupLabel("OPENAI")).toBe("OpenAI");
    expect(formatProviderGroupLabel("google-vertex")).toBe("Google Vertex");
    expect(formatProviderGroupLabel("deepseek")).toBe("DeepSeek");
    expect(formatProviderGroupLabel("qwen-token-plan")).toBe("Qwen Token Plan");
    expect(formatProviderGroupLabel("qwen-token-plan-cn")).toBe("Qwen Token Plan Cn");
    expect(formatProviderGroupLabel("qwen-token-plan-individual")).toBe(
      "Qwen Token Plan Individual",
    );
    expect(formatProviderGroupLabel("baseten")).toBe("Baseten");
  });

  it("title-cases unknown hyphenated ids and preserves mixed-case custom ids", () => {
    expect(formatProviderGroupLabel("my-cool-llm")).toBe("My Cool Llm");
    expect(formatProviderGroupLabel("XTJ")).toBe("XTJ");
  });

  it("lists custom providers first in first-seen order, then builtin — no alpha re-sort", () => {
    const models = [
      { provider: "openai", id: "gpt-4o", name: "GPT-4o", source: "builtin" as const },
      { provider: "anthropic", id: "claude", name: "Claude", source: "builtin" as const },
      { provider: "XTJ", id: "gpt-5.6-sol", name: "gpt-5.6-sol", source: "custom" as const },
      { provider: "acme", id: "x", name: "X", source: "custom" as const },
    ];
    const groups = groupModelsByProvider(models, "自定义");
    // Custom first in input order (XTJ before Acme), then builtin (OpenAI before Anthropic).
    expect(groups.map((g) => g.label)).toEqual(["XTJ", "Acme", "OpenAI", "Anthropic"]);
    expect(groups.map((g) => g.key)).toEqual(["custom:XTJ", "custom:acme", "openai", "anthropic"]);
    expect(groups.every((g) => g.key !== "custom")).toBe(true);
  });

  it("preserves model order within a provider from the input list", () => {
    const models = [
      { provider: "openai", id: "gpt-5", name: "GPT-5", source: "builtin" as const },
      { provider: "openai", id: "gpt-4o", name: "GPT-4o", source: "builtin" as const },
      { provider: "openai", id: "o3", name: "o3", source: "builtin" as const },
    ];
    const groups = groupModelsByProvider(models);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.models.map((m) => m.id)).toEqual(["gpt-5", "gpt-4o", "o3"]);
  });

  it("preserves models.json-style custom provider and model order", () => {
    const models = [
      { provider: "XTJ", id: "gpt-5.6-sol", name: "gpt-5.6-sol", source: "custom" as const },
      { provider: "Yu", id: "grok-4.5", name: "Grok 4.5", source: "custom" as const },
      { provider: "XTJ", id: "other", name: "other", source: "custom" as const },
    ];
    const groups = groupModelsByProvider(models);
    expect(groups.map((g) => g.label)).toEqual(["XTJ", "Yu"]);
    expect(groups[0]?.models.map((m) => m.id)).toEqual(["gpt-5.6-sol", "other"]);
    expect(groups[1]?.models.map((m) => m.id)).toEqual(["grok-4.5"]);
  });
});
