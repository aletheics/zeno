import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  normalizeModelsJsonBaseUrls,
  upsertCustomProviderInModelsJson,
} from "../src/models-json.ts";
import { normalizeProviderBaseUrl } from "../src/provider-base-url.ts";

describe("normalizeProviderBaseUrl", () => {
  describe("anthropic-messages", () => {
    it("strips trailing /v1 so SDK does not produce /v1/v1/messages", () => {
      expect(normalizeProviderBaseUrl("https://anyrouter.top/v1", "anthropic-messages")).toBe(
        "https://anyrouter.top",
      );
      expect(normalizeProviderBaseUrl("https://anyrouter.top/v1/", "anthropic-messages")).toBe(
        "https://anyrouter.top",
      );
      expect(normalizeProviderBaseUrl("https://anyrouter.top", "anthropic-messages")).toBe(
        "https://anyrouter.top",
      );
    });

    it("strips full /v1/messages endpoint when pasted as base", () => {
      expect(
        normalizeProviderBaseUrl("https://anyrouter.top/v1/messages", "anthropic-messages"),
      ).toBe("https://anyrouter.top");
    });
  });

  describe("openai-completions / openai-responses", () => {
    it("appends /v1 to bare hosts and keeps existing /v1", () => {
      expect(normalizeProviderBaseUrl("https://anyrouter.top", "openai-completions")).toBe(
        "https://anyrouter.top/v1",
      );
      expect(normalizeProviderBaseUrl("https://anyrouter.top/v1", "openai-completions")).toBe(
        "https://anyrouter.top/v1",
      );
      expect(normalizeProviderBaseUrl("https://anyrouter.top/", "openai-responses")).toBe(
        "https://anyrouter.top/v1",
      );
    });

    it("preserves custom path prefixes (not bare host)", () => {
      expect(normalizeProviderBaseUrl("https://ai.153575.xyz/openai", "openai-responses")).toBe(
        "https://ai.153575.xyz/openai",
      );
      expect(normalizeProviderBaseUrl("https://openrouter.ai/api/v1", "openai-completions")).toBe(
        "https://openrouter.ai/api/v1",
      );
      expect(
        normalizeProviderBaseUrl(
          "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
          "openai-completions",
        ),
      ).toBe("https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1");
    });

    it("strips pasted chat/responses endpoint paths back to API root", () => {
      expect(
        normalizeProviderBaseUrl("https://anyrouter.top/v1/chat/completions", "openai-completions"),
      ).toBe("https://anyrouter.top/v1");
      expect(
        normalizeProviderBaseUrl("https://anyrouter.top/v1/responses", "openai-responses"),
      ).toBe("https://anyrouter.top/v1");
    });
  });

  describe("mistral-conversations", () => {
    it("strips trailing /v1", () => {
      expect(normalizeProviderBaseUrl("https://api.mistral.ai/v1", "mistral-conversations")).toBe(
        "https://api.mistral.ai",
      );
      expect(normalizeProviderBaseUrl("https://api.mistral.ai", "mistral-conversations")).toBe(
        "https://api.mistral.ai",
      );
    });
  });

  describe("google-generative-ai", () => {
    it("defaults bare host to /v1beta and keeps explicit version roots", () => {
      expect(
        normalizeProviderBaseUrl(
          "https://generativelanguage.googleapis.com",
          "google-generative-ai",
        ),
      ).toBe("https://generativelanguage.googleapis.com/v1beta");
      expect(
        normalizeProviderBaseUrl(
          "https://generativelanguage.googleapis.com/v1beta",
          "google-generative-ai",
        ),
      ).toBe("https://generativelanguage.googleapis.com/v1beta");
    });
  });

  describe("azure-openai-responses", () => {
    it("normalizes Azure resource hosts to /openai/v1", () => {
      expect(
        normalizeProviderBaseUrl("https://my-resource.openai.azure.com", "azure-openai-responses"),
      ).toBe("https://my-resource.openai.azure.com/openai/v1");
      expect(
        normalizeProviderBaseUrl(
          "https://my-resource.openai.azure.com/openai",
          "azure-openai-responses",
        ),
      ).toBe("https://my-resource.openai.azure.com/openai/v1");
      expect(
        normalizeProviderBaseUrl(
          "https://my-resource.openai.azure.com/openai/v1/responses",
          "azure-openai-responses",
        ),
      ).toBe("https://my-resource.openai.azure.com/openai/v1");
    });
  });

  describe("passthrough APIs", () => {
    it("only trims trailing slashes for codex / vertex / bedrock", () => {
      expect(
        normalizeProviderBaseUrl("https://chatgpt.com/backend-api/", "openai-codex-responses"),
      ).toBe("https://chatgpt.com/backend-api");
      expect(normalizeProviderBaseUrl("https://aiplatform.googleapis.com/", "google-vertex")).toBe(
        "https://aiplatform.googleapis.com",
      );
    });
  });
});

describe("normalizeModelsJsonBaseUrls", () => {
  it("rewrites mixed provider baseUrls in models.json", async () => {
    const agentDir = await mkdtemp(join(tmpdir(), "zeno-baseurl-"));
    await writeFile(
      join(agentDir, "models.json"),
      `${JSON.stringify(
        {
          providers: {
            AnyRouter: {
              baseUrl: "https://anyrouter.top/v1",
              api: "anthropic-messages",
              models: [{ id: "claude", name: "claude", reasoning: true, input: ["text"] }],
            },
            Ollama: {
              baseUrl: "http://localhost:11434",
              api: "openai-completions",
              models: [{ id: "llama", name: "llama", reasoning: false, input: ["text"] }],
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    expect(await normalizeModelsJsonBaseUrls(agentDir)).toBe(true);
    expect(await normalizeModelsJsonBaseUrls(agentDir)).toBe(false);

    const raw = JSON.parse(await readFile(join(agentDir, "models.json"), "utf8")) as {
      providers: Record<string, { baseUrl: string }>;
    };
    expect(raw.providers.AnyRouter?.baseUrl).toBe("https://anyrouter.top");
    expect(raw.providers.Ollama?.baseUrl).toBe("http://localhost:11434/v1");
  });

  it("normalizes baseUrl on upsert regardless of user trailing /v1", async () => {
    const agentDir = await mkdtemp(join(tmpdir(), "zeno-baseurl-upsert-"));
    const view = await upsertCustomProviderInModelsJson(agentDir, {
      provider: "AnyRouter",
      baseUrl: "https://anyrouter.top/v1",
      api: "anthropic-messages",
      modelId: "claude-fable-5",
    });
    expect(view.providers[0]?.baseUrl).toBe("https://anyrouter.top");

    const openai = await upsertCustomProviderInModelsJson(agentDir, {
      provider: "proxy",
      baseUrl: "https://proxy.example.com",
      api: "openai-completions",
      modelId: "gpt",
    });
    expect(openai.providers.find((p) => p.provider === "proxy")?.baseUrl).toBe(
      "https://proxy.example.com/v1",
    );
  });
});
