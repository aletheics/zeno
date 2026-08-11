import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DefaultPackageManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vite-plus/test";

const temporaryDirectories: string[] = [];

function portablePath(path: string): string {
  return path.replace(/\\/g, "/");
}

async function createPromptPackage(root: string, text: string): Promise<void> {
  await mkdir(join(root, "prompts"), { recursive: true });
  await Promise.all([
    writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: `pix-pkg-${text}`,
        version: "1.0.0",
        pi: { prompts: ["prompts/*.md"] },
      }),
    ),
    writeFile(join(root, "prompts", "fixture.md"), `${text}\n`),
  ]);
}

class FailingSettingsStorage {
  global: string | undefined;
  project: string | undefined;
  failWrites = false;

  withLock(
    scope: "global" | "project",
    fn: (current: string | undefined) => string | undefined,
  ): void {
    const current = scope === "global" ? this.global : this.project;
    const next = fn(current);
    if (next === undefined) return;
    if (this.failWrites) throw new Error(`Injected ${scope} persistence failure`);
    if (scope === "global") this.global = next;
    else this.project = next;
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("P06 package failure and recovery", () => {
  it("does not persist failed installs and keeps configured resources recoverable", async () => {
    const root = await mkdtemp(join(tmpdir(), "pix-pkg-install-"));
    temporaryDirectories.push(root);
    const agentDir = join(root, "home", ".pi", "agent");
    const cwd = join(root, "project");
    const good = join(root, "good-package");
    const missing = join(root, "missing-package");
    const missingConfigured = "npm:pix-pkg-missing@1.0.0";
    await Promise.all([
      mkdir(agentDir, { recursive: true }),
      mkdir(join(cwd, ".pi"), { recursive: true }),
      createPromptPackage(good, "good"),
    ]);

    const settings = SettingsManager.create(cwd, agentDir, { projectTrusted: true });
    const manager = new DefaultPackageManager({ cwd, agentDir, settingsManager: settings });
    const progress: Array<{ type: string; source: string }> = [];
    manager.setProgressCallback((event) => progress.push(event));

    await expect(manager.installAndPersist(missing)).rejects.toThrow(/Path does not exist/);
    expect(settings.getPackages()).toEqual([]);
    expect(progress.filter((event) => event.source === missing).map((event) => event.type)).toEqual(
      ["start", "error"],
    );

    await manager.installAndPersist(good);
    await settings.flush();
    expect((await manager.resolve()).prompts).toHaveLength(1);

    settings.setPackages([good, missingConfigured]);
    await settings.flush();
    const skipped: string[] = [];
    const withSkip = await manager.resolve(async (source) => {
      skipped.push(source);
      return "skip";
    });
    expect(skipped).toEqual([missingConfigured]);
    expect(withSkip.prompts).toHaveLength(1);
    expect(settings.getPackages()).toEqual([good, missingConfigured]);
    await expect(manager.resolve(async () => "error")).rejects.toThrow(/Missing source/);

    settings.setPackages([good]);
    await settings.flush();
    expect((await manager.resolve()).prompts).toHaveLength(1);

    const untrustedSettings = SettingsManager.create(cwd, agentDir, { projectTrusted: false });
    const untrusted = new DefaultPackageManager({
      cwd,
      agentDir,
      settingsManager: untrustedSettings,
    });
    await expect(untrusted.installAndPersist(good, { local: true })).rejects.toThrow(/trusted/i);
    expect(untrustedSettings.getProjectSettings()).toEqual({});
  });

  it("records persistence errors and reloads the last authoritative settings", async () => {
    const root = await mkdtemp(join(tmpdir(), "pix-pkg-persist-"));
    temporaryDirectories.push(root);
    const cwd = join(root, "project");
    const agentDir = join(root, "agent");
    const original = join(root, "original-package");
    const added = join(root, "added-package");
    await Promise.all([
      mkdir(cwd, { recursive: true }),
      mkdir(agentDir, { recursive: true }),
      createPromptPackage(original, "original"),
      createPromptPackage(added, "added"),
    ]);

    const storage = new FailingSettingsStorage();
    storage.global = JSON.stringify({ packages: [original] });
    const settings = SettingsManager.fromStorage(storage, { projectTrusted: true });
    const manager = new DefaultPackageManager({ cwd, agentDir, settingsManager: settings });
    expect((await manager.resolve()).prompts).toHaveLength(1);

    storage.failWrites = true;
    await manager.installAndPersist(added);
    await settings.flush();
    expect(
      settings
        .getPackages()
        .map((source) => portablePath(typeof source === "string" ? source : source.source)),
    ).toEqual([portablePath(original), "../added-package"]);
    expect(settings.drainErrors()).toMatchObject([
      { scope: "global", error: { message: "Injected global persistence failure" } },
    ]);

    const diskView = SettingsManager.fromStorage(storage, { projectTrusted: true });
    expect(diskView.getPackages()).toEqual([original]);
    storage.failWrites = false;
    await settings.reload();
    expect(settings.getPackages()).toEqual([original]);
    expect((await manager.resolve()).prompts).toHaveLength(1);
  });
});
