import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createPixRuntime, resolvePixProjectTrust } from "../src/index.ts";
import { FakeOpenAiServer } from "../../test-utils/src/index.ts";
import { ProjectTrustStore } from "@earendil-works/pi-coding-agent";

const temporaryDirectories: string[] = [];
const servers: Array<{ stop(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.stop()));
  await Promise.all(
    temporaryDirectories.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pix-trust-"));
  temporaryDirectories.push(root);
  const home = join(root, "home");
  const agentDir = join(home, ".pi", "agent");
  const project = join(root, "project");
  const toolPath = join(project, "fixture.txt");
  await Promise.all([
    mkdir(agentDir, { recursive: true }),
    mkdir(join(home, ".agents"), { recursive: true }),
    mkdir(join(project, ".pi"), { recursive: true }),
    mkdir(project, { recursive: true }),
  ]);
  await writeFile(toolPath, "m2\n");
  await writeFile(join(project, ".pi", "settings.json"), "{}\n");
  const server = new FakeOpenAiServer({ toolPath });
  await server.start();
  servers.push(server);
  await writeFile(
    join(agentDir, "models.json"),
    JSON.stringify({
      providers: {
        "pix-fake": {
          baseUrl: server.baseUrl,
          apiKey: "test-key",
          api: "openai-completions",
          models: [
            {
              id: "pix-fake",
              name: "Zeno",
              reasoning: true,
              input: ["text"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 8192,
              maxTokens: 1024,
              compat: { supportsUsageInStreaming: true },
            },
            {
              id: "pix-fake-b",
              name: "Zeno B",
              reasoning: false,
              input: ["text"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 8192,
              maxTokens: 1024,
              compat: { supportsUsageInStreaming: true },
            },
          ],
        },
      },
    }),
  );
  return { root, home, agentDir, project, toolPath };
}

describe("Workspace model trust resume", () => {
  it("exposes models, thinking, trust, and resumeRecent on createPixRuntime", async () => {
    const { root, agentDir, project } = await fixture();
    const trust = resolvePixProjectTrust(project, agentDir);
    expect(trust.required).toBe(true);

    const handle = await createPixRuntime({
      cwd: project,
      agentDir,
      model: { provider: "pix-fake", id: "pix-fake" },
      persistSession: true,
      projectTrusted: false,
    });
    let priorSessionFile: string | undefined;
    try {
      const snap = handle.snapshot();
      expect(snap.cwd).toBe(project);
      expect(snap.projectTrusted).toBe(false);
      expect(snap.trust?.required).toBe(true);
      expect(snap.thinkingLevel).toBeTruthy();
      expect(Array.isArray(snap.availableThinkingLevels)).toBe(true);

      const models = handle.listModels();
      expect(models.some((m) => m.id === "pix-fake")).toBe(true);
      expect(models.some((m) => m.id === "pix-fake-b")).toBe(true);
      expect(models.find((m) => m.id === "pix-fake")).toMatchObject({
        api: "openai-completions",
        input: ["text"],
        contextWindow: 8192,
        maxTokens: 1024,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      });

      // setModel may require auth; pix-fake has key in models.json
      const afterModel = await handle.setModel("pix-fake", "pix-fake-b");
      expect(afterModel.model).toEqual({
        provider: "pix-fake",
        id: "pix-fake-b",
        api: "openai-completions",
        reasoning: false,
      });

      if ((afterModel.availableThinkingLevels?.length ?? 0) > 0) {
        const level = afterModel.availableThinkingLevels![0]!;
        const afterThink = handle.setThinkingLevel(level);
        expect(afterThink.thinkingLevel).toBe(level);
      }

      await handle.runtime.session.prompt("resume anchor");
      priorSessionFile = handle.runtime.session.sessionFile;
      expect(priorSessionFile).toBeTruthy();
      const usageSnap = handle.snapshot();
      expect(usageSnap.usage).toBeTruthy();
      expect(usageSnap.usage?.tokens.total).toBeGreaterThanOrEqual(0);
      expect(typeof usageSnap.usage?.cost).toBe("number");
    } finally {
      await handle.dispose();
    }

    const resumed = await createPixRuntime({
      cwd: project,
      agentDir,
      model: { provider: "pix-fake", id: "pix-fake" },
      persistSession: true,
      resumeRecent: true,
      projectTrusted: true,
    });
    try {
      expect(resumed.snapshot().cwd).toBe(project);
      expect(resumed.snapshot().sessionFile).toBe(priorSessionFile);
      const listed = await resumed.listSessions();
      expect(listed.length).toBeGreaterThan(0);
      const trusted = await resumed.setTrust(true);
      expect(trusted.projectTrusted).toBe(true);
      expect(new ProjectTrustStore(agentDir).get(project)).toBe(true);
    } finally {
      await resumed.dispose();
    }

    // A different cwd must not reuse the previous project's session file.
    const other = join(root, "other-project");
    await mkdir(other, { recursive: true });
    const switched = await createPixRuntime({
      cwd: other,
      agentDir,
      model: { provider: "pix-fake", id: "pix-fake" },
      persistSession: true,
      projectTrusted: true,
    });
    try {
      expect(switched.snapshot().cwd).toBe(other);
      const otherFile = switched.snapshot().sessionFile;
      if (otherFile) expect(otherFile).not.toBe(priorSessionFile);
    } finally {
      await switched.dispose();
    }
  });
});

describe("provider auth projection", () => {
  it("lists non-secret provider status and can set/clear api keys", async () => {
    const { agentDir, project } = await fixture();
    const handle = await createPixRuntime({
      cwd: project,
      agentDir,
      model: { provider: "pix-fake", id: "pix-fake" },
      projectTrusted: true,
    });
    try {
      const before = handle.listProviders();
      expect(before.some((p) => p.provider === "pix-fake")).toBe(true);
      const pix = before.find((p) => p.provider === "pix-fake");
      expect(pix?.configured).toBe(true);
      // models.json key counts as configured source
      expect(JSON.stringify(before)).not.toMatch(/test-key|sk-/i);

      const afterSet = await handle.setProviderApiKey("pix-fake", "sk-test-provider-key-not-real");
      const updated = afterSet.find((p) => p.provider === "pix-fake");
      expect(updated?.configured).toBe(true);
      expect(JSON.stringify(afterSet)).not.toContain("sk-test-provider-key-not-real");

      const cleared = await handle.clearProviderAuth("pix-fake");
      // may still be configured via models.json key
      expect(JSON.stringify(cleared)).not.toContain("sk-test-provider-key-not-real");
    } finally {
      await handle.dispose();
    }
  });
});
