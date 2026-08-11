import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { HostSnapshot } from "@zeno/contracts";
import { afterEach, describe, expect, it } from "vite-plus/test";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("P06/U06 extension load failure", () => {
  it("keeps the runtime alive, reports a diagnostic, and preserves other resources", async () => {
    const root = await mkdtemp(join(tmpdir(), "pix-pkg-extension-load-"));
    temporaryDirectories.push(root);
    const home = join(root, "home");
    const agentDir = join(home, ".pi", "agent");
    const cwd = join(root, "project");
    await Promise.all([
      mkdir(join(agentDir, "extensions"), { recursive: true }),
      mkdir(join(agentDir, "prompts"), { recursive: true }),
      mkdir(join(home, ".agents"), { recursive: true }),
      mkdir(cwd, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        join(agentDir, "extensions", "broken.ts"),
        'throw new Error("pix-pkg-extension-load-failure");\nexport default () => undefined;\n',
      ),
      writeFile(join(agentDir, "prompts", "still-available.md"), "Still available.\n"),
    ]);

    const environment = { ...process.env };
    for (const key of Object.keys(environment)) {
      if (/(_API_KEY|_TOKEN|_SECRET|_CREDENTIALS?)$/i.test(key)) delete environment[key];
    }
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [join(import.meta.dirname, "settings-probe.mjs"), cwd],
      {
        cwd,
        env: {
          ...environment,
          HOME: home,
          USERPROFILE: home,
          XDG_CONFIG_HOME: join(home, ".config"),
          PI_CODING_AGENT_DIR: agentDir,
        },
        timeout: 20_000,
      },
    );
    const snapshot = JSON.parse(stdout.trim()) as HostSnapshot;

    expect(stderr).toBe("");
    expect(snapshot.runtimeId).toBeTruthy();
    expect(snapshot.resources.prompts).toBe(1);
    expect(snapshot.resources.extensions).toBe(0);
    expect(snapshot.slashCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "still-available", source: "prompt" }),
      ]),
    );
    expect(snapshot.queuedMessages).toEqual({ steering: [], followUp: [] });
    expect(snapshot.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "error", message: expect.stringContaining("broken.ts") }),
      ]),
    );
    expect(JSON.stringify(snapshot.diagnostics)).not.toContain(home);
  });
});
