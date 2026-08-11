import type { ThemeLibrarySnapshot, ThemeSkinConfig, ThemeSkinRecord } from "@zeno/contracts";
import {
  ArrowUp,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  Folder,
  ImagePlus,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  SquarePen,
  Terminal,
  Trash2,
  Upload,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type WheelEvent,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MAX_THEME_CUSTOM_CSS_LENGTH,
  scopeThemeCustomCss,
  validateThemeCustomCss,
} from "../../../shared/theme-css.ts";
import { t, type Locale, type MessageKey } from "../../lib/i18n.ts";
import { cn } from "../../lib/utils.ts";
import {
  activeThemePack,
  ART_DEFAULTS,
  BUILTIN_THEME_BACKGROUNDS,
  createThemeSkinDraft,
  DEFAULT_THEME_ID,
  MATERIAL_DEFAULTS,
  serializeThemePack,
  themeEditorPreview,
  themePreview,
  themePreviewShadow,
  THEME_TOKEN_CSS_VARIABLES,
  THEME_PRESETS,
  THEME_PRESET_IDS,
  THEME_WALLPAPER_FITS,
  wallpaperFitToCssSize,
  isDefaultThemeSelection,
  isThemeImagePresetId,
  isThemePresetId,
  type ThemeImagePresetId,
  type ThemePreview,
  type ThemeSelection,
  type ThemeWallpaperFit,
} from "../../lib/theme-packs.ts";
import { PixLogo } from "../PixLogo.tsx";
import { SettingsButton, SettingsSectionBlock } from "./SettingsPrimitives.tsx";

type ThemeEditorMode = "create" | "edit";
type ThemeEditorColorMode = "light" | "dark";
type ThemeEditorTab = "theme" | "css";

const CUSTOM_CSS_EXAMPLE = `.composer-card {
  border-radius: 26px;
  box-shadow: 0 18px 48px rgb(0 0 0 / 24%);
}

.thread-messages.empty h1 {
  color: color-mix(in srgb, var(--primary) 82%, var(--foreground));
}`;

const CUSTOM_CSS_VARIABLES: ReadonlyArray<{
  variable: string;
  descriptionKey: MessageKey;
}> = [
  {
    variable: THEME_TOKEN_CSS_VARIABLES.background,
    descriptionKey: "appearance.themeSkinCssVarBackground",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.foreground,
    descriptionKey: "appearance.themeSkinCssVarForeground",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.surfacePanel,
    descriptionKey: "appearance.themeSkinCssVarSurfacePanel",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.surfaceMuted,
    descriptionKey: "appearance.themeSkinCssVarSurfaceMuted",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.surfaceSoft,
    descriptionKey: "appearance.themeSkinCssVarSurfaceSoft",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.primary,
    descriptionKey: "appearance.themeSkinCssVarPrimary",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.primaryForeground,
    descriptionKey: "appearance.themeSkinCssVarPrimaryForeground",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.secondary,
    descriptionKey: "appearance.themeSkinCssVarSecondary",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.secondaryForeground,
    descriptionKey: "appearance.themeSkinCssVarSecondaryForeground",
  },
  { variable: THEME_TOKEN_CSS_VARIABLES.muted, descriptionKey: "appearance.themeSkinCssVarMuted" },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.mutedForeground,
    descriptionKey: "appearance.themeSkinCssVarMutedForeground",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.hoverFill,
    descriptionKey: "appearance.themeSkinCssVarHoverFill",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.hoverFillForeground,
    descriptionKey: "appearance.themeSkinCssVarHoverFillForeground",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.accent,
    descriptionKey: "appearance.themeSkinCssVarAccent",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.accentForeground,
    descriptionKey: "appearance.themeSkinCssVarAccentForeground",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.destructive,
    descriptionKey: "appearance.themeSkinCssVarDestructive",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.border,
    descriptionKey: "appearance.themeSkinCssVarBorder",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.borderSubtle,
    descriptionKey: "appearance.themeSkinCssVarBorderSubtle",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.divider,
    descriptionKey: "appearance.themeSkinCssVarDivider",
  },
  { variable: THEME_TOKEN_CSS_VARIABLES.input, descriptionKey: "appearance.themeSkinCssVarInput" },
  { variable: THEME_TOKEN_CSS_VARIABLES.ring, descriptionKey: "appearance.themeSkinCssVarRing" },
  { variable: THEME_TOKEN_CSS_VARIABLES.link, descriptionKey: "appearance.themeSkinCssVarLink" },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.switchOn,
    descriptionKey: "appearance.themeSkinCssVarSwitchOn",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.sidebar,
    descriptionKey: "appearance.themeSkinCssVarSidebar",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.sidebarForeground,
    descriptionKey: "appearance.themeSkinCssVarSidebarForeground",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.sidebarPrimary,
    descriptionKey: "appearance.themeSkinCssVarSidebarPrimary",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.sidebarPrimaryForeground,
    descriptionKey: "appearance.themeSkinCssVarSidebarPrimaryForeground",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.sidebarBorder,
    descriptionKey: "appearance.themeSkinCssVarSidebarBorder",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.sidebarRing,
    descriptionKey: "appearance.themeSkinCssVarSidebarRing",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.composerBorder,
    descriptionKey: "appearance.themeSkinCssVarComposerBorder",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.composerProtrusion,
    descriptionKey: "appearance.themeSkinCssVarComposerProtrusion",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.userBubble,
    descriptionKey: "appearance.themeSkinCssVarUserBubble",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.userBubbleForeground,
    descriptionKey: "appearance.themeSkinCssVarUserBubbleForeground",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.codeBg,
    descriptionKey: "appearance.themeSkinCssVarCodeBg",
  },
  {
    variable: THEME_TOKEN_CSS_VARIABLES.codeFg,
    descriptionKey: "appearance.themeSkinCssVarCodeFg",
  },
];

type ThemeSkinStudioProps = {
  locale: Locale;
  colorMode: "light" | "dark";
  selection: ThemeSelection;
  library: ThemeLibrarySnapshot;
  sidebarTranslucent: boolean;
  onSelection: (selection: ThemeSelection) => void;
  onLibrary: (library: ThemeLibrarySnapshot) => void;
  onPreview: (preview: ThemePreview | undefined) => void;
};

function cloneConfig(config: ThemeSkinConfig): ThemeSkinConfig {
  return JSON.parse(JSON.stringify(config)) as ThemeSkinConfig;
}

function selectedRecord(
  selection: ThemeSelection,
  library: ThemeLibrarySnapshot,
): ThemeSkinRecord | undefined {
  return library.skins.find((skin) => skin.id === selection.id);
}

function colorValue(value: string | undefined, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : fallback;
}

function updateVariantColor(
  config: ThemeSkinConfig,
  colorMode: "light" | "dark",
  key: "background" | "panel" | "accent" | "text",
  value: string,
): ThemeSkinConfig {
  const variant = config[colorMode] ?? {};
  return {
    ...config,
    [colorMode]: {
      ...variant,
      ...(key === "background" ? { background: value } : {}),
      colors: { ...variant.colors, [key]: value },
    },
  };
}

function updateArt(
  config: ThemeSkinConfig,
  key: "focusX" | "focusY" | "zoom" | "dim" | "taskIntensity",
  value: number,
): ThemeSkinConfig {
  return { ...config, art: { ...config.art, [key]: value } };
}

function updateWallpaperFit(config: ThemeSkinConfig, fit: ThemeWallpaperFit): ThemeSkinConfig {
  return { ...config, art: { ...config.art, wallpaperFit: fit } };
}

function updateMaterials(
  config: ThemeSkinConfig,
  key: "sidebarOpacity" | "pageOpacity" | "panelOpacity" | "blur" | "radius" | "borderAlpha",
  value: number,
): ThemeSkinConfig {
  return { ...config, materials: { ...config.materials, [key]: value } };
}

function updateCustomCss(config: ThemeSkinConfig, value: string): ThemeSkinConfig {
  const next = { ...config };
  if (value) next.customCss = value;
  else delete next.customCss;
  return next;
}

function sliderValue(value: number | undefined, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

/** Live shell preview for the forced light/dark tab (mode-local variant colors). */
function previewForMode(
  config: ThemeSkinConfig,
  mode: ThemeEditorColorMode,
  hasWallpaper = false,
  sidebarTranslucent = false,
) {
  return themeEditorPreview(config, mode, { hasWallpaper, sidebarTranslucent });
}

function previewCustomCss(customCss: string | undefined): string {
  try {
    return scopeThemeCustomCss(customCss, ".theme-skin-preview-scope");
  } catch {
    return "";
  }
}

function customCssError(customCss: string | undefined): string | undefined {
  try {
    validateThemeCustomCss(customCss);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid CSS";
  }
}

function ThemeAppPreview(props: {
  config: ThemeSkinConfig;
  mode: ThemeEditorColorMode;
  locale: Locale;
  sidebarTranslucent: boolean;
  backgroundUrl?: string;
}) {
  const tr = (key: MessageKey) => t(props.locale, key);
  const hasWallpaper = Boolean(props.backgroundUrl);
  const preview = previewForMode(props.config, props.mode, hasWallpaper, props.sidebarTranslucent);
  // Same merge order as applyThemeSelection so sliders match the live shell.
  const art = { ...ART_DEFAULTS, ...props.config.art };
  const materials = { ...MATERIAL_DEFAULTS, ...props.config.materials };
  const scopedCss = previewCustomCss(props.config.customCss);
  const sidebarOpacity = materials.sidebarOpacity;
  const pageOpacity = materials.pageOpacity;
  const panelOpacity = materials.panelOpacity;
  const taskIntensity = art.taskIntensity;
  const safeArea = art.safeArea ?? ART_DEFAULTS.safeArea;
  const wallpaperFit = art.wallpaperFit ?? ART_DEFAULTS.wallpaperFit;
  const panelShadow = themePreviewShadow(preview.shadow, preview.backgroundRgb);
  const artPosition = `${Math.round(art.focusX * 100)}% ${Math.round(art.focusY * 100)}%`;
  const artSize = wallpaperFitToCssSize(wallpaperFit, art.zoom);
  // Same CSS variables as applyThemeSelection → live .skin-wallpaper.
  const previewStyle = {
    background: preview.backgroundSolid,
    color: preview.text,
    colorScheme: props.mode,
    "--preview-rail-width": "28%",
    "--preview-surface": preview.surface,
    "--preview-panel-alt": preview.panelAlt,
    "--preview-primary": preview.primary,
    "--preview-text": preview.text,
    "--preview-muted": preview.muted,
    "--preview-line": preview.line,
    "--preview-background-rgb": preview.backgroundRgb,
    "--preview-panel-rgb": preview.panelRgb,
    "--preview-panel-alt-rgb": preview.panelAltRgb,
    "--preview-sidebar-rgb": preview.sidebarRgb,
    "--preview-text-rgb": preview.textRgb,
    "--preview-accent-rgb": preview.accentRgb,
    "--background": preview.backgroundSolid,
    "--theme-background": preview.background,
    "--primary": preview.primary,
    "--primary-foreground": preview.primaryForeground,
    "--foreground": preview.text,
    "--surface-panel": preview.surface,
    "--surface-muted": preview.panelAlt,
    "--muted-foreground": preview.muted,
    "--composer-protrusion": preview.composerProtrusion,
    "--composer-border": preview.composerMaterialBorder,
    "--bg-composer": preview.surface,
    "--sidebar": preview.sidebar,
    "--sidebar-border": preview.line,
    "--border": preview.line,
    "--preview-material-border": preview.materialBorder,
    "--preview-sidebar-material-border": preview.sidebarMaterialBorder,
    "--preview-sidebar-opacity": String(sidebarOpacity),
    "--preview-sidebar-panel-opacity": String(Math.min(1, sidebarOpacity + 0.08)),
    "--preview-page-opacity": String(pageOpacity),
    "--preview-header-opacity": String(Math.min(1, pageOpacity + 0.1)),
    "--preview-panel-opacity": String(panelOpacity),
    "--preview-task-intensity": String(taskIntensity),
    "--preview-blur": `${Math.round(materials.blur)}px`,
    "--preview-radius": `${Math.round(materials.radius)}px`,
    "--preview-border-alpha": String(materials.borderAlpha),
    "--preview-panel-shadow": panelShadow,
    "--skin-wallpaper-base": preview.background,
    "--skin-wallpaper-image": hasWallpaper ? `url(${JSON.stringify(props.backgroundUrl)})` : "none",
    "--skin-art-position": artPosition,
    "--skin-art-size": artSize,
    "--skin-wallpaper-dim": String(art.dim),
    "--skin-background-rgb": preview.backgroundRgb,
  } as CSSProperties;

  return (
    <div
      className="theme-skin-studio-preview theme-skin-preview-scope"
      data-preview-mode={props.mode}
      data-preview-glass={preview.glass ? "true" : "false"}
      data-preview-sidebar-translucent={preview.sidebarTranslucent ? "true" : "false"}
      data-preview-sidebar-glass={preview.sidebarGlass ? "true" : "false"}
      data-preview-safe-area={safeArea}
      data-preview-has-wallpaper={hasWallpaper ? "true" : "false"}
      data-theme={props.mode}
      style={previewStyle}
    >
      {scopedCss ? <style>{scopedCss}</style> : null}

      {/* Full-canvas wallpaper: same geometry as live .skin-wallpaper (::before image + ::after scrim). */}
      <div className="theme-skin-studio-wallpaper" aria-hidden />

      {/*
        Live shell: absolute rail over full-bleed content with padding-left + background-clip.
        Wallpaper stays viewport-sized so cover/contain/focus% match the real window.
      */}
      <div className="theme-skin-preview-app" aria-hidden="true">
        <main className="theme-skin-preview-main">
          <header className="theme-skin-preview-header">
            <div className="theme-skin-preview-header-title">
              <strong>{tr("thread.new")}</strong>
              <MoreHorizontal aria-hidden="true" strokeWidth={1.8} />
            </div>
            <div className="theme-skin-preview-header-actions">
              <Terminal aria-hidden="true" strokeWidth={1.7} />
              <Layers aria-hidden="true" strokeWidth={1.7} />
            </div>
          </header>
          <div
            className="theme-skin-preview-empty-hero"
            data-testid="theme-skin-preview-empty-hero"
          >
            <PixLogo className="theme-skin-preview-empty-logo" title={tr("app.name")} />
            <h1>{tr("empty.titleConversation")}</h1>
            <p>{tr("empty.subtitleConversation")}</p>
          </div>
          <div className="theme-skin-preview-composer-dock">
            <div className="theme-skin-preview-project-bar">
              <Folder aria-hidden="true" strokeWidth={1.75} />
              <span>{tr("composer.project.pick")}</span>
            </div>
            <div className="theme-skin-preview-composer composer-card-with-protrusion">
              <div className="theme-skin-preview-prompt">{tr("composer.placeholder")}</div>
              <div className="theme-skin-preview-composer-controls">
                <div className="theme-skin-preview-composer-left">
                  <Plus aria-hidden="true" strokeWidth={2} />
                  <span>{tr("composer.access.default")}</span>
                </div>
                <div className="theme-skin-preview-composer-right">
                  <Sparkles aria-hidden="true" strokeWidth={1.75} />
                  <span>{tr("composer.model.none")}</span>
                  <span className="theme-skin-preview-send">
                    <ArrowUp aria-hidden="true" strokeWidth={2.25} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </main>

        <aside
          className="theme-skin-preview-sidebar"
          data-preview-sidebar={
            preview.sidebarTranslucent ? "native" : preview.sidebarGlass ? "glass" : "solid"
          }
        >
          <div className="theme-skin-preview-brand">
            <span className="theme-skin-preview-brand-name">{tr("app.name")}</span>
            <Search className="theme-skin-preview-brand-search" strokeWidth={1.7} />
          </div>
          <nav className="theme-skin-preview-nav" aria-hidden>
            <div className="theme-skin-preview-nav-item" data-primary="true">
              <SquarePen aria-hidden="true" strokeWidth={1.7} />
              <span>{tr("nav.newThread")}</span>
            </div>
            <div className="theme-skin-preview-nav-item">
              <Boxes aria-hidden="true" strokeWidth={1.7} />
              <span>{tr("nav.packages")}</span>
            </div>
            <div className="theme-skin-preview-nav-item">
              <Layers aria-hidden="true" strokeWidth={1.7} />
              <span>{tr("nav.resources")}</span>
            </div>
          </nav>
          <div className="theme-skin-preview-section">
            <div className="theme-skin-preview-section-head">
              <span className="theme-skin-preview-section-label">{tr("section.threads")}</span>
              <ChevronRight
                className="theme-skin-preview-section-chevron"
                strokeWidth={2.25}
                aria-hidden
              />
            </div>
            <div className="theme-skin-preview-thread-row" data-active="true">
              <span>{tr("thread.new")}</span>
            </div>
            <div className="theme-skin-preview-thread-row">
              <span>{tr("thread.current")}</span>
            </div>
          </div>
          <div className="theme-skin-preview-sidebar-spacer" />
          <div className="theme-skin-preview-sidebar-footer">
            <div className="theme-skin-preview-nav-item">
              <SettingsIcon aria-hidden="true" strokeWidth={1.7} />
              <span>{tr("nav.settings")}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function themeExportFileName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "pix-skin"}.json`;
}

function downloadBuiltin(config: ThemeSkinConfig): void {
  const blob = new Blob([serializeThemePack(config)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = themeExportFileName(config.name);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ThemeSkinStudio(props: ThemeSkinStudioProps) {
  const tr = (key: MessageKey, vars?: Record<string, string>) => t(props.locale, key, vars);
  const imageInput = useRef<HTMLInputElement>(null);
  const customCssInput = useRef<HTMLTextAreaElement>(null);
  const customCssSelection = useRef<{ start: number; end: number } | undefined>(undefined);
  const themeTrack = useRef<HTMLDivElement>(null);
  const previewImageUrl = useRef<string | undefined>(undefined);
  const [editorMode, setEditorMode] = useState<ThemeEditorMode | undefined>();
  const [editorColorMode, setEditorColorMode] = useState<ThemeEditorColorMode>(props.colorMode);
  const [editorTab, setEditorTab] = useState<ThemeEditorTab>("theme");
  const [draft, setDraft] = useState<ThemeSkinConfig | undefined>();
  const [backgroundPath, setBackgroundPath] = useState<string | undefined>();
  const [backgroundBuiltinId, setBackgroundBuiltinId] = useState<ThemeImagePresetId | undefined>();
  const [initialBackgroundBuiltinId, setInitialBackgroundBuiltinId] = useState<
    ThemeImagePresetId | undefined
  >();
  const [removeBackground, setRemoveBackground] = useState(false);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  /** Remount key so the CSS variable select returns to its placeholder after insert. */
  const [cssVariableSelectKey, setCssVariableSelectKey] = useState(0);
  const defaultSelected = isDefaultThemeSelection(props.selection);
  const activeRecord = selectedRecord(props.selection, props.library);
  const activePack = activeThemePack(props.selection, props.library.skins);
  const editable = draft;
  const editorRecord = editorMode === "edit" ? activeRecord : undefined;
  const editorBackgroundUrl =
    previewImageUrl.current ??
    (!removeBackground
      ? (editorRecord?.backgroundUrl ??
        (backgroundBuiltinId ? BUILTIN_THEME_BACKGROUNDS[backgroundBuiltinId] : undefined))
      : undefined);

  const cards = useMemo(() => {
    const skinById = new Map(props.library.skins.map((record) => [record.id, record]));
    const cardForRecord = (record: (typeof props.library.skins)[number]) => ({
      id: record.id,
      config: record.config,
      backgroundUrl:
        record.backgroundUrl ??
        (isThemeImagePresetId(record.backgroundBuiltinId)
          ? BUILTIN_THEME_BACKGROUNDS[record.backgroundBuiltinId]
          : isThemeImagePresetId(record.id)
            ? BUILTIN_THEME_BACKGROUNDS[record.id]
            : undefined),
      record,
    });
    const defaultCard = {
      id: DEFAULT_THEME_ID,
      config: {
        schemaVersion: 1 as const,
        name: t(props.locale, "appearance.themeSkinDefault"),
      },
      backgroundUrl: undefined,
      record: undefined as (typeof props.library.skins)[number] | undefined,
    };
    // Preserve custom-first ordering, then show the unskinned default before editable built-ins.
    const customCards = props.library.skins
      .filter((record) => !isThemePresetId(record.id))
      .map(cardForRecord);
    const builtinCards = THEME_PRESET_IDS.map((id) => {
      const override = skinById.get(id);
      if (override) return cardForRecord(override);
      return {
        id,
        config: THEME_PRESETS[id],
        backgroundUrl: isThemeImagePresetId(id) ? BUILTIN_THEME_BACKGROUNDS[id] : undefined,
        record: undefined as (typeof props.library.skins)[number] | undefined,
      };
    });
    return [...customCards, defaultCard, ...builtinCards];
  }, [props.colorMode, props.library.skins, props.locale]);

  function updateTrackControls(): void {
    const track = themeTrack.current;
    if (!track) return;
    setCanScrollBack(track.scrollLeft > 2);
    setCanScrollForward(track.scrollLeft + track.clientWidth < track.scrollWidth - 2);
  }

  useEffect(() => {
    const track = themeTrack.current;
    if (!track) return;
    const frame = requestAnimationFrame(updateTrackControls);
    const observer = new ResizeObserver(updateTrackControls);
    observer.observe(track);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [cards.length]);

  function scrollThemeTrack(direction: -1 | 1): void {
    const track = themeTrack.current;
    if (!track) return;
    track.scrollBy({
      left: direction * Math.max(190, track.clientWidth * 0.72),
      behavior: "smooth",
    });
  }

  function onThemeTrackWheel(event: WheelEvent<HTMLDivElement>): void {
    const track = themeTrack.current;
    if (!track || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    event.preventDefault();
    track.scrollLeft += event.deltaY;
    updateTrackControls();
  }

  function revokePreviewImage(): void {
    if (previewImageUrl.current) URL.revokeObjectURL(previewImageUrl.current);
    previewImageUrl.current = undefined;
  }

  function revokePreviewAssets(): void {
    revokePreviewImage();
  }

  function applyPreview(config: ThemeSkinConfig, backgroundUrl?: string): void {
    // Always send an explicit wallpaper value: a URL keeps it, "" clears it.
    // Omitting the key would make color-only edits inherit the previous skin.
    props.onPreview({
      config,
      backgroundUrl: backgroundUrl ?? "",
    });
  }

  function clearEditor(): void {
    revokePreviewAssets();
    setBackgroundPath(undefined);
    setBackgroundBuiltinId(undefined);
    setInitialBackgroundBuiltinId(undefined);
    setRemoveBackground(false);
    setDraft(undefined);
    setEditorTab("theme");
    setEditorMode(undefined);
    props.onPreview(undefined);
  }

  useEffect(
    () => () => {
      revokePreviewAssets();
      props.onPreview(undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only editor cleanup
    [],
  );

  function openCreateEditor(): void {
    revokePreviewAssets();
    const next = createThemeSkinDraft(tr("appearance.themeSkinDefaultName"));
    setEditorColorMode(props.colorMode);
    setEditorTab("theme");
    setBackgroundPath(undefined);
    setBackgroundBuiltinId(undefined);
    setInitialBackgroundBuiltinId(undefined);
    setRemoveBackground(false);
    setDraft(next);
    setEditorMode("create");
    setMessage(undefined);
    applyPreview(next);
  }

  function openEditEditor(): void {
    if (defaultSelected) return;
    revokePreviewAssets();
    const sourcePresetId = isThemeImagePresetId(props.selection.id)
      ? props.selection.id
      : isThemeImagePresetId(activeRecord?.backgroundBuiltinId)
        ? activeRecord.backgroundBuiltinId
        : undefined;
    const next = cloneConfig(activePack.config);
    if (isThemePresetId(props.selection.id)) next.id = props.selection.id;
    else if (activeRecord) next.id = activeRecord.id;
    else delete next.id;
    setEditorColorMode(props.colorMode);
    setEditorTab("theme");
    setBackgroundPath(undefined);
    setBackgroundBuiltinId(sourcePresetId);
    setInitialBackgroundBuiltinId(sourcePresetId);
    setRemoveBackground(false);
    setDraft(next);
    setEditorMode("edit");
    setMessage(undefined);
    applyPreview(next, activePack.backgroundUrl);
  }

  /**
   * Factory config for "Restore defaults".
   * Built-in presets must reload THEME_PRESETS (not the on-disk override),
   * so materials match the product defaults again.
   */
  function factoryDraftConfig(): ThemeSkinConfig {
    if (editorMode === "edit" && isThemePresetId(props.selection.id)) {
      const factory = cloneConfig(THEME_PRESETS[props.selection.id]);
      factory.id = props.selection.id;
      return factory;
    }
    if (
      editorMode === "edit" &&
      initialBackgroundBuiltinId &&
      isThemeImagePresetId(initialBackgroundBuiltinId)
    ) {
      // Custom skin that started from a built-in wallpaper: restore that preset's chrome defaults.
      const factory = cloneConfig(THEME_PRESETS[initialBackgroundBuiltinId]);
      if (editable?.id) factory.id = editable.id;
      factory.name = editable?.name?.trim() || factory.name;
      return factory;
    }
    if (editorMode === "edit" && editable) {
      // Pure custom: keep identity, reset chrome to draft defaults.
      const factory = createThemeSkinDraft(editable.name);
      if (editable.id) factory.id = editable.id;
      factory.name = editable.name;
      return factory;
    }
    return createThemeSkinDraft(tr("appearance.themeSkinDefaultName"));
  }

  function resetDraft(): void {
    const next = factoryDraftConfig();
    revokePreviewAssets();
    setBackgroundPath(undefined);
    const restoreBuiltin =
      editorMode === "edit" &&
      isThemePresetId(props.selection.id) &&
      isThemeImagePresetId(props.selection.id)
        ? props.selection.id
        : editorMode === "edit"
          ? initialBackgroundBuiltinId
          : undefined;
    setBackgroundBuiltinId(restoreBuiltin);
    setRemoveBackground(false);
    setDraft(next);
    const wallpaper =
      editorMode === "edit"
        ? isThemePresetId(props.selection.id) && isThemeImagePresetId(props.selection.id)
          ? BUILTIN_THEME_BACKGROUNDS[props.selection.id]
          : restoreBuiltin
            ? BUILTIN_THEME_BACKGROUNDS[restoreBuiltin]
            : undefined
        : undefined;
    applyPreview(next, wallpaper);
  }

  function changeDraft(next: ThemeSkinConfig): void {
    setDraft(next);
    applyPreview(next, editorBackgroundUrl);
  }

  function rememberCustomCssSelection(): void {
    const input = customCssInput.current;
    if (!input) return;
    customCssSelection.current = {
      start: input.selectionStart,
      end: input.selectionEnd,
    };
  }

  function insertCustomCssVariable(variable: string): void {
    if (!editable) return;
    const input = customCssInput.current;
    const current = editable.customCss ?? "";
    const remembered = customCssSelection.current;
    const start = remembered?.start ?? input?.selectionStart ?? current.length;
    const end = remembered?.end ?? input?.selectionEnd ?? current.length;
    const value = `var(${variable})`;
    changeDraft(
      updateCustomCss(editable, `${current.slice(0, start)}${value}${current.slice(end)}`),
    );
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + value.length, start + value.length);
      customCssSelection.current = {
        start: start + value.length,
        end: start + value.length,
      };
    });
  }

  async function selectSkin(id: string): Promise<void> {
    if (busy || id === props.selection.id) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const library = await window.pix.themes.activate(id);
      props.onLibrary(library);
      props.onSelection({ id: library.activeId });
    } catch {
      setMessage(tr("appearance.themeSkinError"));
    } finally {
      setBusy(false);
    }
  }

  async function importSkin(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const library = await window.pix.themes.importPick();
      if (!library) return;
      props.onLibrary(library);
      props.onSelection({ id: library.activeId });
    } catch {
      setMessage(tr("appearance.themeSkinImportError"));
    } finally {
      setBusy(false);
    }
  }

  async function exportSkin(): Promise<void> {
    if (busy || defaultSelected) return;
    if (!activeRecord) {
      downloadBuiltin(activePack.config);
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      await window.pix.themes.exportPick(activeRecord.id);
    } catch {
      setMessage(tr("appearance.themeSkinError"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteSkin(): Promise<void> {
    if (!activeRecord || busy || !window.confirm(tr("appearance.themeSkinDeleteConfirm"))) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const library = await window.pix.themes.remove(activeRecord.id);
      props.onLibrary(library);
      props.onSelection({ id: library.activeId });
    } catch {
      setMessage(tr("appearance.themeSkinError"));
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(): Promise<void> {
    if (!editable || !editorMode || busy) return;
    setBusy(true);
    setMessage(undefined);
    try {
      // Built-ins save under their factory id so edits replace the preset instead of cloning.
      const saveId =
        editorMode === "edit"
          ? isThemePresetId(props.selection.id)
            ? props.selection.id
            : activeRecord?.id
          : undefined;
      const resolvedBuiltinBackground =
        backgroundBuiltinId ??
        (editorMode === "edit" &&
        isThemeImagePresetId(props.selection.id) &&
        !backgroundPath &&
        !removeBackground &&
        !activeRecord?.backgroundUrl
          ? props.selection.id
          : undefined);
      const library = await window.pix.themes.save({
        ...(saveId ? { id: saveId } : {}),
        config: editable,
        ...(backgroundPath ? { backgroundPath } : {}),
        ...(resolvedBuiltinBackground ? { backgroundBuiltinId: resolvedBuiltinBackground } : {}),
        ...(removeBackground ? { removeBackground: true } : {}),
      });
      revokePreviewAssets();
      setBackgroundPath(undefined);
      setRemoveBackground(false);
      setDraft(undefined);
      setEditorMode(undefined);
      props.onPreview(undefined);
      props.onLibrary(library);
      props.onSelection({ id: library.activeId });
      setMessage(tr("appearance.themeSkinSaved"));
    } catch {
      setMessage(tr("appearance.themeSkinError"));
    } finally {
      setBusy(false);
    }
  }

  async function chooseBackground(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editable) return;
    const path = window.pix.workspace.pathForFile(file);
    if (!path) {
      setMessage(tr("appearance.themeSkinError"));
      return;
    }
    revokePreviewImage();
    previewImageUrl.current = URL.createObjectURL(file);
    setBackgroundPath(path);
    setBackgroundBuiltinId(undefined);
    setRemoveBackground(false);
    applyPreview(editable, previewImageUrl.current);
  }

  function removeWallpaper(): void {
    if (!editable) return;
    revokePreviewImage();
    setBackgroundPath(undefined);
    setBackgroundBuiltinId(undefined);
    setRemoveBackground(true);
    applyPreview(editable);
  }

  // The dialog follows the active interface; only the mock app changes with the preview switch.
  const dialogPreview = previewForMode(
    editable ?? activePack.config,
    props.colorMode,
    false,
    props.sidebarTranslucent,
  );
  const effectiveColors = {
    ...(editable ?? activePack.config).colors,
    ...(editable ?? activePack.config)[editorColorMode]?.colors,
  };
  const cssValidationError = customCssError(editable?.customCss);
  const dialogStyle = {
    "--theme-dialog-background": dialogPreview.surface,
    "--theme-dialog-canvas": dialogPreview.background,
    "--theme-dialog-text": dialogPreview.text,
    "--theme-dialog-muted": dialogPreview.muted,
    "--theme-dialog-accent": dialogPreview.primary,
    "--theme-dialog-accent-foreground": dialogPreview.primaryForeground,
    "--theme-dialog-line": dialogPreview.line,
  } as CSSProperties;

  return (
    <>
      <SettingsSectionBlock
        label={tr("appearance.themeLibrary")}
        testId="settings-appearance-theme-library"
      >
        <div className="theme-skin-library">
          <div className="theme-skin-rail">
            <button
              type="button"
              className="theme-skin-scroll-button"
              data-side="back"
              data-testid="appearance-theme-skin-scroll-back"
              aria-label={tr("appearance.themeSkinScrollBack")}
              disabled={!canScrollBack}
              onClick={() => scrollThemeTrack(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <div
              ref={themeTrack}
              className="theme-skin-grid"
              role="list"
              onScroll={updateTrackControls}
              onWheel={onThemeTrackWheel}
            >
              {cards.map((skin) => {
                const preview =
                  skin.id === DEFAULT_THEME_ID
                    ? undefined
                    : themePreview(skin.config, props.colorMode, {
                        sidebarTranslucent: props.sidebarTranslucent,
                      });
                const selected = skin.id === props.selection.id;
                return (
                  <button
                    key={skin.id}
                    type="button"
                    className="theme-skin-card"
                    data-active={selected ? "true" : "false"}
                    data-testid={`appearance-theme-skin-${skin.id}`}
                    aria-pressed={selected}
                    disabled={busy}
                    onClick={() => void selectSkin(skin.id)}
                  >
                    <span
                      className="theme-skin-card-art"
                      style={{
                        // Avoid the `background` shorthand so wallpaper images are not cleared.
                        backgroundColor:
                          preview?.backgroundSolid || preview?.background || "var(--background)",
                        ...(skin.backgroundUrl
                          ? {
                              backgroundImage: `linear-gradient(135deg, rgb(0 0 0 / .04), rgb(0 0 0 / .3)), url(${JSON.stringify(skin.backgroundUrl)})`,
                              backgroundPosition: `${Math.round((skin.config.art?.focusX ?? 0.5) * 100)}% ${Math.round((skin.config.art?.focusY ?? 0.5) * 100)}%`,
                              backgroundRepeat: "no-repeat",
                              backgroundSize: wallpaperFitToCssSize(
                                skin.config.art?.wallpaperFit ?? ART_DEFAULTS.wallpaperFit,
                                skin.config.art?.zoom ?? ART_DEFAULTS.zoom,
                              ),
                            }
                          : {}),
                      }}
                    >
                      <span
                        className="theme-skin-card-glass"
                        style={{ background: preview?.surface ?? "var(--surface-panel)" }}
                      >
                        <span
                          className="theme-skin-card-accent"
                          style={{ background: preview?.primary ?? "var(--primary)" }}
                        />
                      </span>
                    </span>
                    <span className="theme-skin-card-name">{skin.config.name}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="theme-skin-scroll-button"
              data-side="forward"
              data-testid="appearance-theme-skin-scroll-forward"
              aria-label={tr("appearance.themeSkinScrollForward")}
              disabled={!canScrollForward}
              onClick={() => scrollThemeTrack(1)}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <div className="theme-skin-library-actions">
            <SettingsButton
              type="button"
              variant="secondary"
              size="sm"
              testId="appearance-theme-skin-new"
              disabled={busy}
              onClick={openCreateEditor}
            >
              <Plus className="size-3.5" strokeWidth={1.75} />
              {tr("appearance.themeSkinNew")}
            </SettingsButton>
            <SettingsButton
              type="button"
              variant="ghost"
              size="sm"
              testId="appearance-theme-skin-import"
              disabled={busy}
              onClick={() => void importSkin()}
            >
              <Upload className="size-3.5" strokeWidth={1.75} />
              {tr("appearance.themeSkinImport")}
            </SettingsButton>
            {!defaultSelected ? (
              <>
                <SettingsButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  testId="appearance-theme-skin-edit"
                  disabled={busy}
                  onClick={openEditEditor}
                >
                  <Pencil className="size-3.5" strokeWidth={1.75} />
                  {tr("appearance.themeSkinEdit")}
                </SettingsButton>
                <SettingsButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  testId="appearance-theme-skin-export"
                  disabled={busy}
                  onClick={() => void exportSkin()}
                >
                  <Download className="size-3.5" strokeWidth={1.75} />
                  {tr("appearance.themeSkinExport")}
                </SettingsButton>
              </>
            ) : null}
            {activeRecord ? (
              <SettingsButton
                type="button"
                variant="ghost"
                size="sm"
                testId="appearance-theme-skin-delete"
                danger
                disabled={busy}
                onClick={() => void deleteSkin()}
              >
                <Trash2 className="size-3.5" strokeWidth={1.75} />
                {tr("appearance.themeSkinDelete")}
              </SettingsButton>
            ) : null}
          </div>
          {!editorMode && message ? (
            <p className="theme-skin-library-message" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </SettingsSectionBlock>

      <Dialog
        open={editorMode !== undefined}
        onOpenChange={(open) => {
          if (!open && !busy) clearEditor();
        }}
      >
        <DialogContent
          className="theme-skin-dialog"
          data-dialog-mode={props.colorMode}
          data-testid="appearance-theme-skin-studio"
          style={dialogStyle}
        >
          <DialogHeader className="theme-skin-dialog-header">
            <DialogTitle>
              {tr(
                editorMode === "edit"
                  ? "appearance.themeSkinEditTitle"
                  : "appearance.themeSkinNewTitle",
              )}
            </DialogTitle>
          </DialogHeader>

          {editable ? (
            <Tabs
              value={editorTab}
              onValueChange={(value) => setEditorTab(value as ThemeEditorTab)}
              className="theme-skin-dialog-tabs"
            >
              <TabsList variant="line" className="theme-skin-dialog-tabs-list">
                <TabsTrigger value="theme" data-testid="appearance-theme-skin-tab-theme">
                  {tr("appearance.themeSkinTabTheme")}
                </TabsTrigger>
                <TabsTrigger value="css" data-testid="appearance-theme-skin-tab-css">
                  {tr("appearance.themeSkinTabCss")}
                </TabsTrigger>
              </TabsList>
              <form
                className="theme-skin-dialog-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveDraft();
                }}
              >
                <TabsContent value="theme" className="theme-skin-dialog-tab-content">
                  <div className="theme-skin-dialog-body">
                    <div className="theme-skin-dialog-preview-column">
                      <div className="theme-skin-preview-toolbar">
                        <span>{tr("appearance.themeSkinPreview")}</span>
                        <div className="theme-skin-mode-switch" role="group">
                          {(["light", "dark"] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              data-active={editorColorMode === mode ? "true" : "false"}
                              onClick={() => setEditorColorMode(mode)}
                            >
                              {tr(
                                mode === "light" ? "appearance.themeLight" : "appearance.themeDark",
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      <ThemeAppPreview
                        config={editable}
                        mode={editorColorMode}
                        locale={props.locale}
                        sidebarTranslucent={props.sidebarTranslucent}
                        {...(editorBackgroundUrl ? { backgroundUrl: editorBackgroundUrl } : {})}
                      />

                      <div className="theme-skin-dialog-asset-actions">
                        <div className="theme-skin-dialog-asset-actions-left">
                          <input
                            ref={imageInput}
                            className="sr-only"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            data-testid="appearance-theme-skin-background-file"
                            onChange={(event) => void chooseBackground(event)}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-testid="appearance-theme-skin-background"
                            disabled={busy}
                            onClick={() => imageInput.current?.click()}
                          >
                            <ImagePlus className="size-3.5" strokeWidth={1.75} />
                            {tr("appearance.themeSkinChooseBackground")}
                          </Button>
                          {editorBackgroundUrl ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={removeWallpaper}
                            >
                              {tr("appearance.themeSkinRemoveBackground")}
                            </Button>
                          ) : null}
                        </div>
                        {editorBackgroundUrl ? (
                          <div className="theme-skin-dialog-asset-fit">
                            <Select
                              value={editable.art?.wallpaperFit ?? ART_DEFAULTS.wallpaperFit}
                              onValueChange={(value) => {
                                if (
                                  value === "cover" ||
                                  value === "contain" ||
                                  value === "stretch"
                                ) {
                                  changeDraft(updateWallpaperFit(editable, value));
                                }
                              }}
                            >
                              <SelectTrigger
                                data-testid="appearance-theme-skin-wallpaper-fit"
                                size="sm"
                                className="theme-skin-dialog-asset-fit-trigger"
                                aria-label={tr("appearance.themeSkinWallpaperFit")}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent align="end" side="top">
                                {THEME_WALLPAPER_FITS.map((fit) => (
                                  <SelectItem
                                    key={fit}
                                    value={fit}
                                    data-testid={`appearance-theme-skin-wallpaper-fit-${fit}`}
                                  >
                                    {tr(
                                      fit === "cover"
                                        ? "appearance.themeSkinWallpaperFitCover"
                                        : fit === "contain"
                                          ? "appearance.themeSkinWallpaperFitContain"
                                          : "appearance.themeSkinWallpaperFitStretch",
                                    )}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="theme-skin-dialog-controls">
                      <FieldGroup className="theme-skin-studio-grid">
                        <Field className="theme-skin-field-wide">
                          <FieldLabel htmlFor="theme-skin-name">
                            {tr("appearance.themeSkinName")}
                          </FieldLabel>
                          <Input
                            id="theme-skin-name"
                            data-testid="appearance-theme-skin-name"
                            value={editable.name}
                            maxLength={80}
                            autoFocus
                            onChange={(event) =>
                              changeDraft({ ...editable, name: event.target.value })
                            }
                          />
                        </Field>
                        {(
                          [
                            ["background", tr("appearance.themeSkinBackgroundColor"), "#1a1a1a"],
                            ["panel", tr("appearance.themeSkinPanelColor"), "#2a2a2a"],
                            ["accent", tr("appearance.themeSkinAccentColor"), "#379cfc"],
                            ["text", tr("appearance.themeSkinTextColor"), "#f5f5f5"],
                          ] as const
                        ).map(([key, label, fallback]) => (
                          <Field
                            key={key}
                            orientation="horizontal"
                            className="theme-skin-color-field"
                          >
                            <FieldLabel htmlFor={`theme-skin-color-${key}`}>{label}</FieldLabel>
                            <Input
                              id={`theme-skin-color-${key}`}
                              type="color"
                              value={colorValue(effectiveColors[key], fallback)}
                              onChange={(event) =>
                                changeDraft(
                                  updateVariantColor(
                                    editable,
                                    editorColorMode,
                                    key,
                                    event.target.value,
                                  ),
                                )
                              }
                            />
                          </Field>
                        ))}
                      </FieldGroup>

                      <div className="theme-skin-slider-grid">
                        {(
                          [
                            [
                              "focusX",
                              tr("appearance.themeSkinFocusX"),
                              0,
                              1,
                              0.01,
                              ART_DEFAULTS.focusX,
                            ],
                            [
                              "focusY",
                              tr("appearance.themeSkinFocusY"),
                              0,
                              1,
                              0.01,
                              ART_DEFAULTS.focusY,
                            ],
                            // Zoom only refines cover mode (crop scale).
                            ...((editable.art?.wallpaperFit ?? ART_DEFAULTS.wallpaperFit) ===
                            "cover"
                              ? ([
                                  [
                                    "zoom",
                                    tr("appearance.themeSkinZoom"),
                                    0.75,
                                    1.5,
                                    0.01,
                                    ART_DEFAULTS.zoom,
                                  ],
                                ] as const)
                              : ([] as const)),
                            ["dim", tr("appearance.themeSkinDim"), 0, 0.75, 0.01, ART_DEFAULTS.dim],
                            [
                              "taskIntensity",
                              tr("appearance.themeSkinTaskIntensity"),
                              0.2,
                              1,
                              0.01,
                              ART_DEFAULTS.taskIntensity,
                            ],
                          ] as const
                        ).map(([key, label, min, max, step, fallback]) => {
                          const value = sliderValue(editable.art?.[key], fallback);
                          return (
                            <label key={key} className="theme-skin-slider">
                              <span>
                                {label}
                                <output>{Math.round(value * 100)}%</output>
                              </span>
                              <input
                                type="range"
                                min={min}
                                max={max}
                                step={step}
                                value={value}
                                onChange={(event) =>
                                  changeDraft(updateArt(editable, key, Number(event.target.value)))
                                }
                              />
                            </label>
                          );
                        })}
                        {(
                          [
                            [
                              "sidebarOpacity",
                              tr("appearance.themeSkinSidebarOpacity"),
                              0.35,
                              1,
                              0.01,
                              MATERIAL_DEFAULTS.sidebarOpacity,
                            ],
                            [
                              "pageOpacity",
                              tr("appearance.themeSkinPageOpacity"),
                              0.35,
                              1,
                              0.01,
                              MATERIAL_DEFAULTS.pageOpacity,
                            ],
                            [
                              "panelOpacity",
                              tr("appearance.themeSkinPanelOpacity"),
                              0.35,
                              1,
                              0.01,
                              MATERIAL_DEFAULTS.panelOpacity,
                            ],
                            [
                              "blur",
                              tr("appearance.themeSkinBlur"),
                              0,
                              36,
                              1,
                              MATERIAL_DEFAULTS.blur,
                            ],
                            [
                              "radius",
                              tr("appearance.themeSkinRadius"),
                              0,
                              32,
                              1,
                              MATERIAL_DEFAULTS.radius,
                            ],
                            [
                              "borderAlpha",
                              tr("appearance.themeSkinBorderAlpha"),
                              0,
                              0.8,
                              0.01,
                              MATERIAL_DEFAULTS.borderAlpha,
                            ],
                          ] as const
                        ).map(([key, label, min, max, step, fallback]) => {
                          const value = sliderValue(editable.materials?.[key], fallback);
                          // Native translucent ignores sidebarOpacity (and rail blur via glass path).
                          const nativeTranslucent = props.sidebarTranslucent;
                          const opacityLocked = nativeTranslucent && key === "sidebarOpacity";
                          return (
                            <label
                              key={key}
                              className={cn(
                                "theme-skin-slider",
                                opacityLocked && "theme-skin-slider-disabled",
                              )}
                              title={
                                key === "sidebarOpacity"
                                  ? nativeTranslucent
                                    ? tr("appearance.themeSkinSidebarOpacityDisabledHint")
                                    : tr("appearance.themeSkinSidebarOpacityHint")
                                  : undefined
                              }
                            >
                              <span>
                                {label}
                                <output>
                                  {key === "blur" || key === "radius"
                                    ? `${value}px`
                                    : `${Math.round(value * 100)}%`}
                                </output>
                              </span>
                              <input
                                type="range"
                                min={min}
                                max={max}
                                step={step}
                                value={value}
                                disabled={opacityLocked}
                                data-testid={
                                  key === "sidebarOpacity"
                                    ? "appearance-theme-skin-sidebar-opacity"
                                    : undefined
                                }
                                onChange={(event) =>
                                  changeDraft(
                                    updateMaterials(editable, key, Number(event.target.value)),
                                  )
                                }
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="css" className="theme-skin-dialog-tab-content">
                  <section className="theme-skin-css-page">
                    <div className="theme-skin-control-section-title">
                      <Code2 aria-hidden="true" />
                      <span>{tr("appearance.themeSkinCustomCss")}</span>
                      <div className="theme-skin-css-toolbar">
                        <Select
                          key={cssVariableSelectKey}
                          onOpenChange={(open) => {
                            if (open) rememberCustomCssSelection();
                          }}
                          onValueChange={(value) => {
                            insertCustomCssVariable(value);
                            setCssVariableSelectKey((key) => key + 1);
                          }}
                        >
                          <SelectTrigger
                            size="sm"
                            className="theme-skin-css-variable-select"
                            data-testid="appearance-theme-skin-css-variable"
                            aria-label={tr("appearance.themeSkinCssVariables")}
                            onPointerDown={() => rememberCustomCssSelection()}
                          >
                            <SelectValue placeholder={tr("appearance.themeSkinCssVariables")} />
                          </SelectTrigger>
                          <SelectContent
                            className="theme-skin-css-variable-menu"
                            position="popper"
                            align="end"
                          >
                            {CUSTOM_CSS_VARIABLES.map((item) => (
                              <SelectItem
                                key={item.variable}
                                value={item.variable}
                                className="theme-skin-css-variable-item"
                                data-testid={`appearance-theme-skin-css-variable-${item.variable.slice(2)}`}
                              >
                                <span className="theme-skin-css-variable-item-main">
                                  <code>var({item.variable})</code>
                                  <span>{tr(item.descriptionKey)}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            changeDraft({
                              ...editable,
                              customCss: editable.customCss?.trim()
                                ? `${editable.customCss.trim()}\n\n${CUSTOM_CSS_EXAMPLE}`
                                : CUSTOM_CSS_EXAMPLE,
                            })
                          }
                        >
                          {tr("appearance.themeSkinCssExample")}
                        </Button>
                      </div>
                    </div>
                    <textarea
                      ref={customCssInput}
                      className="theme-skin-css-editor"
                      data-testid="appearance-theme-skin-custom-css"
                      value={editable.customCss ?? ""}
                      maxLength={MAX_THEME_CUSTOM_CSS_LENGTH}
                      spellCheck={false}
                      onSelect={rememberCustomCssSelection}
                      onKeyUp={rememberCustomCssSelection}
                      onClick={rememberCustomCssSelection}
                      onChange={(event) =>
                        changeDraft(updateCustomCss(editable, event.target.value))
                      }
                    />
                    <div
                      className="theme-skin-css-status"
                      data-invalid={cssValidationError ? "true" : "false"}
                    >
                      {cssValidationError ? (
                        <span>{tr("appearance.themeSkinCssInvalid")}</span>
                      ) : null}
                      <output>
                        {(editable.customCss?.length ?? 0).toLocaleString()} /{" "}
                        {MAX_THEME_CUSTOM_CSS_LENGTH.toLocaleString()}
                      </output>
                    </div>
                  </section>
                </TabsContent>

                <DialogFooter className="theme-skin-dialog-footer">
                  {message ? (
                    <p className="theme-skin-dialog-message" role="status">
                      {message}
                    </p>
                  ) : null}
                  <Button type="button" variant="ghost" disabled={busy} onClick={clearEditor}>
                    {tr("appearance.themeSkinCancel")}
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={resetDraft}>
                    {tr("appearance.themeSkinReset")}
                  </Button>
                  <Button
                    type="submit"
                    data-testid="appearance-theme-skin-save"
                    disabled={busy || !editable.name.trim() || Boolean(cssValidationError)}
                  >
                    {tr(
                      editorMode === "create"
                        ? "appearance.themeSkinCreate"
                        : "appearance.themeSkinSave",
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
