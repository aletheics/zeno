/**
 * First-launch extract of the builtin pi CLI out of app.asar into userData.
 *
 * Bundled/system Node cannot read asar. Unpacking the JS tree into asar.unpacked
 * makes Windows NSIS copy tens of thousands of files. Extract once into userData
 * (same idea as managed runtimes) so every platform's TUI uses bundled Node.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { selectPiTuiAsarFiles } from "./asar-unpack.ts";
import { PI_SDK_PACKAGE } from "./pi-sdk.ts";

export const PI_CLI_EXTRACT_STAMP = ".extracted.json";

export type PiCliExtractStamp = {
  package: string;
  version: string;
  extractedAt: string;
};

export type PiCliExtractResult = {
  root: string;
  extractedNow: boolean;
  version?: string;
};

export function piCliExtractDir(userDataPath: string): string {
  return join(userDataPath, "pi-cli");
}

export function extractedPiCliPackageRoot(userDataPath: string): string | undefined {
  const root = join(piCliExtractDir(userDataPath), "node_modules", ...PI_SDK_PACKAGE.split("/"));
  return existsSync(join(root, "package.json")) ? root : undefined;
}

export function readPiCliExtractStamp(extractDir: string): PiCliExtractStamp | undefined {
  try {
    const raw = readFileSync(join(extractDir, PI_CLI_EXTRACT_STAMP), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return undefined;
    const rec = parsed as Record<string, unknown>;
    if (typeof rec.package !== "string" || typeof rec.version !== "string") return undefined;
    return {
      package: rec.package,
      version: rec.version,
      extractedAt: typeof rec.extractedAt === "string" ? rec.extractedAt : "",
    };
  } catch {
    return undefined;
  }
}

export function isPiCliExtractCurrent(
  stamp: PiCliExtractStamp | undefined,
  expectedVersion: string,
  extractDir: string,
): boolean {
  if (!stamp || !expectedVersion) return false;
  if (stamp.package !== PI_SDK_PACKAGE) return false;
  if (stamp.version !== expectedVersion) return false;
  return Boolean(extractedPackageRootFromDir(extractDir));
}

function extractedPackageRootFromDir(extractDir: string): string | undefined {
  const root = join(extractDir, "node_modules", ...PI_SDK_PACKAGE.split("/"));
  return existsSync(join(root, "package.json")) ? root : undefined;
}

export function listRelativeFiles(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [""];
  while (stack.length > 0) {
    const rel = stack.pop() ?? "";
    const dir = rel ? join(root, rel) : root;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      const posix = child.replace(/\\/g, "/");
      if (entry.isDirectory()) stack.push(posix);
      else out.push(posix);
    }
  }
  return out;
}

function readAsarPackageVersion(asarPath: string): string | undefined {
  const pkgPath = join(asarPath, "node_modules", ...PI_SDK_PACKAGE.split("/"), "package.json");
  try {
    const parsed: unknown = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (!parsed || typeof parsed !== "object") return undefined;
    const version = (parsed as { version?: unknown }).version;
    return typeof version === "string" && version.trim() ? version.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * True when userData/pi-cli holds an extract of exactly the pi package shipped
 * in `asarPath`.
 *
 * The extract sorts ahead of node_modules in the builtin search roots, so a
 * leftover copy from an earlier release would silently pin the app to the old
 * SDK. Callers must gate on this before offering the extract as a search root.
 */
export function isExtractedPiCliCurrentFor(options: {
  userDataPath: string;
  asarPath: string;
}): boolean {
  const asarPath = options.asarPath.trim();
  if (!asarPath) return false;
  const version = readAsarPackageVersion(asarPath);
  if (!version) return false;
  const extractDir = piCliExtractDir(options.userDataPath);
  return isPiCliExtractCurrent(readPiCliExtractStamp(extractDir), version, extractDir);
}

/**
 * Copy the builtin pi CLI + production deps from asar (or a directory fixture)
 * into userData/pi-cli. No-ops when the stamp matches and cli.js is present.
 */
export function ensureExtractedPiCli(options: {
  userDataPath: string;
  asarPath: string;
}): PiCliExtractResult | undefined {
  const asarPath = options.asarPath.trim();
  if (!asarPath || !existsSync(join(asarPath, "node_modules"))) return undefined;

  const version = readAsarPackageVersion(asarPath);
  if (!version) return undefined;

  const extractDir = piCliExtractDir(options.userDataPath);
  const stamp = readPiCliExtractStamp(extractDir);
  if (isPiCliExtractCurrent(stamp, version, extractDir)) {
    return { root: extractDir, extractedNow: false, version };
  }

  try {
    rmSync(extractDir, { recursive: true, force: true });
  } catch {
    // continue
  }
  mkdirSync(extractDir, { recursive: true });

  const files = listRelativeFiles(join(asarPath, "node_modules")).map(
    (rel) => `node_modules/${rel}`,
  );
  const selected = selectPiTuiAsarFiles(files, (entry) =>
    readFileSync(join(asarPath, ...normalizeAsarRel(entry).split("/"))),
  );
  for (const entry of selected) {
    const rel = normalizeAsarRel(entry);
    const dest = join(extractDir, ...rel.split("/"));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(join(asarPath, ...rel.split("/"))));
  }

  if (!extractedPackageRootFromDir(extractDir)) {
    console.warn("[zeno] pi CLI extract finished but package root is missing");
    return undefined;
  }

  const next: PiCliExtractStamp = {
    package: PI_SDK_PACKAGE,
    version,
    extractedAt: new Date().toISOString(),
  };
  writeFileSync(join(extractDir, PI_CLI_EXTRACT_STAMP), `${JSON.stringify(next, null, 2)}\n`);
  return { root: extractDir, extractedNow: true, version };
}

function normalizeAsarRel(entry: string): string {
  return entry.replace(/\\/g, "/").replace(/^\//, "");
}
