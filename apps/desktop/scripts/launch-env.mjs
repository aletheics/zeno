/**
 * Shared launch environment for interactive / isolated desktop runs.
 * Used by launch.mjs and dev.mjs.
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeOpenAiServer } from "../../../packages/test-utils/src/index.ts";

/**
 * @param {{ isolated?: boolean }} options
 * @returns {Promise<{ environment: NodeJS.ProcessEnv, cleanup: () => Promise<void>, label: string }>}
 */
export async function prepareLaunchEnv(options = {}) {
  const isolated = Boolean(options.isolated);

  if (!isolated) {
    // Product = visual pi: real HOME, real ~/.pi/agent (models/auth/settings/tools).
    const environment = {
      ...process.env,
      // CLI-compatible durable sessions unless the user disables.
      ZENO_PERSIST_SESSION: process.env.ZENO_PERSIST_SESSION ?? "1",
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    // Never inherit probe fixtures into product mode.
    delete environment.ZENO_WORKSPACE;
    delete environment.ZENO_TOOLS;
    if (!process.env.ZENO_MODEL_PROVIDER) {
      delete environment.ZENO_MODEL_PROVIDER;
      delete environment.ZENO_MODEL_ID;
    }
    // Use the same agent dir as the `pi` CLI unless the user overrode it.
    if (!process.env.PI_CODING_AGENT_DIR) {
      delete environment.PI_CODING_AGENT_DIR;
    }
    return {
      environment,
      label: "Zeno product launch (visual pi — real HOME + ~/.pi/agent)",
      cleanup: async () => {},
    };
  }

  const root = await mkdtemp(join(tmpdir(), "zeno-fake-"));
  const home = join(root, "home");
  const agentDir = join(home, ".pi", "agent");
  const workspace = join(root, "workspace");

  await Promise.all([
    mkdir(agentDir, { recursive: true }),
    mkdir(join(home, ".agents"), { recursive: true }),
    mkdir(workspace, { recursive: true }),
  ]);
  const toolPath = join(workspace, "fixture.txt");
  await writeFile(toolPath, "Zeno isolated launch fixture\n");

  const fakeModel = new FakeOpenAiServer({ toolPath });
  await fakeModel.start();
  await writeFile(
    join(agentDir, "models.json"),
    JSON.stringify({
      providers: {
        "zeno-fake": {
          baseUrl: fakeModel.baseUrl,
          apiKey: "test-key-not-secret",
          api: "openai-completions",
          models: [
            {
              id: "zeno-fake",
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

  const environment = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    PI_CODING_AGENT_DIR: agentDir,
    ZENO_WORKSPACE: workspace,
    ZENO_MODEL_PROVIDER: "zeno-fake",
    ZENO_MODEL_ID: "zeno-fake",
    ZENO_TOOLS: "read",
    ZENO_PERSIST_SESSION: "1",
    ZENO_ENABLE_TEST_COMMANDS: "1",
  };
  delete environment.ELECTRON_RUN_AS_NODE;

  return {
    environment,
    label: `Zeno isolated home: ${root}`,
    cleanup: async () => {
      await fakeModel.stop();
      if (process.env.ZENO_KEEP_HOME === "1") console.log(`Kept Zeno home: ${root}`);
      else await rm(root, { recursive: true, force: true });
    },
  };
}
