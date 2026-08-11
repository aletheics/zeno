import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2]?.trim();
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: pnpm version:set <semver>");
  console.error("Example: pnpm version:set 0.1.0");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const desktopPackagePath = join(root, "apps", "desktop", "package.json");
const pkg = JSON.parse(readFileSync(desktopPackagePath, "utf8"));
const previous = pkg.version;
pkg.version = version;
writeFileSync(desktopPackagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

console.log(`@zeno/desktop ${previous} -> ${version}`);
console.log(`Next: commit, then tag and push:`);
console.log(`  git tag v${version}`);
console.log(`  git push origin v${version}`);
