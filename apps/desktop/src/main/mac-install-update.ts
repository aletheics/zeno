/**
 * Unsigned macOS auto-update installer (Tauri-style).
 *
 * electron-updater on macOS normally hands the zip to Squirrel.Mac, which
 * rejects ad-hoc / unsigned builds. We keep electron-updater for feed check +
 * zip download (sha512 verified), then replace the .app ourselves.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type MacInstallUpdateOptions = {
  /** Path to the downloaded electron-updater zip (Zeno-*.zip). */
  zipPath: string;
  /** Absolute path to the running app bundle (.../Zeno.app). */
  appBundlePath: string;
  /** Optional shell runner for tests. */
  run?: (cmd: string, args: string[]) => Promise<void>;
};

/**
 * Resolve the .app bundle from the main executable path.
 * `/Applications/Zeno.app/Contents/MacOS/Zeno` → `/Applications/Zeno.app`
 */
export function resolveMacAppBundlePath(execPath: string): string {
  return resolve(execPath, "../../..");
}

/** True when path is a directory whose name ends with `.app`. */
export function isAppBundlePath(path: string): boolean {
  try {
    return path.endsWith(".app") && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Locate a single `.app` under extractDir (root or one level deep).
 * electron-builder zip layout is `Zeno.app/...` at the archive root.
 */
export function findAppBundleInDir(extractDir: string): string | null {
  if (isAppBundlePath(extractDir)) return extractDir;
  let entries: string[];
  try {
    entries = readdirSync(extractDir);
  } catch {
    return null;
  }
  const apps = entries
    .map((name) => join(extractDir, name))
    .filter((path) => isAppBundlePath(path));
  if (apps.length === 1) return apps[0]!;
  if (apps.length > 1) {
    // Prefer the product name when multiple helpers exist at top level (unlikely in our zips).
    const zeno = apps.find((path) => basename(path).toLowerCase() === "zeno.app");
    return zeno ?? apps[0]!;
  }
  // One more level (some tools wrap in a folder).
  for (const name of entries) {
    const child = join(extractDir, name);
    try {
      if (!statSync(child).isDirectory()) continue;
    } catch {
      continue;
    }
    const nested = readdirSync(child)
      .map((n) => join(child, n))
      .filter((path) => isAppBundlePath(path));
    if (nested.length === 1) return nested[0]!;
    if (nested.length > 1) {
      const zeno = nested.find((path) => basename(path).toLowerCase() === "zeno.app");
      return zeno ?? nested[0]!;
    }
  }
  return null;
}

async function defaultRun(cmd: string, args: string[]): Promise<void> {
  await execFileAsync(cmd, args, {
    timeout: 10 * 60_000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

/**
 * Extract zip → find .app → swap over the running bundle (rename while live).
 * Clears Gatekeeper quarantine attrs on the new bundle (unsigned downloads).
 */
export async function installMacUpdateFromZip(options: MacInstallUpdateOptions): Promise<void> {
  const run = options.run ?? defaultRun;
  const zipPath = options.zipPath;
  const appBundlePath = resolve(options.appBundlePath);

  if (!existsSync(zipPath)) {
    throw new Error(`Update archive not found: ${zipPath}`);
  }
  if (!isAppBundlePath(appBundlePath)) {
    throw new Error(`Not a macOS app bundle: ${appBundlePath}`);
  }

  const parentDir = dirname(appBundlePath);
  const extractDir = mkdtempSync(join(tmpdir(), "zeno-update-extract-"));
  const backupDir = mkdtempSync(join(tmpdir(), "zeno-update-backup-"));
  const backupPath = join(backupDir, basename(appBundlePath));

  try {
    // ditto preserves permissions/xattrs better than unzip for .app bundles.
    await run("ditto", ["-x", "-k", zipPath, extractDir]);
    const newApp = findAppBundleInDir(extractDir);
    if (!newApp) {
      throw new Error(`No .app found inside update archive: ${zipPath}`);
    }

    try {
      renameSync(appBundlePath, backupPath);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : "";
      if (code === "EACCES" || code === "EPERM") {
        // Privileged install (e.g. root-owned /Applications).
        await run("osascript", [
          "-e",
          `do shell script "rm -rf ${shellSingleQuote(appBundlePath)} && mv -f ${shellSingleQuote(newApp)} ${shellSingleQuote(appBundlePath)} && xattr -cr ${shellSingleQuote(appBundlePath)}" with administrator privileges`,
        ]);
        return;
      }
      throw error;
    }

    try {
      renameSync(newApp, appBundlePath);
    } catch (error) {
      // Roll back if the new app cannot be moved into place.
      try {
        if (!existsSync(appBundlePath) && existsSync(backupPath)) {
          renameSync(backupPath, appBundlePath);
        }
      } catch {
        // ignore secondary failure
      }
      throw error;
    }

    // Drop com.apple.quarantine so Gatekeeper does not treat the replaced app as damaged.
    try {
      await run("xattr", ["-cr", appBundlePath]);
    } catch {
      // Non-fatal: app still launches after manual xattr if needed.
    }

    // Best-effort cleanup of backup; keep extract dir cleanup in finally.
    try {
      rmSync(backupDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  } finally {
    try {
      rmSync(extractDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    // If backup still exists (failed mid-way after successful swap is rare), leave it for recovery.
    if (existsSync(backupPath) && existsSync(appBundlePath)) {
      try {
        rmSync(backupDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }

  // Touch parent so Launch Services refreshes the icon/version.
  try {
    await run("touch", [appBundlePath]);
    await run("touch", [parentDir]);
  } catch {
    // ignore
  }
}

function shellSingleQuote(value: string): string {
  // Safe for embedding in a single-quoted sh string inside AppleScript.
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
