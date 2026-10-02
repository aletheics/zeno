import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { normalizeMcpConfig, readMcpConfig, setMcpServerEnabled } from "./mcp-config.ts";

const temporaryDirectories: string[] = [];

function temporaryAgentDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "zeno-mcp-"));
  temporaryDirectories.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temporaryDirectories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("normalizeMcpConfig", () => {
  it("moves the legacy disabled flag onto pi's enabled switch", () => {
    const { config, changed } = normalizeMcpConfig({
      mcpServers: { docs: { command: "npx", args: ["-y", "docs-mcp"], disabled: true } },
    });

    expect(changed).toBe(true);
    // `toEqual` on the exact shape already proves `disabled` is gone.
    expect(config.mcpServers.docs).toEqual({
      command: "npx",
      args: ["-y", "docs-mcp"],
      enabled: false,
    });
  });

  it("drops a disabled:false flag without inventing an enabled key", () => {
    const { config, changed } = normalizeMcpConfig({
      mcpServers: { docs: { command: "npx", args: [], disabled: false } },
    });

    expect(changed).toBe(true);
    expect(config.mcpServers.docs).toEqual({ command: "npx", args: [] });
  });

  it("leaves an already-canonical entry untouched and reports no change", () => {
    const raw = { mcpServers: { docs: { command: "node", args: ["server.js"], enabled: false } } };
    const { config, changed } = normalizeMcpConfig(raw);

    expect(changed).toBe(false);
    expect(config.mcpServers.docs).toEqual(raw.mcpServers.docs);
  });

  it("lets an explicit enabled win over the legacy flag", () => {
    const { config, changed } = normalizeMcpConfig({
      mcpServers: { docs: { command: "npx", args: [], enabled: true, disabled: true } },
    });

    expect(changed).toBe(true);
    expect(config.mcpServers.docs).toEqual({ command: "npx", args: [], enabled: true });
  });

  it("preserves every unrelated field, including Zeno-only ones", () => {
    const { config } = normalizeMcpConfig({
      mcpServers: {
        docs: {
          command: "node",
          args: ["index.js"],
          env: { TOKEN: "x" },
          packageName: "@scope/docs-mcp",
          cwd: "/tmp/pkg",
          disabled: true,
        },
      },
    });

    expect(config.mcpServers.docs).toEqual({
      command: "node",
      args: ["index.js"],
      env: { TOKEN: "x" },
      packageName: "@scope/docs-mcp",
      cwd: "/tmp/pkg",
      enabled: false,
    });
  });

  it("treats an unreadable file as empty rather than throwing", () => {
    for (const raw of [null, "nope", 42, {}, { mcpServers: [] }]) {
      const { config, changed } = normalizeMcpConfig(raw);
      expect(config).toEqual({ mcpServers: {} });
      expect(changed).toBe(false);
    }
  });

  it("keeps an entry that is not an object instead of dropping the user's config", () => {
    const { config, changed } = normalizeMcpConfig({ mcpServers: { broken: "oops" } });

    expect(changed).toBe(false);
    expect(config.mcpServers.broken).toBe("oops");
  });
});

describe("readMcpConfig", () => {
  it("writes the migrated shape back to disk once", () => {
    const agentDir = temporaryAgentDir();
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify({ mcpServers: { docs: { command: "npx", args: [], disabled: true } } }),
    );

    const config = readMcpConfig(agentDir);
    expect(config.mcpServers.docs).toEqual({ command: "npx", args: [], enabled: false });

    const onDisk = JSON.parse(readFileSync(join(agentDir, "mcp.json"), "utf8"));
    expect(onDisk.mcpServers.docs).toEqual({ command: "npx", args: [], enabled: false });
  });

  it("returns an empty config for a missing file", () => {
    expect(readMcpConfig(join(temporaryAgentDir(), "nested"))).toEqual({ mcpServers: {} });
  });
});

describe("setMcpServerEnabled", () => {
  it("writes pi's enabled:false and removes the key again when re-enabled", () => {
    const agentDir = temporaryAgentDir();
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify({ mcpServers: { docs: { command: "npx", args: [] } } }),
    );

    setMcpServerEnabled(agentDir, "docs", false);
    expect(JSON.parse(readFileSync(join(agentDir, "mcp.json"), "utf8")).mcpServers.docs).toEqual({
      command: "npx",
      args: [],
      enabled: false,
    });

    setMcpServerEnabled(agentDir, "docs", true);
    expect(JSON.parse(readFileSync(join(agentDir, "mcp.json"), "utf8")).mcpServers.docs).toEqual({
      command: "npx",
      args: [],
    });
  });
});
