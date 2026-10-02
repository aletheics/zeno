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

type Flags = { disabled?: boolean; enabled?: boolean };

/**
 * The two readers of mcp.json, each stated as its own rule. They are the whole reason the flags
 * are written as a pair: the adapter is what serves both Zeno paths today, and it disables on
 * `disabled === true` alone — a file that only says `enabled: false` reads as *enabled* to it.
 */
const adapterDisables = (entry: Flags) => entry.disabled === true;
const piDisables = (entry: Flags) => entry.enabled === false;

function entryIn(agentDir: string, name: string): Record<string, unknown> {
  const raw = JSON.parse(readFileSync(join(agentDir, "mcp.json"), "utf8"));
  return raw.mcpServers[name];
}

describe("normalizeMcpConfig", () => {
  it("turns a legacy disabled flag into the pair both readers agree on", () => {
    const { config, changed } = normalizeMcpConfig({
      mcpServers: { docs: { command: "npx", args: ["-y", "docs-mcp"], disabled: true } },
    });

    expect(changed).toBe(true);
    const entry = config.mcpServers.docs as Flags;
    expect(entry).toEqual({
      command: "npx",
      args: ["-y", "docs-mcp"],
      disabled: true,
      enabled: false,
    });
    expect(adapterDisables(entry)).toBe(true);
    expect(piDisables(entry)).toBe(true);
  });

  it("rescues an entry that only carries pi's flag, so the adapter honours it too", () => {
    // The shape a hand-edit or a future pi-native write would leave behind. On its own it is
    // read as *enabled* by the adapter, which is what serves the connections today.
    const { config, changed } = normalizeMcpConfig({
      mcpServers: { docs: { command: "npx", args: [], enabled: false } },
    });

    expect(changed).toBe(true);
    const entry = config.mcpServers.docs as Flags;
    expect(adapterDisables(entry)).toBe(true);
    expect(piDisables(entry)).toBe(true);
  });

  it("leaves the canonical pair alone and reports no change", () => {
    const docs = { command: "node", args: ["server.js"], disabled: true, enabled: false };
    const { config, changed } = normalizeMcpConfig({ mcpServers: { docs } });

    expect(changed).toBe(false);
    expect(config.mcpServers.docs).toEqual(docs);
  });

  it("leaves an enabled entry alone and reports no change", () => {
    const docs = { command: "node", args: ["server.js"] };
    const { config, changed } = normalizeMcpConfig({ mcpServers: { docs } });

    expect(changed).toBe(false);
    expect(config.mcpServers.docs).toEqual(docs);
  });

  it.each([
    ["disabled: false", { disabled: false }],
    ["enabled: true", { enabled: true }],
    ["both spelling the same way", { disabled: false, enabled: true }],
  ])("drops flags that mean enabled (%s)", (_label, flags) => {
    const { config, changed } = normalizeMcpConfig({
      mcpServers: { docs: { command: "npx", args: [], ...flags } },
    });

    expect(changed).toBe(true);
    expect(config.mcpServers.docs).toEqual({ command: "npx", args: [] });
  });

  it("resolves a contradictory entry as disabled, since one reader would have connected it", () => {
    const { config, changed } = normalizeMcpConfig({
      mcpServers: { docs: { command: "npx", args: [], disabled: true, enabled: true } },
    });

    expect(changed).toBe(true);
    expect(adapterDisables(config.mcpServers.docs as Flags)).toBe(true);
    expect(piDisables(config.mcpServers.docs as Flags)).toBe(true);
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
      disabled: true,
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
  it("writes the canonical pair back to disk once", () => {
    const agentDir = temporaryAgentDir();
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify({ mcpServers: { docs: { command: "npx", args: [], disabled: true } } }),
    );

    expect(readMcpConfig(agentDir).mcpServers.docs).toEqual({
      command: "npx",
      args: [],
      disabled: true,
      enabled: false,
    });
    expect(entryIn(agentDir, "docs")).toEqual({
      command: "npx",
      args: [],
      disabled: true,
      enabled: false,
    });
  });

  it("returns an empty config for a missing file", () => {
    expect(readMcpConfig(join(temporaryAgentDir(), "nested"))).toEqual({ mcpServers: {} });
  });
});

describe("setMcpServerEnabled", () => {
  it("writes both flags when disabling and removes both when enabling", () => {
    const agentDir = temporaryAgentDir();
    writeFileSync(
      join(agentDir, "mcp.json"),
      JSON.stringify({ mcpServers: { docs: { command: "npx", args: [] } } }),
    );

    setMcpServerEnabled(agentDir, "docs", false);
    expect(entryIn(agentDir, "docs")).toEqual({
      command: "npx",
      args: [],
      disabled: true,
      enabled: false,
    });
    // The regression this guards: writing only `enabled: false` reads as enabled to the adapter.
    expect(adapterDisables(entryIn(agentDir, "docs") as Flags)).toBe(true);

    setMcpServerEnabled(agentDir, "docs", true);
    expect(entryIn(agentDir, "docs")).toEqual({ command: "npx", args: [] });
  });
});
