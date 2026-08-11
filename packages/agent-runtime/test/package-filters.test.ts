import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  DefaultPackageManager,
  SettingsManager,
  type PackageSource,
  type ResolvedResource,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vite-plus/test";

const temporaryDirectories: string[] = [];

async function createFilteredPackage(root: string): Promise<void> {
  await Promise.all([
    mkdir(join(root, "extensions"), { recursive: true }),
    mkdir(join(root, "prompts"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "pix-pkg-filter-fixture",
        version: "1.0.0",
        pi: {
          extensions: ["extensions/*.ts"],
          prompts: ["prompts/*.md"],
        },
      }),
    ),
    writeFile(join(root, "extensions", "one.ts"), "export default () => undefined;\n"),
    writeFile(join(root, "extensions", "two.ts"), "export default () => undefined;\n"),
    writeFile(join(root, "prompts", "one.md"), "Prompt one.\n"),
    writeFile(join(root, "prompts", "two.md"), "Prompt two.\n"),
  ]);
}

function projection(resources: ResolvedResource[]) {
  return resources
    .map((resource) => ({
      file: basename(resource.path),
      enabled: resource.enabled,
      scope: resource.metadata.scope,
    }))
    .sort((left, right) => left.file.localeCompare(right.file));
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("P05 package filters and scope deduplication", () => {
  it("applies project filters and autoload=false deltas over one canonical local identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "pix-pkg-"));
    temporaryDirectories.push(root);
    const agentDir = join(root, "home", ".pi", "agent");
    const cwd = join(root, "project");
    const packageRoot = join(root, "source", "package");
    await Promise.all([
      mkdir(agentDir, { recursive: true }),
      mkdir(join(cwd, ".pi"), { recursive: true }),
      createFilteredPackage(packageRoot),
    ]);

    const settings = SettingsManager.create(cwd, agentDir, { projectTrusted: true });
    const manager = new DefaultPackageManager({ cwd, agentDir, settingsManager: settings });
    await manager.installAndPersist(packageRoot);
    await manager.installAndPersist(packageRoot, { local: true });
    await settings.flush();
    const configured = manager.listConfiguredPackages();
    const globalSource = configured.find((entry) => entry.scope === "user")?.source;
    const projectSource = configured.find((entry) => entry.scope === "project")?.source;
    if (!globalSource || !projectSource) throw new Error("P05 package sources were not persisted");

    const projectWins = await manager.resolve();
    expect(projectWins.extensions).toHaveLength(2);
    expect(projectWins.prompts).toHaveLength(2);
    expect(projectWins.extensions.every((resource) => resource.metadata.scope === "project")).toBe(
      true,
    );
    expect(projectWins.prompts.every((resource) => resource.metadata.scope === "project")).toBe(
      true,
    );

    const filtered: PackageSource = {
      source: projectSource,
      extensions: [],
      prompts: ["prompts/*.md", "!prompts/two.md"],
    };
    settings.setProjectPackages([filtered]);
    await settings.flush();
    const filteredResources = await manager.resolve();
    expect(projection(filteredResources.extensions)).toEqual([
      { file: "one.ts", enabled: false, scope: "project" },
      { file: "two.ts", enabled: false, scope: "project" },
    ]);
    expect(projection(filteredResources.prompts)).toEqual([
      { file: "one.md", enabled: true, scope: "project" },
      { file: "two.md", enabled: false, scope: "project" },
    ]);

    const delta: PackageSource = {
      source: projectSource,
      autoload: false,
      extensions: ["-extensions/two.ts"],
      prompts: ["+prompts/two.md"],
    };
    settings.setProjectPackages([delta]);
    await settings.flush();
    const deltaResources = await manager.resolve();
    expect(projection(deltaResources.extensions)).toEqual([
      { file: "one.ts", enabled: true, scope: "user" },
      { file: "two.ts", enabled: false, scope: "project" },
    ]);
    expect(projection(deltaResources.prompts)).toEqual([
      { file: "one.md", enabled: true, scope: "user" },
      { file: "two.md", enabled: true, scope: "project" },
    ]);

    const reopenedSettings = SettingsManager.create(cwd, agentDir, { projectTrusted: true });
    const reopened = new DefaultPackageManager({
      cwd,
      agentDir,
      settingsManager: reopenedSettings,
    });
    expect(reopened.listConfiguredPackages()).toEqual([
      { source: globalSource, scope: "user", filtered: false, installedPath: packageRoot },
      { source: projectSource, scope: "project", filtered: true, installedPath: packageRoot },
    ]);
    expect(projection((await reopened.resolve()).extensions)).toEqual(
      projection(deltaResources.extensions),
    );
  });
});
