import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { HostSnapshot } from "@zeno/contracts";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

interface ProbeResult {
  eventTypes: string[];
  text: string;
  requestCount: number;
  snapshot: HostSnapshot;
}

function isolatedEnvironment(home: string, agentDir: string): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/(_API_KEY|_TOKEN|_SECRET|_CREDENTIALS?)$/i.test(key)) delete environment[key];
  }
  return {
    ...environment,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    PI_CODING_AGENT_DIR: agentDir,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Runtime streaming", () => {
  it("streams text, executes a core tool, aborts, and settles without real credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "zeno-runtime-"));
    temporaryDirectories.push(root);
    const home = join(root, "home");
    const agentDir = join(home, ".pi", "agent");
    const project = join(root, "project");
    const toolPath = join(project, "fixture.txt");
    await Promise.all([
      mkdir(agentDir, { recursive: true }),
      mkdir(join(home, ".agents"), { recursive: true }),
      mkdir(project, { recursive: true }),
    ]);
    await writeFile(toolPath, "Runtime tool fixture\n");

    const probe = join(import.meta.dirname, "runtime-probe.mjs");
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [probe, project, agentDir, toolPath],
      {
        cwd: project,
        env: isolatedEnvironment(home, agentDir),
        timeout: 20_000,
      },
    );
    const result = JSON.parse(stdout.trim()) as ProbeResult;

    expect(stderr).toBe("");
    expect(result.requestCount).toBe(3);
    expect(result.text).toContain("Tool result received.");
    expect(result.text).toContain("Waiting for abort...");
    expect(result.eventTypes).toContain("tool_execution_start");
    expect(result.eventTypes).toContain("tool_execution_end");
    expect(result.eventTypes).toContain("agent_settled");
    expect(result.snapshot.model).toEqual({
      provider: "zeno-fake",
      id: "zeno-fake",
      api: "openai-completions",
      reasoning: false,
    });
    expect(result.snapshot.activeTools).toEqual(["read"]);
    expect(result.snapshot.sessionFile).toBeUndefined();
  }, 30_000);
});
