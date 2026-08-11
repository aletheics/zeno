import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { ZENO_SESSION_DIR_ENV, createPixRuntime, resolvePixSessionDir } from "../src/index.ts";
import { SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";

const temporaryDirectories: string[] = [];

async function fixture(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(root);
  const home = join(root, "home");
  const agentDir = join(home, ".pi", "agent");
  const cwd = join(root, "project");
  const userData = join(root, "electron-userData");
  await Promise.all([
    mkdir(agentDir, { recursive: true }),
    mkdir(cwd, { recursive: true }),
    mkdir(userData, { recursive: true }),
    mkdir(join(home, ".agents"), { recursive: true }),
  ]);
  return { root, home, agentDir, cwd, userData };
}

async function fileHash(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("C04 invalid settings/models/auth", () => {
  it("keeps host alive, preserves broken file bytes, and recovers after repair", async () => {
    const paths = await fixture("zeno-test-");
    const settingsPath = join(paths.agentDir, "settings.json");
    const modelsPath = join(paths.agentDir, "models.json");
    const authPath = join(paths.agentDir, "auth.json");

    const brokenSettings = "{ not-json settings";
    const brokenModels = ["{", '  "providers": {', "}"].join(String.fromCharCode(10));
    const brokenAuth = [
      "{",
      '  "openai": { "type": "api_key", "key": "sk-secret-should-not-leak" }',
      "}",
      " trailing",
    ].join(String.fromCharCode(10));
    await Promise.all([
      writeFile(settingsPath, brokenSettings),
      writeFile(modelsPath, brokenModels),
      writeFile(authPath, brokenAuth),
    ]);
    const hashes = {
      settings: await fileHash(settingsPath),
      models: await fileHash(modelsPath),
      auth: await fileHash(authPath),
    };

    const handle = await createPixRuntime({ cwd: paths.cwd, agentDir: paths.agentDir });
    try {
      const snapshot = handle.snapshot();
      expect(snapshot.runtimeId).toBeTruthy();
      const messages = snapshot.diagnostics.map((item) => item.message).join("\n");
      expect(messages.toLowerCase()).toMatch(/settings/);
      expect(messages.toLowerCase()).toMatch(/model/);
      // Auth may surface parse errors without embedding credential material.
      expect(JSON.stringify(snapshot)).not.toContain("sk-secret-should-not-leak");
      expect(await fileHash(settingsPath)).toBe(hashes.settings);
      expect(await fileHash(modelsPath)).toBe(hashes.models);
      expect(await fileHash(authPath)).toBe(hashes.auth);
    } finally {
      await handle.dispose();
    }

    await Promise.all([
      writeFile(settingsPath, `${JSON.stringify({ theme: "dark" }, null, 2)}\n`),
      writeFile(
        modelsPath,
        `${JSON.stringify({
          providers: {
            "zeno-fake": {
              baseUrl: "http://127.0.0.1:9/v1",
              apiKey: "test",
              api: "openai-completions",
              models: [
                {
                  id: "zeno-fake",
                  name: "Zeno",
                  reasoning: false,
                  input: ["text"],
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                  contextWindow: 8192,
                  maxTokens: 1024,
                },
              ],
            },
          },
        })}\n`,
      ),
      writeFile(authPath, "{}\n"),
    ]);

    const recovered = await createPixRuntime({
      cwd: paths.cwd,
      agentDir: paths.agentDir,
      model: { provider: "zeno-fake", id: "zeno-fake" },
    });
    try {
      const snapshot = recovered.snapshot();
      const messages = snapshot.diagnostics.map((item) => item.message).join("\n");
      expect(messages.toLowerCase()).not.toMatch(/settings .*failed/);
      expect(messages.toLowerCase()).not.toMatch(/models failed/);
      expect(snapshot.model).toEqual({
        provider: "zeno-fake",
        id: "zeno-fake",
        api: "openai-completions",
        reasoning: false,
      });
      expect(SettingsManager.create(paths.cwd, paths.agentDir).getTheme()).toBe("dark");
    } finally {
      await recovered.dispose();
    }
  });
});

describe("C05 external settings changes", () => {
  it("reloads atomic rename and in-place writes without rewriting the file", async () => {
    const paths = await fixture("zeno-test-");
    const settingsPath = join(paths.agentDir, "settings.json");
    await writeFile(settingsPath, `${JSON.stringify({ theme: "light", keep: true }, null, 2)}\n`);

    const handle = await createPixRuntime({ cwd: paths.cwd, agentDir: paths.agentDir });
    try {
      expect(handle.runtime.services.settingsManager.getTheme()).toBe("light");

      // Atomic rename: write temp then rename over target.
      const next = `${JSON.stringify({ theme: "dark", keep: true, external: "rename" }, null, 2)}\n`;
      const temp = `${settingsPath}.tmp`;
      await writeFile(temp, next);
      await rename(temp, settingsPath);
      await handle.runtime.services.settingsManager.reload();
      expect(handle.runtime.services.settingsManager.getTheme()).toBe("dark");
      expect(handle.runtime.services.settingsManager.getGlobalSettings()).toMatchObject({
        keep: true,
        external: "rename",
      });
      const afterRename = await readFile(settingsPath, "utf8");
      expect(afterRename).toContain('"external": "rename"');

      // In-place overwrite.
      const inPlace = `${JSON.stringify({ theme: "light", keep: true, external: "inplace" }, null, 2)}\n`;
      await writeFile(settingsPath, inPlace);
      await handle.runtime.services.settingsManager.reload();
      expect(handle.runtime.services.settingsManager.getTheme()).toBe("light");
      expect(handle.runtime.services.settingsManager.getGlobalSettings()).toMatchObject({
        external: "inplace",
      });

      // Read-only reload must not rewrite disk (byte-stable after second reload).
      const hash = await fileHash(settingsPath);
      await handle.runtime.services.settingsManager.reload();
      expect(await fileHash(settingsPath)).toBe(hash);
    } finally {
      await handle.dispose();
    }
  });
});

describe("C06 desktop state deletion isolation", () => {
  it("does not store agent config in userData and survives userData deletion", async () => {
    const paths = await fixture("zeno-test-");
    const settingsPath = join(paths.agentDir, "settings.json");
    await writeFile(
      settingsPath,
      `${JSON.stringify({ theme: "dark", futureKeep: { packagesHint: 1 } }, null, 2)}\n`,
    );
    await writeFile(join(paths.userData, "window-layout.json"), '{"x":1}\n');

    const handle = await createPixRuntime({ cwd: paths.cwd, agentDir: paths.agentDir });
    try {
      const before = handle.snapshot();
      expect(before.agentDir).toBe(paths.agentDir);
      const agentHash = await fileHash(settingsPath);

      await rm(paths.userData, { recursive: true, force: true });
      await mkdir(paths.userData, { recursive: true });

      const after = handle.snapshot();
      expect(after.agentDir).toBe(paths.agentDir);
      expect(await fileHash(settingsPath)).toBe(agentHash);
      expect(SettingsManager.create(paths.cwd, paths.agentDir).getTheme()).toBe("dark");
      expect(JSON.stringify(after)).not.toContain(paths.userData);
    } finally {
      await handle.dispose();
    }
  });
});

describe("C07 session dir precedence", () => {
  it("resolves explicit > env > settings > default and persists under the winner", async () => {
    const paths = await fixture("zeno-test-");
    const settingsDir = join(paths.root, "from-settings");
    const envDir = join(paths.root, "from-env");
    const explicitDir = join(paths.root, "from-explicit");
    await mkdir(settingsDir, { recursive: true });
    await mkdir(envDir, { recursive: true });
    await mkdir(explicitDir, { recursive: true });
    await writeFile(
      join(paths.agentDir, "settings.json"),
      `${JSON.stringify({ sessionDir: settingsDir }, null, 2)}\n`,
    );

    expect(
      resolvePixSessionDir({
        cwd: paths.cwd,
        agentDir: paths.agentDir,
        env: {},
      }).source,
    ).toBe("settings");

    expect(
      resolvePixSessionDir({
        cwd: paths.cwd,
        agentDir: paths.agentDir,
        env: { [ZENO_SESSION_DIR_ENV]: envDir },
      }),
    ).toMatchObject({ source: "env", sessionDir: envDir });

    expect(
      resolvePixSessionDir({
        cwd: paths.cwd,
        agentDir: paths.agentDir,
        explicit: explicitDir,
        env: { [ZENO_SESSION_DIR_ENV]: envDir },
      }),
    ).toMatchObject({ source: "explicit", sessionDir: explicitDir });

    // Product-like path: no explicit override; env wins over settings.
    const envHandle = await createPixRuntime({
      cwd: paths.cwd,
      agentDir: paths.agentDir,
      persistSession: true,
    });
    // Temporarily inject env by resolving with process.env — set then restore.
    const previous = process.env[ZENO_SESSION_DIR_ENV];
    process.env[ZENO_SESSION_DIR_ENV] = envDir;
    try {
      await envHandle.dispose();
      const handle = await createPixRuntime({
        cwd: paths.cwd,
        agentDir: paths.agentDir,
        persistSession: true,
      });
      try {
        expect(handle.sessionDirSource).toBe("env");
        expect(handle.runtime.session.sessionManager.getSessionDir()).toBe(envDir);
        expect(handle.runtime.session.sessionFile?.startsWith(envDir)).toBe(true);
      } finally {
        await handle.dispose();
      }
    } finally {
      if (previous === undefined) delete process.env[ZENO_SESSION_DIR_ENV];
      else process.env[ZENO_SESSION_DIR_ENV] = previous;
    }

    // Explicit test option (must not be used by product normal path).
    const explicitHandle = await createPixRuntime({
      cwd: paths.cwd,
      agentDir: paths.agentDir,
      persistSession: true,
      sessionDir: explicitDir,
    });
    try {
      expect(explicitHandle.sessionDirSource).toBe("explicit");
      expect(explicitHandle.runtime.session.sessionManager.getSessionDir()).toBe(explicitDir);
      const sessionFile = explicitHandle.runtime.session.sessionFile;
      expect(sessionFile?.startsWith(explicitDir)).toBe(true);
      // Reopen by path must land in the same custom session directory.
      if (!sessionFile) throw new Error("missing session file");
      const reopened = SessionManager.open(sessionFile, explicitDir, paths.cwd);
      expect(reopened.getSessionFile()).toBe(sessionFile);
      expect(reopened.getSessionDir()).toBe(explicitDir);
      expect(reopened.getSessionId()).toBeTruthy();
    } finally {
      await explicitHandle.dispose();
    }

    // Default when no env/settings.
    await writeFile(join(paths.agentDir, "settings.json"), "{}\n");
    const defaultHandle = await createPixRuntime({
      cwd: paths.cwd,
      agentDir: paths.agentDir,
      persistSession: true,
    });
    try {
      expect(defaultHandle.sessionDirSource).toBe("default");
      expect(defaultHandle.runtime.session.sessionManager.getSessionDir()).toContain("sessions");
    } finally {
      await defaultHandle.dispose();
    }
  });
});
