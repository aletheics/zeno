/**
 * Durable workaround for a pi-subagents foreground-spawn bug.
 *
 * `pi-subagents`' `getPiSpawnCommand` (src/runs/shared/pi-spawn.ts) launches the
 * child Pi CLI with `process.execPath`. Inside Zeno's agent-host — an Electron
 * utility process — `process.execPath` is the Electron binary, so children are
 * spawned as `electron cli.js …` instead of `node cli.js …` and exit with code
 * -1 (0xFFFFFFFF) before the model ever starts. The background async path
 * already guards against this (`resolveAsyncRunnerNodeCommand`); the foreground
 * path does not.
 *
 * This module re-applies the same guard to the installed source file. It is
 * idempotent, so a reinstall that wipes the edit is repaired on the next host
 * start. Upstreaming the fix removes the need for this file.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Marker that identifies an already-patched file (and the helper we insert). */
const MARKER = "function resolveNodeCommand";

/**
 * Anchor spanning the foreground `piCliPath` branch only. Using the two-line
 * context (with the trailing `args: [piCliPath, ...args],`) avoids clobbering the
 * earlier `return { command: execPath, args };` in the standalone-pi branch.
 */
const SPAWN_ANCHOR = "\t\t\tcommand: execPath,\n\t\t\targs: [piCliPath, ...args],";
const SPAWN_REPLACEMENT =
  "\t\t\tcommand: resolveNodeCommand(execPath),\n\t\t\targs: [piCliPath, ...args],";

/** Anchor that locates where the helpers must be inserted (before this fn). */
const INSERT_ANCHOR = "export function getPiSpawnCommand(";

/**
 * The block inserted at module scope. Kept byte-identical to the hand-applied
 * edit so the two never diverge. Uses `path.basename` (not a regex) to match the
 * existing `resolveAsyncRunnerNodeCommand` in async-execution.ts.
 */
const HELPER_BLOCK = [
  "function isNodeExecutableName(execPath: string): boolean {",
  "\tconst basename = path.basename(execPath).toLowerCase();",
  "\treturn (",
  '\t\tbasename === "node" ||',
  '\t\tbasename === "node.exe" ||',
  '\t\tbasename === "nodejs" ||',
  '\t\tbasename === "nodejs.exe"',
  "\t);",
  "}",
  "",
  "function canUseExecutable(execPath: string): boolean {",
  "\ttry {",
  "\t\tfs.accessSync(",
  "\t\t\texecPath,",
  '\t\t\tprocess.platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK,',
  "\t\t);",
  "\t\treturn true;",
  "\t} catch {",
  "\t\treturn false;",
  "\t}",
  "}",
  "",
  "/**",
  " * Resolve the runtime that must execute the pi CLI script. When the host is an",
  " * Electron utility process, `process.execPath` is the Electron binary (not a",
  " * Node runtime), so spawning it as `electron cli.js …` fails. Fall back to a",
  " * real `node` from PATH — the same guard the async runner path already applies.",
  " */",
  "function resolveNodeCommand(execPath: string): string {",
  "\tif (isNodeExecutableName(execPath) && canUseExecutable(execPath)) return execPath;",
  '\treturn process.platform === "win32" ? "node.exe" : "node";',
  "}",
].join("\n");

export type PiSubagentsPatchOutcome = "not-installed" | "already-patched" | "patched" | "failed";

/** Candidate on-disk locations of the pi-subagents spawn source. */
export function piSubagentsSpawnFileCandidates(agentDir: string): string[] {
  return [
    join(agentDir, "npm", "node_modules", "pi-subagents", "src", "runs", "shared", "pi-spawn.ts"),
    join(agentDir, "node_modules", "pi-subagents", "src", "runs", "shared", "pi-spawn.ts"),
  ];
}

/**
 * Idempotently apply the node-fallback patch to pi-subagents' foreground spawn
 * path. Returns the outcome; never throws (a missing/changed source is reported,
 * not fatal).
 */
export function ensurePiSubagentsSpawnPatch(
  agentDir: string,
  log: (message: string) => void = (message) => console.warn(message),
): PiSubagentsPatchOutcome {
  const target = piSubagentsSpawnFileCandidates(agentDir).find((p) => existsSync(p));
  if (!target) return "not-installed";

  let original: string;
  try {
    original = readFileSync(target, "utf8");
  } catch {
    return "failed";
  }

  if (original.includes(MARKER)) return "already-patched";

  // Make anchors line-ending aware so the patch also works on CRLF checkouts.
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const spawnAnchor = newline === "\n" ? SPAWN_ANCHOR : SPAWN_ANCHOR.replace(/\n/g, "\r\n");
  const spawnReplacement =
    newline === "\n" ? SPAWN_REPLACEMENT : SPAWN_REPLACEMENT.replace(/\n/g, "\r\n");

  if (!original.includes(spawnAnchor)) {
    log(
      `[zeno] pi-subagents patch: spawn anchor not found in ${target}; upstream may have changed — skipping`,
    );
    return "failed";
  }
  if (!original.includes(INSERT_ANCHOR)) {
    log(`[zeno] pi-subagents patch: insertion anchor not found in ${target}; skipping`);
    return "failed";
  }

  const block = newline === "\n" ? HELPER_BLOCK : HELPER_BLOCK.replace(/\n/g, "\r\n");

  const patched = original
    .replace(spawnAnchor, spawnReplacement)
    .replace(INSERT_ANCHOR, `${block}${newline}${newline}${INSERT_ANCHOR}`);

  try {
    writeFileSync(target, patched, "utf8");
  } catch {
    return "failed";
  }

  log(`[zeno] pi-subagents patch applied: ${target}`);
  return "patched";
}
