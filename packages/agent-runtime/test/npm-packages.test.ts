import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

interface PackedVersion {
  version: string;
  tarball: Buffer;
  shasum: string;
  integrity: string;
}

interface RegistryPackage {
  name: string;
  versions: PackedVersion[];
}

function npmInvocation(args: string[]): { command: string; args: string[] } {
  return process.platform === "win32"
    ? {
        command: process.env.ComSpec ?? "cmd.exe",
        args: ["/d", "/s", "/c", "npm.cmd", ...args],
      }
    : { command: "npm", args };
}

async function packVersion(root: string, name: string, version: string): Promise<PackedVersion> {
  const source = join(root, "pack", `${name}-${version}`);
  const destination = join(root, "tarballs");
  await Promise.all([
    mkdir(join(source, "prompts"), { recursive: true }),
    mkdir(destination, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      join(source, "package.json"),
      JSON.stringify({
        name,
        version,
        keywords: ["pi-package"],
        pi: { prompts: ["prompts/*.md"] },
      }),
    ),
    writeFile(join(source, "prompts", "fixture.md"), `${name} ${version}\n`),
  ]);
  const npm = npmInvocation([
    "pack",
    "--ignore-scripts",
    "--pack-destination",
    destination,
    "--json",
  ]);
  const { stdout } = await execFileAsync(npm.command, npm.args, {
    cwd: source,
    timeout: 20_000,
  });
  const packed = JSON.parse(stdout) as Array<{ filename: string }>;
  const filename = packed[0]?.filename;
  if (!filename) throw new Error("npm pack did not return a tarball");
  const tarball = await readFile(join(destination, filename));
  return {
    version,
    tarball,
    shasum: createHash("sha1").update(tarball).digest("hex"),
    integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
  };
}

async function startRegistry(packages: RegistryPackage[]) {
  let exposeNext = false;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    const fixture = packages.find(
      (candidate) =>
        pathname === `/${candidate.name}` || pathname.startsWith(`/${candidate.name}/-/`),
    );
    if (!fixture) {
      response.writeHead(404).end(JSON.stringify({ error: "not_found" }));
      return;
    }
    if (pathname.startsWith(`/${fixture.name}/-/`)) {
      const version = fixture.versions.find((candidate) =>
        pathname.includes(`-${candidate.version}.tgz`),
      );
      if (!version) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(version.tarball);
      return;
    }

    const available = exposeNext ? fixture.versions : fixture.versions.slice(0, 1);
    const latest = available.at(-1);
    const address = server.address();
    if (!latest || !address || typeof address === "string") {
      response.writeHead(500).end();
      return;
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const versions = Object.fromEntries(
      available.map((version) => [
        version.version,
        {
          name: fixture.name,
          version: version.version,
          dist: {
            tarball: `${baseUrl}/${fixture.name}/-/${fixture.name}-${version.version}.tgz`,
            shasum: version.shasum,
            integrity: version.integrity,
          },
        },
      ]),
    );
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        name: fixture.name,
        "dist-tags": { latest: latest.version },
        versions,
      }),
    );
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No npm registry address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    exposeNextVersion: () => {
      exposeNext = true;
    },
  };
}

async function createNpmCommand(root: string, registry: string): Promise<string[]> {
  const bin = join(root, "bin");
  const wrapper = join(bin, "npm-wrapper.mjs");
  await mkdir(bin, { recursive: true });
  await writeFile(
    wrapper,
    `import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
const args = process.argv.slice(2);
const env = {
  ...process.env,
  npm_config_registry: ${JSON.stringify(registry)},
  npm_config_cache: ${JSON.stringify(join(root, "npm-cache"))},
  npm_config_audit: "false",
  npm_config_fund: "false",
  npm_config_update_notifier: "false",
};
const npmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const result = existsSync(npmCli)
  ? spawnSync(process.execPath, [npmCli, ...args], { encoding: "utf8", env })
  : process.platform === "win32"
    ? spawnSync(
        process.env.ComSpec ?? "cmd.exe",
        [
          "/d",
          "/s",
          "/c",
          "npm.cmd",
          ...args.map((arg) => String(arg).replace(/\\^/g, "^^")),
        ],
        { encoding: "utf8", env, windowsHide: true },
      )
    : spawnSync("npm", args, { encoding: "utf8", env });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
`,
  );
  return [process.execPath, wrapper];
}

async function packageVersion(path: string): Promise<string> {
  const manifest = JSON.parse(await readFile(join(path, "package.json"), "utf8")) as {
    version: string;
  };
  return manifest.version;
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

describe("P01/P02/P08 npm package transport", () => {
  it("installs both scopes, updates only an unpinned range, and resolves while offline", async () => {
    const root = await mkdtemp(join(tmpdir(), "pix-pkg-p02-"));
    temporaryDirectories.push(root);
    const agentDir = join(root, "home", ".pi", "agent");
    const cwd = join(root, "project");
    await Promise.all([
      mkdir(agentDir, { recursive: true }),
      mkdir(join(cwd, ".pi"), { recursive: true }),
    ]);

    const globalName = "pix-fake-npm-global-fixture";
    const projectName = "pix-fake-npm-project-fixture";
    const packages: RegistryPackage[] = [];
    for (const name of [globalName, projectName]) {
      packages.push({
        name,
        versions: [await packVersion(root, name, "1.0.0"), await packVersion(root, name, "1.1.0")],
      });
    }
    const registry = await startRegistry(packages);
    const npmCommand = await createNpmCommand(root, registry.url);

    const settings = SettingsManager.create(cwd, agentDir, { projectTrusted: true });
    settings.setNpmCommand(npmCommand);
    await settings.flush();
    const manager = new DefaultPackageManager({ cwd, agentDir, settingsManager: settings });
    const progress: ProgressEvent[] = [];
    manager.setProgressCallback((event) => progress.push(event));
    const globalSource = `npm:${globalName}@^1.0.0`;
    const projectSource = `npm:${projectName}@1.0.0`;

    await manager.installAndPersist(globalSource);
    await manager.installAndPersist(projectSource, { local: true });
    await settings.flush();
    const globalPath = manager.getInstalledPath(globalSource, "user");
    const projectPath = manager.getInstalledPath(projectSource, "project");
    expect(globalPath).toBeTruthy();
    expect(projectPath).toBeTruthy();
    if (!globalPath || !projectPath) throw new Error("npm fixture installs are missing");
    expect(globalPath.startsWith(join(agentDir, "npm"))).toBe(true);
    expect(projectPath.startsWith(join(cwd, ".pi", "npm"))).toBe(true);
    expect(await packageVersion(globalPath)).toBe("1.0.0");
    expect(await packageVersion(projectPath)).toBe("1.0.0");
    expect((await manager.resolve()).prompts).toHaveLength(2);

    registry.exposeNextVersion();
    const updates = await manager.checkForAvailableUpdates();
    expect(updates.map((update) => update.source)).toEqual([globalSource]);
    await manager.update();
    expect(await packageVersion(globalPath)).toBe("1.1.0");
    expect(await packageVersion(projectPath)).toBe("1.0.0");

    process.env.PI_OFFLINE = "1";
    try {
      const reopenedSettings = SettingsManager.create(cwd, agentDir, { projectTrusted: true });
      const offline = new DefaultPackageManager({
        cwd,
        agentDir,
        settingsManager: reopenedSettings,
      });
      expect((await offline.resolve()).prompts).toHaveLength(2);
      expect(await offline.checkForAvailableUpdates()).toEqual([]);
    } finally {
      delete process.env.PI_OFFLINE;
    }

    for (const source of [globalSource, projectSource]) {
      const events = progress.filter((event) => event.source === source);
      expect(events.some((event) => event.type === "start")).toBe(true);
      expect(events.some((event) => event.type === "complete")).toBe(true);
      expect(events.some((event) => event.type === "error")).toBe(false);
    }

    expect(await manager.removeAndPersist(projectSource, { local: true })).toBe(true);
    expect(await manager.removeAndPersist(globalSource)).toBe(true);
    await settings.flush();
    expect(manager.listConfiguredPackages()).toEqual([]);
  }, 120_000);
});
