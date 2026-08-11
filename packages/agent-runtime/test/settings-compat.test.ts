import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  ProjectTrustStore,
  SettingsManager,
  type PackageSource,
} from "@earendil-works/pi-coding-agent";
import type { HostSnapshot } from "@zeno/contracts";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { resolvePixProjectTrust } from "../src/index.ts";

const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);

function semanticHash(value: unknown): string {
  function canonical(current: unknown): unknown {
    if (Array.isArray(current)) return current.map(canonical);
    if (typeof current !== "object" || current === null) return current;
    return Object.fromEntries(
      Object.entries(current)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonical(nested)]),
    );
  }
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

async function json(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function runRuntime(cwd: string, agentDir: string, home: string): Promise<HostSnapshot> {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/(_API_KEY|_TOKEN|_SECRET|_CREDENTIALS?)$/i.test(key)) delete environment[key];
  }
  const { stdout } = await execFileAsync(
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
  return JSON.parse(stdout.trim()) as HostSnapshot;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pix-settings-"));
  temporaryDirectories.push(root);
  const home = join(root, "home");
  const agentDir = join(home, ".pi", "agent");
  const cwd = join(root, "project");
  await Promise.all([mkdir(agentDir, { recursive: true }), mkdir(cwd, { recursive: true })]);
  return {
    root,
    home,
    agentDir,
    cwd,
    globalPath: join(agentDir, "settings.json"),
    projectPath: join(cwd, ".pi", "settings.json"),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("C02/C03 native settings and project trust", () => {
  it("round-trips one global field without losing unknown or package fields", async () => {
    const paths = await fixture();
    const initial = {
      theme: "dark",
      futureGlobal: { enabled: true, version: 7 },
      packages: [
        "plain-package@1.2.3",
        {
          source: "filtered-package@4.5.6",
          autoload: false,
          skills: ["alpha", "!beta"],
          extensions: [],
          futureFilter: "preserve-me",
        },
      ],
    };
    await writeFile(paths.globalPath, JSON.stringify(initial, null, 2));
    const initialHash = semanticHash(initial);

    const manager = SettingsManager.create(paths.cwd, paths.agentDir, { projectTrusted: false });
    await manager.reload();
    expect(semanticHash(manager.getGlobalSettings())).toBe(initialHash);
    expect(manager.getThemeSetting()).toBe("dark");

    manager.setTheme("light");
    await manager.flush();

    const persisted = await json(paths.globalPath);
    expect(persisted.theme).toBe("light");
    expect(persisted.futureGlobal).toEqual(initial.futureGlobal);
    expect(persisted.packages).toEqual(initial.packages);
    expect(await exists(paths.projectPath)).toBe(false);

    const reopened = SettingsManager.create(paths.cwd, paths.agentDir, { projectTrusted: false });
    expect(reopened.getThemeSetting()).toBe("light");
    expect(reopened.getPackages()).toEqual(initial.packages as PackageSource[]);
    expect(semanticHash(reopened.getGlobalSettings())).toBe(semanticHash(persisted));
  });

  it(
    "gates project settings, merges trusted scope, and only writes the project file",
    { timeout: 20_000 },
    async () => {
      const paths = await fixture();
      await mkdir(join(paths.cwd, ".pi", "prompts"), { recursive: true });
      await writeFile(join(paths.cwd, ".pi", "prompts", "trusted.md"), "Trusted prompt fixture\n");
      const global = {
        theme: "dark",
        defaultProjectTrust: "ask",
        compaction: { enabled: true, reserveTokens: 16_384, futureGlobalNested: "keep" },
        futureGlobal: "keep",
      };
      const project = {
        theme: "light",
        compaction: { reserveTokens: 8192, futureProjectNested: "keep" },
        futureProject: { revision: 3 },
      };
      await Promise.all([
        writeFile(paths.globalPath, JSON.stringify(global, null, 2)),
        writeFile(paths.projectPath, JSON.stringify(project, null, 2)),
      ]);
      const globalBefore = await readFile(paths.globalPath, "utf8");
      const projectBefore = await readFile(paths.projectPath, "utf8");

      expect(resolvePixProjectTrust(paths.cwd, paths.agentDir)).toEqual({
        required: true,
        trusted: false,
        savedDecision: null,
        fallback: "ask",
      });
      const untrusted = SettingsManager.create(paths.cwd, paths.agentDir, {
        projectTrusted: false,
      });
      expect(untrusted.getProjectSettings()).toEqual({});
      expect(untrusted.getThemeSetting()).toBe("dark");
      expect(() => untrusted.setProjectPackages(["blocked-package"])).toThrow(/trusted/i);
      await untrusted.flush();
      expect(await readFile(paths.projectPath, "utf8")).toBe(projectBefore);
      const untrustedSnapshot = await runRuntime(paths.cwd, paths.agentDir, paths.home);
      expect(untrustedSnapshot.projectTrusted).toBe(false);
      expect(untrustedSnapshot.resources.prompts).toBe(0);

      const trustStore = new ProjectTrustStore(paths.agentDir);
      trustStore.set(paths.cwd, true);
      expect(new ProjectTrustStore(paths.agentDir).get(paths.cwd)).toBe(true);
      expect(resolvePixProjectTrust(paths.cwd, paths.agentDir).trusted).toBe(true);
      const trustedSnapshot = await runRuntime(paths.cwd, paths.agentDir, paths.home);
      expect(trustedSnapshot.projectTrusted).toBe(true);
      expect(trustedSnapshot.resources.prompts).toBe(1);

      const trusted = SettingsManager.create(paths.cwd, paths.agentDir, { projectTrusted: true });
      expect(trusted.getThemeSetting()).toBe("light");
      expect(trusted.getCompactionSettings()).toMatchObject({ enabled: true, reserveTokens: 8192 });
      trusted.setProjectPackages([
        { source: "project-package", autoload: false, extensions: ["desktop.ts"] },
      ]);
      await trusted.flush();

      expect(await readFile(paths.globalPath, "utf8")).toBe(globalBefore);
      const persistedProject = await json(paths.projectPath);
      expect(persistedProject.futureProject).toEqual(project.futureProject);
      expect(persistedProject.compaction).toEqual(project.compaction);
      expect(persistedProject.packages).toEqual([
        { source: "project-package", autoload: false, extensions: ["desktop.ts"] },
      ]);

      const reopened = SettingsManager.create(paths.cwd, paths.agentDir, { projectTrusted: true });
      expect(reopened.getThemeSetting()).toBe("light");
      expect(reopened.getPackages()).toEqual(persistedProject.packages);

      trustStore.set(paths.cwd, null);
      const globalManager = SettingsManager.create(paths.cwd, paths.agentDir, {
        projectTrusted: false,
      });
      globalManager.setDefaultProjectTrust("always");
      await globalManager.flush();
      expect(resolvePixProjectTrust(paths.cwd, paths.agentDir)).toMatchObject({
        required: true,
        trusted: true,
        savedDecision: null,
        fallback: "always",
      });
    },
  );
});
