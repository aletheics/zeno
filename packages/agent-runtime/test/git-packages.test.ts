import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import {
  DefaultPackageManager,
  SettingsManager,
  type ProgressEvent,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vite-plus/test";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];
const servers: Server[] = [];

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    timeout: 20_000,
  });
  return stdout.trim();
}

async function createGitPackage(
  root: string,
  remoteRoot: string,
  name: string,
  withManifest = false,
) {
  const work = join(root, `${name}-work`);
  const bare = join(remoteRoot, "pix", `${name}.git`);
  await Promise.all([
    mkdir(join(work, "prompts"), { recursive: true }),
    mkdir(join(remoteRoot, "pix"), { recursive: true }),
  ]);
  await git(work, "init", "-b", "main");
  await git(work, "config", "user.email", "pix-fake@example.invalid");
  await git(work, "config", "user.name", "Zeno");
  await git(work, "config", "core.autocrlf", "false");
  await git(work, "config", "core.eol", "lf");
  await writeFile(join(work, ".gitattributes"), "* text=auto eol=lf\n");
  await writeFile(join(work, "prompts", "fixture.md"), `${name} v1\n`);
  if (withManifest) {
    await writeFile(
      join(work, "package.json"),
      JSON.stringify({
        name: `pix-${name}-fixture`,
        version: "1.0.0",
        pi: { prompts: ["prompts/*.md"] },
      }),
    );
  }
  await git(work, "add", ".");
  await git(work, "commit", "-m", "fixture v1");
  const v1Commit = await git(work, "rev-parse", "HEAD");
  await git(work, "tag", "v1");
  await git(root, "clone", "--bare", work, bare);
  await git(root, "--git-dir", bare, "update-server-info");
  await git(work, "remote", "add", "fixture", bare);
  return { work, bare, v1Commit };
}

async function publishV2(fixture: { work: string; bare: string }, name: string): Promise<string> {
  await writeFile(join(fixture.work, "prompts", "fixture.md"), `${name} v2\n`);
  await git(fixture.work, "add", ".");
  await git(fixture.work, "commit", "-m", "fixture v2");
  await git(fixture.work, "tag", "v2");
  await git(fixture.work, "push", "fixture", "main", "v2");
  await git(fixture.work, "--git-dir", fixture.bare, "update-server-info");
  return git(fixture.work, "rev-parse", "HEAD");
}

async function startGitServer(remoteRoot: string): Promise<number> {
  const root = resolve(remoteRoot);
  const server = createServer((request, response) => {
    void (async () => {
      try {
        const pathname = decodeURIComponent(
          new URL(request.url ?? "/", "http://localhost").pathname,
        );
        const path = resolve(root, `.${pathname}`);
        const relativePath = relative(root, path);
        if (
          isAbsolute(relativePath) ||
          relativePath === ".." ||
          relativePath.startsWith(`..${sep}`)
        ) {
          response.writeHead(403).end();
          return;
        }
        const content = await readFile(path);
        response.writeHead(200, { "content-type": "application/octet-stream" });
        response.end(request.method === "HEAD" ? undefined : content);
      } catch {
        response.writeHead(404).end();
      }
    })();
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No fixture HTTP address");
  return address.port;
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("P03 git package transport", () => {
  it("clones both scopes, keeps pinned refs fixed, updates a branch, and reconciles a new ref", async () => {
    const root = await mkdtemp(join(tmpdir(), "pix-pkg-"));
    temporaryDirectories.push(root);
    const agentDir = join(root, "home", ".pi", "agent");
    const cwd = join(root, "project");
    const remoteRoot = join(root, "remotes");
    await Promise.all([
      mkdir(agentDir, { recursive: true }),
      mkdir(join(cwd, ".pi"), { recursive: true }),
      mkdir(remoteRoot, { recursive: true }),
    ]);
    const globalFixture = await createGitPackage(root, remoteRoot, "global");
    const projectFixture = await createGitPackage(root, remoteRoot, "project");
    const port = await startGitServer(remoteRoot);
    const globalV1 = `http://127.0.0.1:${port}/pix/global.git@v1`;
    const globalV2 = `http://127.0.0.1:${port}/pix/global.git@v2`;
    const projectMain = `http://127.0.0.1:${port}/pix/project.git`;

    const settings = SettingsManager.create(cwd, agentDir, { projectTrusted: true });
    const manager = new DefaultPackageManager({ cwd, agentDir, settingsManager: settings });
    const progress: ProgressEvent[] = [];
    manager.setProgressCallback((event) => progress.push(event));

    await manager.installAndPersist(globalV1);
    await manager.installAndPersist(projectMain, { local: true });
    await settings.flush();

    const globalPath = manager.getInstalledPath(globalV1, "user");
    const projectPath = manager.getInstalledPath(projectMain, "project");
    expect(globalPath).toBeTruthy();
    expect(projectPath).toBeTruthy();
    if (!globalPath || !projectPath) throw new Error("Git fixture clones are missing");
    expect(globalPath.startsWith(join(agentDir, "git"))).toBe(true);
    expect(projectPath.startsWith(join(cwd, ".pi", "git"))).toBe(true);
    expect(await git(globalPath, "rev-parse", "HEAD")).toBe(globalFixture.v1Commit);
    expect((await manager.resolve()).prompts).toHaveLength(2);

    const globalV2Commit = await publishV2(globalFixture, "global");
    const projectV2Commit = await publishV2(projectFixture, "project");

    await manager.update(globalV1);
    expect(await git(globalPath, "rev-parse", "HEAD")).toBe(globalFixture.v1Commit);
    await manager.update(projectMain);
    expect(await git(projectPath, "rev-parse", "HEAD")).toBe(projectV2Commit);
    expect(
      (await readFile(join(projectPath, "prompts", "fixture.md"), "utf8")).replace(/\r\n/g, "\n"),
    ).toBe("project v2\n");

    await manager.installAndPersist(globalV2);
    await settings.flush();
    expect(await git(globalPath, "rev-parse", "HEAD")).toBe(globalV2Commit);
    expect(manager.listConfiguredPackages().map((entry) => entry.source)).toEqual([
      globalV2,
      projectMain,
    ]);

    for (const source of [globalV1, projectMain, globalV2]) {
      const events = progress.filter((event) => event.source === source);
      expect(events.some((event) => event.type === "start")).toBe(true);
      expect(events.some((event) => event.type === "complete")).toBe(true);
      expect(events.some((event) => event.type === "error")).toBe(false);
    }

    expect(await manager.removeAndPersist(projectMain, { local: true })).toBe(true);
    expect(await manager.removeAndPersist(globalV2)).toBe(true);
    await settings.flush();
    expect(manager.listConfiguredPackages()).toEqual([]);
    expect(manager.getInstalledPath(projectMain, "project")).toBeUndefined();
    expect(manager.getInstalledPath(globalV2, "user")).toBeUndefined();
  }, 60_000);

  it("recovers a retained clone after an injected dependency-install failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "pix-pkg-git-dependency-"));
    temporaryDirectories.push(root);
    const agentDir = join(root, "home", ".pi", "agent");
    const cwd = join(root, "project");
    const remoteRoot = join(root, "remotes");
    await Promise.all([
      mkdir(agentDir, { recursive: true }),
      mkdir(cwd, { recursive: true }),
      mkdir(remoteRoot, { recursive: true }),
    ]);
    await createGitPackage(root, remoteRoot, "dependency", true);
    const port = await startGitServer(remoteRoot);
    const source = `http://127.0.0.1:${port}/pix/dependency.git@v1`;

    const wrapperDirectory = join(root, "bin");
    const wrapper = join(wrapperDirectory, "npm-wrapper.mjs");
    const failedMarker = join(root, "failed-once");
    await mkdir(wrapperDirectory, { recursive: true });
    await writeFile(
      wrapper,
      `import { existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const marker = ${JSON.stringify(failedMarker)};
const args = process.argv.slice(2);
if (args.includes("install") && !existsSync(marker)) {
  writeFileSync(marker, "failed");
  process.exit(23);
}
const npm = process.platform === "win32"
  ? { command: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", "npm.cmd", ...args] }
  : { command: "npm", args };
const result = spawnSync(npm.command, npm.args, {
  stdio: "inherit",
  env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false" },
});
process.exit(result.status ?? 1);
`,
    );

    const settings = SettingsManager.create(cwd, agentDir, { projectTrusted: true });
    settings.setNpmCommand([process.execPath, wrapper]);
    await settings.flush();
    const manager = new DefaultPackageManager({ cwd, agentDir, settingsManager: settings });
    const progress: ProgressEvent[] = [];
    manager.setProgressCallback((event) => progress.push(event));

    await expect(manager.installAndPersist(source)).rejects.toThrow();
    expect(settings.getPackages()).toEqual([]);
    expect(progress.filter((event) => event.source === source).at(-1)?.type).toBe("error");
    // pi 0.83+ removes partial git clones on dependency-install failure so retries
    // are not blocked by a half-written directory (previously retained the clone).
    expect(manager.getInstalledPath(source, "user")).toBeUndefined();

    await manager.installAndPersist(source);
    await settings.flush();
    expect(settings.getPackages()).toEqual([source]);
    expect((await manager.resolve()).prompts).toHaveLength(1);
    expect(progress.filter((event) => event.source === source).at(-1)?.type).toBe("complete");
  }, 60_000);
});
