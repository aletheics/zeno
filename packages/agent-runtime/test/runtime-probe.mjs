import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createPixRuntime } from "../src/index.ts";
import { FakeOpenAiServer } from "../../test-utils/src/index.ts";

const [project, agentDir, toolPath] = process.argv.slice(2);
if (!project || !agentDir || !toolPath)
  throw new Error("runtime-probe requires project, agentDir, and toolPath");

const server = new FakeOpenAiServer({ toolPath });
await server.start();
await mkdir(agentDir, { recursive: true });
await writeFile(
  join(agentDir, "models.json"),
  JSON.stringify({
    providers: {
      "pix-fake": {
        baseUrl: server.baseUrl,
        apiKey: "test-key-not-secret",
        api: "openai-completions",
        models: [
          {
            id: "pix-fake",
            name: "Zeno Fake Model",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 8192,
            maxTokens: 1024,
            compat: { supportsUsageInStreaming: true },
          },
        ],
      },
    },
  }),
);

const handle = await createPixRuntime({
  cwd: project,
  agentDir,
  model: { provider: "pix-fake", id: "pix-fake" },
  tools: ["read"],
});

const eventTypes = [];
const deltas = [];
let resolveAbortDelta;
const abortDelta = new Promise((resolve) => {
  resolveAbortDelta = resolve;
});
const unsubscribe = handle.runtime.session.subscribe((event) => {
  eventTypes.push(event.type);
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    deltas.push(event.assistantMessageEvent.delta);
    if (event.assistantMessageEvent.delta.includes("Waiting for abort")) resolveAbortDelta();
  }
});

try {
  await handle.runtime.session.prompt("Use the read tool for the fixture file.");

  const abortPrompt = handle.runtime.session.prompt("ABORT this response after its first delta.");
  let abortTimeout;
  try {
    await Promise.race([
      abortDelta,
      new Promise((_, reject) => {
        abortTimeout = setTimeout(
          () => reject(new Error("Timed out waiting for abort delta")),
          5_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(abortTimeout);
  }
  await handle.runtime.session.abort();
  await abortPrompt;

  process.stdout.write(
    `${JSON.stringify({
      eventTypes,
      text: deltas.join(""),
      requestCount: server.requests.length,
      snapshot: handle.snapshot(eventTypes.length),
    })}\n`,
  );
} finally {
  unsubscribe();
  await handle.dispose();
  await server.stop();
}
