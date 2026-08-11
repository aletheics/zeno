import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { ThemeSkinRecord } from "@zeno/contracts";
import {
  activeThemePack,
  applyThemeSelection,
  ART_DEFAULTS,
  wallpaperFitToCssSize,
  BUILTIN_THEME_BACKGROUNDS,
  createThemeSkinDraft,
  DEFAULT_THEME_SELECTION,
  isGlassThemeMaterials,
  isSidebarGlassSkin,
  loadThemeSelection,
  MATERIAL_DEFAULTS,
  parseThemePackJson,
  resolveSidebarMaterialGlass,
  resolveThemeVariant,
  saveThemeSelection,
  themeEditorPreview,
  THEME_IMAGE_PRESET_IDS,
  THEME_PRESET_IDS,
  THEME_PRESETS,
} from "./theme-packs.ts";

function contrastRatio(foreground: string | undefined, background: string | undefined): number {
  const luminance = (value: string | undefined) => {
    const match = value?.match(/^#([0-9a-f]{6})$/i);
    if (!match) throw new Error(`Expected a six-digit hex color, received ${String(value)}`);
    const channels = match[1]!
      .match(/../g)!
      .map((part) => Number.parseInt(part, 16) / 255)
      .map((part) => (part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4));
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

describe("theme-packs", () => {
  let storage: Map<string, string>;
  let styles: Map<string, string>;
  let dataset: Record<string, string>;
  let customStyle: { id: string; textContent: string; remove: () => void } | undefined;

  beforeEach(() => {
    storage = new Map<string, string>();
    styles = new Map<string, string>();
    dataset = {};
    customStyle = undefined;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, String(value)),
      },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        getElementById: (id: string) => (customStyle?.id === id ? customStyle : undefined),
        createElement: () => {
          const node = {
            id: "",
            textContent: "",
            remove: () => {
              customStyle = undefined;
            },
          };
          return node;
        },
        head: {
          append: (node: typeof customStyle) => {
            customStyle = node;
          },
        },
        documentElement: {
          dataset,
          style: {
            setProperty: (key: string, value: string) => styles.set(key, value),
            removeProperty: (key: string) => styles.delete(key),
          },
        },
      },
    });
  });

  it("maps a Dream Skin-style theme document into a native Zeno skin", () => {
    const pack = parseThemePackJson(
      JSON.stringify({
        schemaVersion: 1,
        name: "Moon room",
        appearance: "dark",
        image: "background.webp",
        colors: { panel: "#101820", accent: "#54d4ca", text: "#e8ffff" },
        art: { focusX: 0.72, safeArea: "left", taskIntensity: 0.7 },
        materials: { blur: 20, panelOpacity: 0.8 },
        customCss: ".composer-card { border-radius: 24px; }",
      }),
    );

    expect(pack.name).toBe("Moon room");
    expect(pack.image).toBe("background.webp");
    expect(pack.colors?.accent).toBe("#54d4ca");
    expect(pack.art?.safeArea).toBe("left");
    expect(pack.customCss).toContain(".composer-card");
    expect(resolveThemeVariant(pack, "light")).toEqual({});
  });

  it("keeps Zeno's original light/dark token packs compatible", () => {
    const pack = parseThemePackJson(
      '{"meta":{"name":"Dual"},"light":{"tokens":{"primary":"#0f766e"}},"dark":{"tokens":{"primary":"#f1ae80"}}}',
    );

    expect(resolveThemeVariant(pack, "light").tokens?.primary).toBe("#0f766e");
    expect(resolveThemeVariant(pack, "dark").tokens?.primary).toBe("#f1ae80");
  });

  it("starts new themes with neutral, readable glass defaults", () => {
    const draft = createThemeSkinDraft("Aurora");

    expect(draft.description).toBeUndefined();
    expect(draft.light?.background).toBe("linear-gradient(135deg, #f4f8ff 0%, #e7effa 100%)");
    expect(draft.dark?.background).toBe("linear-gradient(135deg, #1f1f1f 0%, #252525 100%)");
    expect(draft.light?.colors?.accent).toBe("#379cfc");
    expect(draft.dark?.colors?.accent).toBe("#379cfc");
    expect(draft.light?.colors?.secondary).toBe("#379cfc");
    expect(draft.materials).toMatchObject({
      sidebarOpacity: 0.64,
      pageOpacity: 0.35,
      blur: 0,
      panelOpacity: 0.74,
      radius: 20,
      borderAlpha: 0.3,
      shadow: "strong",
    });
    expect(draft.art).toMatchObject({
      focusX: 0.5,
      focusY: 0.5,
      zoom: 1,
      dim: 0.1,
      safeArea: "center",
      taskIntensity: 0.78,
    });
  });

  it("maps wallpaper fit modes to CSS background-size", () => {
    expect(wallpaperFitToCssSize("cover", 1)).toBe("cover");
    expect(wallpaperFitToCssSize("cover", 1.25)).toBe("125%");
    expect(wallpaperFitToCssSize("contain")).toBe("contain");
    expect(wallpaperFitToCssSize("stretch")).toBe("100% 100%");
  });

  it("ships image presets with adaptive palettes", () => {
    expect(THEME_PRESET_IDS).toEqual(THEME_IMAGE_PRESET_IDS);
    for (const id of THEME_IMAGE_PRESET_IDS) {
      expect(THEME_PRESETS[id].appearance).toBe("auto");
      expect(THEME_PRESETS[id].light?.colors?.text).toBeTruthy();
      expect(THEME_PRESETS[id].dark?.colors?.text).toBeTruthy();
      expect(BUILTIN_THEME_BACKGROUNDS[id]).toMatch(/\.jpg$/);
      expect(THEME_PRESETS[id].art).toMatchObject(ART_DEFAULTS);
      expect(THEME_PRESETS[id].materials).toMatchObject(MATERIAL_DEFAULTS);
    }
  });

  it("rejects remote images, unsafe CSS, and unsupported token names", () => {
    expect(() => parseThemePackJson('{"image":"https://example.com/skin.png"}')).toThrow("image");
    expect(() => parseThemePackJson('{"background":"url(https://example.com/skin.png)"}')).toThrow(
      "background",
    );
    expect(() => parseThemePackJson('{"tokens":{"--not-a-zeno-token":"#fff"}}')).toThrow(
      "Unsupported theme token",
    );
    expect(() =>
      parseThemePackJson(
        '{"customCss":".composer-card { background-image: url(https://example.com/a.png); }"}',
      ),
    ).toThrow("external resources");
  });

  it("ignores the removed per-skin translucent sidebar setting", () => {
    const parsed = parseThemePackJson(
      '{"schemaVersion":1,"name":"Legacy","sidebarTranslucent":true}',
    );
    expect(parsed).not.toHaveProperty("sidebarTranslucent");
  });

  it("persists only the active skin id and migrates an old preset selection", () => {
    expect(saveThemeSelection({ id: "skin-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" })).toEqual({
      id: "skin-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
    expect(loadThemeSelection()).toEqual({ id: "skin-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" });

    storage.set("zeno.theme.selection.v2", JSON.stringify({ presetId: "lagoon" }));
    expect(loadThemeSelection()).toEqual(DEFAULT_THEME_SELECTION);

    storage.set("zeno.theme.selection.v2", JSON.stringify({ id: "classic-light" }));
    expect(loadThemeSelection()).toEqual(DEFAULT_THEME_SELECTION);
    storage.set("zeno.theme.selection.v2", JSON.stringify({ presetId: "classic-dark" }));
    expect(loadThemeSelection()).toEqual(DEFAULT_THEME_SELECTION);
  });

  it("applies saved skins and fully clears them when returning to default", () => {
    const skin: ThemeSkinRecord = {
      id: "skin-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      backgroundUrl: "zeno-theme://skin-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/background?v=1",
      config: {
        schemaVersion: 1,
        name: "Glass room",
        appearance: "dark",
        colors: { background: "#102030", panel: "#203040", accent: "#4fd1c5", text: "#f0ffff" },
        art: { focusX: 0.7, zoom: 1.1, taskIntensity: 0.76 },
        materials: { blur: 24, panelOpacity: 0.8, density: "compact" },
        customCss: ".composer-card { border-radius: 25px; }",
      },
    };

    applyThemeSelection({ id: skin.id }, "dark", [skin]);
    expect(dataset.themeSkin).toBe(skin.id);
    expect(dataset.themeSkinActive).toBe("true");
    expect(dataset.themeSkinSidebarTranslucent).toBe("false");
    expect(dataset.themeSkinSidebarGlass).toBe("true");
    expect(styles.get("--skin-wallpaper-image")).toContain("zeno-theme://");
    expect(styles.get("--skin-blur")).toBe("24px");
    expect(styles.get("--primary")).toBe("#4fd1c5");
    expect(dataset.themeSkinDensity).toBe("compact");
    expect(dataset.theme).toBe("dark");
    expect(customStyle?.textContent).toContain(
      'html[data-theme-skin-active="true"] .composer-card',
    );

    applyThemeSelection({ id: skin.id }, "dark", [skin], undefined, true);
    expect(dataset.themeSkinSidebarTranslucent).toBe("true");
    expect(dataset.themeSkinSidebarGlass).toBe("false");

    applyThemeSelection(DEFAULT_THEME_SELECTION, "light");
    expect(dataset.theme).toBe("light");
    expect(dataset.themeSkin).toBeUndefined();
    expect(dataset.themeSkinActive).toBeUndefined();
    expect(dataset.themeSkinMode).toBeUndefined();
    expect(dataset.themeSkinSafeArea).toBeUndefined();
    expect(dataset.themeSkinDensity).toBeUndefined();
    expect(dataset.themeSkinSidebarTranslucent).toBeUndefined();
    expect(dataset.themeSkinSidebarGlass).toBeUndefined();
    expect(styles.get("--skin-wallpaper-image")).toBeUndefined();
    expect(styles.get("--primary")).toBeUndefined();
    expect(customStyle).toBeUndefined();

    applyThemeSelection(DEFAULT_THEME_SELECTION, "dark");
    expect(dataset.theme).toBe("dark");
    expect(styles.size).toBe(0);
  });

  it("derives readable semantic foregrounds without using text colors as fills", () => {
    for (const id of THEME_IMAGE_PRESET_IDS) {
      for (const mode of ["light", "dark"] as const) {
        applyThemeSelection({ id }, mode);
        expect(styles.get("--muted")).toBe(styles.get("--surface-muted"));
        expect(styles.get("--muted")).not.toBe(styles.get("--muted-foreground"));
        expect(styles.get("--hover-fill")).toBe(styles.get("--surface-muted"));
        expect(styles.get("--accent")).toBe(styles.get("--surface-muted"));

        for (const [foreground, background] of [
          ["--primary-foreground", "--primary"],
          ["--secondary-foreground", "--secondary"],
          ["--muted-foreground", "--muted"],
          ["--hover-fill-foreground", "--hover-fill"],
          ["--user-bubble-fg", "--user-bubble"],
          ["--code-fg", "--code-bg"],
          ["--link", "--background"],
        ] as const) {
          expect(
            contrastRatio(styles.get(foreground), styles.get(background)),
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("applies legacy CSS-variable token aliases without exposing arbitrary variables", () => {
    applyThemeSelection({ id: "skin-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }, "light", [
      {
        id: "skin-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        config: {
          schemaVersion: 1,
          name: "Alias",
          light: { tokens: { "--primary": "#158b83" } },
        },
      },
    ]);

    expect(styles.get("--primary")).toBe("#158b83");
    expect(styles.get("undefined")).toBeUndefined();
  });

  it("uses CSS-variable aliases in both material chrome and studio previews", () => {
    const config = {
      schemaVersion: 1 as const,
      name: "Token aliases",
      light: {
        tokens: {
          "--background": "#f8fafc",
          "--surface-panel": "#dbeafe",
          "--foreground": "#172554",
          "--primary": "#1d4ed8",
          "--sidebar": "#eff6ff",
          "--sidebar-border": "#93c5fd",
          "--composer-border": "#60a5fa",
        },
      },
    };
    const preview = themeEditorPreview(config, "light");
    expect(preview.backgroundSolid).toBe("#f8fafc");
    expect(preview.surface).toBe("#dbeafe");
    expect(preview.text).toBe("#172554");
    expect(preview.primary).toBe("#1d4ed8");
    expect(contrastRatio(preview.primaryForeground, preview.primary)).toBeGreaterThanOrEqual(4.5);
    expect(preview.sidebar).toBe("#eff6ff");
    expect(preview.sidebarMaterialBorder).toBe("#93c5fd");
    expect(preview.composerMaterialBorder).toBe("#60a5fa");

    applyThemeSelection({ id: "skin-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }, "light", [
      {
        id: "skin-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        config,
      },
    ]);
    expect(styles.get("--skin-panel-rgb")).toBe("219 234 254");
    expect(styles.get("--skin-sidebar-border")).toBe("#93c5fd");
    expect(styles.get("--skin-composer-border")).toBe("#60a5fa");
  });

  it("resolves built-ins and a saved library record without leaking unknown ids", () => {
    for (const id of THEME_IMAGE_PRESET_IDS) {
      expect(activeThemePack({ id })).toEqual({
        config: THEME_PRESETS[id],
        backgroundUrl: BUILTIN_THEME_BACKGROUNDS[id],
      });
    }
    expect(activeThemePack({ id: "unknown" })).toEqual({
      config: THEME_PRESETS["miku-stage"],
      backgroundUrl: BUILTIN_THEME_BACKGROUNDS["miku-stage"],
    });
  });

  it("keeps the outer native translucent setting and material opacity mutually exclusive", () => {
    expect(isSidebarGlassSkin(THEME_PRESETS["miku-stage"].materials)).toBe(true);
    expect(resolveSidebarMaterialGlass(THEME_PRESETS["miku-stage"], false)).toBe(true);
    expect(resolveSidebarMaterialGlass(THEME_PRESETS["miku-stage"], true)).toBe(false);
    expect(isSidebarGlassSkin({ sidebarOpacity: 1, blur: 36 })).toBe(false);
  });

  it("marks image skins as glass in the studio preview", () => {
    expect(isGlassThemeMaterials(THEME_PRESETS["miku-stage"].materials, true)).toBe(true);
    expect(isSidebarGlassSkin(THEME_PRESETS["miku-stage"].materials)).toBe(true);
    const mikuLight = themeEditorPreview(THEME_PRESETS["miku-stage"], "light", {
      hasWallpaper: true,
    });
    expect(mikuLight.glass).toBe(true);
    expect(mikuLight.sidebarTranslucent).toBe(false);
    expect(mikuLight.sidebarGlass).toBe(true);
    expect(mikuLight.surface).toBe("#f3fffc");
    const nativeMikuLight = themeEditorPreview(THEME_PRESETS["miku-stage"], "light", {
      hasWallpaper: true,
      sidebarTranslucent: true,
    });
    expect(nativeMikuLight.sidebarTranslucent).toBe(true);
    expect(nativeMikuLight.sidebarGlass).toBe(false);
    const mikuDark = themeEditorPreview(THEME_PRESETS["miku-stage"], "dark", {
      hasWallpaper: true,
    });
    expect(mikuDark.surface).toBe("#12343b");
    expect(mikuDark.text).toBe("#eefffd");
  });

  it("keeps the selected bundled wallpaper for an editable built-in copy", () => {
    const copied: ThemeSkinRecord = {
      id: "skin-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      backgroundBuiltinId: "miku-stage",
      config: { schemaVersion: 1, name: "初音未来 · 我的舞台" },
    };

    expect(activeThemePack({ id: copied.id }, [copied])).toEqual({
      config: copied.config,
      backgroundUrl: BUILTIN_THEME_BACKGROUNDS["miku-stage"],
    });
  });

  it("prefers an in-place built-in override over the factory preset", () => {
    const override: ThemeSkinRecord = {
      id: "zhang-ruonan",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      backgroundBuiltinId: "zhang-ruonan",
      config: {
        schemaVersion: 1,
        id: "zhang-ruonan",
        name: "章若楠 · 我的映画",
        light: { colors: { accent: "#112233" } },
      },
    };

    expect(activeThemePack({ id: "zhang-ruonan" }, [override])).toEqual({
      config: override.config,
      backgroundUrl: BUILTIN_THEME_BACKGROUNDS["zhang-ruonan"],
    });
  });

  it("keeps the active wallpaper when a live color preview omits backgroundUrl", () => {
    const preview = activeThemePack({ id: "zhang-ruonan" }, [], {
      config: {
        ...THEME_PRESETS["zhang-ruonan"],
        light: {
          ...THEME_PRESETS["zhang-ruonan"].light,
          colors: {
            ...THEME_PRESETS["zhang-ruonan"].light?.colors,
            accent: "#ff0000",
          },
        },
      },
    });

    expect(preview.backgroundUrl).toBe(BUILTIN_THEME_BACKGROUNDS["zhang-ruonan"]);
    expect(preview.config.light?.colors?.accent).toBe("#ff0000");
  });

  it("allows an explicit empty backgroundUrl to clear the wallpaper in studio", () => {
    const preview = activeThemePack({ id: "zhang-ruonan" }, [], {
      config: THEME_PRESETS["zhang-ruonan"],
      backgroundUrl: "",
    });

    expect(preview.backgroundUrl).toBeUndefined();
  });
});
