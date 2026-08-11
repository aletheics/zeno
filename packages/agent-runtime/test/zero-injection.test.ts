import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { HostSnapshot } from "@zeno/contracts";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

async function listFiles(root: string, relative = ""): Promise<string[]> {
  const directory = join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(relative, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, path)));
    else files.push(path);
  }

  return files.map((path) => path.replace(/\\/g, "/")).sort();
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

describe("C01 fresh pi home", () => {
  it("creates an in-memory core runtime without injecting Zeno configuration or resources", async () => {
    const root = await mkdtemp(join(tmpdir(), "zeno-zero-injection-"));
    temporaryDirectories.push(root);

    const home = join(root, "home");
    const agentDir = join(home, ".pi", "agent");
    const project = join(root, "project");
    const userData = join(root, "user-data");
    await Promise.all([
      mkdir(agentDir, { recursive: true }),
      mkdir(join(home, ".agents"), { recursive: true }),
      mkdir(project, { recursive: true }),
      mkdir(userData, { recursive: true }),
    ]);

    const before = await listFiles(root);
    const probe = join(import.meta.dirname, "zero-injection-probe.mjs");
    const { stdout, stderr } = await execFileAsync(process.execPath, [probe, project], {
      cwd: project,
      env: isolatedEnvironment(home, agentDir),
      timeout: 20_000,
    });
    const after = await listFiles(root);
    const snapshot = JSON.parse(stdout.trim()) as HostSnapshot;

    expect(stderr).toBe("");
    expect(snapshot.cwd).toBe(project);
    expect(snapshot.agentDir).toBe(agentDir);
    expect(snapshot.sessionFile).toBeUndefined();
    expect(snapshot.resources.extensions).toBe(0);
    expect(snapshot.resources.skills).toBe(0);
    expect(snapshot.resources.prompts).toBe(0);
    expect(snapshot.resources.contextFiles).toBe(0);
    expect(snapshot.configuredPackages).toEqual({ global: 0, project: 0 });

    // AuthStorage initializes pi's native empty auth file; newer pi also seeds
    // models-store.json. No Zeno-owned data may appear.
    const created = after.filter((path) => !before.includes(path)).sort();
    expect(created).toEqual(
      ["home/.pi/agent/auth.json", "home/.pi/agent/models-store.json"].sort(),
    );
    expect(JSON.parse(await readFile(join(agentDir, "auth.json"), "utf8"))).toEqual({});
    expect((await readFile(join(agentDir, "auth.json"), "utf8")).toLowerCase()).not.toContain(
      "zeno",
    );
    expect(
      (await readFile(join(agentDir, "models-store.json"), "utf8")).toLowerCase(),
    ).not.toContain("zeno");
  });
});
