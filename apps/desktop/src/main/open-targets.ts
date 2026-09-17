/**
 * Which apps can open a workspace, and their icons.
 *
 * Split out of `index.ts` (was ~444 lines of its own). Platform discovery is by design
 * a grab-bag of OS-specific probing: macOS resolves `.app` bundles and digs .icns out of
 * the asset catalog (nativeImage, `sips`, `qlmanage`, `plutil`), Windows uses `where.exe`
 * plus known install paths, Linux probes PATH with `which`.
 *
 * Icon resolution is best-effort: every failure path returns `undefined` and callers omit
 * the icon rather than failing the row, so one unreadable app can never blank the menu.
 */
import type { DetectedApp } from "@zeno/contracts";
import { app, nativeImage, type NativeImage } from "electron";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Resolve a macOS .app bundle path (Applications + System Utilities + ~/Applications). */
function resolveMacAppPath(appName: string): string | undefined {
  const names = [appName];
  // Common aliases
  if (appName === "iTerm") names.push("iTerm2");
  if (appName === "iTerm2") names.push("iTerm");
  const roots = [
    "/Applications",
    "/System/Applications",
    "/System/Applications/Utilities",
    join(homedir(), "Applications"),
  ];
  for (const root of roots) {
    for (const name of names) {
      const p = join(root, `${name}.app`);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

function isUsableIconDataUrl(data: string | undefined): data is string {
  // Reject empty / tiny payloads (broken extract) so UI can fall back to lucide icons.
  return Boolean(data && data.startsWith("data:image/") && data.length > 200);
}

function nativeImageToPngDataUrl(img: NativeImage): string | undefined {
  if (img.isEmpty()) return undefined;
  try {
    const size = img.getSize();
    if (!size.width || !size.height) return undefined;
    // Normalize chip size — some ICNS frames are huge / multi-resolution.
    let out = img;
    if (size.width > 64 || size.height > 64) {
      out = img.resize({ width: 64, height: 64, quality: "best" });
    } else if (size.width > 0 && size.width < 32) {
      out = img.resize({ width: 32, height: 32, quality: "best" });
    }
    const png = out.toPNG();
    if (!png?.length) {
      const url = out.toDataURL();
      return isUsableIconDataUrl(url) ? url : undefined;
    }
    const data = `data:image/png;base64,${png.toString("base64")}`;
    return isUsableIconDataUrl(data) ? data : undefined;
  } catch {
    return undefined;
  }
}

async function fileIconDataUrl(filePath: string): Promise<string | undefined> {
  try {
    // Prefer large size for crisp 20px chips after downscale.
    const img = await app.getFileIcon(filePath, { size: "large" });
    return nativeImageToPngDataUrl(img);
  } catch {
    return undefined;
  }
}

/** Convert .icns/.png via macOS `sips` — more reliable than nativeImage for some ICNS. */
async function sipsIconDataUrl(iconPath: string): Promise<string | undefined> {
  const out = join(tmpdir(), `zeno-icon-${randomUUID()}.png`);
  try {
    await execFileAsync("sips", ["-s", "format", "png", "-z", "64", "64", iconPath, "--out", out], {
      windowsHide: true,
      timeout: 4_000,
    });
    if (!existsSync(out)) return undefined;
    const buf = readFileSync(out);
    if (!buf.length) return undefined;
    const data = `data:image/png;base64,${buf.toString("base64")}`;
    return isUsableIconDataUrl(data) ? data : undefined;
  } catch {
    return undefined;
  } finally {
    try {
      unlinkSync(out);
    } catch {
      // ignore
    }
  }
}

/** Read CFBundleIconFile / CFBundleIconName from a macOS .app Info.plist. */
async function macBundleIconBaseName(appPath: string): Promise<string | undefined> {
  const plist = join(appPath, "Contents", "Info.plist");
  if (!existsSync(plist)) return undefined;
  for (const key of ["CFBundleIconFile", "CFBundleIconName"] as const) {
    try {
      const { stdout } = await execFileAsync("plutil", ["-extract", key, "raw", "-o", "-", plist], {
        windowsHide: true,
      });
      const name = stdout.trim();
      if (name) return name;
    } catch {
      // key missing
    }
  }
  return undefined;
}

function resolveMacIcnsPath(appPath: string, iconBase: string): string | undefined {
  const resources = join(appPath, "Contents", "Resources");
  const base = iconBase.replace(/\.icns$/i, "");
  const candidates = [
    join(resources, iconBase),
    join(resources, `${base}.icns`),
    join(resources, `${base}.png`),
    join(resources, `${base}.ico`),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

/** Prefer the largest .icns under Contents/Resources (real app art, not generic). */
function findLargestMacIcns(appPath: string): string | undefined {
  const resources = join(appPath, "Contents", "Resources");
  if (!existsSync(resources)) return undefined;
  let best: { path: string; size: number } | undefined;
  try {
    for (const name of readdirSync(resources)) {
      if (!name.toLowerCase().endsWith(".icns")) continue;
      const p = join(resources, name);
      try {
        const st = lstatSync(p);
        if (!st.isFile()) continue;
        if (!best || st.size > best.size) best = { path: p, size: st.size };
      } catch {
        // skip
      }
    }
  } catch {
    return undefined;
  }
  return best?.path;
}

/** Successful icon data URLs only — never cache failures forever. */
const macAppIconCache = new Map<string, string>();

/**
 * Quick Look thumbnail of the .app (works for asset-catalog icons that have no loose .icns).
 * Hard-capped: never block the env panel for seconds per app.
 */
async function qlmanageAppIconDataUrl(appPath: string): Promise<string | undefined> {
  const outDir = join(tmpdir(), "zeno-app-icons");
  try {
    mkdirSync(outDir, { recursive: true });
    await execFileAsync("qlmanage", ["-t", "-s", "64", "-o", outDir, appPath], {
      windowsHide: true,
      timeout: 2_500,
    });
    const expected = join(outDir, `${basename(appPath)}.png`);
    let pngPath = existsSync(expected) ? expected : undefined;
    if (!pngPath) {
      const stem = basename(appPath, ".app").toLowerCase();
      const hit = readdirSync(outDir).find(
        (f) => f.toLowerCase().includes(stem) && f.endsWith(".png"),
      );
      if (hit) pngPath = join(outDir, hit);
    }
    if (!pngPath || !existsSync(pngPath)) return undefined;
    // Prefer raw file bytes (reliable) over nativeImage re-encode.
    const buf = readFileSync(pngPath);
    if (!buf.length) return undefined;
    const data = `data:image/png;base64,${buf.toString("base64")}`;
    return isUsableIconDataUrl(data) ? data : undefined;
  } catch {
    return undefined;
  }
}

async function iconFromFilePath(iconPath: string): Promise<string | undefined> {
  // 1) Electron nativeImage
  const fromNi = nativeImageToPngDataUrl(nativeImage.createFromPath(iconPath));
  if (fromNi) return fromNi;
  // 2) sips re-encode (handles many ICNS cases nativeImage mishandles)
  return sipsIconDataUrl(iconPath);
}

/**
 * Real macOS app icons for "Open in…".
 * Order: ICNS/sips → getFileIcon(.app) → Quick Look.
 */
async function macAppIconDataUrl(appPath: string): Promise<string | undefined> {
  if (!appPath || !existsSync(appPath)) return undefined;
  const cached = macAppIconCache.get(appPath);
  if (cached) return cached;

  try {
    // 1) Info.plist → Resources icon file
    const iconBase = await macBundleIconBaseName(appPath);
    const fromPlist = iconBase ? resolveMacIcnsPath(appPath, iconBase) : undefined;
    if (fromPlist) {
      const data = await iconFromFilePath(fromPlist);
      if (data) {
        macAppIconCache.set(appPath, data);
        return data;
      }
    }

    // 2) Largest loose .icns (skip tiny utility icons when possible)
    const largest = findLargestMacIcns(appPath);
    if (largest && largest !== fromPlist) {
      const data = await iconFromFilePath(largest);
      if (data) {
        macAppIconCache.set(appPath, data);
        return data;
      }
    }

    // 3) OS icon for the .app bundle (correct for most modern apps)
    const fromOs = await fileIconDataUrl(appPath);
    if (fromOs) {
      macAppIconCache.set(appPath, fromOs);
      return fromOs;
    }

    // 4) Quick Look fallback
    const ql = await qlmanageAppIconDataUrl(appPath);
    if (ql) {
      macAppIconCache.set(appPath, ql);
      return ql;
    }
  } catch {
    // leave uncached so a later call can retry
  }
  return undefined;
}

async function listOpenTargets(cwd: string): Promise<DetectedApp[]> {
  const apps: DetectedApp[] = [];
  const push = (item: DetectedApp) => {
    if (!apps.some((a) => a.id === item.id)) apps.push(item);
  };

  if (process.platform === "darwin") {
    type Cand = {
      id: string;
      name: string;
      kind: DetectedApp["kind"];
      app: string;
      appPath: string;
    };
    const pending: Cand[] = [];

    const finderPath = resolveMacAppPath("Finder") ?? "/System/Library/CoreServices/Finder.app";
    if (existsSync(finderPath)) {
      pending.push({
        id: "finder",
        name: "Finder",
        kind: "finder",
        app: "Finder",
        appPath: finderPath,
      });
    }

    const candidates: Array<{
      id: string;
      name: string;
      kind: DetectedApp["kind"];
      app: string;
    }> = [
      { id: "cursor", name: "Cursor", kind: "ide", app: "Cursor" },
      { id: "vscode", name: "Visual Studio Code", kind: "ide", app: "Visual Studio Code" },
      {
        id: "vscode-insiders",
        name: "VS Code Insiders",
        kind: "ide",
        app: "Visual Studio Code - Insiders",
      },
      { id: "zed", name: "Zed", kind: "ide", app: "Zed" },
      { id: "webstorm", name: "WebStorm", kind: "ide", app: "WebStorm" },
      { id: "intellij", name: "IntelliJ IDEA", kind: "ide", app: "IntelliJ IDEA" },
      { id: "terminal", name: "Terminal", kind: "terminal", app: "Terminal" },
      { id: "iterm", name: "iTerm", kind: "terminal", app: "iTerm" },
      { id: "iterm2", name: "iTerm2", kind: "terminal", app: "iTerm2" },
      { id: "warp", name: "Warp", kind: "terminal", app: "Warp" },
      { id: "ghostty", name: "Ghostty", kind: "terminal", app: "Ghostty" },
      { id: "alacritty", name: "Alacritty", kind: "terminal", app: "Alacritty" },
      { id: "kitty", name: "Kitty", kind: "terminal", app: "kitty" },
      { id: "hyper", name: "Hyper", kind: "terminal", app: "Hyper" },
      { id: "wezterm", name: "WezTerm", kind: "terminal", app: "WezTerm" },
    ];

    const seenBundles = new Set<string>();
    for (const c of candidates) {
      const appPath = resolveMacAppPath(c.app);
      if (!appPath) continue;
      const bundleKey = appPath.replace(/\\/g, "/").toLowerCase();
      if (seenBundles.has(bundleKey)) continue;
      seenBundles.add(bundleKey);
      pending.push({ ...c, appPath });
    }

    // Resolve icons in parallel; isolate failures so one app cannot blank all icons.
    const resolved = await Promise.all(
      pending.map(async (c) => {
        let iconDataUrl: string | undefined;
        try {
          iconDataUrl = await macAppIconDataUrl(c.appPath);
        } catch {
          iconDataUrl = undefined;
        }
        const launchName = basename(c.appPath, ".app");
        const item: DetectedApp = {
          id: c.id,
          name: c.name === "iTerm2" || c.name === "iTerm" ? launchName : c.name,
          kind: c.kind,
          target: c.kind === "finder" ? "Finder" : launchName,
          ...(iconDataUrl ? { iconDataUrl } : {}),
        };
        return item;
      }),
    );
    for (const item of resolved) push(item);
  } else if (process.platform === "win32") {
    push({ id: "explorer", name: "Explorer", kind: "finder", target: "explorer" });
    // Only list apps that resolve on PATH or known install dirs (do not advertise missing IDEs).
    const winCandidates: Array<{
      id: string;
      name: string;
      kind: DetectedApp["kind"];
      target: string;
      /** Extra absolute paths to check when `where` fails (e.g. Cursor not on PATH). */
      extraPaths?: string[];
    }> = [
      {
        id: "cursor",
        name: "Cursor",
        kind: "ide",
        target: "cursor",
        extraPaths: [
          join(homedir(), "AppData", "Local", "Programs", "cursor", "Cursor.exe"),
          join(homedir(), "AppData", "Local", "cursor", "Cursor.exe"),
          "C:\\Program Files\\Cursor\\Cursor.exe",
        ],
      },
      {
        id: "vscode",
        name: "Visual Studio Code",
        kind: "ide",
        target: "code",
        extraPaths: [
          join(homedir(), "AppData", "Local", "Programs", "Microsoft VS Code", "Code.exe"),
          "C:\\Program Files\\Microsoft VS Code\\Code.exe",
          "C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd",
        ],
      },
      {
        id: "goland",
        name: "GoLand",
        kind: "ide",
        target: "goland",
        extraPaths: [
          join(homedir(), "AppData", "Local", "Programs", "GoLand", "bin", "goland64.exe"),
        ],
      },
      {
        id: "pycharm",
        name: "PyCharm",
        kind: "ide",
        target: "pycharm",
        extraPaths: [
          join(homedir(), "AppData", "Local", "Programs", "PyCharm", "bin", "pycharm64.exe"),
        ],
      },
      { id: "wt", name: "Windows Terminal", kind: "terminal", target: "wt" },
      { id: "cmd", name: "Command Prompt", kind: "terminal", target: "cmd" },
      { id: "powershell", name: "PowerShell", kind: "terminal", target: "powershell" },
    ];

    await Promise.all(
      winCandidates.map(async (c) => {
        let exe: string | undefined;
        try {
          const { stdout } = await execFileAsync("where.exe", [c.target], {
            windowsHide: true,
            timeout: 8_000,
            maxBuffer: 1024 * 1024,
          });
          exe = stdout
            .split(/\r?\n/)
            .map((s) => s.trim())
            .find((line) => line.length > 0 && existsSync(line));
        } catch {
          exe = undefined;
        }
        if (!exe) {
          exe = (c.extraPaths ?? []).find((p) => existsSync(p));
        }
        if (!exe) return; // not installed — omit from menu
        let iconDataUrl: string | undefined;
        try {
          iconDataUrl = await fileIconDataUrl(exe);
        } catch {
          iconDataUrl = undefined;
        }
        // Prefer resolved absolute path so open works even when the shim is not on PATH.
        push({
          id: c.id,
          name: c.name,
          kind: c.kind,
          target: exe,
          ...(iconDataUrl ? { iconDataUrl } : {}),
        });
      }),
    );
  } else {
    push({ id: "files", name: "Files", kind: "finder", target: "xdg-open" });
    await Promise.all(
      [
        { id: "cursor", name: "Cursor", kind: "ide" as const, target: "cursor" },
        { id: "vscode", name: "Visual Studio Code", kind: "ide" as const, target: "code" },
        {
          id: "terminal",
          name: "Terminal",
          kind: "terminal" as const,
          target: "x-terminal-emulator",
        },
        {
          id: "gnome-terminal",
          name: "GNOME Terminal",
          kind: "terminal" as const,
          target: "gnome-terminal",
        },
        { id: "konsole", name: "Konsole", kind: "terminal" as const, target: "konsole" },
      ].map(async (c) => {
        try {
          await execFileAsync("which", [c.target], { timeout: 5_000, maxBuffer: 256 * 1024 });
          push({ ...c });
        } catch {
          // not installed
        }
      }),
    );
  }

  void cwd;
  return apps;
}

export { listOpenTargets };
