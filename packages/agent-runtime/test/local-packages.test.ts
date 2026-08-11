import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  DefaultPackageManager,
  SettingsManager,
  type ResolvedPaths,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vite-plus/test";

const temporaryDirectories: string[] = [];

function portablePath(path: string): string {
  return path.replace(/\\/g, "/");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function createPackage(root: string, name: string): Promise<void> {
  await Promise.all([
    mkdir(join(root, "extensions"), { recursive: true }),
    mkdir(join(root, "skills", "demo"), { recursive: true }),
    mkdir(join(root, "prompts"), { recursive: true }),
    mkdir(join(root, "themes"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name,
        version: "1.0.0",
        keywords: ["pi-package"],
        pi: {
          extensions: ["extensions/*.ts"],
          skills: ["skills/*/SKILL.md"],
          prompts: ["prompts/*.md"],
          themes: ["themes/*.json"],
        },
      }),
    ),
    writeFile(join(root, "extensions", "index.ts"), "export default () => undefined;\n"),
    writeFile(
      join(root, "skills", "demo", "SKILL.md"),
      `---\nname: ${name}\ndescription: local fixture\n---\n\nFixture skill.\n`,
    ),
    writeFile(join(root, "prompts", "review.md"), "Review the fixture.\n"),
    writeFile(
      join(root, "themes", "fixture.json"),
      JSON.stringify({ name: `${name}-theme`, colors: {} }),
    ),
  ]);
}

function assertScope(resources: ResolvedPaths, scope: "user" | "project", source: string): void {
  for (const group of [
    resources.extensions,
    resources.skills,
    resources.prompts,
    resources.themes,
  ]) {
    expect(group).toHaveLength(1);
    expect(group[0]?.enabled).toBe(true);
    expect(group[0]?.metadata).toMatchObject({ scope, source, origin: "package" });
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("P04 local package transport", () => {
  it("persists absolute global and relative project sources without copying them", async () => {
    const root = await mkdtemp(join(tmpdir(), "pix-pkg-"));
    temporaryDirectories.push(root);
    const agentDir = join(root, "home", ".pi", "agent");
    const cwd = join(root, "project");
    const globalPackage = join(root, "sources", "global-package");
    const projectPackage = join(cwd, "project-package");
    await Promise.all([
      mkdir(agentDir, { recursive: true }),
      mkdir(join(cwd, ".pi"), { recursive: true }),
      createPackage(globalPackage, "pix-global-local-fixture"),
      createPackage(projectPackage, "pix-project-local-fixture"),
    ]);

    const settings = SettingsManager.create(cwd, agentDir, { projectTrusted: true });
    const manager = new DefaultPackageManager({ cwd, agentDir, settingsManager: settings });
    const projectInstallSource = `./${relative(cwd, projectPackage)}`;

    await manager.installAndPersist(globalPackage);
    await manager.installAndPersist(projectInstallSource, { local: true });
    await settings.flush();
    const configured = manager.listConfiguredPackages();
    const projectSource = configured.find((entry) => entry.scope === "project")?.source;
    const globalSource = configured.find((entry) => entry.scope === "user")?.source;
    expect(portablePath(projectSource ?? "")).toBe("../project-package");
    expect(portablePath(globalSource ?? "")).toBe("../../../sources/global-package");
    if (!projectSource || !globalSource)
      throw new Error("Local package sources were not persisted");

    expect(manager.getInstalledPath(globalSource, "user")).toBe(globalPackage);
    expect(manager.getInstalledPath(projectSource, "project")).toBe(projectPackage);
    expect(configured).toEqual([
      { source: globalSource, scope: "user", filtered: false, installedPath: globalPackage },
      { source: projectSource, scope: "project", filtered: false, installedPath: projectPackage },
    ]);

    const resolved = await manager.resolve();
    // Only package-origin resources — pi may auto-discover ~/.agents skills etc.
    const fromPackage = (item: { metadata: { scope: string; origin?: string } }, scope: string) =>
      item.metadata.scope === scope && item.metadata.origin === "package";
    const globalResolved: ResolvedPaths = {
      extensions: resolved.extensions.filter((item) => fromPackage(item, "user")),
      skills: resolved.skills.filter((item) => fromPackage(item, "user")),
      prompts: resolved.prompts.filter((item) => fromPackage(item, "user")),
      themes: resolved.themes.filter((item) => fromPackage(item, "user")),
    };
    const projectResolved: ResolvedPaths = {
      extensions: resolved.extensions.filter((item) => fromPackage(item, "project")),
      skills: resolved.skills.filter((item) => fromPackage(item, "project")),
      prompts: resolved.prompts.filter((item) => fromPackage(item, "project")),
      themes: resolved.themes.filter((item) => fromPackage(item, "project")),
    };
    assertScope(globalResolved, "user", globalSource);
    assertScope(projectResolved, "project", projectSource);

    expect(await exists(join(agentDir, "npm"))).toBe(false);
    expect(await exists(join(cwd, ".pi", "npm"))).toBe(false);
    expect(await readFile(join(globalPackage, "prompts", "review.md"), "utf8")).toBe(
      "Review the fixture.\n",
    );

    const reopenedSettings = SettingsManager.create(cwd, agentDir, { projectTrusted: true });
    const reopened = new DefaultPackageManager({
      cwd,
      agentDir,
      settingsManager: reopenedSettings,
    });
    expect(reopened.listConfiguredPackages()).toHaveLength(2);
    expect((await reopened.resolve()).extensions).toHaveLength(2);

    expect(await reopened.removeAndPersist(projectInstallSource, { local: true })).toBe(true);
    expect(await reopened.removeAndPersist(globalPackage)).toBe(true);
    await reopenedSettings.flush();
    expect(reopened.listConfiguredPackages()).toEqual([]);
    expect(await exists(globalPackage)).toBe(true);
    expect(await exists(projectPackage)).toBe(true);
  });
});
