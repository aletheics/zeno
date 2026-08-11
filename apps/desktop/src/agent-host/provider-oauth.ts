import { randomUUID } from "node:crypto";
import {
  IPC_PROTOCOL_VERSION,
  type HostEvent,
  type ProviderOAuthPrompt,
  type ProviderOAuthUpdate,
} from "@zeno/contracts";

interface RuntimeAuthPromptBase {
  signal?: AbortSignal;
}

type RuntimeAuthPrompt = RuntimeAuthPromptBase &
  (
    | { type: "text" | "secret" | "manual_code"; message: string; placeholder?: string }
    | {
        type: "select";
        message: string;
        options: readonly { id: string; label: string; description?: string }[];
      }
  );

type RuntimeAuthEvent =
  | { type: "info"; message: string; links?: readonly { url: string; label?: string }[] }
  | { type: "auth_url"; url: string; instructions?: string }
  | {
      type: "device_code";
      userCode: string;
      verificationUri: string;
      intervalSeconds?: number;
      expiresInSeconds?: number;
    }
  | { type: "progress"; message: string };

interface RuntimeAuthInteraction {
  signal?: AbortSignal;
  prompt(prompt: RuntimeAuthPrompt): Promise<string>;
  notify(event: RuntimeAuthEvent): void;
}

export interface OAuthModelRuntime {
  getProvider(provider: string): { auth: { oauth?: unknown } } | undefined;
  login(provider: string, type: "oauth", interaction: RuntimeAuthInteraction): Promise<unknown>;
}

interface PendingPrompt {
  resolve(value: string): void;
  reject(error: Error): void;
}

interface ActiveOAuthFlow {
  operationId: string;
  provider: string;
  abortController: AbortController;
  prompts: Map<string, PendingPrompt>;
}

function cancelledError(): Error {
  const error = new Error("OAuth login cancelled");
  error.name = "AbortError";
  return error;
}

/**
 * Undici/Node often surfaces opaque "fetch failed" without the underlying cause
 * (ENOTFOUND / ECONNRESET / cert / proxy). Unwrap cause chain for UI.
 */
export function formatOAuthError(error: unknown, provider?: string): string {
  if (!(error instanceof Error)) return "OAuth login failed";
  if (error.name === "AbortError" || error.message === "Login cancelled") {
    return "OAuth login cancelled";
  }

  const parts: string[] = [];
  const codes = new Set<string>();
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    if (current.message && !parts.includes(current.message)) parts.push(current.message);
    const code = (current as NodeJS.ErrnoException).code;
    if (typeof code === "string" && code) codes.add(code);
    current = (current as { cause?: unknown }).cause;
  }

  let message = parts.join(" — ");
  if (codes.size > 0) {
    message = `${message} (${[...codes].join(", ")})`;
  }

  const network =
    /fetch failed|network|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|CERT_|UNABLE_TO_VERIFY|socket|TLS|SSL/i.test(
      message,
    );
  if (network) {
    message +=
      ". Cannot reach the provider auth server — check network/VPN/proxy (HTTPS_PROXY/HTTP_PROXY).";
    if (provider === "xai") {
      message += " For xAI you can use an API key (XAI_API_KEY) instead of OAuth.";
    }
  }
  return message;
}

function safePrompt(prompt: RuntimeAuthPrompt): ProviderOAuthPrompt {
  if (prompt.type === "select") {
    return {
      type: "select",
      message: prompt.message,
      options: prompt.options.map((option) => ({ ...option })),
    };
  }
  const safe: ProviderOAuthPrompt = { type: prompt.type, message: prompt.message };
  if (prompt.placeholder !== undefined) safe.placeholder = prompt.placeholder;
  return safe;
}

function eventUpdate(event: RuntimeAuthEvent): ProviderOAuthUpdate {
  switch (event.type) {
    case "auth_url":
      return {
        stage: "auth_url",
        url: event.url,
        ...(event.instructions !== undefined ? { instructions: event.instructions } : {}),
      };
    case "device_code":
      return {
        stage: "device_code",
        userCode: event.userCode,
        verificationUri: event.verificationUri,
        ...(event.intervalSeconds !== undefined ? { intervalSeconds: event.intervalSeconds } : {}),
        ...(event.expiresInSeconds !== undefined
          ? { expiresInSeconds: event.expiresInSeconds }
          : {}),
      };
    case "info":
      return {
        stage: "info",
        message: event.message,
        ...(event.links ? { links: event.links.map((link) => ({ ...link })) } : {}),
      };
    case "progress":
      return { stage: "progress", message: event.message };
  }
}

export class ProviderOAuthCoordinator {
  #active: ActiveOAuthFlow | undefined;

  constructor(private readonly post: (event: HostEvent) => void) {}

  async start(
    operationId: string,
    provider: string,
    modelRuntime: OAuthModelRuntime,
  ): Promise<void> {
    if (this.#active) {
      this.#post(operationId, provider, {
        stage: "error",
        message: `OAuth login is already running for ${this.#active.provider}`,
      });
      return;
    }
    if (!modelRuntime.getProvider(provider)?.auth.oauth) {
      this.#post(operationId, provider, {
        stage: "error",
        message: `${provider} does not support OAuth login`,
      });
      return;
    }

    const flow: ActiveOAuthFlow = {
      operationId,
      provider,
      abortController: new AbortController(),
      prompts: new Map(),
    };
    this.#active = flow;
    try {
      await modelRuntime.login(provider, "oauth", {
        signal: flow.abortController.signal,
        prompt: (prompt) => this.#prompt(flow, prompt),
        notify: (event) => this.#post(operationId, provider, eventUpdate(event)),
      });
      this.#post(operationId, provider, { stage: "complete" });
    } catch (error) {
      if (
        flow.abortController.signal.aborted ||
        (error instanceof Error &&
          (error.name === "AbortError" || error.message === "Login cancelled"))
      ) {
        this.#post(operationId, provider, { stage: "cancelled" });
      } else {
        this.#post(operationId, provider, {
          stage: "error",
          message: formatOAuthError(error, provider),
        });
      }
    } finally {
      this.#rejectPrompts(flow, cancelledError());
      if (this.#active === flow) this.#active = undefined;
    }
  }

  respond(
    operationId: string,
    promptId: string,
    value: string | undefined,
    cancelled: boolean,
  ): boolean {
    const flow = this.#active;
    if (!flow || flow.operationId !== operationId) return false;
    const pending = flow.prompts.get(promptId);
    if (!pending) return false;
    if (cancelled) pending.reject(cancelledError());
    else pending.resolve(value ?? "");
    return true;
  }

  cancel(operationId?: string): boolean {
    const flow = this.#active;
    if (!flow || (operationId !== undefined && flow.operationId !== operationId)) return false;
    flow.abortController.abort();
    this.#rejectPrompts(flow, cancelledError());
    return true;
  }

  #prompt(flow: ActiveOAuthFlow, prompt: RuntimeAuthPrompt): Promise<string> {
    if (flow.abortController.signal.aborted || prompt.signal?.aborted) {
      return Promise.reject(cancelledError());
    }
    const promptId = randomUUID();
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        flow.prompts.delete(promptId);
        flow.abortController.signal.removeEventListener("abort", onAbort);
        prompt.signal?.removeEventListener("abort", onAbort);
        callback();
      };
      const onAbort = () => finish(() => reject(cancelledError()));
      flow.prompts.set(promptId, {
        resolve: (value) => finish(() => resolve(value)),
        reject: (error) => finish(() => reject(error)),
      });
      flow.abortController.signal.addEventListener("abort", onAbort, { once: true });
      prompt.signal?.addEventListener("abort", onAbort, { once: true });
      this.#post(flow.operationId, flow.provider, {
        stage: "prompt",
        promptId,
        prompt: safePrompt(prompt),
      });
    });
  }

  #rejectPrompts(flow: ActiveOAuthFlow, error: Error): void {
    for (const prompt of flow.prompts.values()) prompt.reject(error);
  }

  #post(operationId: string, provider: string, update: ProviderOAuthUpdate): void {
    this.post({
      protocolVersion: IPC_PROTOCOL_VERSION,
      type: "providers.oauth",
      requestId: operationId,
      provider,
      update,
    });
  }
}
