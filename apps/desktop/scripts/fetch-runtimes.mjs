/**
 * Download platform-matched Node.js + Python into apps/desktop/runtimes/
 * and materialize runtimes/current/ for electron-builder extraResources.
 *
 * Usage:
 *   node scripts/fetch-runtimes.mjs
 *   node scripts/fetch-runtimes.mjs --platform darwin --arch arm64
 *   node scripts/fetch-runtimes.mjs --force
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = resolve(__dirname, "..");
const RUNTIMES_ROOT = join(DESKTOP_ROOT, "runtimes");
const VERSIONS_PATH = join(RUNTIMES_ROOT, "versions.json");
const CACHE_ROOT = join(homedir(), ".cache", "zeno-runtimes");

/**
 * @typedef {{ node: string, python: string, pythonReleaseTag: string }} RuntimeVersions
 */

function parseArgs(argv) {
  /** @type {{ platform?: string, arch?: string, force: boolean }} */
  const out = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") out.force = true;
    else if (a === "--platform") out.platform = argv[++i];
    else if (a === "--arch") out.arch = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node fetch-runtimes.mjs [--platform <os>] [--arch <arch>] [--force]`);
      process.exit(0);
    }
  }
  return out;
}

/**
 * @param {string} [versionsPath]
 * @returns {RuntimeVersions}
 */
export function loadVersions(versionsPath = VERSIONS_PATH) {
  const raw = JSON.parse(readFileSync(versionsPath, "utf8"));
  if (!raw?.node || !raw?.python || !raw?.pythonReleaseTag) {
    throw new Error(`Invalid ${versionsPath}: need node, python, pythonReleaseTag`);
  }
  return {
    node: String(raw.node),
    python: String(raw.python),
    pythonReleaseTag: String(raw.pythonReleaseTag),
  };
}

/**
 * Map host / electron-builder arch names to our cache key pieces.
 * @param {string | undefined} platform
 * @param {string | undefined} arch
 */
export function resolveTarget(platform, arch) {
  const plat = (platform || process.platform).toLowerCase();
  let a = (arch || process.arch).toLowerCase();
  if (a === "x86_64") a = "x64";
  if (a === "aarch64") a = "arm64";

  /** @type {"darwin" | "win32" | "linux"} */
  let os;
  if (plat === "darwin" || plat === "mac" || plat === "macos") os = "darwin";
  else if (plat === "win32" || plat === "win" || plat === "windows") os = "win32";
  else if (plat === "linux") os = "linux";
  else throw new Error(`Unsupported platform: ${plat}`);

  if (a !== "x64" && a !== "arm64") {
    throw new Error(`Unsupported arch: ${a} (need x64 or arm64)`);
  }
  // Official Node windows arm64 exists but our release matrix is win-x64 only for now.
  if (os === "win32" && a === "arm64") {
    console.warn("[fetch-runtimes] win arm64 requested; using win x64 Node/Python assets");
    a = "x64";
  }
  return { os, arch: a, key: `${os}-${a}` };
}

/**
 * @param {{ os: string, arch: string }} target
 * @param {RuntimeVersions} versions
 */
export function nodeDistMeta(target, versions) {
  const v = versions.node;
  if (target.os === "darwin") {
    const narch = target.arch === "arm64" ? "arm64" : "x64";
    const name = `node-v${v}-darwin-${narch}.tar.gz`;
    return {
      url: `https://nodejs.org/dist/v${v}/${name}`,
      archiveName: name,
      kind: "tar.gz",
      stripTop: true,
    };
  }
  if (target.os === "linux") {
    const narch = target.arch === "arm64" ? "arm64" : "x64";
    const name = `node-v${v}-linux-${narch}.tar.gz`;
    return {
      url: `https://nodejs.org/dist/v${v}/${name}`,
      archiveName: name,
      kind: "tar.gz",
      stripTop: true,
    };
  }
  // win32
  const name = `node-v${v}-win-x64.zip`;
  return {
    url: `https://nodejs.org/dist/v${v}/${name}`,
    archiveName: name,
    kind: "zip",
    stripTop: true,
  };
}

/**
 * @param {{ os: string, arch: string }} target
 * @param {RuntimeVersions} versions
 */
export function pythonDistMeta(target, versions) {
  const tag = versions.pythonReleaseTag;
  const py = versions.python;
  /** @type {string} */
  let triple;
  if (target.os === "darwin") {
    triple = target.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  } else if (target.os === "linux") {
    triple = target.arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu";
  } else {
    triple = "x86_64-pc-windows-msvc";
  }
  // install_only_stripped drops debug symbols / tests — much smaller than install_only.
  const name = `cpython-${py}+${tag}-${triple}-install_only_stripped.tar.gz`;
  return {
    url: `https://github.com/astral-sh/python-build-standalone/releases/download/${tag}/${name}`,
    archiveName: name,
    kind: "tar.gz",
    stripTop: false,
  };
}

/**
 * @param {string} url
 * @param {string} destFile
 */
async function download(url, destFile) {
  mkdirSync(dirname(destFile), { recursive: true });
  if (existsSync(destFile) && statSync(destFile).size > 0) {
    console.log(`[fetch-runtimes] cache hit ${destFile}`);
    return;
  }
  console.log(`[fetch-runtimes] download ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed ${res.status} ${url}`);
  }
  const tmp = `${destFile}.partial`;
  await pipeline(res.body, createWriteStream(tmp));
  // renameSync may fail across devices; copy+unlink is fine for cache.
  copyFileSync(tmp, destFile);
  rmSync(tmp, { force: true });
}

/**
 * Git's GNU `tar` treats `C:\` as a remote host ("Cannot connect to C:").
 * Windows built-in bsdtar (`%SystemRoot%\System32\tar.exe`) accepts drive letters.
 * Prefer that binary so pack/extract work without rewriting paths to `/c/...`
 * (which System32 tar does not understand).
 *
 * @param {string} [platform]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function resolveTarBinary(platform = process.platform, env = process.env) {
  if (platform !== "win32") return "tar";
  const root = env.SystemRoot || env.SYSTEMROOT || "C:\\Windows";
  const systemTar = join(root, "System32", "tar.exe");
  if (existsSync(systemTar)) return systemTar;
  return "tar";
}

/**
 * @param {string[]} args tar argv after the binary name
 * @param {{ stdio?: "inherit" | "ignore" }} [opts]
 */
export function runTar(args, opts = {}) {
  const stdio = opts.stdio ?? "inherit";
  execFileSync(resolveTarBinary(), args, { stdio });
}

/**
 * @param {string} archive
 * @param {string} destDir
 * @param {"tar.gz" | "zip"} kind
 */
function extractArchive(archive, destDir, kind) {
  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });
  if (kind === "tar.gz") {
    // System tar is available on macOS, Linux, and modern Windows.
    runTar(["-xzf", archive, "-C", destDir], { stdio: "inherit" });
    return;
  }
  if (process.platform === "win32") {
    const litArchive = archive.replace(/'/g, "''");
    const litDest = destDir.replace(/'/g, "''");
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${litArchive}' -DestinationPath '${litDest}' -Force`,
      ],
      { stdio: "inherit" },
    );
    return;
  }
  // unzip fallback
  execFileSync("unzip", ["-q", archive, "-d", destDir], { stdio: "inherit" });
}

/**
 * If archive extracted a single top-level dir, return its path; else destDir.
 * @param {string} destDir
 */
function unwrapSingleTopDir(destDir) {
  const entries = readdirSync(destDir, { withFileTypes: true }).filter(
    (e) => !e.name.startsWith("."),
  );
  if (entries.length === 1 && entries[0]?.isDirectory()) {
    return join(destDir, entries[0].name);
  }
  return destDir;
}

/**
 * Copy directory tree (files only; follow symlinks as files when possible).
 * @param {string} src
 * @param {string} dest
 */
function copyTree(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyTree(from, to);
    } else if (entry.isSymbolicLink()) {
      // Materialize symlink targets as copies when possible.
      try {
        copyFileSync(from, to);
      } catch {
        // skip broken links
      }
    } else {
      copyFileSync(from, to);
    }
  }
}

/**
 * Ensure unix execute bits on common bin names.
 * @param {string} root
 */
function ensureUnixExecuteBits(root) {
  if (process.platform === "win32") return;
  const candidates = [
    join(root, "bin", "node"),
    join(root, "bin", "npm"),
    join(root, "bin", "npx"),
    join(root, "bin", "python"),
    join(root, "bin", "python3"),
    join(root, "node"),
    join(root, "node.exe"),
    join(root, "python.exe"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const mode = statSync(p).mode;
      chmodSync(p, mode | 0o755);
    } catch {
      // ignore
    }
  }
}

/**
 * @param {string} nodeRoot
 */
function findNodeBinary(nodeRoot) {
  const candidates =
    process.platform === "win32" || existsSync(join(nodeRoot, "node.exe"))
      ? [join(nodeRoot, "node.exe"), join(nodeRoot, "bin", "node.exe")]
      : [join(nodeRoot, "bin", "node"), join(nodeRoot, "node")];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return undefined;
}

/**
 * @param {string} pythonRoot
 */
function findPythonBinary(pythonRoot) {
  const candidates = [
    join(pythonRoot, "bin", "python3"),
    join(pythonRoot, "bin", "python"),
    join(pythonRoot, "python.exe"),
    join(pythonRoot, "bin", "python.exe"),
    join(pythonRoot, "python", "python.exe"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // install_only often has python/ top folder
  const nested = join(pythonRoot, "python");
  if (existsSync(nested)) {
    for (const c of [
      join(nested, "bin", "python3"),
      join(nested, "bin", "python"),
      join(nested, "python.exe"),
    ]) {
      if (existsSync(c)) return c;
    }
  }
  return undefined;
}

/**
 * Normalize python tree so bin/python3 lives under destRoot.
 * install_only extracts to `python/` subfolder.
 * @param {string} extracted
 * @param {string} destRoot
 */
function materializePython(extracted, destRoot) {
  rmSync(destRoot, { recursive: true, force: true });
  const nested = join(extracted, "python");
  const src = existsSync(nested) ? nested : extracted;
  copyTree(src, destRoot);
  ensureUnixExecuteBits(destRoot);
  // Convenience: ensure python3 name exists on unix
  const py3 = join(destRoot, "bin", "python3");
  const py = join(destRoot, "bin", "python");
  if (!existsSync(py3) && existsSync(py) && process.platform !== "win32") {
    try {
      copyFileSync(py, py3);
      chmodSync(py3, 0o755);
    } catch {
      // ignore
    }
  }
  prunePythonRuntime(destRoot);
}

/**
 * @param {string} extracted
 * @param {string} destRoot
 */
function materializeNode(extracted, destRoot) {
  rmSync(destRoot, { recursive: true, force: true });
  copyTree(extracted, destRoot);
  ensureUnixExecuteBits(destRoot);
  pruneNodeRuntime(destRoot);
}

/**
 * Drop headers/docs we never compile against — keeps bin/node + npm only.
 * Official Node tarball ships ~50–60MB of include/ that is useless at runtime.
 * @param {string} nodeRoot
 * @returns {number} approximate bytes removed (best-effort)
 */
export function pruneNodeRuntime(nodeRoot) {
  if (!nodeRoot || !existsSync(nodeRoot)) return 0;
  let removed = 0;
  const drop = [
    join(nodeRoot, "include"),
    join(nodeRoot, "share"),
    join(nodeRoot, "CHANGELOG.md"),
    join(nodeRoot, "README.md"),
    join(nodeRoot, "LICENSE"),
  ];
  for (const p of drop) {
    removed += removePathBestEffort(p);
  }
  // Do not `strip` the node binary — Apple Silicon Node builds often break after strip.
  return removed;
}

/**
 * Drop Tcl/Tk, idle, headers, tests — keep a usable stdlib for agent scripts.
 * @param {string} pythonRoot
 * @returns {number}
 */
export function prunePythonRuntime(pythonRoot) {
  if (!pythonRoot || !existsSync(pythonRoot)) return 0;
  let removed = 0;
  const drop = [
    join(pythonRoot, "include"),
    join(pythonRoot, "share"),
    join(pythonRoot, "lib", "pkgconfig"),
  ];
  // Tcl/Tk and friends are huge and unused by typical agent tooling.
  const libDir = join(pythonRoot, "lib");
  if (existsSync(libDir)) {
    for (const name of readdirSync(libDir)) {
      if (
        name.startsWith("tcl") ||
        name.startsWith("tk") ||
        name.startsWith("itcl") ||
        name.startsWith("thread") ||
        name.startsWith("tdbc") ||
        name.startsWith("sqlite") ||
        /^lib(tcl|tk)/i.test(name)
      ) {
        drop.push(join(libDir, name));
      }
    }
  }
  // Find lib/pythonX.Y
  let pyLib;
  if (existsSync(libDir)) {
    for (const name of readdirSync(libDir)) {
      if (/^python\d+\.\d+$/.test(name)) {
        pyLib = join(libDir, name);
        break;
      }
    }
  }
  if (pyLib) {
    for (const name of [
      "idlelib",
      "tkinter",
      "turtledemo",
      "turtle.py",
      "pydoc_data",
      "lib2to3",
      "test",
      "tests",
      "ensurepip/_bundled", // keep ensurepip module; drop heavy wheels if present as dir
    ]) {
      drop.push(join(pyLib, name));
    }
    // config-* build dirs
    try {
      for (const name of readdirSync(pyLib)) {
        if (name.startsWith("config-")) drop.push(join(pyLib, name));
      }
    } catch {
      // ignore
    }
  }
  // CLI helpers we do not need on PATH for the agent
  const binDir = join(pythonRoot, "bin");
  if (existsSync(binDir)) {
    try {
      for (const name of readdirSync(binDir)) {
        if (
          name.startsWith("2to3") ||
          name.startsWith("idle") ||
          name.startsWith("pydoc") ||
          name.startsWith("python3-config") ||
          name.endsWith("-config")
        ) {
          drop.push(join(binDir, name));
        }
      }
    } catch {
      // ignore
    }
  }
  for (const p of drop) {
    removed += removePathBestEffort(p);
  }
  // __pycache__ / *.pyc
  removed += removePycaches(pythonRoot);
  return removed;
}

/**
 * @param {string} path
 * @returns {number}
 */
function removePathBestEffort(path) {
  if (!path || !existsSync(path)) return 0;
  let size = 0;
  try {
    size = dirSizeBytes(path);
  } catch {
    size = 0;
  }
  try {
    rmSync(path, { recursive: true, force: true });
    return size;
  } catch {
    return 0;
  }
}

/**
 * @param {string} root
 * @returns {number}
 */
function removePycaches(root) {
  let removed = 0;
  /** @type {string[]} */
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__pycache__") {
          removed += removePathBestEffort(full);
        } else {
          stack.push(full);
        }
      } else if (entry.name.endsWith(".pyc") || entry.name.endsWith(".pyo")) {
        removed += removePathBestEffort(full);
      }
    }
  }
  return removed;
}

/**
 * @param {string} path
 * @returns {number}
 */
function dirSizeBytes(path) {
  let total = 0;
  const st = lstatSync(path);
  if (st.isFile() || st.isSymbolicLink()) return st.size;
  if (!st.isDirectory()) return 0;
  for (const name of readdirSync(path)) {
    total += dirSizeBytes(join(path, name));
  }
  return total;
}

/**
 * @param {string} file
 */
function sha256File(file) {
  const h = createHash("sha256");
  h.update(readFileSync(file));
  return h.digest("hex");
}

/**
 * @param {{ os: string, arch: string, key: string }} target
 * @param {RuntimeVersions} versions
 * @param {boolean} force
 */
async function fetchOne(target, versions, force) {
  const platformDir = join(RUNTIMES_ROOT, target.key);
  const nodeDest = join(platformDir, "node");
  const pythonDest = join(platformDir, "python");
  const manifestPath = join(platformDir, "manifest.json");

  if (
    !force &&
    existsSync(manifestPath) &&
    findNodeBinary(nodeDest) &&
    findPythonBinary(pythonDest)
  ) {
    try {
      const prev = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (prev.node === versions.node && prev.python === versions.python && prev.pruned === true) {
        console.log(`[fetch-runtimes] ${target.key} already at pinned versions (pruned)`);
        return { platformDir, nodeDest, pythonDest, manifestPath };
      }
    } catch {
      // re-fetch
    }
  }

  mkdirSync(CACHE_ROOT, { recursive: true });
  mkdirSync(platformDir, { recursive: true });

  // ── Node ──────────────────────────────────────────────────────────────
  const nodeMeta = nodeDistMeta(target, versions);
  const nodeArchive = join(CACHE_ROOT, nodeMeta.archiveName);
  await download(nodeMeta.url, nodeArchive);
  const nodeExtract = join(tmpdir(), `zeno-node-${target.key}-${Date.now()}`);
  try {
    extractArchive(nodeArchive, nodeExtract, nodeMeta.kind);
    const unwrapped = nodeMeta.stripTop ? unwrapSingleTopDir(nodeExtract) : nodeExtract;
    materializeNode(unwrapped, nodeDest);
  } finally {
    rmSync(nodeExtract, { recursive: true, force: true });
  }
  const nodeBin = findNodeBinary(nodeDest);
  if (!nodeBin) throw new Error(`Node binary missing after extract (${nodeDest})`);

  // ── Python ────────────────────────────────────────────────────────────
  const pyMeta = pythonDistMeta(target, versions);
  const pyArchive = join(CACHE_ROOT, pyMeta.archiveName);
  await download(pyMeta.url, pyArchive);
  const pyExtract = join(tmpdir(), `zeno-py-${target.key}-${Date.now()}`);
  try {
    extractArchive(pyArchive, pyExtract, pyMeta.kind);
    materializePython(pyExtract, pythonDest);
  } finally {
    rmSync(pyExtract, { recursive: true, force: true });
  }
  // Prune again in case materialize skipped (upgrade path).
  pruneNodeRuntime(nodeDest);
  prunePythonRuntime(pythonDest);

  const nodeBinAfter = findNodeBinary(nodeDest);
  const pyBin = findPythonBinary(pythonDest);
  if (!nodeBinAfter) throw new Error(`Node binary missing after prune (${nodeDest})`);
  if (!pyBin) throw new Error(`Python binary missing after extract (${pythonDest})`);

  // Smoke
  try {
    const nodeV = execFileSync(nodeBinAfter, ["-v"], { encoding: "utf8" }).trim();
    console.log(`[fetch-runtimes] node smoke ${nodeV}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Bundled node failed smoke test: ${detail}`);
  }
  try {
    const pyV = execFileSync(pyBin, ["--version"], { encoding: "utf8" }).trim();
    console.log(`[fetch-runtimes] python smoke ${pyV}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Bundled python failed smoke test: ${detail}`);
  }

  const nodeBytes = dirSizeBytes(nodeDest);
  const pyBytes = dirSizeBytes(pythonDest);
  console.log(
    `[fetch-runtimes] sizes node=${formatMb(nodeBytes)} python=${formatMb(pyBytes)} total=${formatMb(nodeBytes + pyBytes)}`,
  );

  const manifest = {
    node: versions.node,
    python: versions.python,
    pythonReleaseTag: versions.pythonReleaseTag,
    platform: target.os,
    arch: target.arch,
    key: target.key,
    pruned: true,
    nodeBytes,
    pythonBytes: pyBytes,
    nodeBinary: nodeBinAfter.replace(platformDir + (process.platform === "win32" ? "\\" : "/"), ""),
    pythonBinary: pyBin.replace(platformDir + (process.platform === "win32" ? "\\" : "/"), ""),
    fetchedAt: new Date().toISOString(),
    nodeArchiveSha256: sha256File(nodeArchive),
    pythonArchiveSha256: sha256File(pyArchive),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`[fetch-runtimes] wrote ${manifestPath}`);
  return { platformDir, nodeDest, pythonDest, manifestPath };
}

/**
 * @param {number} bytes
 */
function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Pack pruned trees into archives for shipping (WorkBuddy-style).
 * Archives extract to `node/` and `python/` under the destination root.
 * @param {string} platformDir
 */
export function packShippingArchives(platformDir) {
  const archives = join(platformDir, "archives");
  rmSync(archives, { recursive: true, force: true });
  mkdirSync(archives, { recursive: true });
  const nodeArchive = join(archives, "node.tar.gz");
  const pythonArchive = join(archives, "python.tar.gz");
  if (existsSync(join(platformDir, "node"))) {
    runTar(["-czf", nodeArchive, "-C", platformDir, "node"], { stdio: "ignore" });
    console.log(`[fetch-runtimes] packed ${nodeArchive} (${formatMb(statSync(nodeArchive).size)})`);
  }
  if (existsSync(join(platformDir, "python"))) {
    runTar(["-czf", pythonArchive, "-C", platformDir, "python"], { stdio: "ignore" });
    console.log(
      `[fetch-runtimes] packed ${pythonArchive} (${formatMb(statSync(pythonArchive).size)})`,
    );
  }
  // Enrich manifest for the provisioner
  const manifestPath = join(platformDir, "manifest.json");
  try {
    const man = JSON.parse(readFileSync(manifestPath, "utf8"));
    man.archives = {
      node: existsSync(nodeArchive) ? "archives/node.tar.gz" : undefined,
      python: existsSync(pythonArchive) ? "archives/python.tar.gz" : undefined,
    };
    writeFileSync(manifestPath, `${JSON.stringify(man, null, 2)}\n`, "utf8");
  } catch {
    // ignore
  }
}

/**
 * Point runtimes/current at the platform dir for electron-builder + local dev.
 * Prefer a directory symlink so we do not store two full copies (~2× disk).
 * Archives live under the platform dir (and thus under current via the link).
 * @param {string} platformDir
 */
function materializeCurrent(platformDir) {
  packShippingArchives(platformDir);

  const current = join(RUNTIMES_ROOT, "current");
  try {
    rmSync(current, { recursive: true, force: true });
  } catch {
    // ignore
  }
  try {
    // Relative link so the tree is relocatable within apps/desktop/runtimes/.
    const rel = platformDir.startsWith(RUNTIMES_ROOT)
      ? platformDir.slice(RUNTIMES_ROOT.length).replace(/^[/\\]/, "")
      : platformDir;
    // Junctions on Windows look like real directories to electron-builder
    // extraResources; `dir` symlinks are often copied as empty link files.
    const linkType = process.platform === "win32" ? "junction" : "dir";
    symlinkSync(rel, current, linkType);
    console.log(`[fetch-runtimes] linked current -> ${rel} (${linkType}, no duplicate copy)`);
    return;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[fetch-runtimes] symlink failed (${detail}); copying`);
  }
  mkdirSync(current, { recursive: true });
  copyTree(join(platformDir, "node"), join(current, "node"));
  copyTree(join(platformDir, "python"), join(current, "python"));
  if (existsSync(join(platformDir, "archives"))) {
    copyTree(join(platformDir, "archives"), join(current, "archives"));
  }
  copyFileSync(join(platformDir, "manifest.json"), join(current, "manifest.json"));
  ensureUnixExecuteBits(join(current, "node"));
  ensureUnixExecuteBits(join(current, "python"));
  console.log(`[fetch-runtimes] materialised ${current} (copy)`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const versions = loadVersions();
  const target = resolveTarget(args.platform, args.arch);
  console.log(
    `[fetch-runtimes] target=${target.key} node=${versions.node} python=${versions.python} (${versions.pythonReleaseTag})`,
  );
  const result = await fetchOne(target, versions, args.force);
  materializeCurrent(result.platformDir);
  console.log("[fetch-runtimes] done");
}

// Only auto-run when executed as a CLI entry (not when imported by tests).
const isCliEntry =
  typeof process.argv[1] === "string" &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCliEntry) {
  main().catch((error) => {
    console.error("[fetch-runtimes] failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
