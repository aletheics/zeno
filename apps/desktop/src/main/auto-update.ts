/**
 * Desktop auto-update via electron-updater + GitHub Releases.
 * Checks once after launch when packaged; manual check from Settings.
 *
 * Feed config lives in Resources/app-update.yml (written by electron-builder
 * PublishManager for installer targets, and always by scripts/after-pack.mjs
 * so directory packs also work).
 *
 * macOS: electron-updater only checks + downloads the zip (sha512 verified).
 * Install replaces the .app without Squirrel.Mac so unsigned / ad-hoc builds work
 * (see mac-install-update.ts). Windows / Linux keep electron-updater installers.
 */
import type { AppUpdateStatus, AppUpdateState } from "@zeno/contracts";
import { app } from "electron";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { installMacUpdateFromZip, resolveMacAppBundlePath } from "./mac-install-update.ts";

export type AutoUpdateBroadcast = (status: AppUpdateStatus) => void;

export type AutoUpdateController = {
  getStatus(): AppUpdateStatus;
  checkForUpdates(): Promise<AppUpdateStatus>;
  downloadUpdate(): Promise<AppUpdateStatus>;
  quitAndInstall(): void;
  dispose(): void;
};

/** GitHub Releases feed — must match electron-builder.yml `publish`. */
export const DEFAULT_UPDATE_FEED = {
  provider: "github" as const,
  owner: "num-scope",
  repo: "zeno",
  releaseType: "release" as const,
};

type UpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  logger: typeof console | null;
  checkForUpdates(): Promise<{ updateInfo: { version: string } } | null>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeAllListeners(event?: string): void;
  /** Override / supply feed when app-update.yml is missing or wrong. */
  setFeedURL?(options: typeof DEFAULT_UPDATE_FEED): void;
};

type StatusFields = {
  state: AppUpdateState;
  availableVersion?: string;
  percent?: number;
  error?: string;
  checkedAt?: string;
};

const nodeRequire = createRequire(import.meta.url);

function snapshotStatus(
  fields: StatusFields,
  currentVersion: string,
  canCheck: boolean,
): AppUpdateStatus {
  return buildAppUpdateStatus({
    state: fields.state,
    currentVersion,
    canCheck,
    ...(fields.availableVersion !== undefined ? { availableVersion: fields.availableVersion } : {}),
    ...(fields.percent !== undefined ? { percent: fields.percent } : {}),
    ...(fields.error !== undefined ? { error: fields.error } : {}),
    ...(fields.checkedAt !== undefined ? { checkedAt: fields.checkedAt } : {}),
  });
}

/**
 * Wire electron-updater. No-ops (except status) when not packaged.
 * `autoUpdater` is loaded lazily so unit tests and unpackaged runs avoid side effects.
 */
export function createAutoUpdateController(options: {
  broadcast: AutoUpdateBroadcast;
  /** Startup delay before the one automatic check (ms). */
  startupDelayMs?: number;
  /** Injected for tests. */
  loadUpdater?: () => UpdaterLike | null;
  /** Injected for tests. */
  isPackaged?: boolean;
  /** Injected for tests. */
  getVersion?: () => string;
  /** Injected for platform-specific install path tests. */
  platform?: NodeJS.Platform;
  /** Injected for mac install tests. */
  installMacUpdate?: (zipPath: string) => Promise<void>;
  /** Injected for mac install tests. */
  getExecPath?: () => string;
  /** Called after a successful mac install before process exit (tests). */
  relaunchApp?: () => void;
}): AutoUpdateController {
  const isPackaged = options.isPackaged ?? app.isPackaged;
  const getVersion = options.getVersion ?? (() => app.getVersion());
  const platform = options.platform ?? process.platform;
  const startupDelayMs = options.startupDelayMs ?? 8_000;
  const isDarwin = platform === "darwin";

  let status: AppUpdateStatus = snapshotStatus({ state: "idle" }, getVersion(), isPackaged);
  let disposed = false;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let updater: UpdaterLike | null = null;
  let listenersAttached = false;
  /** Absolute path to the downloaded mac zip (from update-downloaded). */
  let downloadedFile: string | undefined;
  let macInstallInFlight = false;

  function setStatus(fields: StatusFields): AppUpdateStatus {
    status = snapshotStatus(fields, getVersion(), isPackaged);
    if (!disposed) options.broadcast(status);
    return status;
  }

  /** Fresh read — avoids TS control-flow narrowing after async / setStatus. */
  function currentState(): AppUpdateState {
    return status.state;
  }

  function missingUpdateConfigError(): string | null {
    // electron-updater reads process.resourcesPath/app-update.yml for downloads.
    // setFeedURL alone is not enough — getOrCreateDownloadHelper still loads the file.
    if (!isPackaged) return null;
    // Injected updaters (unit tests) do not exercise the on-disk config path.
    if (options.loadUpdater) return null;
    const resourcesPath =
      typeof process.resourcesPath === "string" && process.resourcesPath.length > 0
        ? process.resourcesPath
        : null;
    if (!resourcesPath) return null;
    const configPath = join(resourcesPath, "app-update.yml");
    if (existsSync(configPath)) return null;
    return (
      `Missing app-update.yml (expected at ${configPath}). ` +
      `This usually means the app was installed from a directory pack ` +
      `instead of a GitHub Release installer. Reinstall from the official release.`
    );
  }

  function load(): UpdaterLike | null {
    if (!isPackaged) return null;
    if (updater) return updater;
    if (options.loadUpdater) {
      updater = options.loadUpdater();
      configureFeed(updater);
      return updater;
    }
    try {
      // electron-updater is CJS; createRequire works from ESM main.
      const mod = nodeRequire("electron-updater") as {
        autoUpdater?: UpdaterLike;
        default?: { autoUpdater?: UpdaterLike };
      };
      updater = mod.autoUpdater ?? mod.default?.autoUpdater ?? null;
      configureFeed(updater);
      return updater;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus({ state: "error", error: message });
      return null;
    }
  }

  function configureFeed(instance: UpdaterLike | null): void {
    if (!instance?.setFeedURL) return;
    try {
      // Prefer explicit feed so check works even if app-update.yml is incomplete.
      // Download still requires the on-disk yml (see missingUpdateConfigError).
      instance.setFeedURL(DEFAULT_UPDATE_FEED);
    } catch (error) {
      console.warn("[zeno] setFeedURL failed:", error);
    }
  }

  function attachListeners(instance: UpdaterLike): void {
    if (listenersAttached) return;
    listenersAttached = true;
    instance.autoDownload = false;
    // macOS: never hand the zip to Squirrel.Mac (rejects unsigned/ad-hoc apps).
    // Windows/Linux still auto-install on quit after download.
    instance.autoInstallOnAppQuit = !isDarwin;
    instance.allowPrerelease = false;
    instance.logger = console;

    instance.on("checking-for-update", () => {
      setStatus({ state: "checking" });
    });
    instance.on("update-available", (info: unknown) => {
      const version =
        info && typeof info === "object" && "version" in info
          ? String((info as { version: unknown }).version)
          : undefined;
      setStatus({
        state: "available",
        ...(version ? { availableVersion: version } : {}),
        checkedAt: new Date().toISOString(),
      });
    });
    instance.on("update-not-available", () => {
      setStatus({
        state: "not-available",
        checkedAt: new Date().toISOString(),
      });
    });
    instance.on("download-progress", (progress: unknown) => {
      const raw =
        progress && typeof progress === "object" && "percent" in progress
          ? Number((progress as { percent: unknown }).percent)
          : Number.NaN;
      setStatus({
        state: "downloading",
        ...(status.availableVersion ? { availableVersion: status.availableVersion } : {}),
        ...(Number.isFinite(raw) ? { percent: raw } : {}),
      });
    });
    instance.on("update-downloaded", (info: unknown) => {
      const version =
        info && typeof info === "object" && "version" in info
          ? String((info as { version: unknown }).version)
          : status.availableVersion;
      if (info && typeof info === "object" && "downloadedFile" in info) {
        const path = String((info as { downloadedFile: unknown }).downloadedFile);
        if (path) downloadedFile = path;
      }
      setStatus({
        state: "downloaded",
        ...(version ? { availableVersion: version } : {}),
        percent: 100,
      });
    });
    instance.on("error", (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setStatus({
        state: "error",
        error: message,
        ...(status.availableVersion ? { availableVersion: status.availableVersion } : {}),
      });
    });
  }

  async function checkForUpdates(): Promise<AppUpdateStatus> {
    if (!isPackaged) {
      return setStatus({
        state: "not-available",
        checkedAt: new Date().toISOString(),
      });
    }
    const configError = missingUpdateConfigError();
    if (configError) {
      return setStatus({ state: "error", error: configError, checkedAt: new Date().toISOString() });
    }
    const instance = load();
    if (!instance) {
      return setStatus({
        state: "error",
        error: status.error ?? "Auto-updater is unavailable",
      });
    }
    attachListeners(instance);
    try {
      setStatus({ state: "checking" });
      const result = await instance.checkForUpdates();
      // Event handlers usually update state; keep a fallback if none fired.
      if (status.state === "checking" && result?.updateInfo?.version) {
        return setStatus({
          state: "available",
          availableVersion: result.updateInfo.version,
          checkedAt: new Date().toISOString(),
        });
      }
      if (status.state === "checking") {
        return setStatus({
          state: "not-available",
          checkedAt: new Date().toISOString(),
        });
      }
      return status;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return setStatus({ state: "error", error: message });
    }
  }

  async function downloadUpdate(): Promise<AppUpdateStatus> {
    if (!isPackaged) {
      return setStatus({
        state: "error",
        error: "Updates are only available in packaged builds",
      });
    }
    // Already busy — ignore re-entrant clicks from the UI.
    if (
      currentState() === "downloading" ||
      currentState() === "installing" ||
      currentState() === "downloaded"
    ) {
      return status;
    }

    const configError = missingUpdateConfigError();
    if (configError) {
      return setStatus({ state: "error", error: configError });
    }
    const instance = load();
    if (!instance) {
      return setStatus({
        state: "error",
        error: status.error ?? "Auto-updater is unavailable",
      });
    }
    attachListeners(instance);
    // Allow retry from error; otherwise require an available update.
    if (currentState() !== "available" && currentState() !== "error") {
      await checkForUpdates();
    }
    if (
      currentState() === "downloaded" ||
      currentState() === "downloading" ||
      currentState() === "installing"
    ) {
      return status;
    }
    if (currentState() !== "available" && currentState() !== "error") {
      return status;
    }
    try {
      setStatus({
        state: "downloading",
        percent: status.percent ?? 0,
        ...(status.availableVersion ? { availableVersion: status.availableVersion } : {}),
      });
      await instance.downloadUpdate();
      // On darwin autoInstallOnAppQuit=false so download resolves after zip is on disk
      // (no Squirrel.Mac). Mark downloaded if events did not already.
      if (currentState() === "downloading") {
        return setStatus({
          state: "downloaded",
          percent: 100,
          ...(status.availableVersion ? { availableVersion: status.availableVersion } : {}),
        });
      }
      return status;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return setStatus({
        state: "error",
        error: message,
        ...(status.availableVersion ? { availableVersion: status.availableVersion } : {}),
      });
    }
  }

  async function installMacAndRelaunch(): Promise<void> {
    if (macInstallInFlight) return;
    macInstallInFlight = true;
    try {
      const zipPath = downloadedFile;
      if (!zipPath || !existsSync(zipPath)) {
        throw new Error(
          "macOS update archive is missing. Download the update again, then restart to install.",
        );
      }
      const install =
        options.installMacUpdate ??
        ((path: string) =>
          installMacUpdateFromZip({
            zipPath: path,
            appBundlePath: resolveMacAppBundlePath(options.getExecPath?.() ?? process.execPath),
          }));
      await install(zipPath);
      if (options.relaunchApp) {
        options.relaunchApp();
        return;
      }
      // Relaunch then exit; before-quit must not cancel via preventDefault during install exit.
      app.relaunch();
      app.exit(0);
    } catch (error) {
      macInstallInFlight = false;
      const message = error instanceof Error ? error.message : String(error);
      setStatus({
        state: "error",
        error: message,
        ...(status.availableVersion ? { availableVersion: status.availableVersion } : {}),
      });
    }
  }

  function quitAndInstall(): void {
    if (!isPackaged) return;
    // Ignore double-clicks while install / relaunch is already underway.
    if (currentState() === "installing" || macInstallInFlight) return;
    setStatus({
      state: "installing",
      percent: 100,
      ...(status.availableVersion ? { availableVersion: status.availableVersion } : {}),
    });
    if (isDarwin) {
      void installMacAndRelaunch();
      return;
    }
    const instance = load();
    if (!instance) {
      setStatus({
        state: "error",
        error: "Auto-updater is unavailable",
        ...(status.availableVersion ? { availableVersion: status.availableVersion } : {}),
      });
      return;
    }
    // isSilent=false, isForceRunAfter=true
    instance.quitAndInstall(false, true);
  }

  if (isPackaged) {
    startupTimer = setTimeout(() => {
      void checkForUpdates().catch((error) => {
        console.warn("[zeno] startup update check failed:", error);
      });
    }, startupDelayMs);
  }

  return {
    getStatus: () =>
      snapshotStatus(
        {
          state: status.state,
          ...(status.availableVersion !== undefined
            ? { availableVersion: status.availableVersion }
            : {}),
          ...(status.percent !== undefined ? { percent: status.percent } : {}),
          ...(status.error !== undefined ? { error: status.error } : {}),
          ...(status.checkedAt !== undefined ? { checkedAt: status.checkedAt } : {}),
        },
        getVersion(),
        isPackaged,
      ),
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    dispose: () => {
      disposed = true;
      if (startupTimer) clearTimeout(startupTimer);
      startupTimer = undefined;
      try {
        updater?.removeAllListeners();
      } catch {
        // ignore
      }
    },
  };
}

/** Test helper: build a status snapshot without Electron app. */
export function buildAppUpdateStatus(input: {
  state: AppUpdateState;
  currentVersion: string;
  canCheck: boolean;
  availableVersion?: string;
  percent?: number;
  error?: string;
  checkedAt?: string;
}): AppUpdateStatus {
  return {
    state: input.state,
    currentVersion: input.currentVersion,
    canCheck: input.canCheck,
    ...(input.availableVersion !== undefined ? { availableVersion: input.availableVersion } : {}),
    ...(input.percent !== undefined ? { percent: input.percent } : {}),
    ...(input.error !== undefined ? { error: input.error } : {}),
    ...(input.checkedAt !== undefined ? { checkedAt: input.checkedAt } : {}),
  };
}
