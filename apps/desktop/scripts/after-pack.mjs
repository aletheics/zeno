/**
 * electron-builder afterPack:
 * 1) restore execute bits on native helpers (node-pty spawn-helper)
 * 2) ensure app-update.yml is present for electron-updater
 *
 * PublishManager only writes app-update.yml when targets include dmg/zip/nsis/etc.
 * `electron-builder --dir` skips that path, so directory packs would hit:
 *   ENOENT .../Resources/app-update.yml
 */
import { chmodSync, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Build the YAML electron-updater expects under Resources/app-update.yml.
 * Mirrors app-builder-lib PublishManager.getAppUpdatePublishConfiguration.
 *
 * @param {{
 *   provider?: string,
 *   owner?: string,
 *   repo?: string,
 *   releaseType?: string,
 *   url?: string,
 *   channel?: string,
 *   updaterCacheDirName?: string,
 *   [key: string]: unknown,
 * }} publish
 * @param {string} updaterCacheDirName
 * @returns {string}
 */
export function serializeAppUpdateYml(publish, updaterCacheDirName) {
  const lines = [];
  // Stable key order matching electron-builder output for easier diffs.
  if (publish.owner != null) lines.push(`owner: ${yamlScalar(publish.owner)}`);
  if (publish.repo != null) lines.push(`repo: ${yamlScalar(publish.repo)}`);
  if (publish.provider != null) lines.push(`provider: ${yamlScalar(publish.provider)}`);
  if (publish.releaseType != null) lines.push(`releaseType: ${yamlScalar(publish.releaseType)}`);
  if (publish.url != null) lines.push(`url: ${yamlScalar(publish.url)}`);
  if (publish.channel != null) lines.push(`channel: ${yamlScalar(publish.channel)}`);
  lines.push(`updaterCacheDirName: ${yamlScalar(updaterCacheDirName)}`);
  return `${lines.join("\n")}\n`;
}

/**
 * @param {string | number | boolean} value
 * @returns {string}
 */
function yamlScalar(value) {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const text = String(value);
  // Quote when needed (e.g. @pixdesktop-updater).
  if (/[:#{}[\],&*?|>!%@`'"]/.test(text) || text === "" || /^\s|\s$/.test(text)) {
    return JSON.stringify(text);
  }
  return text;
}

/**
 * Resolve resources dir for the packed app layout.
 * @param {import('electron-builder').AfterPackContext} context
 * @returns {string}
 */
export function resolveResourcesDir(context) {
  if (context.electronPlatformName === "darwin") {
    const appName = context.packager.appInfo.productFilename;
    return join(context.appOutDir, `${appName}.app`, "Contents", "Resources");
  }
  return join(context.appOutDir, "resources");
}

/**
 * Always embed app-update.yml so electron-updater can resolve the feed.
 * Safe to re-run: overwrites with the same publish config used for installers.
 *
 * @param {import('electron-builder').AfterPackContext} context
 * @returns {boolean} true when written
 */
export function writeAppUpdateYml(context) {
  const publishRaw = context.packager?.config?.publish;
  const publish = Array.isArray(publishRaw) ? publishRaw[0] : publishRaw;
  if (publish == null || typeof publish !== "object") {
    console.warn("[zeno afterPack] skip app-update.yml: no publish config");
    return false;
  }
  if (typeof publish.provider !== "string" || publish.provider.length === 0) {
    console.warn("[zeno afterPack] skip app-update.yml: publish.provider missing");
    return false;
  }

  const resourcesDir = resolveResourcesDir(context);
  if (!existsSync(resourcesDir)) {
    console.warn(`[zeno afterPack] skip app-update.yml: resources dir missing (${resourcesDir})`);
    return false;
  }

  const updaterCacheDirName =
    context.packager?.appInfo?.updaterCacheDirName ??
    `${context.packager?.appInfo?.name ?? "zeno"}-updater`;

  const dest = join(resourcesDir, "app-update.yml");
  writeFileSync(dest, serializeAppUpdateYml(publish, updaterCacheDirName), "utf8");
  console.log(`[zeno afterPack] wrote ${dest}`);
  return true;
}

/**
 * @param {import('electron-builder').AfterPackContext} context
 */
export default async function afterPack(context) {
  const roots = [];
  if (context.electronPlatformName === "darwin") {
    const appName = context.packager.appInfo.productFilename;
    roots.push(join(context.appOutDir, `${appName}.app`, "Contents", "Resources"));
  } else {
    roots.push(join(context.appOutDir, "resources"));
    roots.push(context.appOutDir);
  }

  let fixed = 0;
  let runtimeFixed = 0;
  for (const root of roots) {
    if (!existsSync(root)) continue;
    fixed += chmodSpawnHelpers(root);
    runtimeFixed += chmodRuntimeBins(join(root, "runtimes"));
  }
  if (fixed > 0) {
    console.log(`[zeno afterPack] chmod +x on ${fixed} spawn-helper file(s)`);
  }
  if (runtimeFixed > 0) {
    console.log(`[zeno afterPack] chmod +x on ${runtimeFixed} bundled runtime bin(s)`);
  }

  // Clear quarantine on mac so Gatekeeper does not block first terminal spawn.
  if (context.electronPlatformName === "darwin") {
    for (const root of roots) {
      const runtimes = join(root, "runtimes");
      if (!existsSync(runtimes)) continue;
      try {
        const { execFileSync } = await import("node:child_process");
        execFileSync("xattr", ["-cr", runtimes], { stdio: "ignore" });
        console.log(`[zeno afterPack] xattr -cr ${runtimes}`);
      } catch {
        // xattr may be missing in some CI images; non-fatal.
      }
    }
  }

  writeAppUpdateYml(context);
}

/**
 * Ensure bundled Node/Python binaries are executable after pack.
 * @param {string} runtimesDir
 * @returns {number}
 */
function chmodRuntimeBins(runtimesDir) {
  if (!existsSync(runtimesDir)) return 0;
  let fixed = 0;
  /** @type {string[]} */
  const stack = [runtimesDir];
  const binNames = new Set(["node", "npm", "npx", "python", "python3", "node.exe", "python.exe"]);
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
        stack.push(full);
        continue;
      }
      if (!binNames.has(entry.name) && !entry.name.startsWith("python3.")) continue;
      try {
        const mode = statSync(full).mode;
        if ((mode & 0o111) === 0) {
          chmodSync(full, mode | 0o755);
          fixed += 1;
        }
      } catch {
        // ignore
      }
    }
  }
  return fixed;
}

/**
 * @param {string} dir
 * @returns {number}
 */
function chmodSpawnHelpers(dir) {
  let fixed = 0;
  /** @type {string[]} */
  const stack = [dir];
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
        stack.push(full);
        continue;
      }
      if (entry.name !== "spawn-helper") continue;
      try {
        const mode = statSync(full).mode;
        if ((mode & 0o111) === 0) {
          chmodSync(full, mode | 0o755);
          fixed += 1;
        }
      } catch {
        // ignore unreadable
      }
    }
  }
  return fixed;
}
