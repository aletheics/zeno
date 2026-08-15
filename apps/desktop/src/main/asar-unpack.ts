/**
 * Packaged asar unpack policy.
 *
 * Windows NSIS copies every asar.unpacked file one-by-one. Unpacking the whole
 * node_modules tree (~30k files) makes "Install for me only" look stuck.
 *
 * Native addons still must live on a real filesystem. The pi TUI JS tree is
 * extracted into userData on first launch (pi-cli-extract.ts) so bundled Node
 * can spawn the CLI on every platform.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Globs for electron-builder `asarUnpack` — natives only, all platforms. */
export const NATIVE_ASAR_UNPACK_GLOBS = [
  "**/*.node",
  "**/node-pty/prebuilds/**",
  "**/node-pty/build/**",
  "**/spawn-helper",
  "**/@silvia-odwyer/photon-node/**",
];

export const PI_TUI_SEED_PACKAGES = ["@earendil-works/pi-coding-agent"];

type PackageJsonLike = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

export function normalizeAsarEntry(entry: string): string {
  return String(entry).replace(/\\/g, "/").replace(/^\//, "");
}

/** Innermost package name for a `node_modules/…` asar path. */
export function packageNameFromAsarEntry(entry: string): string | undefined {
  const rel = normalizeAsarEntry(entry);
  let last: string | undefined;
  const re = /(?:^|\/)node_modules\/((?:@[^/]+\/)[^/]+|[^/]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(rel)) !== null) last = match[1];
  if (!last || last === ".bin" || last.startsWith(".")) return undefined;
  return last;
}

export function collectAsarPackageNames(fileList: string[]): Set<string> {
  const names = new Set<string>();
  for (const entry of fileList) {
    const name = packageNameFromAsarEntry(entry);
    if (name) names.add(name);
  }
  return names;
}

export function asarPackageJsonEntry(fileList: string[], packageName: string): string | undefined {
  const suffix = `node_modules/${packageName}/package.json`;
  const hits = fileList
    .map((entry) => normalizeAsarEntry(entry))
    .filter((entry) => entry === suffix || entry.endsWith(`/${suffix}`));
  hits.sort((a, b) => {
    const nested = a.split("node_modules").length - b.split("node_modules").length;
    return nested !== 0 ? nested : a.length - b.length;
  });
  return hits[0];
}

export function productionDependencyClosure(
  seedNames: string[],
  readPackageJson: (name: string) => PackageJsonLike | undefined,
): Set<string> {
  const out = new Set<string>();
  const queue = [...seedNames];
  while (queue.length > 0) {
    const name = queue.pop();
    if (!name || out.has(name)) continue;
    const pkg = readPackageJson(name);
    if (!pkg || typeof pkg !== "object") continue;
    out.add(name);
    const deps = {
      ...(pkg.dependencies && typeof pkg.dependencies === "object" ? pkg.dependencies : {}),
      ...(pkg.optionalDependencies && typeof pkg.optionalDependencies === "object"
        ? pkg.optionalDependencies
        : {}),
    };
    for (const dep of Object.keys(deps)) queue.push(dep);
  }
  return out;
}

export function selectAsarFilesForPackages(
  fileList: string[],
  packageNames: Iterable<string>,
): string[] {
  const wanted = packageNames instanceof Set ? packageNames : new Set(packageNames);
  return fileList.filter((entry) => {
    const rel = normalizeAsarEntry(entry);
    if (rel === "node_modules/.bin/pi" || rel.endsWith("/node_modules/.bin/pi")) return true;
    if (rel === "node_modules/.bin/pi.cmd" || rel.endsWith("/node_modules/.bin/pi.cmd")) {
      return true;
    }
    const name = packageNameFromAsarEntry(entry);
    return Boolean(name && wanted.has(name));
  });
}

/** Choose asar entries that bundled/system Node needs to run the builtin pi CLI. */
export function selectPiTuiAsarFiles(
  fileList: string[],
  readEntry: (entry: string) => string | Buffer,
): string[] {
  const readPackageJson = (name: string): PackageJsonLike | undefined => {
    const entry = asarPackageJsonEntry(fileList, name);
    if (!entry) return undefined;
    const listed = fileList.find((item) => normalizeAsarEntry(item) === entry) ?? entry;
    try {
      const raw = readEntry(listed);
      const text = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8");
      return JSON.parse(text) as PackageJsonLike;
    } catch {
      return undefined;
    }
  };
  const packages = productionDependencyClosure(PI_TUI_SEED_PACKAGES, readPackageJson);
  return selectAsarFilesForPackages(fileList, packages);
}

export function extractSelectedAsarFiles(options: {
  destRoot: string;
  files: string[];
  extractFile: (entry: string) => string | Buffer;
  mkdir?: (path: string, opts?: { recursive?: boolean }) => void;
  writeFile?: (path: string, data: string | Buffer) => void;
}): number {
  const { destRoot, files, extractFile, mkdir = mkdirSync, writeFile = writeFileSync } = options;
  let count = 0;
  for (const entry of files) {
    const rel = normalizeAsarEntry(entry);
    if (!rel) continue;
    const dest = join(destRoot, ...rel.split("/"));
    mkdir(dirname(dest), { recursive: true });
    let data: string | Buffer;
    try {
      data = extractFile(entry);
    } catch {
      data = extractFile(rel);
    }
    writeFile(dest, data);
    count += 1;
  }
  return count;
}
