import type {
  ThemeLibrarySnapshot,
  ThemeSkinColors,
  ThemeSkinConfig,
  ThemeSkinMaterials,
  ThemeSkinRecord,
  ThemeSkinVariant,
} from "@zeno/contracts";
import mikuStageUrl from "../assets/theme-skins/miku-stage.jpg";
import zhangRuonanUrl from "../assets/theme-skins/zhang-ruonan.jpg";
import { scopeThemeCustomCss, validateThemeCustomCss } from "../../shared/theme-css.ts";
import type { ResolvedColorMode } from "./theme.ts";

export const THEME_TOKEN_CSS_VARIABLES = {
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

export type ThemeTokenName = keyof typeof THEME_TOKEN_CSS_VARIABLES;
export type ThemeTokens = Partial<Record<ThemeTokenName, string>>;
export type ThemePack = ThemeSkinConfig;
export type ThemeSelection = { id: string };
export type ThemePreview = Pick<ThemeSkinRecord, "config" | "backgroundUrl">;
/** Special selection that leaves the original light/dark shell completely unskinned. */
export const DEFAULT_THEME_ID = "default" as const;
/** Built-in skins that ship with a bundled wallpaper. */
export type ThemeImagePresetId = "miku-stage" | "zhang-ruonan";
export type ThemePresetId = ThemeImagePresetId;
/** Wallpaper fit modes for skin art (maps to CSS background-size). */
export type ThemeWallpaperFit = "cover" | "contain" | "stretch";

export const THEME_IMAGE_PRESET_IDS: readonly ThemeImagePresetId[] = ["miku-stage", "zhang-ruonan"];
export const THEME_PRESET_IDS: readonly ThemePresetId[] = [...THEME_IMAGE_PRESET_IDS];
export const THEME_WALLPAPER_FITS: readonly ThemeWallpaperFit[] = [
  "cover",
  "contain",
  "stretch",
] as const;
/** Fallback only for invalid skin ids; the product default is the unskinned shell. */
export const DEFAULT_THEME_PRESET_ID: ThemePresetId = "miku-stage";
export const DEFAULT_THEME_SELECTION: ThemeSelection = { id: DEFAULT_THEME_ID };

export const BUILTIN_THEME_BACKGROUNDS: Record<ThemeImagePresetId, string> = {
  "miku-stage": mikuStageUrl,
  "zhang-ruonan": zhangRuonanUrl,
};

const BUILTIN_BACKGROUND_URLS = new Set(Object.values(BUILTIN_THEME_BACKGROUNDS));
const LEGACY_THEME_PRESET_IDS = new Set([
  "classic-light",
  "classic-dark",
  "neutral",
  "lagoon",
  "cinder",
  "anime-studio",
  "pink-street",
  "anime-street",
  "safe-landing",
]);

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

/** Shared slider defaults shown in Theme Studio (and used by image skins). */
export const ART_DEFAULTS = {
  focusX: 0.5,
  focusY: 0.5,
  zoom: 1,
  dim: 0.1,
  safeArea: "center" as const,
  taskIntensity: 0.78,
  wallpaperFit: "cover" as ThemeWallpaperFit,
};

/** Resolve CSS `background-size` for the wallpaper fit mode. */
export function wallpaperFitToCssSize(
  fit: ThemeWallpaperFit | undefined,
  zoom = ART_DEFAULTS.zoom,
): string {
  if (fit === "contain") return "contain";
  if (fit === "stretch") return "100% 100%";
  // cover: optional zoom scales beyond cover via percentage (1 = cover-like full bleed)
  const z = Number.isFinite(zoom) ? Math.min(2, Math.max(0.75, zoom)) : 1;
  if (Math.abs(z - 1) < 0.01) return "cover";
  return `${Math.round(z * 100)}%`;
}

export const MATERIAL_DEFAULTS: Required<ThemeSkinMaterials> = {
  sidebarOpacity: 0.64,
  pageOpacity: 0.35,
  panelOpacity: 0.74,
  blur: 0,
  radius: 20,
  borderAlpha: 0.3,
  shadow: "strong",
  density: "standard",
};

export const THEME_PRESETS: Record<ThemePresetId, ThemePack> = {
  "miku-stage": {
    schemaVersion: 1,
    id: "miku-stage",
    name: "初音未来 · 青葱舞台",
    appearance: "auto",
    art: { ...ART_DEFAULTS },
    materials: { ...MATERIAL_DEFAULTS },
    light: {
      background: "linear-gradient(135deg, #d9fcf5 0%, #cbeafd 100%)",
      colors: {
        background: "#d9f4f1",
        panel: "#f3fffc",
        panelAlt: "#c8e7e5",
        accent: "#169ba8",
        accentAlt: "#48c6ca",
        secondary: "#277ed0",
        highlight: "#df5d91",
        text: "#15323a",
        muted: "#5b7479",
        line: "rgba(22, 155, 168, 0.25)",
      },
    },
    dark: {
      background: "linear-gradient(135deg, #071f28 0%, #10254d 100%)",
      colors: {
        background: "#09212a",
        panel: "#12343b",
        panelAlt: "#1d4a51",
        accent: "#62dfd8",
        accentAlt: "#a4f4ed",
        secondary: "#77b9ff",
        highlight: "#ffa3c4",
        text: "#eefffd",
        muted: "#aed0d1",
        line: "rgba(98, 223, 216, 0.28)",
      },
    },
  },
  "zhang-ruonan": {
    schemaVersion: 1,
    id: "zhang-ruonan",
    name: "章若楠 · 青春映画",
    appearance: "auto",
    art: { ...ART_DEFAULTS },
    materials: { ...MATERIAL_DEFAULTS },
    light: {
      background: "linear-gradient(135deg, #fff1eb 0%, #e0f0eb 100%)",
      colors: {
        background: "#faece7",
        panel: "#fffaf6",
        panelAlt: "#eadbd8",
        accent: "#cb5770",
        accentAlt: "#ee91a5",
        secondary: "#237d7b",
        highlight: "#cf7d3e",
        text: "#372729",
        muted: "#80696b",
        line: "rgba(203, 87, 112, 0.22)",
      },
    },
    dark: {
      background: "linear-gradient(135deg, #1d151b 0%, #132c30 100%)",
      colors: {
        background: "#20171d",
        panel: "#2d2029",
        panelAlt: "#3d3038",
        accent: "#ff9cae",
        accentAlt: "#ffc3ce",
        secondary: "#8bd1c9",
        highlight: "#ffb36e",
        text: "#fff7f8",
        muted: "#d2bdc3",
        line: "rgba(255, 156, 174, 0.28)",
      },
    },
  },
};

/** A vivid, readable starting point for themes created in Studio. */
export function createThemeSkinDraft(name: string): ThemePack {
  return {
    schemaVersion: 1,
    name: name.trim() || "Aurora",
    appearance: "auto",
    art: { ...ART_DEFAULTS },
    materials: { ...MATERIAL_DEFAULTS },
    light: {
      background: "linear-gradient(135deg, #f4f8ff 0%, #e7effa 100%)",
      colors: {
        background: "#eef3fb",
        panel: "#ffffff",
        panelAlt: "#e2eaf5",
        accent: "#379cfc",
        accentAlt: "#6db6ff",
        secondary: "#379cfc",
        highlight: "#d06b42",
        text: "#172235",
        muted: "#66768c",
        line: "rgba(55, 156, 252, 0.22)",
      },
    },
    dark: {
      background: "linear-gradient(135deg, #1f1f1f 0%, #252525 100%)",
      colors: {
        background: "#202020",
        panel: "#2a2a2a",
        panelAlt: "#353535",
        accent: "#379cfc",
        accentAlt: "#7bbcff",
        secondary: "#379cfc",
        highlight: "#d98b57",
        text: "#f5f5f5",
        muted: "#b2b2b2",
        line: "rgba(255, 255, 255, 0.16)",
      },
    },
  };
}

const CSS_VARIABLE_TO_THEME_TOKEN: Record<string, ThemeTokenName> = Object.fromEntries(
  Object.entries(THEME_TOKEN_CSS_VARIABLES).map(([name, cssVariable]) => [cssVariable, name]),
) as Record<string, ThemeTokenName>;

const THEME_SELECTION_STORAGE_KEY = "pix.theme.selection.v2";
const MAX_CSS_VALUE_LENGTH = 1_000;
const MAX_THEME_NAME_LENGTH = 80;
const MAX_THEME_DESCRIPTION_LENGTH = 280;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text && text.length <= maxLength ? text : undefined;
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

function isSafeCssValue(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (!text || text.length > MAX_CSS_VALUE_LENGTH) return false;
  if (/[;{}<>\n\r]/.test(text)) return false;
  if (/\b(?:url|expression)\s*\(/i.test(text)) return false;
  return CSS_VALUE_CHARACTER_PATTERN.test(text) && hasSafeCssFunctions(text);
}

function themeTokenName(value: string): ThemeTokenName | undefined {
  if (value in THEME_TOKEN_CSS_VARIABLES) return value as ThemeTokenName;
  return CSS_VARIABLE_TO_THEME_TOKEN[value];
}

function parseTokens(raw: unknown): ThemeTokens | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new Error("Theme tokens must be an object");
  const tokens: ThemeTokens = {};
  for (const [name, value] of Object.entries(raw)) {
    const token = themeTokenName(name);
    if (!token) throw new Error(`Unsupported theme token: ${name}`);
    if (!isSafeCssValue(value)) throw new Error(`Invalid value for theme token: ${name}`);
    tokens[token] = value.trim();
  }
  return Object.keys(tokens).length ? tokens : undefined;
}

function parseColors(raw: unknown): ThemeSkinColors | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new Error("Theme colors must be an object");
  const colors: ThemeSkinColors = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!(COLOR_KEYS as readonly string[]).includes(name)) {
      throw new Error(`Unsupported theme color: ${name}`);
    }
    if (!isSafeCssValue(value)) throw new Error(`Invalid value for theme color: ${name}`);
    colors[name as keyof ThemeSkinColors] = value.trim();
  }
  return Object.keys(colors).length ? colors : undefined;
}

function parseBackground(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  if (!isSafeCssValue(raw)) throw new Error("Theme background must be a color or gradient");
  const background = raw.trim();
  if (
    GRADIENT_PATTERN.test(background) ||
    COLOR_FUNCTION_PATTERN.test(background) ||
    background.startsWith("var(") ||
    !background.includes("(")
  ) {
    return background;
  }
  throw new Error("Theme background must be a color or gradient");
}

function parseVariant(raw: unknown, label: string): ThemeSkinVariant | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new Error(`${label} theme variant must be an object`);
  const background = parseBackground(raw.background);
  const colors = parseColors(raw.colors);
  const tokens = parseTokens(raw.tokens);
  if (!background && !colors && !tokens) return undefined;
  const variant: ThemeSkinVariant = {};
  if (background) variant.background = background;
  if (colors) variant.colors = colors;
  if (tokens) variant.tokens = tokens;
  return variant;
}

function parseUnit(value: unknown, min: number, max: number, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function parseArt(raw: unknown): ThemeSkinConfig["art"] {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new Error("Theme art must be an object");
  const art: NonNullable<ThemeSkinConfig["art"]> = {};
  const focusX = parseUnit(raw.focusX, 0, 1, "art focusX");
  const focusY = parseUnit(raw.focusY, 0, 1, "art focusY");
  const zoom = parseUnit(raw.zoom, 0.75, 2, "art zoom");
  const dim = parseUnit(raw.dim, 0, 0.88, "art dim");
  const taskIntensity = parseUnit(raw.taskIntensity, 0, 1, "art taskIntensity");
  if (focusX !== undefined) art.focusX = focusX;
  if (focusY !== undefined) art.focusY = focusY;
  if (zoom !== undefined) art.zoom = zoom;
  if (dim !== undefined) art.dim = dim;
  if (taskIntensity !== undefined) art.taskIntensity = taskIntensity;
  if (raw.safeArea !== undefined) {
    if (raw.safeArea !== "left" && raw.safeArea !== "center" && raw.safeArea !== "right") {
      throw new Error("Invalid art safeArea");
    }
    art.safeArea = raw.safeArea;
  }
  if (raw.wallpaperFit !== undefined) {
    if (
      raw.wallpaperFit !== "cover" &&
      raw.wallpaperFit !== "contain" &&
      raw.wallpaperFit !== "stretch"
    ) {
      throw new Error("Invalid art wallpaperFit");
    }
    art.wallpaperFit = raw.wallpaperFit;
  }
  return Object.keys(art).length ? art : undefined;
}

function parseMaterials(raw: unknown): ThemeSkinConfig["materials"] {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new Error("Theme materials must be an object");
  const materials: NonNullable<ThemeSkinConfig["materials"]> = {};
  const sidebarOpacity = parseUnit(raw.sidebarOpacity, 0.2, 1, "material sidebarOpacity");
  const pageOpacity = parseUnit(raw.pageOpacity, 0.2, 1, "material pageOpacity");
  const panelOpacity = parseUnit(raw.panelOpacity, 0.2, 1, "material panelOpacity");
  const blur = parseUnit(raw.blur, 0, 40, "material blur");
  const radius = parseUnit(raw.radius, 0, 32, "material radius");
  const borderAlpha = parseUnit(raw.borderAlpha, 0, 0.8, "material borderAlpha");
  if (sidebarOpacity !== undefined) materials.sidebarOpacity = sidebarOpacity;
  if (pageOpacity !== undefined) materials.pageOpacity = pageOpacity;
  if (panelOpacity !== undefined) materials.panelOpacity = panelOpacity;
  if (blur !== undefined) materials.blur = blur;
  if (radius !== undefined) materials.radius = radius;
  if (borderAlpha !== undefined) materials.borderAlpha = borderAlpha;
  if (raw.shadow !== undefined) {
    if (raw.shadow !== "none" && raw.shadow !== "soft" && raw.shadow !== "strong") {
      throw new Error("Invalid material shadow");
    }
    materials.shadow = raw.shadow;
  }
  if (raw.density !== undefined) {
    if (raw.density !== "compact" && raw.density !== "standard" && raw.density !== "comfortable") {
      throw new Error("Invalid material density");
    }
    materials.density = raw.density;
  }
  return Object.keys(materials).length ? materials : undefined;
}

function parseImageName(raw: unknown): string | undefined {
  const image = cleanText(raw, 160);
  if (!image) return undefined;
  if (image.includes("/") || image.includes("\\") || !/\.(?:png|jpe?g|webp)$/i.test(image)) {
    throw new Error("Theme image must be a local PNG, JPEG, or WebP file name");
  }
  return image;
}

/** Parse a portable Zeno skin or a compatible Dream Skin theme.json document. */
export function parseThemePack(raw: unknown): ThemePack {
  if (!isRecord(raw)) throw new Error("Theme pack must be an object");
  if (hasOwn(raw, "version") && raw.version !== 1)
    throw new Error("Unsupported theme pack version");
  if (hasOwn(raw, "schemaVersion") && raw.schemaVersion !== 1) {
    throw new Error("Unsupported theme schema version");
  }
  if (hasOwn(raw, "meta") && !isRecord(raw.meta))
    throw new Error("Theme metadata must be an object");

  const meta = isRecord(raw.meta) ? raw.meta : raw;
  const config: ThemePack = {
    schemaVersion: 1,
    name: cleanText(meta.name, MAX_THEME_NAME_LENGTH) ?? "Imported skin",
  };
  const description = cleanText(meta.description, MAX_THEME_DESCRIPTION_LENGTH);
  const id = cleanText(raw.id, 80);
  const appearance = raw.appearance;
  const shared = parseVariant(
    hasOwn(raw, "background") || hasOwn(raw, "tokens")
      ? { background: raw.background, tokens: raw.tokens }
      : undefined,
    "shared",
  );
  const light = parseVariant(raw.light, "light") ?? shared;
  const dark = parseVariant(raw.dark, "dark") ?? shared;
  const colors = parseColors(raw.colors);
  const art = parseArt(raw.art);
  const materials = parseMaterials(raw.materials);
  const image = parseImageName(raw.image);
  const customCss = validateThemeCustomCss(raw.customCss);
  if (description) config.description = description;
  if (id) config.id = id;
  if (appearance === "auto" || appearance === "light" || appearance === "dark") {
    config.appearance = appearance;
  } else if (appearance !== undefined) {
    throw new Error("Invalid theme appearance");
  }
  if (image) config.image = image;
  if (colors) config.colors = colors;
  if (light) config.light = light;
  if (dark) config.dark = dark;
  if (art) config.art = art;
  if (materials) config.materials = materials;
  if (customCss) config.customCss = customCss;
  return config;
}

export function parseThemePackJson(input: string): ThemePack {
  let raw: unknown;
  try {
    raw = JSON.parse(input) as unknown;
  } catch {
    throw new Error("Theme package must be valid JSON");
  }
  return parseThemePack(raw);
}

export function serializeThemePack(pack: ThemePack): string {
  return `${JSON.stringify(pack, null, 2)}\n`;
}

export const EMPTY_THEME_LIBRARY: ThemeLibrarySnapshot = {
  activeId: DEFAULT_THEME_SELECTION.id,
  skins: [],
};

export function isThemePresetId(value: unknown): value is ThemePresetId {
  return typeof value === "string" && (THEME_PRESET_IDS as readonly string[]).includes(value);
}

export function isThemeImagePresetId(value: unknown): value is ThemeImagePresetId {
  return typeof value === "string" && (THEME_IMAGE_PRESET_IDS as readonly string[]).includes(value);
}

export function isDefaultThemeSelection(selection: ThemeSelection): boolean {
  return selection.id === DEFAULT_THEME_ID;
}

function builtinBackgroundUrl(id: string): string | undefined {
  return isThemeImagePresetId(id) ? BUILTIN_THEME_BACKGROUNDS[id] : undefined;
}

function isSelectionId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,96}$/i.test(value);
}

/** Convert persisted v1 selection data into the new id-only theme selection. */
export function normalizeThemeSelection(raw: unknown): ThemeSelection {
  if (!isRecord(raw)) return { ...DEFAULT_THEME_SELECTION };
  if (isSelectionId(raw.id)) {
    return LEGACY_THEME_PRESET_IDS.has(raw.id) ? { ...DEFAULT_THEME_SELECTION } : { id: raw.id };
  }
  if (isThemePresetId(raw.presetId)) return { id: raw.presetId };
  if (typeof raw.presetId === "string" && LEGACY_THEME_PRESET_IDS.has(raw.presetId)) {
    return { ...DEFAULT_THEME_SELECTION };
  }
  return { ...DEFAULT_THEME_SELECTION };
}

export function loadThemeSelection(): ThemeSelection {
  try {
    const raw = localStorage.getItem(THEME_SELECTION_STORAGE_KEY);
    return raw
      ? normalizeThemeSelection(JSON.parse(raw) as unknown)
      : { ...DEFAULT_THEME_SELECTION };
  } catch {
    return { ...DEFAULT_THEME_SELECTION };
  }
}

export function saveThemeSelection(selection: ThemeSelection): ThemeSelection {
  const next = normalizeThemeSelection(selection);
  try {
    localStorage.setItem(THEME_SELECTION_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // LocalStorage is unavailable in a few embedded test surfaces.
  }
  return next;
}

function savedSkinBackgroundUrl(saved: ThemeSkinRecord): string | undefined {
  if (saved.backgroundUrl) return saved.backgroundUrl;
  if (isThemeImagePresetId(saved.backgroundBuiltinId)) {
    return BUILTIN_THEME_BACKGROUNDS[saved.backgroundBuiltinId];
  }
  // Built-in image override without a custom file still uses the factory wallpaper.
  return builtinBackgroundUrl(saved.id);
}

function resolveSkinBackgroundUrl(
  selection: ThemeSelection,
  skins: readonly ThemeSkinRecord[] = [],
): string | undefined {
  const saved = skins.find((skin) => skin.id === selection.id);
  if (saved) return savedSkinBackgroundUrl(saved);
  return builtinBackgroundUrl(selection.id) ?? builtinBackgroundUrl(DEFAULT_THEME_PRESET_ID);
}

export function activeThemePack(
  selection: ThemeSelection,
  skins: readonly ThemeSkinRecord[] = [],
  preview?: ThemePreview,
): ThemePreview {
  if (preview) {
    // Studio always sends an own `backgroundUrl` key. Empty string means the
    // wallpaper was intentionally removed; omitted means inherit the selection.
    if (Object.prototype.hasOwnProperty.call(preview, "backgroundUrl")) {
      return preview.backgroundUrl
        ? { config: preview.config, backgroundUrl: preview.backgroundUrl }
        : { config: preview.config };
    }
    const backgroundUrl = resolveSkinBackgroundUrl(selection, skins);
    return backgroundUrl ? { config: preview.config, backgroundUrl } : { config: preview.config };
  }
  // Prefer an on-disk override (including built-ins saved under their factory id).
  const saved = skins.find((skin) => skin.id === selection.id);
  if (saved) {
    const backgroundUrl = savedSkinBackgroundUrl(saved);
    return {
      config: saved.config,
      ...(backgroundUrl ? { backgroundUrl } : {}),
    };
  }
  if (isThemePresetId(selection.id)) {
    const backgroundUrl = builtinBackgroundUrl(selection.id);
    return {
      config: THEME_PRESETS[selection.id],
      ...(backgroundUrl ? { backgroundUrl } : {}),
    };
  }
  const fallbackBackground = builtinBackgroundUrl(DEFAULT_THEME_PRESET_ID);
  return {
    config: THEME_PRESETS[DEFAULT_THEME_PRESET_ID],
    ...(fallbackBackground ? { backgroundUrl: fallbackBackground } : {}),
  };
}

export function resolveSkinColorMode(
  pack: ThemePack,
  colorMode: ResolvedColorMode,
): ResolvedColorMode {
  if (pack.appearance === "light" || pack.appearance === "dark") return pack.appearance;
  return colorMode;
}

export function resolveThemeVariant(
  pack: ThemePack,
  colorMode: ResolvedColorMode,
): ThemeSkinVariant {
  const mode = resolveSkinColorMode(pack, colorMode);
  return mode === "dark" ? (pack.dark ?? pack.light ?? {}) : (pack.light ?? pack.dark ?? {});
}

export function resolveThemeColors(pack: ThemePack, colorMode: ResolvedColorMode): ThemeSkinColors {
  return { ...pack.colors, ...resolveThemeVariant(pack, colorMode).colors };
}

export type ThemePreviewColors = {
  background: string;
  backgroundSolid: string;
  surface: string;
  /** Solid rail fill when not glass (classic --sidebar / derived panel). */
  sidebar: string;
  primary: string;
  primaryForeground: string;
  panelAlt: string;
  /** Composer protrusion fill (panelAlt / token). */
  composerProtrusion: string;
  text: string;
  muted: string;
  line: string;
  backgroundRgb: string;
  panelRgb: string;
  panelAltRgb: string;
  sidebarRgb: string;
  textRgb: string;
  accentRgb: string;
  materialBorder: string;
  sidebarMaterialBorder: string;
  composerMaterialBorder: string;
  /** True when the shell paints glass materials (wallpaper / opacity / blur). */
  glass: boolean;
  /** Native frosted rail (ignores material sidebar opacity). */
  sidebarTranslucent: boolean;
  /** Material glass rail (only when sidebarTranslucent is false). */
  sidebarGlass: boolean;
  shadow: "none" | "soft" | "strong";
  density: "compact" | "standard" | "comfortable";
};

/**
 * Material glass rail (sidebarOpacity / blur). Only applies when native translucent is off.
 */
export function isSidebarGlassSkin(materials: ThemeSkinMaterials | undefined): boolean {
  const merged = { ...MATERIAL_DEFAULTS, ...materials };
  // An opaque rail cannot reveal backdrop blur, regardless of the blur radius.
  return numberOr(merged.sidebarOpacity, 1) < 0.999;
}

/** Effective material glass: disabled while native translucent is on. */
export function resolveSidebarMaterialGlass(pack: ThemePack, sidebarTranslucent = false): boolean {
  if (sidebarTranslucent) return false;
  return isSidebarGlassSkin(pack.materials);
}

/** Whether skin materials paint glass chrome for panels/page (not only the rail). */
export function isGlassThemeMaterials(
  materials: ThemeSkinMaterials | undefined,
  hasWallpaper = false,
): boolean {
  const merged = { ...MATERIAL_DEFAULTS, ...materials };
  return (
    hasWallpaper ||
    isSidebarGlassSkin(materials) ||
    numberOr(merged.pageOpacity, 1) < 0.999 ||
    numberOr(merged.panelOpacity, 1) < 0.999
  );
}

function normalizedThemeTokens(tokens: Record<string, string> | undefined): ThemeTokens {
  const normalized: ThemeTokens = {};
  for (const [name, value] of Object.entries(tokens ?? {})) {
    const token = themeTokenName(name);
    if (token) normalized[token] = value;
  }
  return normalized;
}

function explicitThemeToken(
  tokens: Record<string, string> | undefined,
  name: ThemeTokenName,
): string | undefined {
  return normalizedThemeTokens(tokens)[name];
}

function buildThemePreviewColors(
  pack: ThemePack,
  mode: ResolvedColorMode,
  colors: Required<ThemeSkinColors>,
  background: string | undefined,
  materials: Required<ThemeSkinMaterials>,
  hasWallpaper: boolean,
  sidebarTranslucent: boolean,
  tokens?: ThemeTokens,
): ThemePreviewColors {
  const glass = isGlassThemeMaterials(materials, hasWallpaper);
  const sidebarGlass = resolveSidebarMaterialGlass(pack, sidebarTranslucent);
  const derived = colorTokens(colors);
  const normalizedTokens = normalizedThemeTokens(tokens);
  const mergedTokens = ensureSemanticTokenContrast(
    { ...derived, ...normalizedTokens },
    normalizedTokens,
  );
  const backgroundSolid = mergedTokens.background ?? colors.background;
  const surface = mergedTokens.surfacePanel ?? colors.panel;
  const primary = mergedTokens.primary ?? colors.accent;
  const primaryForeground =
    mergedTokens.primaryForeground ?? accessibleForeground(colors.text, [primary]);
  const panelAlt = mergedTokens.surfaceMuted ?? colors.panelAlt;
  const text = mergedTokens.foreground ?? colors.text;
  const muted = mergedTokens.mutedForeground ?? colors.muted;
  const line = mergedTokens.border ?? colors.line;
  const sidebar = mergedTokens.sidebar ?? colors.panel;
  const composerProtrusion = mergedTokens.composerProtrusion ?? colors.panelAlt;
  const materialBorder =
    explicitThemeToken(tokens, "border") ??
    "rgb(var(--preview-text-rgb) / var(--preview-border-alpha))";
  return {
    background: background ?? backgroundSolid,
    backgroundSolid,
    surface,
    sidebar,
    primary,
    primaryForeground,
    panelAlt,
    composerProtrusion,
    text,
    muted,
    line,
    backgroundRgb: rgbValue(backgroundSolid, mode === "dark" ? "18 18 18" : "247 247 246"),
    panelRgb: rgbValue(surface, mode === "dark" ? "32 32 32" : "255 255 255"),
    panelAltRgb: rgbValue(panelAlt, mode === "dark" ? "42 42 42" : "245 245 245"),
    sidebarRgb: rgbValue(sidebar, mode === "dark" ? "21 21 21" : "241 242 244"),
    textRgb: rgbValue(text, mode === "dark" ? "245 245 245" : "25 25 25"),
    accentRgb: rgbValue(primary, mode === "dark" ? "210 210 210" : "32 32 32"),
    materialBorder,
    sidebarMaterialBorder: explicitThemeToken(tokens, "sidebarBorder") ?? materialBorder,
    composerMaterialBorder: explicitThemeToken(tokens, "composerBorder") ?? materialBorder,
    glass,
    sidebarTranslucent,
    sidebarGlass,
    shadow: materials.shadow,
    density: materials.density,
  };
}

export function themePreview(
  pack: ThemePack,
  colorMode: ResolvedColorMode,
  options?: { hasWallpaper?: boolean; sidebarTranslucent?: boolean },
): ThemePreviewColors {
  const mode = resolveSkinColorMode(pack, colorMode);
  const variant = resolveThemeVariant(pack, colorMode);
  const materials = { ...MATERIAL_DEFAULTS, ...pack.materials };
  const colors = { ...paletteForMode(mode), ...resolveThemeColors(pack, colorMode) };
  return buildThemePreviewColors(
    pack,
    mode,
    colors,
    variant.background,
    materials,
    options?.hasWallpaper ?? false,
    options?.sidebarTranslucent ?? false,
    variant.tokens,
  );
}

/**
 * Studio mock preview for a forced light/dark switch.
 * Uses the selected mode's own variant only (no cross-mode color fallback),
 * so light/dark tabs match what that variant actually paints.
 */
export function themeEditorPreview(
  pack: ThemePack,
  mode: ResolvedColorMode,
  options?: { hasWallpaper?: boolean; sidebarTranslucent?: boolean },
): ThemePreviewColors {
  const variant = pack[mode] ?? {};
  const materials = { ...MATERIAL_DEFAULTS, ...pack.materials };
  // Fill any missing keys from palette (partial variant colors).
  const fullColors = {
    ...paletteForMode(mode),
    ...pack.colors,
    ...variant.colors,
  };
  return buildThemePreviewColors(
    pack,
    mode,
    fullColors,
    variant.background,
    materials,
    options?.hasWallpaper ?? false,
    options?.sidebarTranslucent ?? false,
    variant.tokens,
  );
}

/** CSS box-shadow for studio chrome (mirrors shadowValue, with concrete rgb). */
export function themePreviewShadow(
  shadow: ThemeSkinMaterials["shadow"],
  backgroundRgb: string,
): string {
  if (shadow === "none") return "none";
  if (shadow === "strong") return `0 10px 28px rgb(${backgroundRgb} / 0.32)`;
  return `0 8px 20px rgb(${backgroundRgb} / 0.22)`;
}

function paletteForMode(colorMode: ResolvedColorMode): Required<ThemeSkinColors> {
  return colorMode === "dark"
    ? {
        background: "#151515",
        panel: "#202020",
        panelAlt: "#2a2a2a",
        accent: "#d2d2d2",
        accentAlt: "#eeeeee",
        secondary: "#969696",
        highlight: "#b7b7b7",
        text: "#f5f5f5",
        muted: "#a7a7a7",
        line: "rgba(255, 255, 255, 0.16)",
      }
    : {
        background: "#f7f7f6",
        panel: "#ffffff",
        panelAlt: "#efefed",
        accent: "#202020",
        accentAlt: "#454545",
        secondary: "#696969",
        highlight: "#343434",
        text: "#191919",
        muted: "#6d6d6d",
        line: "rgba(24, 24, 24, 0.15)",
      };
}

function ensureSemanticTokenContrast(
  tokens: ThemeTokens,
  explicitTokens: ThemeTokens,
): ThemeTokens {
  const resolved = { ...tokens };
  const pairs: ReadonlyArray<
    readonly [foreground: ThemeTokenName, backgrounds: readonly ThemeTokenName[], ratio?: number]
  > = [
    ["primaryForeground", ["primary"]],
    ["sidebarPrimaryForeground", ["sidebarPrimary"]],
    ["secondaryForeground", ["secondary"]],
    ["mutedForeground", ["muted"]],
    ["hoverFillForeground", ["hoverFill"]],
    ["accentForeground", ["accent"]],
    ["userBubbleForeground", ["userBubble"]],
    ["codeFg", ["codeBg"]],
    ["link", ["background", "surfacePanel"]],
    ["ring", ["background", "surfacePanel"], 3],
    ["sidebarRing", ["sidebar"], 3],
  ];
  for (const [foreground, backgroundNames, ratio] of pairs) {
    if (explicitTokens[foreground]) continue;
    const foregroundValue = resolved[foreground];
    const backgrounds = backgroundNames
      .map((name) => resolved[name])
      .filter((value): value is string => Boolean(value));
    if (!foregroundValue || backgrounds.length !== backgroundNames.length) continue;
    resolved[foreground] = accessibleForeground(foregroundValue, backgrounds, ratio);
  }
  return resolved;
}

function colorTokens(colors: ThemeSkinColors): ThemeTokens {
  const tokens: ThemeTokens = {};
  if (colors.background) tokens.background = colors.background;
  if (colors.text) {
    tokens.foreground = colors.text;
    tokens.sidebarForeground = colors.text;
  }
  if (colors.panel) {
    tokens.surfacePanel = colors.panel;
    tokens.sidebar = colors.panel;
  }
  if (colors.panelAlt) {
    tokens.surfaceMuted = colors.panelAlt;
    tokens.surfaceSoft = colors.panelAlt;
    tokens.muted = colors.panelAlt;
    tokens.hoverFill = colors.panelAlt;
    tokens.accent = colors.panelAlt;
    tokens.userBubble = colors.panelAlt;
    tokens.composerProtrusion = colors.panelAlt;
    tokens.codeBg = colors.panelAlt;
  }
  if (colors.accent) {
    tokens.primary = colors.accent;
    tokens.sidebarPrimary = colors.accent;
    tokens.switchOn = colors.accent;
  }
  if (colors.text && colors.accent) {
    const foreground = accessibleForeground(colors.text, [colors.accent]);
    tokens.primaryForeground = foreground;
    tokens.sidebarPrimaryForeground = foreground;
  }
  if (colors.secondary) {
    tokens.secondary = colors.secondary;
    if (colors.text) {
      tokens.secondaryForeground = accessibleForeground(colors.text, [colors.secondary]);
    }
    tokens.link = accessibleForeground(
      colors.secondary,
      [colors.background, colors.panel].filter((value): value is string => Boolean(value)),
    );
  }
  if (colors.muted) {
    tokens.mutedForeground = accessibleForeground(
      colors.muted,
      [colors.background, colors.panel, colors.panelAlt].filter((value): value is string =>
        Boolean(value),
      ),
    );
  }
  if (colors.text && colors.panelAlt) {
    const surfaceForeground = accessibleForeground(colors.text, [colors.panelAlt]);
    tokens.hoverFillForeground = surfaceForeground;
    tokens.accentForeground = surfaceForeground;
    tokens.userBubbleForeground = surfaceForeground;
    tokens.codeFg = surfaceForeground;
  }
  if (colors.highlight) {
    tokens.ring = accessibleForeground(
      colors.highlight,
      [colors.background, colors.panel].filter((value): value is string => Boolean(value)),
      3,
    );
    tokens.sidebarRing = tokens.ring;
  } else if (colors.accent) {
    tokens.ring = colors.accent;
    tokens.sidebarRing = colors.accent;
  }
  if (colors.line) {
    tokens.border = colors.line;
    tokens.borderSubtle = colors.line;
    tokens.divider = colors.line;
    tokens.input = colors.line;
    tokens.sidebarBorder = colors.line;
    tokens.composerBorder = colors.line;
  }
  return tokens;
}

type RgbChannels = readonly [number, number, number];

function rgbChannels(color: string): RgbChannels | undefined {
  const hex = color.trim().match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    const compact = hex[1]!.length <= 4;
    const value = compact
      ? hex[1]!
          .slice(0, 3)
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : hex[1]!.slice(0, 6);
    const number = Number.parseInt(value, 16);
    return [number >> 16, (number >> 8) & 255, number & 255];
  }
  const rgb = color.match(
    /rgba?\(\s*([\d.]+)(%)?[\s,]+([\d.]+)(%)?[\s,]+([\d.]+)(%)?(?:\s*[/,][^)]+)?\s*\)/i,
  );
  if (!rgb) return undefined;
  const channel = (value: string, percent: string | undefined) =>
    Math.max(0, Math.min(255, Math.round(Number(value) * (percent ? 2.55 : 1))));
  return [channel(rgb[1]!, rgb[2]), channel(rgb[3]!, rgb[4]), channel(rgb[5]!, rgb[6])];
}

function relativeLuminance([red, green, blue]: RgbChannels): number {
  const linear = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrastRatio(foreground: RgbChannels, background: RgbChannels): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function mixChannels(from: RgbChannels, to: RgbChannels, amount: number): RgbChannels {
  return from.map((channel, index) =>
    Math.round(channel + (to[index]! - channel) * amount),
  ) as unknown as RgbChannels;
}

function channelsToHex(channels: RgbChannels): string {
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Preserve the authored hue while nudging foregrounds to WCAG-readable contrast. */
function accessibleForeground(
  foreground: string,
  backgrounds: readonly string[],
  minimumRatio = 4.5,
): string {
  const foregroundChannels = rgbChannels(foreground);
  const backgroundChannels = backgrounds.map(rgbChannels);
  if (!foregroundChannels || backgroundChannels.some((value) => !value)) return foreground;
  const resolvedBackgrounds = backgroundChannels as RgbChannels[];
  const passes = (candidate: RgbChannels) =>
    resolvedBackgrounds.every((background) => contrastRatio(candidate, background) >= minimumRatio);
  if (passes(foregroundChannels)) return foreground;

  const candidates: Array<{ amount: number; channels: RgbChannels }> = [];
  for (const target of [[0, 0, 0] as const, [255, 255, 255] as const]) {
    if (!passes(target)) continue;
    let low = 0;
    let high = 1;
    for (let index = 0; index < 20; index += 1) {
      const middle = (low + high) / 2;
      if (passes(mixChannels(foregroundChannels, target, middle))) high = middle;
      else low = middle;
    }
    candidates.push({ amount: high, channels: mixChannels(foregroundChannels, target, high) });
  }
  candidates.sort((left, right) => left.amount - right.amount);
  return candidates[0] ? channelsToHex(candidates[0].channels) : foreground;
}

function rgbValue(color: string, fallback: string): string {
  return rgbChannels(color)?.join(" ") ?? fallback;
}

function numberOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function shadowValue(shadow: ThemeSkinMaterials["shadow"]): string {
  if (shadow === "none") return "none";
  if (shadow === "strong") return "0 18px 56px rgb(var(--skin-background-rgb) / 0.38)";
  return "0 12px 34px rgb(var(--skin-background-rgb) / 0.26)";
}

function isSafeThemeAssetUrl(value: string | undefined, allowBuiltin = false): value is string {
  if (!value) return false;
  if (allowBuiltin && BUILTIN_BACKGROUND_URLS.has(value)) return true;
  // Bundled assets may arrive with cache-busting query strings after HMR/build.
  if (allowBuiltin) {
    for (const builtin of BUILTIN_BACKGROUND_URLS) {
      if (value === builtin || value.startsWith(`${builtin}?`) || value.startsWith(`${builtin}#`)) {
        return true;
      }
    }
    if (
      /theme-skins\/(?:miku-stage|zhang-ruonan)(?:[-.][\w]+)?\.(?:jpe?g|png|webp)(?:[?#].*)?$/i.test(
        value,
      )
    ) {
      return true;
    }
  }
  try {
    const url = new URL(value, "https://pix.local");
    if (url.protocol === "blob:") return true;
    if (
      url.protocol === "pix-theme:" &&
      (/^skin-[a-f0-9-]{36}$/i.test(url.hostname) || isThemePresetId(url.hostname))
    ) {
      return true;
    }
    // Vite dev / packaged asset URLs for the three built-in wallpapers.
    if (
      allowBuiltin &&
      (url.protocol === "http:" ||
        url.protocol === "https:" ||
        url.protocol === "file:" ||
        url.protocol === "app:" ||
        url.protocol === "atom:" ||
        value.startsWith("/"))
    ) {
      return /theme-skins\/(?:miku-stage|zhang-ruonan)/i.test(url.pathname);
    }
    return false;
  } catch {
    return false;
  }
}

const SKIN_CSS_VARIABLES = [
  "--theme-background",
  "--skin-wallpaper-base",
  "--skin-wallpaper-image",
  "--skin-art-position",
  "--skin-art-size",
  "--skin-wallpaper-dim",
  "--skin-background-rgb",
  "--skin-panel-rgb",
  "--skin-text-rgb",
  "--skin-accent-rgb",
  "--skin-sidebar-opacity",
  "--skin-sidebar-panel-opacity",
  "--skin-page-opacity",
  "--skin-header-opacity",
  "--skin-panel-opacity",
  "--skin-popover-opacity",
  "--skin-blur",
  "--skin-radius",
  "--skin-border-alpha",
  "--skin-border-inset-alpha",
  "--skin-material-border",
  "--skin-sidebar-border",
  "--skin-composer-border",
  "--skin-shadow",
  "--skin-task-intensity",
] as const;

const CUSTOM_THEME_STYLE_ID = "pix-theme-custom-css";

function applyCustomThemeCss(value: string | undefined): void {
  document.getElementById(CUSTOM_THEME_STYLE_ID)?.remove();
  if (!value) return;
  try {
    const css = scopeThemeCustomCss(value);
    if (!css) return;
    const style = document.createElement("style");
    style.id = CUSTOM_THEME_STYLE_ID;
    style.textContent = css;
    document.head.append(style);
  } catch {
    // Invalid live drafts remain editable without affecting the running interface.
  }
}

function clearAppliedThemeSkin(root: HTMLElement, colorMode: ResolvedColorMode): void {
  root.dataset.theme = colorMode;
  root.style.colorScheme = colorMode;
  delete root.dataset.themeSkin;
  delete root.dataset.themeSkinActive;
  delete root.dataset.themeSkinMode;
  delete root.dataset.themeSkinSafeArea;
  delete root.dataset.themeSkinDensity;
  delete root.dataset.themeSkinSidebarTranslucent;
  delete root.dataset.themeSkinSidebarGlass;
  for (const cssVariable of Object.values(THEME_TOKEN_CSS_VARIABLES)) {
    root.style.removeProperty(cssVariable);
  }
  for (const cssVariable of SKIN_CSS_VARIABLES) root.style.removeProperty(cssVariable);
  applyCustomThemeCss(undefined);
}

/** Apply a complete native skin while leaving agent and typography preferences untouched. */
export function applyThemeSelection(
  selection: ThemeSelection,
  colorMode: ResolvedColorMode,
  skins: readonly ThemeSkinRecord[] = [],
  preview?: ThemePreview,
  sidebarTranslucent = false,
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (isDefaultThemeSelection(selection) && !preview) {
    clearAppliedThemeSkin(root, colorMode);
    return;
  }
  const skin = activeThemePack(selection, skins, preview);
  const pack = skin.config;
  const mode = resolveSkinColorMode(pack, colorMode);
  const variant = resolveThemeVariant(pack, colorMode);
  const colors = { ...paletteForMode(mode), ...resolveThemeColors(pack, colorMode) };
  const materials = { ...MATERIAL_DEFAULTS, ...pack.materials };
  const art = pack.art ?? {};

  root.dataset.themeSkin = selection.id;
  root.dataset.themeSkinActive = "true";
  root.dataset.themeSkinMode = mode;
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  root.dataset.themeSkinSafeArea = art.safeArea ?? "center";
  for (const cssVariable of Object.values(THEME_TOKEN_CSS_VARIABLES))
    root.style.removeProperty(cssVariable);
  for (const cssVariable of SKIN_CSS_VARIABLES) root.style.removeProperty(cssVariable);
  root.dataset.themeSkinDensity = materials.density;

  // Merge mode palette so skins without explicit panelAlt still get a muted
  // protrusion fill (matches pre-skin --composer-protrusion behavior).
  const derivedTokens = colorTokens({
    ...paletteForMode(mode),
    ...resolveThemeColors(pack, colorMode),
  });
  const normalizedVariantTokens = normalizedThemeTokens(variant.tokens);
  const tokens = ensureSemanticTokenContrast(
    { ...derivedTokens, ...normalizedVariantTokens },
    normalizedVariantTokens,
  );
  if (variant.background) root.style.setProperty("--theme-background", variant.background);
  for (const [token, value] of Object.entries(tokens)) {
    const tokenName = themeTokenName(token);
    if (tokenName) root.style.setProperty(THEME_TOKEN_CSS_VARIABLES[tokenName], value);
  }
  const hasWallpaper = isSafeThemeAssetUrl(skin.backgroundUrl, true);
  // Native frosted rail and material opacity glass are mutually exclusive.
  root.dataset.themeSkinSidebarTranslucent = sidebarTranslucent ? "true" : "false";
  root.dataset.themeSkinSidebarGlass = resolveSidebarMaterialGlass(pack, sidebarTranslucent)
    ? "true"
    : "false";
  root.style.setProperty(
    "--skin-wallpaper-base",
    variant.background ?? tokens.background ?? colors.background,
  );
  root.style.setProperty(
    "--skin-wallpaper-image",
    hasWallpaper ? `url(${JSON.stringify(skin.backgroundUrl)})` : "none",
  );
  root.style.setProperty(
    "--skin-art-position",
    `${Math.round(numberOr(art.focusX, ART_DEFAULTS.focusX) * 100)}% ${Math.round(numberOr(art.focusY, ART_DEFAULTS.focusY) * 100)}%`,
  );
  root.style.setProperty(
    "--skin-art-size",
    wallpaperFitToCssSize(
      art.wallpaperFit ?? ART_DEFAULTS.wallpaperFit,
      numberOr(art.zoom, ART_DEFAULTS.zoom),
    ),
  );
  root.style.setProperty("--skin-wallpaper-dim", String(numberOr(art.dim, ART_DEFAULTS.dim)));
  root.style.setProperty(
    "--skin-background-rgb",
    rgbValue(tokens.background ?? colors.background, mode === "dark" ? "18 18 18" : "247 247 246"),
  );
  root.style.setProperty(
    "--skin-panel-rgb",
    rgbValue(tokens.surfacePanel ?? colors.panel, mode === "dark" ? "32 32 32" : "255 255 255"),
  );
  root.style.setProperty(
    "--skin-text-rgb",
    rgbValue(tokens.foreground ?? colors.text, mode === "dark" ? "245 245 245" : "25 25 25"),
  );
  root.style.setProperty(
    "--skin-accent-rgb",
    rgbValue(tokens.primary ?? colors.accent, mode === "dark" ? "210 210 210" : "32 32 32"),
  );
  const sidebarOpacity = numberOr(materials.sidebarOpacity, MATERIAL_DEFAULTS.sidebarOpacity);
  const pageOpacity = numberOr(materials.pageOpacity, MATERIAL_DEFAULTS.pageOpacity);
  const panelOpacity = numberOr(materials.panelOpacity, MATERIAL_DEFAULTS.panelOpacity);
  root.style.setProperty("--skin-sidebar-opacity", String(sidebarOpacity));
  root.style.setProperty(
    "--skin-sidebar-panel-opacity",
    String(Math.min(1, sidebarOpacity + 0.08)),
  );
  root.style.setProperty("--skin-page-opacity", String(pageOpacity));
  root.style.setProperty("--skin-header-opacity", String(Math.min(1, pageOpacity + 0.1)));
  root.style.setProperty("--skin-panel-opacity", String(panelOpacity));
  root.style.setProperty("--skin-popover-opacity", String(Math.min(1, panelOpacity + 0.06)));
  root.style.setProperty(
    "--skin-blur",
    `${Math.round(numberOr(materials.blur, MATERIAL_DEFAULTS.blur))}px`,
  );
  root.style.setProperty(
    "--skin-radius",
    `${Math.round(numberOr(materials.radius, MATERIAL_DEFAULTS.radius))}px`,
  );
  root.style.setProperty(
    "--skin-border-alpha",
    String(numberOr(materials.borderAlpha, MATERIAL_DEFAULTS.borderAlpha)),
  );
  root.style.setProperty(
    "--skin-border-inset-alpha",
    String(Math.min(1, numberOr(materials.borderAlpha, MATERIAL_DEFAULTS.borderAlpha) * 0.85)),
  );
  const materialBorder =
    explicitThemeToken(variant.tokens, "border") ??
    "rgb(var(--skin-text-rgb) / var(--skin-border-alpha))";
  root.style.setProperty("--skin-material-border", materialBorder);
  root.style.setProperty(
    "--skin-sidebar-border",
    explicitThemeToken(variant.tokens, "sidebarBorder") ?? materialBorder,
  );
  root.style.setProperty(
    "--skin-composer-border",
    explicitThemeToken(variant.tokens, "composerBorder") ?? materialBorder,
  );
  root.style.setProperty("--skin-shadow", shadowValue(materials.shadow));
  root.style.setProperty(
    "--skin-task-intensity",
    String(numberOr(art.taskIntensity, ART_DEFAULTS.taskIntensity)),
  );
  applyCustomThemeCss(pack.customCss);
}
