import { createServer, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

interface FakeOpenAiServerOptions {
  toolPath: string;
  /** Optional tool name/arguments for the "tool" prompt path (default: read). */
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
  /**
   * How many times to answer with HTTP 429 before succeeding.
   * Used for R03 auto-retry fixtures.
   */
  rateLimitFailures?: number;
  /** Delay between streamed tokens for queue/steer fixtures (ms). */
  streamDelayMs?: number;
}

interface ChatMessage {
  role?: string;
  content?: unknown;
}

interface ChatRequest {
  messages?: ChatMessage[];
}

function sendChunk(response: ServerResponse, value: unknown): void {
  response.write(`data: ${JSON.stringify(value)}\n\n`);
}

function chunk(delta: Record<string, unknown>, finishReason: string | null = null) {
  return {
    id: "chatcmpl-pix-fake",
    object: "chat.completion.chunk",
    created: 1,
    model: "pix-fake",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

function textContent(message: ChatMessage | undefined): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .map((part) =>
      typeof part === "object" && part !== null && "text" in part && typeof part.text === "string"
        ? part.text
        : "",
    )
    .join("");
}

export class FakeOpenAiServer {
  readonly requests: ChatRequest[] = [];
  #server: Server;
  #baseUrl: string | undefined;
  #toolPath: string;
  #toolCall: { name: string; arguments: Record<string, unknown> };
  #remainingRateLimits: number;
  #streamDelayMs: number;

  constructor(options: FakeOpenAiServerOptions) {
    this.#toolPath = options.toolPath;
    this.#toolCall = options.toolCall ?? {
      name: "read",
      arguments: { path: options.toolPath },
    };
    this.#remainingRateLimits = options.rateLimitFailures ?? 0;
    this.#streamDelayMs = options.streamDelayMs ?? 0;
    this.#server = createServer((request, response) => {
      void this.#handle(request, response);
    });
  }

  get baseUrl(): string {
    if (!this.#baseUrl) throw new Error("Fake OpenAI server has not started");
    return this.#baseUrl;
  }

  async start(): Promise<void> {
    this.#server.listen(0, "127.0.0.1");
    await once(this.#server, "listening");
    const address = this.#server.address();
    if (!address || typeof address === "string")
      throw new Error("Fake OpenAI server has no TCP address");
    this.#baseUrl = `http://127.0.0.1:${address.port}/v1`;
  }

  async stop(): Promise<void> {
    this.#server.closeAllConnections();
    this.#server.close();
    await once(this.#server, "close");
  }

  async #handle(
    request: import("node:http").IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404).end();
      return;
    }

    let body = "";
    for await (const data of request) body += String(data);
    const parsed = JSON.parse(body) as ChatRequest;
    this.requests.push(parsed);

    const messages = parsed.messages ?? [];
    const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
    const lastUser = lastUserIndex >= 0 ? messages[lastUserIndex] : undefined;
    const prompt = textContent(lastUser).toLowerCase();
    const hasToolResult = messages
      .slice(lastUserIndex + 1)
      .some((message) => message.role === "tool");

    // Compaction / summarization requests often use system-heavy prompts without "abort"/"tool".
    const isSummary =
      prompt.includes("summary") ||
      prompt.includes("summarize") ||
      messages.some((message) => textContent(message).toLowerCase().includes("compact"));

    if (this.#remainingRateLimits > 0 && !isSummary) {
      this.#remainingRateLimits -= 1;
      response.writeHead(429, {
        "content-type": "application/json",
        "retry-after": "0",
      });
      response.end(
        JSON.stringify({ error: { message: "Rate limited", type: "rate_limit_error" } }),
      );
      return;
    }

    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });

    sendChunk(response, chunk({ role: "assistant", content: "" }));

    // Hang open after the first delta so hosts can exercise abort mid-stream.
    if (prompt.includes("abort") && !prompt.includes("stream slowly")) {
      sendChunk(response, chunk({ content: "Waiting for abort..." }));
      return;
    }

    if (prompt.includes("stream slowly")) {
      sendChunk(response, chunk({ content: "Waiting for abort..." }));
      if (this.#streamDelayMs > 0) await delay(this.#streamDelayMs);
      sendChunk(response, chunk({ content: " still streaming..." }));
      if (this.#streamDelayMs > 0) await delay(this.#streamDelayMs);
      sendChunk(response, chunk({ content: " done." }));
      sendChunk(response, {
        ...chunk({}, "stop"),
        usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
      });
      response.end("data: [DONE]\n\n");
      return;
    }

    if (prompt.includes("structured timeline fixture")) {
      sendChunk(response, chunk({ reasoning_content: "Check the structured timeline first." }));
      sendChunk(response, chunk({ content: "Structured timeline ready." }));
      sendChunk(response, {
        ...chunk({}, "stop"),
        usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
      });
      response.end("data: [DONE]\n\n");
      return;
    }

    if (prompt.includes("tool") && !hasToolResult) {
      sendChunk(
        response,
        chunk({
          tool_calls: [
            {
              index: 0,
              id: "call-pix-tool",
              type: "function",
              function: {
                name: this.#toolCall.name,
                arguments: JSON.stringify(this.#toolCall.arguments),
              },
            },
          ],
        }),
      );
      sendChunk(response, chunk({}, "tool_calls"));
      response.end("data: [DONE]\n\n");
      return;
    }

    const workspace = dirname(this.#toolPath);
    const richContent = [
      "## Rich content",
      "",
      "- [x] Completed task",
      "- [ ] Pending task",
      "",
      "~~Removed text~~",
      "",
      "| Type | Status |",
      "| --- | --- |",
      "| Markdown | Ready |",
      "",
      "Inline math: $E = mc^2$",
      "",
      "$$",
      "E = mc^2",
      "$$",
      "",
      "```javascript",
      "const answer = 42;",
      "```",
      "",
      "```diff",
      "-old",
      "+new",
      "```",
      "",
      "```mermaid",
      "graph TD",
      "  A --> B",
      "```",
      "",
      "See the fixture file[^1] and the external docs[^docs].",
      "",
      `[Fixture file](${this.#toolPath}#L1C1)`,
      "[External docs](https://example.com/docs)",
      "",
      `![Preview image](${join(workspace, "photo.png")})`,
      `![Demo video](${join(workspace, "demo.mp4")})`,
      "",
      "[^1]: Primary source for the fixture path.",
      "[^docs]: https://example.com/docs",
      "",
      '<div data-unsafe-html="true">Unsafe HTML</div>',
      '<iframe src="https://example.com"></iframe>',
      "<style>body { display: none; }</style>",
      "<script>window.__pixUnsafeScript = true;</script>",
    ].join("\n");
    const text = isSummary
      ? "Compaction summary of the conversation."
      : hasToolResult
        ? "Tool result received."
        : prompt.includes("rich content fixture")
          ? richContent
          : "Zeno fake model response.";
    for (const part of text.split(" ")) {
      sendChunk(response, chunk({ content: `${part} ` }));
      if (this.#streamDelayMs > 0) await delay(this.#streamDelayMs);
    }
    sendChunk(response, {
      ...chunk({}, "stop"),
      usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
    });
    response.end("data: [DONE]\n\n");
  }
}
