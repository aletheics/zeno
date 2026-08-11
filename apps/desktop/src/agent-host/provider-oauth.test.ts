import { describe, expect, it } from "vite-plus/test";
import type { HostEvent } from "@zeno/contracts";
import {
  formatOAuthError,
  ProviderOAuthCoordinator,
  type OAuthModelRuntime,
} from "./provider-oauth.ts";

type OAuthEvent = Extract<HostEvent, { type: "providers.oauth" }>;
type OAuthPromptEvent = OAuthEvent & {
  update: Extract<OAuthEvent["update"], { stage: "prompt" }>;
};

function oauthEvents(events: HostEvent[]): OAuthEvent[] {
  return events.filter((event): event is OAuthEvent => event.type === "providers.oauth");
}

function promptEvent(events: HostEvent[], index: number): OAuthPromptEvent {
  const event = oauthEvents(events).filter((item) => item.update.stage === "prompt")[index];
  if (!event || event.update.stage !== "prompt") throw new Error(`Missing OAuth prompt ${index}`);
  return event as OAuthPromptEvent;
}

describe("ProviderOAuthCoordinator", () => {
  it("bridges prompts and notifications without projecting credentials", async () => {
    const events: HostEvent[] = [];
    const coordinator = new ProviderOAuthCoordinator((event) => events.push(event));
    const runtime: OAuthModelRuntime = {
      getProvider: () => ({ auth: { oauth: {} } }),
      async login(_provider, _type, interaction) {
        const method = await interaction.prompt({
          type: "select",
          message: "Choose login",
          options: [{ id: "device", label: "Device code" }],
        });
        expect(method).toBe("device");
        interaction.notify({
          type: "device_code",
          userCode: "ABCD-EFGH",
          verificationUri: "https://example.com/device",
        });
        const code = await interaction.prompt({
          type: "manual_code",
          message: "Paste the redirect URL",
        });
        expect(code).toBe("redirect-value");
        return { access: "must-not-cross-ipc", refresh: "must-not-cross-ipc" };
      },
    };

    const login = coordinator.start("operation-1", "openai-codex", runtime);
    const select = promptEvent(events, 0);
    coordinator.respond("operation-1", select.update.promptId, "device", false);
    await Promise.resolve();
    const manual = promptEvent(events, 1);
    coordinator.respond("operation-1", manual.update.promptId, "redirect-value", false);
    await login;

    expect(oauthEvents(events).some((event) => event.update.stage === "device_code")).toBe(true);
    expect(oauthEvents(events).at(-1)?.update.stage).toBe("complete");
    expect(JSON.stringify(events)).not.toMatch(/must-not-cross-ipc|access|refresh/i);
  });

  it("cancels a pending prompt and reports cancellation", async () => {
    const events: HostEvent[] = [];
    const coordinator = new ProviderOAuthCoordinator((event) => events.push(event));
    const runtime: OAuthModelRuntime = {
      getProvider: () => ({ auth: { oauth: {} } }),
      async login(_provider, _type, interaction) {
        await interaction.prompt({ type: "manual_code", message: "Paste code" });
        return {};
      },
    };

    const login = coordinator.start("operation-2", "anthropic", runtime);
    expect(coordinator.cancel("operation-2")).toBe(true);
    await login;

    expect(oauthEvents(events).at(-1)?.update.stage).toBe("cancelled");
    expect(coordinator.respond("operation-2", "stale", "value", false)).toBe(false);
  });

  it("rejects providers without OAuth support before login", async () => {
    const events: HostEvent[] = [];
    const coordinator = new ProviderOAuthCoordinator((event) => events.push(event));
    let loginCalled = false;
    const runtime: OAuthModelRuntime = {
      getProvider: () => ({ auth: {} }),
      async login() {
        loginCalled = true;
        return {};
      },
    };

    await coordinator.start("operation-3", "api-key-only", runtime);

    expect(loginCalled).toBe(false);
    expect(oauthEvents(events).at(-1)?.update.stage).toBe("error");
  });

  it("formats undici fetch failures with network guidance", () => {
    const cause = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
    const error = Object.assign(new TypeError("fetch failed"), { cause });
    const generic = formatOAuthError(error, "anthropic");
    expect(generic).toMatch(/fetch failed/);
    expect(generic).toMatch(/ECONNRESET/);
    expect(generic).toMatch(/HTTPS_PROXY|network/i);
    expect(generic).not.toMatch(/xAI|XAI_API_KEY/i);

    const xai = formatOAuthError(error, "xai");
    expect(xai).toMatch(/XAI_API_KEY/);
  });

  it("surfaces login network errors instead of bare fetch failed", async () => {
    const events: HostEvent[] = [];
    const coordinator = new ProviderOAuthCoordinator((event) => events.push(event));
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND auth.x.ai"), {
      code: "ENOTFOUND",
    });
    const runtime: OAuthModelRuntime = {
      getProvider: () => ({ auth: { oauth: {} } }),
      async login() {
        throw Object.assign(new TypeError("fetch failed"), { cause });
      },
    };

    await coordinator.start("operation-4", "xai", runtime);
    const last = oauthEvents(events).at(-1)?.update;
    expect(last?.stage).toBe("error");
    if (last?.stage === "error") {
      expect(last.message).toMatch(/ENOTFOUND/);
      expect(last.message).toMatch(/XAI_API_KEY/);
    }
  });
});
