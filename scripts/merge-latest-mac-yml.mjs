/**
 * Merge multiple latest-mac.yml files produced by arch-split CI runners.
 * electron-updater expects a single latest-mac.yml listing all arch zips.
 *
 * Usage: node scripts/merge-latest-mac-yml.mjs <dir-with-yml-copies> <out-file>
 *
 * Input dir may contain:
 *   latest-mac.yml
 *   latest-mac-arm64.yml
 *   latest-mac-x64.yml
 *   any *.yml whose name includes "latest-mac"
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const inputDir = process.argv[2] ? resolve(process.argv[2]) : null;
const outFile = process.argv[3] ? resolve(process.argv[3]) : null;

if (!inputDir || !outFile) {
  console.error("Usage: node scripts/merge-latest-mac-yml.mjs <input-dir> <out-file>");
  process.exit(1);
}

function parseSimpleYaml(text) {
  /** Minimal parser for electron-builder update yml (version/files/path/sha512/releaseDate). */
  const lines = text.split(/\r?\n/);
  const result = {
    version: undefined,
    path: undefined,
    sha512: undefined,
    releaseDate: undefined,
    files: [],
  };
  let inFiles = false;
  let current = null;

  for (const raw of lines) {
    const line = raw.replace(/\t/g, "  ");
    if (!line.trim() || line.trim().startsWith("#")) continue;

    if (/^files:\s*$/.test(line)) {
      inFiles = true;
      continue;
    }

    if (inFiles) {
      const fileStart = line.match(/^\s*-\s+url:\s*(.+)\s*$/);
      if (fileStart) {
        if (current) result.files.push(current);
        current = { url: unquote(fileStart[1]) };
        continue;
      }
      const fileField = line.match(/^\s{2,}([A-Za-z0-9_]+):\s*(.+)\s*$/);
      if (fileField && current) {
        const key = fileField[1];
        const value = unquote(fileField[2]);
        if (key === "sha512") current.sha512 = value;
        else if (key === "size") current.size = Number(value);
        else if (key === "url") current.url = value;
        continue;
      }
      // Left files block
      if (/^[A-Za-z]/.test(line)) {
        if (current) {
          result.files.push(current);
          current = null;
        }
        inFiles = false;
      } else {
        continue;
      }
    }

    const top = line.match(/^([A-Za-z0-9_]+):\s*(.*)\s*$/);
    if (!top) continue;
    const key = top[1];
    const value = unquote(top[2] ?? "");
    if (key === "version") result.version = value;
    else if (key === "path") result.path = value;
    else if (key === "sha512") result.sha512 = value;
    else if (key === "releaseDate") result.releaseDate = value;
  }
  if (current) result.files.push(current);
  return result;
}

function unquote(value) {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function serialize(doc) {
  const lines = [];
  if (doc.version) lines.push(`version: ${doc.version}`);
  lines.push("files:");
  for (const file of doc.files) {
    lines.push(`  - url: ${file.url}`);
    if (file.sha512) lines.push(`    sha512: ${file.sha512}`);
    if (file.size !== undefined && Number.isFinite(file.size)) {
      lines.push(`    size: ${file.size}`);
    }
  }
  const primary = doc.files[0];
  lines.push(`path: ${doc.path ?? primary?.url ?? ""}`);
  if (doc.sha512 ?? primary?.sha512) lines.push(`sha512: ${doc.sha512 ?? primary.sha512}`);
  if (doc.releaseDate) lines.push(`releaseDate: '${doc.releaseDate.replace(/^'|'$/g, "")}'`);
  lines.push("");
  return lines.join("\n");
}

if (!existsSync(inputDir)) {
  console.error(`Input dir not found: ${inputDir}`);
  process.exit(1);
}

const candidates = readdirSync(inputDir)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .filter((name) => name.includes("latest-mac") || name === "latest-mac.yml")
  .map((name) => join(inputDir, name));

if (candidates.length === 0) {
  console.error(`No latest-mac*.yml under ${inputDir}`);
  process.exit(1);
}

const filesByUrl = new Map();
let version;
let releaseDate;
let path;
let sha512;

for (const file of candidates) {
  const parsed = parseSimpleYaml(readFileSync(file, "utf8"));
  if (parsed.version) version = parsed.version;
  if (parsed.releaseDate) releaseDate = parsed.releaseDate;
  if (parsed.path) path = parsed.path;
  if (parsed.sha512) sha512 = parsed.sha512;
  for (const entry of parsed.files) {
    if (!entry.url) continue;
    filesByUrl.set(entry.url, entry);
  }
  // Some yml only set path without files[] (older); promote path to a file entry.
  if (parsed.files.length === 0 && parsed.path) {
    filesByUrl.set(parsed.path, {
      url: parsed.path,
      sha512: parsed.sha512,
    });
  }
}

const files = [...filesByUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
if (files.length === 0) {
  console.error("No file entries found to merge");
  process.exit(1);
}

const merged = {
  version,
  files,
  path: path ?? files[0].url,
  sha512: sha512 ?? files[0].sha512,
  releaseDate,
};

writeFileSync(outFile, serialize(merged), "utf8");
console.log(`Merged ${candidates.length} yml → ${outFile} (${files.length} files)`);
