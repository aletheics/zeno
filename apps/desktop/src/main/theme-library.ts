import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { nativeImage } from "electron";
import type {
  ThemeLibrarySnapshot,
  ThemeSkinConfig,
  ThemeSkinRecord,
  ThemeSkinVariant,
} from "@zeno/contracts";
import { validateThemeCustomCss } from "../shared/theme-css.ts";

export const BUILTIN_THEME_SKIN_IDS = ["miku-stage", "zhang-ruonan"] as const;
/** Selects the original shell without loading a skin configuration. */
export const DEFAULT_THEME_SELECTION_ID = "default";

const BUILTIN_IDS = new Set<string>(BUILTIN_THEME_SKIN_IDS);
const STORAGE_VERSION = 1;
const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_BACKGROUND_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 80_000_000;
const MAX_CSS_VALUE_LENGTH = 1_000;
const SKIN_ID_PATTERN = /^skin-[a-f0-9-]{36}$/;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const CSS_VALUE_CHARACTER_PATTERN = /^[#(),.%/\s+a-z0-9-]+$/i;
const CSS_FUNCTION_NAMES = new Set([
  "linear-gradient",
  "radial-gradient",
  "conic-gradient",
  "repeating-linear-gradient",
  "repeating-radial-gradient",
  "repeating-conic-gradient",
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
  "color-mix",
  "var",
  "calc",
  "min",
  "max",
  "clamp",
]);
const GRADIENT_PATTERN = /^(?:repeating-)?(?:linear|radial|conic)-gradient\(/i;
const COLOR_FUNCTION_PATTERN = /^(?:color|hsl|hwb|lab|lch|oklab|oklch|rgb)a?\(/i;
const COLOR_KEYS = [
  "background",
  "panel",
  "panelAlt",
  "accent",
  "accentAlt",
  "secondary",
  "highlight",
  "text",
  "muted",
  "line",
] as const;
const COLOR_KEY_SET = new Set<string>(COLOR_KEYS);
const THEME_TOKEN_CSS_VARIABLES = {
  background: "--background",
  foreground: "--foreground",
  surfacePanel: "--surface-panel",
  surfaceMuted: "--surface-muted",
  surfaceSoft: "--surface-soft",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  hoverFill: "--hover-fill",
  hoverFillForeground: "--hover-fill-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  border: "--border",
  borderSubtle: "--border-subtle",
  divider: "--divider",
  input: "--input",
  ring: "--ring",
  link: "--link",
  switchOn: "--switch-on",
  sidebar: "--sidebar",
  sidebarForeground: "--sidebar-foreground",
  sidebarPrimary: "--sidebar-primary",
  sidebarPrimaryForeground: "--sidebar-primary-foreground",
  sidebarBorder: "--sidebar-border",
  sidebarRing: "--sidebar-ring",
  composerBorder: "--composer-border",
  composerProtrusion: "--composer-protrusion",
  userBubble: "--user-bubble",
  userBubbleForeground: "--user-bubble-fg",
  codeBg: "--code-bg",
  codeFg: "--code-fg",
} as const;
const THEME_TOKEN_KEYS = new Set([
  ...Object.keys(THEME_TOKEN_CSS_VARIABLES),
  ...Object.values(THEME_TOKEN_CSS_VARIABLES),
]);

type DiskThemeSkinRecord = Omit<ThemeSkinRecord, "backgroundUrl"> & {
  backgroundFile?: string;
};

type DiskThemeLibrary = {
  version: number;
  activeId: string;
  skins: DiskThemeSkinRecord[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || hasControlCharacter(normalized)) {
    return undefined;
  }
  return normalized;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function boundedNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

function numberField(
  source: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): Record<string, number> {
  const value = boundedNumber(source[key], min, max);
  return value === undefined ? {} : { [key]: value };
}

function hasSafeCssFunctions(value: string): boolean {
  let depth = 0;
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  if (depth !== 0) return false;

  for (const match of value.matchAll(/([a-z][a-z0-9-]*)\(/gi)) {
    if (!CSS_FUNCTION_NAMES.has(match[1]!.toLowerCase())) return false;
  }
  return true;
}

function safeCssValue(value: unknown): string | undefined {
  const normalized = text(value, MAX_CSS_VALUE_LENGTH);
  if (!normalized || /[;{}<>\n\r]/.test(normalized)) return undefined;
  if (/\b(?:url|expression)\s*\(/i.test(normalized)) return undefined;
  return CSS_VALUE_CHARACTER_PATTERN.test(normalized) && hasSafeCssFunctions(normalized)
    ? normalized
    : undefined;
}

function safeBackground(value: unknown): string | undefined {
  const background = safeCssValue(value);
  if (!background) return undefined;
  if (
    GRADIENT_PATTERN.test(background) ||
    COLOR_FUNCTION_PATTERN.test(background) ||
    background.startsWith("var(") ||
    !background.includes("(")
  ) {
    return background;
  }
  return undefined;
}

function cssFields(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
  label: string,
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`Theme ${label} must be an object`);
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!allowedKeys.has(key)) throw new Error(`Unsupported theme ${label}: ${key}`);
    const next = safeCssValue(raw);
    if (!next) throw new Error(`Invalid value for theme ${label}: ${key}`);
    result[key] = next;
  }
  return Object.keys(result).length ? result : undefined;
}

function normalizeVariant(value: unknown, label: string): ThemeSkinVariant | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${label} theme variant must be an object`);
  const background = value.background === undefined ? undefined : safeBackground(value.background);
  if (value.background !== undefined && !background) {
    throw new Error(`Invalid ${label} theme background`);
  }
  const colors = cssFields(value.colors, COLOR_KEY_SET, "color");
  const tokens = cssFields(value.tokens, THEME_TOKEN_KEYS, "token");
  if (!background && !colors && !tokens) return undefined;
  return {
    ...(background ? { background } : {}),
    ...(colors ? { colors: colors as NonNullable<ThemeSkinVariant["colors"]> } : {}),
    ...(tokens ? { tokens } : {}),
  };
}

function safeImageName(value: unknown): string | undefined {
  const name = text(value, 160);
  if (!name || basename(name) !== name || !IMAGE_EXTENSIONS.has(extname(name).toLowerCase())) {
    return undefined;
  }
  return name;
}

/** Convert both Zeno's original packs and Dream Skin-style theme.json files into safe storage data. */
export function normalizeThemeSkinConfig(raw: unknown): ThemeSkinConfig {
  if (!isRecord(raw)) throw new Error("Theme configuration must be an object");
  if (raw.version !== undefined && raw.version !== 1) {
    throw new Error("Unsupported theme pack version");
  }
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== 1) {
    throw new Error("Unsupported theme schema version");
  }
  if (raw.meta !== undefined && !isRecord(raw.meta)) {
    throw new Error("Theme metadata must be an object");
  }
  const meta = isRecord(raw.meta) ? raw.meta : raw;
  const name = text(meta.name, 80) ?? "Imported skin";
  const description = text(meta.description, 280);
  const appearance = raw.appearance;
  const image = raw.image === undefined ? undefined : safeImageName(raw.image);
  if (raw.image !== undefined && !image) {
    throw new Error("Theme image must be a local PNG, JPEG, or WebP file name");
  }
  const colors = cssFields(raw.colors, COLOR_KEY_SET, "color") as ThemeSkinConfig["colors"];
  const shared = normalizeVariant(
    raw.background !== undefined || raw.tokens !== undefined
      ? { background: raw.background, tokens: raw.tokens }
      : undefined,
    "shared",
  );
  const light = normalizeVariant(raw.light, "light") ?? shared;
  const dark = normalizeVariant(raw.dark, "dark") ?? shared;
  if (raw.art !== undefined && !isRecord(raw.art)) throw new Error("Theme art must be an object");
  if (raw.materials !== undefined && !isRecord(raw.materials)) {
    throw new Error("Theme materials must be an object");
  }
  const artSource = isRecord(raw.art) ? raw.art : undefined;
  const materialsSource = isRecord(raw.materials) ? raw.materials : undefined;
  const art = artSource
    ? {
        ...numberField(artSource, "focusX", 0, 1),
        ...numberField(artSource, "focusY", 0, 1),
        ...numberField(artSource, "zoom", 0.75, 2),
        ...numberField(artSource, "dim", 0, 0.88),
        ...(artSource.safeArea === "left" ||
        artSource.safeArea === "center" ||
        artSource.safeArea === "right"
          ? { safeArea: artSource.safeArea }
          : {}),
        ...(artSource.wallpaperFit === "cover" ||
        artSource.wallpaperFit === "contain" ||
        artSource.wallpaperFit === "stretch"
          ? { wallpaperFit: artSource.wallpaperFit }
          : {}),
        ...numberField(artSource, "taskIntensity", 0, 1),
      }
    : undefined;
  const materials = materialsSource
    ? {
        ...numberField(materialsSource, "sidebarOpacity", 0.2, 1),
        ...numberField(materialsSource, "pageOpacity", 0.2, 1),
        ...numberField(materialsSource, "panelOpacity", 0.2, 1),
        ...numberField(materialsSource, "blur", 0, 40),
        ...numberField(materialsSource, "radius", 0, 32),
        ...numberField(materialsSource, "borderAlpha", 0, 0.8),
        ...(materialsSource.shadow === "none" ||
        materialsSource.shadow === "soft" ||
        materialsSource.shadow === "strong"
          ? { shadow: materialsSource.shadow }
          : {}),
        ...(materialsSource.density === "compact" ||
        materialsSource.density === "standard" ||
        materialsSource.density === "comfortable"
          ? { density: materialsSource.density }
          : {}),
      }
    : undefined;
  const customCss = validateThemeCustomCss(raw.customCss);

  const config: ThemeSkinConfig = { schemaVersion: 1, name };
  const id = text(raw.id, 80);
  if (id) config.id = id;
  if (description) config.description = description;
  if (appearance === "auto" || appearance === "light" || appearance === "dark") {
    config.appearance = appearance;
  }
  if (image) config.image = image;
  if (colors) config.colors = colors;
  if (light) config.light = light;
  if (dark) config.dark = dark;
  if (art && Object.keys(art).length) {
    config.art = art as NonNullable<ThemeSkinConfig["art"]>;
  }
  if (materials && Object.keys(materials).length) {
    config.materials = materials as NonNullable<ThemeSkinConfig["materials"]>;
  }
  if (customCss) config.customCss = customCss;
  return config;
}

/** User-created library skins (`skin-<uuid>`). */
function isCustomSkinId(value: unknown): value is string {
  return typeof value === "string" && SKIN_ID_PATTERN.test(value);
}

/** Built-in preset ids that can also hold on-disk overrides. */
function isBuiltinSkinId(value: unknown): value is string {
  return typeof value === "string" && BUILTIN_IDS.has(value);
}

/** Any id that may appear as a stored library record. */
function isStoredSkinId(value: unknown): value is string {
  return isCustomSkinId(value) || isBuiltinSkinId(value);
}

function isKnownSkinId(value: unknown, skins: readonly DiskThemeSkinRecord[]): value is string {
  if (typeof value !== "string") return false;
  if (value === DEFAULT_THEME_SELECTION_ID) return true;
  if (isBuiltinSkinId(value)) return true;
  return isCustomSkinId(value) && skins.some((skin) => skin.id === value);
}

function isSafeBackgroundFile(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^background\.(?:jpg|jpeg|png|webp)$/i.test(value) &&
    basename(value) === value
  );
}

function sourceImageExtension(sourcePath: string, label: string): string {
  const extension = extname(sourcePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) {
    throw new Error(`${label} image must be a PNG, JPEG, or WebP file`);
  }
  return extension;
}

function validateImageSource(
  sourcePath: unknown,
  label: string,
  maxBytes: number,
  maxPixels: number,
): { path: string; extension: string } {
  if (typeof sourcePath !== "string" || !sourcePath.trim()) {
    throw new Error(`${label} image path is required`);
  }
  const path = resolve(sourcePath);
  const extension = sourceImageExtension(path, label);
  let stats: ReturnType<typeof lstatSync>;
  try {
    stats = lstatSync(path);
  } catch {
    throw new Error(`${label} image is unavailable`);
  }
  if (stats.isSymbolicLink() || !stats.isFile() || stats.size < 1 || stats.size > maxBytes) {
    throw new Error(`${label} image must be a regular file within the size limit`);
  }
  const image = nativeImage.createFromPath(path);
  const { width, height } = image.getSize();
  if (image.isEmpty() || width < 1 || height < 1 || width * height > maxPixels) {
    throw new Error(`${label} image could not be decoded safely`);
  }
  return { path, extension };
}

function validateBackgroundSource(sourcePath: unknown): { path: string; extension: string } {
  return validateImageSource(sourcePath, "Background", MAX_BACKGROUND_BYTES, MAX_IMAGE_PIXELS);
}

function uniqueExportDirectory(parent: string, name: string): string {
  const stem =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "pix-skin";
  for (let index = 1; index < 10_000; index += 1) {
    const suffix = index === 1 ? "" : `-${index}`;
    const candidate = join(parent, `${stem}${suffix}`);
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error("Unable to choose an export folder name");
}

function now(): string {
  return new Date().toISOString();
}

function cloneConfig(config: ThemeSkinConfig): ThemeSkinConfig {
  return JSON.parse(JSON.stringify(config)) as ThemeSkinConfig;
}

export class ThemeLibrary {
  readonly #root: string;
  readonly #indexPath: string;

  constructor(userDataPath: string) {
    this.#root = join(userDataPath, "theme-library");
    this.#indexPath = join(this.#root, "index.json");
  }

  list(): ThemeLibrarySnapshot {
    return this.#snapshot(this.#load());
  }

  activate(id: unknown): ThemeLibrarySnapshot {
    const state = this.#load();
    if (!isKnownSkinId(id, state.skins)) throw new Error("Unknown theme skin");
    state.activeId = id;
    this.#write(state);
    return this.#snapshot(state);
  }

  save(input: unknown): ThemeLibrarySnapshot {
    if (!isRecord(input)) throw new Error("Theme skin input must be an object");
    const state = this.#load();
    const requestedId = input.id;
    let existing: DiskThemeSkinRecord | undefined;
    let id: string;
    if (requestedId === undefined) {
      // Brand-new custom skin.
      id = `skin-${randomUUID()}`;
      existing = undefined;
    } else if (isBuiltinSkinId(requestedId)) {
      // Edit a built-in in place: create or update the override with the same id.
      id = requestedId;
      existing = state.skins.find((skin) => skin.id === requestedId);
    } else if (isCustomSkinId(requestedId)) {
      existing = state.skins.find((skin) => skin.id === requestedId);
      if (!existing) throw new Error("Unknown theme skin");
      id = existing.id;
    } else {
      throw new Error("Unknown theme skin");
    }
    const config = normalizeThemeSkinConfig(input.config);
    if (isBuiltinSkinId(id)) config.id = id;
    const createdAt = existing?.createdAt ?? now();
    const updatedAt = now();
    const skinDir = this.#skinDirectory(id);
    mkdirSync(skinDir, { recursive: true });

    let backgroundFile = existing?.backgroundFile;
    let backgroundBuiltinId = existing?.backgroundBuiltinId;
    const removeBackground = input.removeBackground === true;
    if (removeBackground) {
      this.#removeManagedBackgrounds(skinDir);
      backgroundFile = undefined;
      // Built-in overrides fall back to the factory wallpaper when the custom file is cleared.
      backgroundBuiltinId = isBuiltinSkinId(id) ? id : undefined;
      delete config.image;
    } else if (input.backgroundPath !== undefined) {
      const source = validateBackgroundSource(input.backgroundPath);
      const nextFile = `background${source.extension}`;
      const temporary = join(skinDir, `.background-${randomUUID()}${source.extension}`);
      copyFileSync(source.path, temporary);
      this.#removeManagedBackgrounds(skinDir);
      renameSync(temporary, join(skinDir, nextFile));
      backgroundFile = nextFile;
      backgroundBuiltinId = undefined;
      config.image = nextFile;
    } else if (backgroundFile) {
      backgroundBuiltinId = undefined;
      config.image = backgroundFile;
    } else {
      const requestedBuiltinBackgroundId = input.backgroundBuiltinId;
      backgroundBuiltinId =
        typeof requestedBuiltinBackgroundId === "string" &&
        BUILTIN_IDS.has(requestedBuiltinBackgroundId)
          ? requestedBuiltinBackgroundId
          : backgroundBuiltinId;
      // New built-in override without a custom file keeps the factory wallpaper.
      if (!backgroundBuiltinId && isBuiltinSkinId(id)) backgroundBuiltinId = id;
      delete config.image;
    }

    const record: DiskThemeSkinRecord = {
      id,
      config,
      createdAt,
      updatedAt,
      ...(backgroundFile ? { backgroundFile } : {}),
      ...(backgroundBuiltinId ? { backgroundBuiltinId } : {}),
    };
    if (existing) state.skins = state.skins.map((skin) => (skin.id === id ? record : skin));
    else state.skins = [record, ...state.skins];
    state.activeId = id;
    this.#write(state);
    return this.#snapshot(state);
  }

  remove(id: unknown): ThemeLibrarySnapshot {
    const state = this.#load();
    if (!isStoredSkinId(id)) throw new Error("Only saved theme skins can be removed");
    const record = state.skins.find((skin) => skin.id === id);
    if (!record) throw new Error("Unknown theme skin");
    const skinDirectory = this.#skinDirectory(id);
    if (existsSync(skinDirectory)) {
      const stats = lstatSync(skinDirectory);
      if (stats.isSymbolicLink()) rmSync(skinDirectory, { force: true });
      else if (stats.isDirectory()) rmSync(skinDirectory, { recursive: true, force: true });
    }
    state.skins = state.skins.filter((skin) => skin.id !== id);
    // Removing a built-in override restores the factory preset with the same id.
    if (state.activeId === id) {
      state.activeId = isBuiltinSkinId(id) ? id : DEFAULT_THEME_SELECTION_ID;
    }
    this.#write(state);
    return this.#snapshot(state);
  }

  importDirectory(directory: unknown): ThemeLibrarySnapshot {
    if (typeof directory !== "string" || !directory.trim()) {
      throw new Error("Theme directory is required");
    }
    const root = resolve(directory);
    if (!existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) {
      throw new Error("Theme package must be a real directory");
    }
    const entries = readdirSync(root, { withFileTypes: true });
    const configEntry =
      entries.find((entry) => entry.isFile() && entry.name === "theme.json") ??
      entries.find((entry) => entry.isFile() && entry.name.endsWith(".pix-theme.json"));
    if (!configEntry) throw new Error("Theme package needs a theme.json file");
    const configPath = join(root, configEntry.name);
    const configStat = lstatSync(configPath);
    if (configStat.isSymbolicLink() || !configStat.isFile()) {
      throw new Error("Theme configuration must be a regular file");
    }
    if (configStat.size < 1 || configStat.size > MAX_CONFIG_BYTES) {
      throw new Error("Theme configuration is too large");
    }

    let rawConfig: unknown;
    try {
      rawConfig = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    } catch {
      throw new Error("Theme configuration is not valid JSON");
    }
    const config = normalizeThemeSkinConfig(rawConfig);
    const namedImage = safeImageName(config.image);
    const fallbackImage = entries.find(
      (entry) => entry.isFile() && /^background\.(?:jpg|jpeg|png|webp)$/i.test(entry.name),
    )?.name;
    const imageName = namedImage ?? fallbackImage;
    const activeId = this.#load().activeId;
    this.save({
      config,
      ...(imageName ? { backgroundPath: join(root, imageName) } : {}),
    });
    // Import adds a skin to the library; choosing when to apply it remains explicit.
    return this.activate(activeId);
  }

  exportDirectory(id: unknown, parentDirectory: unknown): string {
    const state = this.#load();
    if (!isStoredSkinId(id)) throw new Error("Only saved theme skins can be exported");
    const record = state.skins.find((skin) => skin.id === id);
    if (!record) throw new Error("Unknown theme skin");
    if (typeof parentDirectory !== "string" || !parentDirectory.trim()) {
      throw new Error("Export directory is required");
    }
    const parent = resolve(parentDirectory);
    if (
      !existsSync(parent) ||
      !lstatSync(parent).isDirectory() ||
      lstatSync(parent).isSymbolicLink()
    ) {
      throw new Error("Export destination must be a real directory");
    }
    const output = uniqueExportDirectory(parent, record.config.name);
    mkdirSync(output, { recursive: false });
    try {
      const backgroundPath = this.backgroundPath(id);
      const config = cloneConfig(record.config);
      if (backgroundPath) config.image = basename(backgroundPath);
      else delete config.image;
      writeFileSync(join(output, "theme.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
      writeFileSync(
        join(output, "manifest.json"),
        `${JSON.stringify(
          {
            packageVersion: 1,
            type: "pix-theme-skin",
            files: ["theme.json", ...(backgroundPath ? [basename(backgroundPath)] : [])],
            exportedAt: now(),
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      if (backgroundPath) copyFileSync(backgroundPath, join(output, basename(backgroundPath)));
      return output;
    } catch (error) {
      rmSync(output, { recursive: true, force: true });
      throw error;
    }
  }

  backgroundPath(id: unknown): string | undefined {
    const state = this.#load();
    if (!isStoredSkinId(id)) return undefined;
    const record = state.skins.find((skin) => skin.id === id);
    if (!record?.backgroundFile || !isSafeBackgroundFile(record.backgroundFile)) return undefined;
    const filePath = join(this.#skinDirectory(id), record.backgroundFile);
    try {
      return lstatSync(filePath).isFile() && !lstatSync(filePath).isSymbolicLink()
        ? filePath
        : undefined;
    } catch {
      return undefined;
    }
  }

  #skinDirectory(id: string): string {
    if (!isStoredSkinId(id)) throw new Error("Invalid theme skin id");
    return join(this.#root, id);
  }

  #removeManagedBackgrounds(skinDirectory: string): void {
    for (const entry of readdirSync(skinDirectory, { withFileTypes: true })) {
      if (!isSafeBackgroundFile(entry.name)) continue;
      const assetPath = join(skinDirectory, entry.name);
      try {
        const stats = lstatSync(assetPath);
        if (stats.isFile() || stats.isSymbolicLink()) rmSync(assetPath, { force: true });
      } catch {
        // A concurrently removed asset does not prevent saving the new skin.
      }
    }
  }

  #load(): DiskThemeLibrary {
    mkdirSync(this.#root, { recursive: true });
    if (!existsSync(this.#indexPath)) {
      return { version: STORAGE_VERSION, activeId: DEFAULT_THEME_SELECTION_ID, skins: [] };
    }
    try {
      const parsed = JSON.parse(readFileSync(this.#indexPath, "utf8")) as unknown;
      if (!isRecord(parsed) || !Array.isArray(parsed.skins)) {
        throw new Error("Invalid theme library index");
      }
      const skins: DiskThemeSkinRecord[] = [];
      for (const candidate of parsed.skins) {
        if (!isRecord(candidate) || !isStoredSkinId(candidate.id)) continue;
        try {
          const config = normalizeThemeSkinConfig(candidate.config);
          const createdAt = text(candidate.createdAt, 64) ?? now();
          const updatedAt = text(candidate.updatedAt, 64) ?? createdAt;
          const backgroundFile = isSafeBackgroundFile(candidate.backgroundFile)
            ? candidate.backgroundFile
            : undefined;
          const candidateBuiltinBackgroundId = candidate.backgroundBuiltinId;
          const backgroundBuiltinId =
            typeof candidateBuiltinBackgroundId === "string" &&
            BUILTIN_IDS.has(candidateBuiltinBackgroundId)
              ? candidateBuiltinBackgroundId
              : undefined;
          skins.push({
            id: candidate.id,
            config,
            createdAt,
            updatedAt,
            ...(backgroundFile ? { backgroundFile } : {}),
            ...(backgroundBuiltinId ? { backgroundBuiltinId } : {}),
          });
        } catch {
          // A malformed user entry should not hide every valid saved skin.
        }
      }
      const activeId = isKnownSkinId(parsed.activeId, skins)
        ? parsed.activeId
        : DEFAULT_THEME_SELECTION_ID;
      return { version: STORAGE_VERSION, activeId, skins };
    } catch {
      return { version: STORAGE_VERSION, activeId: DEFAULT_THEME_SELECTION_ID, skins: [] };
    }
  }

  #write(state: DiskThemeLibrary): void {
    mkdirSync(this.#root, { recursive: true });
    const temporary = `${this.#indexPath}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    renameSync(temporary, this.#indexPath);
  }

  #snapshot(state: DiskThemeLibrary): ThemeLibrarySnapshot {
    return {
      activeId: state.activeId,
      skins: state.skins
        .slice()
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((skin) => ({
          id: skin.id,
          config: cloneConfig(skin.config),
          createdAt: skin.createdAt,
          updatedAt: skin.updatedAt,
          ...(skin.backgroundBuiltinId ? { backgroundBuiltinId: skin.backgroundBuiltinId } : {}),
          ...(this.backgroundPath(skin.id)
            ? {
                backgroundUrl: `pix-theme://${skin.id}/background?v=${encodeURIComponent(skin.updatedAt)}`,
              }
            : {}),
        })),
    };
  }
}
