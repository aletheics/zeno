/**
 * Unit test for merge-latest-mac-yml.mjs (no vitest at root).
 * Run: node scripts/merge-latest-mac-yml.test.mjs
 * Or:  pnpm test:release-assets
 */
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "scripts/merge-latest-mac-yml.mjs");
const dir = mkdtempSync(join(tmpdir(), "zeno-merge-mac-yml-"));

try {
  writeFileSync(
    join(dir, "latest-mac-arm64.yml"),
    [
      "version: 0.4.0",
      "files:",
      "  - url: Zeno-0.4.0-mac-arm64.zip",
      "    sha512: aaa",
      "    size: 11",
      "path: Zeno-0.4.0-mac-arm64.zip",
      "sha512: aaa",
      "releaseDate: '2026-07-27T00:00:00.000Z'",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(dir, "latest-mac-x64.yml"),
    [
      "version: 0.4.0",
      "files:",
      "  - url: Zeno-0.4.0-mac-x64.zip",
      "    sha512: bbb",
      "    size: 22",
      "path: Zeno-0.4.0-mac-x64.zip",
      "sha512: bbb",
      "releaseDate: '2026-07-27T00:00:00.000Z'",
      "",
    ].join("\n"),
    "utf8",
  );

  const out = join(dir, "latest-mac.yml");
  execFileSync(process.execPath, [script, dir, out], { stdio: "inherit" });
  const text = readFileSync(out, "utf8");
  if (!text.includes("Zeno-0.4.0-mac-arm64.zip")) throw new Error("missing arm64");
  if (!text.includes("Zeno-0.4.0-mac-x64.zip")) throw new Error("missing x64");
  if (!text.includes("version: 0.4.0")) throw new Error("missing version");
  console.log("ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
