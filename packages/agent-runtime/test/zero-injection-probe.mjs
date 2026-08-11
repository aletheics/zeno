import { createPixRuntime } from "../src/index.ts";

const cwd = process.argv[2];
const agentDir = process.env.PI_CODING_AGENT_DIR;

if (!cwd || !agentDir) {
  throw new Error("zero-injection-probe requires cwd and PI_CODING_AGENT_DIR");
}

const handle = await createPixRuntime({ cwd, agentDir });
try {
  process.stdout.write(`${JSON.stringify(handle.snapshot())}\n`);
} finally {
  await handle.dispose();
}
