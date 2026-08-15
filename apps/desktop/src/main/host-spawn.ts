import { existsSync } from "node:fs";
import { join } from "node:path";

/** Resolve the utility-process entry, preferring an unpacked asar copy when present. */
export function resolveAgentHostEntry(currentDirectory: string): string {
  const packed = join(currentDirectory, "..", "agent-host", "agent-host.mjs");
  const unpacked = packed.includes("app.asar")
    ? packed.replace(/app\.asar(?=$|[\\/])/u, "app.asar.unpacked")
    : packed;
  if (unpacked !== packed && existsSync(unpacked)) return unpacked;
  if (existsSync(packed)) return packed;
  throw new Error(
    `Agent Host entry not found at ${packed}. Rebuild the desktop app (pnpm --filter @zeno/desktop build).`,
  );
}

/** Drop flags that make Electron Helper interpret the host as a Node CLI. */
export function sanitizeUtilityProcessEnv(env: Record<string, string>): Record<string, string> {
  const next = { ...env };
  delete next.ELECTRON_RUN_AS_NODE;
  return next;
}

export function formatHostExitError(exitCode: number, stderr = ""): Error {
  const detail = stderr.replace(/\s+/gu, " ").trim();
  if (!detail) return new Error(`Agent Host exited with code ${exitCode}`);
  return new Error(`Agent Host exited with code ${exitCode}: ${detail.slice(0, 2000)}`);
}
