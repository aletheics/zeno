import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  createPixRuntime,
  packageKindFromSource,
  resolvePackageRemoveSource,
} from "../src/index.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("packages and resources listing", () => {
  it("classifies package sources and lists configured packages plus loaded resources", async () => {
    expect(packageKindFromSource("lodash@4")).toBe("npm");
    expect(packageKindFromSource("https://github.com/acme/pkg.git")).toBe("git");
    expect(packageKindFromSource("./vendor/pkg")).toBe("local");
    expect(packageKindFromSource("C:\\vendor\\pkg")).toBe("local");
    expect(packageKindFromSource("..\\vendor\\pkg")).toBe("local");

    const root = await mkdtemp(join(tmpdir(), "pix-pkg-list-"));
    temporaryDirectories.push(root);
    const home = join(root, "home");
    const agentDir = join(home, ".pi", "agent");
    const cwd = join(root, "project");
    const localPackage = join(root, "local-package");
    await Promise.all([
      mkdir(join(agentDir, "extensions"), { recursive: true }),
      mkdir(join(agentDir, "prompts"), { recursive: true }),
      mkdir(join(agentDir, "skills", "desktop-disabled"), { recursive: true }),
      mkdir(join(home, ".agents"), { recursive: true }),
      mkdir(join(localPackage, "extensions"), { recursive: true }),
      mkdir(join(localPackage, "prompts"), { recursive: true }),
      mkdir(cwd, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        join(localPackage, "package.json"),
        JSON.stringify({
          name: "pix-list-fixture",
          version: "1.0.0",
          keywords: ["pi-package"],
          pi: { extensions: ["extensions/*.ts"], prompts: ["prompts/*.md"] },
        }),
      ),
      writeFile(join(localPackage, "extensions", "index.ts"), "export default () => undefined;\n"),
      writeFile(join(localPackage, "prompts", "hello.md"), "Hello from package.\n"),
      writeFile(join(agentDir, "prompts", "global.md"), "Global prompt.\n"),
      writeFile(join(agentDir, "SYSTEM.md"), "Global system prompt.\n"),
      writeFile(
        join(agentDir, "skills", "desktop-disabled", "SKILL.md"),
        "---\nname: desktop-disabled\ndescription: Hidden slash command fixture\n---\n\nFixture skill.\n",
      ),
      writeFile(
        join(agentDir, "settings.json"),
        JSON.stringify({ packages: [localPackage], enableSkillCommands: false }, null, 2),
      ),
    ]);

    const handle = await createPixRuntime({ cwd, agentDir, projectTrusted: true });
    try {
      const packages = handle.listPackages();
      expect(packages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: localPackage,
            scope: "global",
            kind: "local",
            filtered: false,
          }),
        ]),
      );

      const resources = handle.listResources();
      expect(resources.some((item) => item.kind === "prompt" && item.name === "global")).toBe(true);
      expect(resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "system", name: "SYSTEM.md", source: "global" }),
          expect.objectContaining({ kind: "skill", name: "desktop-disabled" }),
        ]),
      );
      expect(
        handle.snapshot().slashCommands.some((item) => item.name === "skill:desktop-disabled"),
      ).toBe(false);
      // Local package extension should be discoverable after settings packages resolve via loader.
      // Resource loader uses package manager at service creation; with packages in settings it loads.
      expect(resources.length).toBeGreaterThan(0);
    } finally {
      await handle.dispose();
    }
  });

  it("installs and removes a local package through the runtime adapter", async () => {
    const root = await mkdtemp(join(tmpdir(), "pix-pkg-mutate-"));
    temporaryDirectories.push(root);
    const home = join(root, "home");
    const agentDir = join(home, ".pi", "agent");
    const cwd = join(root, "project");
    const localPackage = join(root, "mutable-package");
    await Promise.all([
      mkdir(agentDir, { recursive: true }),
      mkdir(join(home, ".agents"), { recursive: true }),
      mkdir(join(localPackage, "extensions"), { recursive: true }),
      mkdir(join(localPackage, "prompts"), { recursive: true }),
      mkdir(cwd, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        join(localPackage, "package.json"),
        JSON.stringify({
          name: "pix-mutable-fixture",
          version: "1.0.0",
          keywords: ["pi-package"],
          pi: { extensions: ["extensions/*.ts"], prompts: ["prompts/*.md"] },
        }),
      ),
      writeFile(
        join(localPackage, "extensions", "mutable.ts"),
        `export default function (pi: any) {
  pi.registerCommand("mutable-command", {
    description: "Mutable package command",
    handler: async () => undefined,
  });
}
`,
      ),
      writeFile(join(localPackage, "prompts", "mutable.md"), "Mutable package prompt.\n"),
    ]);

    const handle = await createPixRuntime({ cwd, agentDir, projectTrusted: true });
    try {
      expect(handle.listPackages()).toEqual([]);
      const installed = await handle.installPackage(localPackage, "global");
      expect(installed).toHaveLength(1);
      expect(installed[0]?.scope).toBe("global");
      expect(installed[0]?.kind).toBe("local");
      expect(installed[0]?.installedPath).toBe(localPackage);
      // pi persists a path relative to the settings scope root, not always the absolute install input.
      expect(installed[0]?.source).toBeTruthy();
      expect(handle.snapshot().slashCommands).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "mutable-command" })]),
      );
      const removed = await handle.removePackage(installed[0]!.source, "global");
      expect(removed).toEqual([]);
      expect(handle.snapshot().slashCommands.some((item) => item.name === "mutable-command")).toBe(
        false,
      );
    } finally {
      await handle.dispose();
    }
  });

  it("loads temporary extensions and persistently disables filtered packages", async () => {
    const root = await mkdtemp(join(tmpdir(), "pix-pkg-toggle-"));
    temporaryDirectories.push(root);
    const home = join(root, "home");
    const agentDir = join(home, ".pi", "agent");
    const cwd = join(root, "project");
    const packageRoot = join(root, "filtered-package");
    const extensionPath = join(packageRoot, "extensions", "filtered.ts");
    const temporaryExtensionPath = join(root, "temporary.ts");
    const globalSettingsPath = join(agentDir, "settings.json");
    const originalEntry = {
      source: packageRoot,
      extensions: ["extensions/*.ts"],
      prompts: ["prompts/*.md"],
    };
    await Promise.all([
      mkdir(join(agentDir, "extensions"), { recursive: true }),
      mkdir(join(home, ".agents"), { recursive: true }),
      mkdir(join(cwd, ".pi"), { recursive: true }),
      mkdir(join(packageRoot, "extensions"), { recursive: true }),
      mkdir(join(packageRoot, "prompts"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        join(packageRoot, "package.json"),
        JSON.stringify({
          name: "pix-filtered-toggle-fixture",
          version: "1.0.0",
          pi: { extensions: ["extensions/*.ts"], prompts: ["prompts/*.md"] },
        }),
      ),
      writeFile(
        extensionPath,
        `export default function (pi: any) {
  pi.registerCommand("filtered-command", {
    description: "Filtered package command",
    handler: async () => undefined,
  });
}
`,
      ),
      writeFile(join(packageRoot, "prompts", "filtered.md"), "Filtered prompt.\n"),
      writeFile(
        temporaryExtensionPath,
        `export default function (pi: any) {
  pi.registerCommand("temporary-command", {
    description: "Temporary extension command",
    handler: async () => undefined,
  });
}
`,
      ),
      writeFile(globalSettingsPath, JSON.stringify({ packages: [originalEntry] }, null, 2)),
      writeFile(join(cwd, ".pi", "settings.json"), JSON.stringify({ packages: [] }, null, 2)),
    ]);

    let handle = await createPixRuntime({ cwd, agentDir, projectTrusted: true });
    try {
      expect(handle.listPackages()[0]).toMatchObject({ scope: "global", enabled: true });
      expect(handle.snapshot().slashCommands.some((item) => item.name === "filtered-command")).toBe(
        true,
      );

      await handle.setPackageEnabled(packageRoot, "global", false);
      expect(handle.listPackages()[0]).toMatchObject({ scope: "global", enabled: false });
      expect(handle.listResources().some((item) => item.name === "filtered")).toBe(false);
      expect(handle.snapshot().slashCommands.some((item) => item.name === "filtered-command")).toBe(
        false,
      );
    } finally {
      await handle.dispose();
    }

    handle = await createPixRuntime({ cwd, agentDir, projectTrusted: true });
    try {
      expect(handle.listPackages()[0]).toMatchObject({ scope: "global", enabled: false });
      await handle.setPackageEnabled(packageRoot, "global", true);
      expect(handle.listPackages()[0]).toMatchObject({ scope: "global", enabled: true });
      expect(handle.snapshot().slashCommands.some((item) => item.name === "filtered-command")).toBe(
        true,
      );
      const persisted = JSON.parse(await readFile(globalSettingsPath, "utf8")) as {
        packages: unknown[];
      };
      expect(persisted.packages).toEqual([originalEntry]);

      await handle.installPackage(temporaryExtensionPath, "global", undefined, { temporary: true });
      expect(
        handle.snapshot().slashCommands.some((item) => item.name === "temporary-command"),
      ).toBe(true);
      const afterTemporaryInstall = JSON.parse(await readFile(globalSettingsPath, "utf8")) as {
        packages: unknown[];
      };
      expect(afterTemporaryInstall.packages).toEqual([originalEntry]);
    } finally {
      await handle.dispose();
    }
  });

  it("resolves remove sources without using npm/git install paths as local keys", () => {
    const npmSource = "npm:pi-atelier";
    const npmInstalled = "/home/user/.pi/agent/npm/node_modules/pi-atelier";
    const gitSource = "https://github.com/acme/pkg.git";
    const gitInstalled = "/home/user/.pi/agent/git/github.com/acme/pkg";
    const localSource = "../vendor/local-pkg";
    const localInstalled = "/workspace/vendor/local-pkg";

    expect(
      resolvePackageRemoveSource(
        [{ source: npmSource, scope: "user", installedPath: npmInstalled }],
        npmSource,
        "global",
      ),
    ).toBe(npmSource);

    expect(
      resolvePackageRemoveSource(
        [{ source: gitSource, scope: "user", installedPath: gitInstalled }],
        gitSource,
        "global",
      ),
    ).toBe(gitSource);

    expect(
      resolvePackageRemoveSource(
        [{ source: localSource, scope: "user", installedPath: localInstalled }],
        localSource,
        "global",
      ),
    ).toBe(localInstalled);

    // Prefer the matching scope when the same package identity exists in both.
    expect(
      resolvePackageRemoveSource(
        [
          { source: npmSource, scope: "user", installedPath: npmInstalled },
          {
            source: npmSource,
            scope: "project",
            installedPath: "/project/.pi/npm/node_modules/pi-atelier",
          },
        ],
        npmSource,
        "project",
      ),
    ).toBe(npmSource);
  });
});
