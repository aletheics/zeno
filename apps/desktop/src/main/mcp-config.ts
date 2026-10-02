/**
 * `mcp.json` read/write, shape normalization, and the operations behind the `zeno:mcp:*` IPC
 * handlers. Extracted from `index.ts` (file-size ratchet) so the migration below is unit
 * testable without an Electron main process.
 *
 * The file itself is pi's: `<agentDir>/mcp.json`, the shared `mcpServers` shape other MCP
 * clients use. pi passes unknown entry fields through untouched, which is what lets Zeno keep
 * `packageName` as its own bookkeeping without confusing pi.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { McpConfig, McpServerConfig } from "@zeno/contracts";

const execFileAsync = promisify(execFile);

/** npm 包名白名单：仅允许合法、URL 安全、不含 shell 元字符的包名（支持 scoped 包）。 */
const NPM_PACKAGE_NAME_RE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

export function isValidNpmPackageName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 214 &&
    NPM_PACKAGE_NAME_RE.test(value)
  );
}

function assertNpmPackageName(value: unknown): string {
  if (!isValidNpmPackageName(value)) throw new Error("非法的 npm 包名");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Move entries still carrying the pre-pi-1.0 `disabled` flag onto pi's own `enabled` switch.
 *
 * pi does not understand `disabled` — it validates `enabled` and passes unknown fields
 * through — so a "disabled" server was silently still connected. Every other field is left
 * exactly as it was.
 *
 * `changed` is false for an already-canonical file, so callers can skip the write.
 */
export function normalizeMcpConfig(raw: unknown): { config: McpConfig; changed: boolean } {
  if (!isRecord(raw) || !isRecord(raw.mcpServers)) {
    // A file we cannot make sense of is treated as empty, matching the previous read behavior.
    return { config: { mcpServers: {} }, changed: false };
  }
  let changed = false;
  const mcpServers: Record<string, McpServerConfig> = {};
  for (const [name, value] of Object.entries(raw.mcpServers)) {
    if (!isRecord(value)) {
      // Keep unparseable entries exactly as they were rather than dropping the user's config.
      mcpServers[name] = value as unknown as McpServerConfig;
      continue;
    }
    if ("disabled" in value) {
      const entry = { ...value };
      const wasDisabled = entry.disabled === true;
      delete entry.disabled;
      // An explicit `enabled` already present wins over the legacy flag.
      if (entry.enabled === undefined && wasDisabled) entry.enabled = false;
      mcpServers[name] = entry as unknown as McpServerConfig;
      changed = true;
      continue;
    }
    mcpServers[name] = value as unknown as McpServerConfig;
  }
  return { config: { mcpServers }, changed };
}

/** Write mcp.json. Normal callers should use {@link readMcpConfig}, which normalizes first. */
export function writeMcpConfig(agentDir: string, config: McpConfig): void {
  if (!existsSync(agentDir)) mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "mcp.json"), JSON.stringify(config, null, 2) + "\n", "utf8");
}

/**
 * Read mcp.json, migrating the legacy `disabled` flag on the way through. The migrated file is
 * written back once, so the shape drifts to canonical even for users who never open the UI.
 * A write failure never loses the read — the caller still gets the normalized config.
 */
export function readMcpConfig(agentDir: string): McpConfig {
  const mcpPath = join(agentDir, "mcp.json");
  let parsed: unknown;
  try {
    if (!existsSync(mcpPath)) return { mcpServers: {} };
    const raw = readFileSync(mcpPath, "utf8");
    if (!raw.trim()) return { mcpServers: {} };
    parsed = JSON.parse(raw);
  } catch {
    return { mcpServers: {} };
  }
  const { config, changed } = normalizeMcpConfig(parsed);
  if (changed) {
    try {
      writeMcpConfig(agentDir, config);
    } catch {
      // Best-effort: keep serving the normalized view.
    }
  }
  return config;
}

/**
 * On Windows, npx-resolver in pi-mcp-adapter misidentifies Unix shell scripts
 * in .bin/ as binaries, causing cmd.exe chain breaks that kill stdio pipes.
 *
 * Work around by installing the package locally and resolving the real entry
 * point from package.json.  Strategy:
 *   - If the bin entry is a .exe → native binary, use it directly with cwd set.
 *   - If the bin entry is a .js  → spawn `node <jsPath>` with cwd set.
 *   - If no bin entry            → fall back to npx (return null).
 *
 * Most MCP servers are pure JS.  Only packages that bundle native binaries
 * (e.g. officecli ships vendor/officecli.exe) get the .exe fast path.
 */
export async function resolveMcpNodeEntry(
  agentDir: string,
  packageName: string,
): Promise<{ command: string; args: string[]; cwd: string } | null> {
  if (process.platform !== "win32") return null;
  assertNpmPackageName(packageName);
  const mcpPackagesDir = join(agentDir, "mcp-packages");
  try {
    // Local install so we can inspect package.json for the bin entry at a
    // known path.  --no-save avoids writing a lockfile; the directory acts as
    // a simple cache — future installs of the same package are fast upgrades.
    await execFileAsync(
      "npm",
      ["install", "--no-fund", "--no-audit", "--no-save", "--prefix", mcpPackagesDir, packageName],
      { windowsHide: true, timeout: 120_000 },
    );
    const pkgPath = join(mcpPackagesDir, "node_modules", ...packageName.split("/"), "package.json");
    if (!existsSync(pkgPath)) return null;
    const pkgJson = JSON.parse(readFileSync(pkgPath, "utf8"));
    const pkgDir = dirname(pkgPath);
    const bin = pkgJson.bin;
    if (!bin) return null;
    const binRelative: string =
      typeof bin === "string" ? bin : (Object.values(bin as Record<string, string>)[0] ?? "");
    if (!binRelative) return null;
    const binPath = resolve(pkgDir, binRelative);
    const isExe = binRelative.toLowerCase().endsWith(".exe");
    // Native binary: spawn directly with cwd set to package root.
    // JS entry:    spawn via node with cwd set to package root.
    // Use "node" (resolved via PATH) — the agent-host utility process has its
    // own Node.js runtime, so process.execPath here is the Electron binary.
    return isExe
      ? { command: binPath, args: [], cwd: pkgDir }
      : { command: "node", args: [binPath], cwd: pkgDir };
  } catch {
    return null;
  }
}

/** Install (or re-point) a server entry from an npm package. */
export async function installMcpServer(
  agentDir: string,
  name: string,
  packageName: string,
): Promise<void> {
  assertNpmPackageName(packageName);
  const config = readMcpConfig(agentDir);
  // On Windows, resolve the JS entry to avoid npx-resolver's shell-script
  // detection bug.  Fall back to plain npx if resolution fails.
  const resolved = await resolveMcpNodeEntry(agentDir, packageName);
  config.mcpServers[name] = resolved
    ? { command: resolved.command, args: resolved.args, packageName, cwd: resolved.cwd }
    : { command: "npx", args: ["-y", packageName], packageName };
  writeMcpConfig(agentDir, config);
}

/** Remove a server entry and the package files Zeno installed for it. */
export function removeMcpServer(agentDir: string, name: string): void {
  const config = readMcpConfig(agentDir);
  const server = config.mcpServers[name];
  if (server) {
    // Clean up locally installed package files so disk doesn't leak.
    try {
      if (server.packageName && isValidNpmPackageName(server.packageName)) {
        const mcpPackagesRoot = join(agentDir, "mcp-packages", "node_modules");
        const pkgDir = resolve(mcpPackagesRoot, ...server.packageName.split("/"));
        // 路径穿越防护：清理目标必须仍位于 node_modules 根目录内
        if (pkgDir !== mcpPackagesRoot && pkgDir.startsWith(mcpPackagesRoot + sep)) {
          if (existsSync(pkgDir)) {
            rmSync(pkgDir, { recursive: true, force: true });
          }
        }
      }
    } catch {
      // best-effort cleanup — the config entry is the source of truth
    }
    delete config.mcpServers[name];
  }
  writeMcpConfig(agentDir, config);
}

/**
 * Enable/disable a server. pi's convention: `enabled: false` keeps the entry without
 * connecting, and an absent `enabled` means enabled — so enabling deletes the key.
 */
export function setMcpServerEnabled(agentDir: string, name: string, enabled: boolean): void {
  const config = readMcpConfig(agentDir);
  const server = config.mcpServers[name];
  if (!server) return;
  if (enabled) {
    delete server.enabled;
  } else {
    server.enabled = false;
  }
  writeMcpConfig(agentDir, config);
}

/** Refresh the package behind a server entry to its latest version (best-effort). */
export async function updateMcpServer(agentDir: string, name: string): Promise<void> {
  const config = readMcpConfig(agentDir);
  const server = config.mcpServers[name];
  if (!server || !server.packageName || !isValidNpmPackageName(server.packageName)) return;
  try {
    if (server.command === "node") {
      // Locally installed via resolveMcpNodeEntry — upgrade in place.
      const mcpPackagesDir = join(agentDir, "mcp-packages");
      await execFileAsync(
        "npm",
        [
          "install",
          "--no-fund",
          "--no-audit",
          "--no-save",
          "--prefix",
          mcpPackagesDir,
          `${server.packageName}@latest`,
        ],
        { windowsHide: true, timeout: 120_000 },
      );
    } else {
      // npx-based — refresh to latest (pure argv, no shell interpolation).
      await execFileAsync(
        process.platform === "win32" ? "npx.cmd" : "npx",
        ["-y", `${server.packageName}@latest`, "--version"],
        { windowsHide: true, timeout: 60_000 },
      );
    }
  } catch {
    // Best-effort — the package is fetched via npx on next runtime start anyway.
  }
}
