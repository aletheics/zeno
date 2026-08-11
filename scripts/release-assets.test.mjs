/**
 * Unit tests for release-assets.mjs (no vitest at root).
 * Run: node scripts/release-assets.test.mjs
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isUsefulReleaseAsset,
  collectReleaseAssets,
  validatePublishAssets,
} from "./release-assets.mjs";

/** @type {string[]} */
const errors = [];

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

// --- isUsefulReleaseAsset ------------------------------------------------------

assert(isUsefulReleaseAsset("Zeno-0.5.0-win-x64.exe"), "keep exe");
assert(isUsefulReleaseAsset("Zeno-0.5.0-mac-arm64.dmg"), "keep dmg");
assert(isUsefulReleaseAsset("Zeno-0.5.0-mac-arm64.zip"), "keep zip");
assert(isUsefulReleaseAsset("Zeno-0.5.0-linux-x86_64.AppImage"), "keep AppImage");
assert(isUsefulReleaseAsset("Zeno-0.5.0-linux-amd64.deb"), "keep deb");
assert(isUsefulReleaseAsset("latest.yml"), "keep latest.yml");
assert(isUsefulReleaseAsset("latest-mac.yml"), "keep latest-mac.yml");
assert(isUsefulReleaseAsset("latest-linux.yml"), "keep latest-linux.yml");
assert(isUsefulReleaseAsset("latest-mac-arm64.yml"), "keep split mac feed");
assert(isUsefulReleaseAsset("Zeno-0.5.0-win-x64.exe.blockmap"), "keep blockmap");
assert(!isUsefulReleaseAsset("builder-debug.yml"), "drop builder-debug");

// --- collect: windows happy path -----------------------------------------------

{
  const root = mkdtempSync(join(tmpdir(), "zeno-rel-win-"));
  const out = join(root, "out");
  const art = join(root, "art");
  mkdirSync(out);
  writeFileSync(join(out, "Zeno-0.5.0-win-x64.exe"), "exe");
  writeFileSync(join(out, "latest.yml"), "version: 0.5.0\n");
  writeFileSync(join(out, "Zeno-0.5.0-win-x64.exe.blockmap"), "map");
  writeFileSync(join(out, "builder-debug.yml"), "debug");
  const result = collectReleaseAssets({
    outDir: out,
    artifactsDir: art,
    platform: "win",
  });
  assert(result.errors.length === 0, `win collect errors: ${result.errors.join("; ")}`);
  assert(existsSync(join(art, "Zeno-0.5.0-win-x64.exe")), "win exe copied");
  assert(existsSync(join(art, "latest.yml")), "win feed copied");
  assert(existsSync(join(art, "Zeno-0.5.0-win-x64.exe.blockmap")), "blockmap copied");
  assert(!existsSync(join(art, "builder-debug.yml")), "debug not copied");
  rmSync(root, { recursive: true, force: true });
}

// --- collect: mac requires zip + renames feed ----------------------------------

{
  const root = mkdtempSync(join(tmpdir(), "zeno-rel-mac-"));
  const out = join(root, "out");
  const art = join(root, "art");
  mkdirSync(out);
  writeFileSync(join(out, "Zeno-0.5.0-mac-arm64.dmg"), "dmg");
  writeFileSync(join(out, "Zeno-0.5.0-mac-arm64.zip"), "zip");
  writeFileSync(
    join(out, "latest-mac.yml"),
    "version: 0.5.0\nfiles:\n  - url: Zeno-0.5.0-mac-arm64.zip\n",
  );
  const result = collectReleaseAssets({
    outDir: out,
    artifactsDir: art,
    platform: "mac",
    arch: "arm64",
  });
  assert(result.errors.length === 0, `mac collect errors: ${result.errors.join("; ")}`);
  assert(existsSync(join(art, "latest-mac-arm64.yml")), "mac feed renamed with arch");
  assert(!existsSync(join(art, "latest-mac.yml")), "mac feed not left un-renamed");
  rmSync(root, { recursive: true, force: true });
}

// --- collect: mac without zip fails --------------------------------------------

{
  const root = mkdtempSync(join(tmpdir(), "zeno-rel-mac-bad-"));
  const out = join(root, "out");
  const art = join(root, "art");
  mkdirSync(out);
  writeFileSync(join(out, "Zeno-0.5.0-mac-arm64.dmg"), "dmg");
  writeFileSync(join(out, "latest-mac.yml"), "version: 0.5.0\n");
  const result = collectReleaseAssets({
    outDir: out,
    artifactsDir: art,
    platform: "mac",
    arch: "arm64",
  });
  assert(
    result.errors.some((e) => e.includes("*.zip")),
    "mac missing zip must fail",
  );
  rmSync(root, { recursive: true, force: true });
}

// --- validate-publish happy path -----------------------------------------------

{
  const root = mkdtempSync(join(tmpdir(), "zeno-rel-pub-"));
  writeFileSync(join(root, "Zeno-0.5.0-win-x64.exe"), "exe");
  writeFileSync(join(root, "latest.yml"), "version: 0.5.0\n");
  writeFileSync(join(root, "Zeno-0.5.0-mac-arm64.dmg"), "dmg");
  writeFileSync(join(root, "Zeno-0.5.0-mac-arm64.zip"), "zip");
  writeFileSync(join(root, "Zeno-0.5.0-mac-x64.dmg"), "dmg");
  writeFileSync(join(root, "Zeno-0.5.0-mac-x64.zip"), "zip");
  writeFileSync(
    join(root, "latest-mac.yml"),
    "version: 0.5.0\nfiles:\n  - url: Zeno-0.5.0-mac-arm64.zip\n  - url: Zeno-0.5.0-mac-x64.zip\n",
  );
  writeFileSync(join(root, "Zeno-0.5.0-linux-x86_64.AppImage"), "app");
  writeFileSync(join(root, "Zeno-0.5.0-linux-amd64.deb"), "deb");
  writeFileSync(join(root, "latest-linux.yml"), "version: 0.5.0\n");
  const result = validatePublishAssets(root);
  assert(result.ok, `publish validate errors: ${result.errors.join("; ")}`);
  rmSync(root, { recursive: true, force: true });
}

// --- validate-publish: dmg-only feed fails -------------------------------------

{
  const root = mkdtempSync(join(tmpdir(), "zeno-rel-pub-bad-"));
  writeFileSync(join(root, "Zeno-0.5.0-win-x64.exe"), "exe");
  writeFileSync(join(root, "latest.yml"), "v\n");
  writeFileSync(join(root, "Zeno-0.5.0-mac-arm64.dmg"), "dmg");
  writeFileSync(join(root, "Zeno-0.5.0-mac-arm64.zip"), "zip");
  writeFileSync(
    join(root, "latest-mac.yml"),
    "version: 0.5.0\nfiles:\n  - url: Zeno-0.5.0-mac-arm64.dmg\n",
  );
  writeFileSync(join(root, "Zeno-0.5.0-linux-x86_64.AppImage"), "app");
  writeFileSync(join(root, "latest-linux.yml"), "v\n");
  const result = validatePublishAssets(root);
  assert(!result.ok, "dmg-only mac feed must fail");
  assert(
    result.errors.some((e) => e.includes(".zip")),
    "error must mention zip reference",
  );
  rmSync(root, { recursive: true, force: true });
}

if (errors.length) {
  console.error("release-assets.test.mjs FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("release-assets.test.mjs: ok");
