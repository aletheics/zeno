import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createPixRuntime } from "../src/index.ts";
import { FakeOpenAiServer } from "../../test-utils/src/index.ts";

const [project, agentDir, toolPath] = process.argv.slice(2);
if (!project || !agentDir || !toolPath) {
  throw new Error("error-probe requires project, agentDir, and toolPath");
}

const server = new FakeOpenAiServer({
  toolPath,
  toolCall: { name: "u06_boom_tool", arguments: {} },
});
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

let uiThrew = false;
const handle = await createPixRuntime({
  cwd: project,
  agentDir,
  model: { provider: "pix-fake", id: "pix-fake" },
  tools: ["u06_boom_tool"],
  onExtensionUiRequest: (request) => {
    if (request.method === "notify") {
      uiThrew = true;
      throw new Error("pix-ext-ui-callback-error");
    }
  },
});

try {
  // Command handler error (recorded by pi ExtensionRunner.onError).
  await handle.runtime.session.prompt("/probe-boom");

  // Tool execute error via fake model tool call.
  const events = [];
  const unsubscribe = handle.runtime.session.subscribe((event) => events.push(event));
  try {
    await handle.runtime.session.prompt("Please use the tool now.");
  } finally {
    unsubscribe();
  }
  const toolEnd = events.find((event) => event.type === "tool_execution_end");
  const toolIsError = toolEnd?.isError === true;
  const toolOutput =
    typeof toolEnd?.result === "object" && toolEnd?.result !== null
      ? JSON.stringify(toolEnd.result)
      : String(toolEnd?.result ?? "");

  // agent_start UI path (notify) after a non-tool prompt — if agent_start already ran
  // on the tool turn, diagnostics should include UI callback failure.
  try {
    await handle.runtime.session.prompt("hello without tools");
  } catch {
    // Keep probe alive.
  }

  const snapshot = handle.snapshot();
  const diagnosticsText = snapshot.diagnostics.map((item) => item.message).join("\n");

  process.stdout.write(
    `${JSON.stringify({
      alive: true,
      diagnostics: snapshot.diagnostics,
      toolIsError,
      toolOutput: toolOutput.includes("pix-ext-tool-error")
        ? toolOutput
        : `${toolOutput}\n${diagnosticsText}`,
      uiCallbackError: uiThrew || diagnosticsText.includes("pix-ext-ui-callback-error"),
      snapshot,
    })}\n`,
  );
} finally {
  await handle.dispose();
  await server.stop();
}
