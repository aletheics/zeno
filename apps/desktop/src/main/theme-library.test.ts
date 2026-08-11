import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("electron", () => ({
  nativeImage: {
    createFromPath: () => ({
      isEmpty: () => false,
      getSize: () => ({ width: 1600, height: 900 }),
    }),
  },
}));

import { BUILTIN_THEME_SKIN_IDS, normalizeThemeSkinConfig, ThemeLibrary } from "./theme-library.ts";

const temporaryRoots: string[] = [];

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("ThemeLibrary", () => {
  it("starts with and persists the unskinned default selection", () => {
    const root = temporaryRoot("pix-theme-library-");
    const library = new ThemeLibrary(root);

    expect(library.list()).toMatchObject({ activeId: "default", skins: [] });
    expect(BUILTIN_THEME_SKIN_IDS).toEqual(["miku-stage", "zhang-ruonan"]);
    expect(library.activate("miku-stage").activeId).toBe("miku-stage");
    expect(library.activate("default").activeId).toBe("default");
    expect(new ThemeLibrary(root).list().activeId).toBe("default");
  });

  it("keeps the active skin when importing a portable package", () => {
    const root = temporaryRoot("pix-theme-library-");
    const packageDir = join(root, "portable");
    mkdirSync(packageDir);
    writeFileSync(
      join(packageDir, "theme.json"),
      JSON.stringify({
        schemaVersion: 1,
        name: "Imported tide",
        colors: { accent: "#158b83", panel: "#f5fffd" },
      }),
    );

    const library = new ThemeLibrary(root);
    library.activate("zhang-ruonan");
    const snapshot = library.importDirectory(packageDir);

    expect(snapshot.activeId).toBe("zhang-ruonan");
    expect(snapshot.skins).toHaveLength(1);
    expect(snapshot.skins[0]?.config.name).toBe("Imported tide");
  });

  it("uses the renderer's safe CSS contract for stored configuration", () => {
    expect(() =>
      normalizeThemeSkinConfig({
        schemaVersion: 1,
        name: "Unsafe",
        background: "url(https://example.com/wallpaper.png)",
      }),
    ).toThrow("background");
    expect(() =>
      normalizeThemeSkinConfig({
        schemaVersion: 1,
        name: "Unsafe token",
        light: { tokens: { "--not-a-pix-token": "#fff" } },
      }),
    ).toThrow("Unsupported theme token");

    const compatible = normalizeThemeSkinConfig({
      schemaVersion: 1,
      name: "Compatible token alias",
      light: {
        background:
          "radial-gradient(circle at 84% 12%, #b5efea 0%, transparent 34%), linear-gradient(128deg, #edf9f8 0%, #dceff0 100%)",
        tokens: { "--primary": "#158b83" },
      },
    });
    expect(compatible.light?.tokens?.["--primary"]).toBe("#158b83");
    expect(compatible.light?.background).toContain("radial-gradient");

    const legacySidebarSetting = normalizeThemeSkinConfig({
      schemaVersion: 1,
      name: "Legacy sidebar setting",
      sidebarTranslucent: true,
    });
    expect(legacySidebarSetting).not.toHaveProperty("sidebarTranslucent");

    const styled = normalizeThemeSkinConfig({
      schemaVersion: 1,
      name: "Scoped CSS",
      customCss: ".composer-card { border-radius: 26px; }",
    });
    expect(styled.customCss).toContain(".composer-card");
    expect(() =>
      normalizeThemeSkinConfig({
        schemaVersion: 1,
        name: "Remote CSS",
        customCss: '.composer-card { background-image: url("https://example.com/a.png"); }',
      }),
    ).toThrow("external resources");
    expect(() =>
      normalizeThemeSkinConfig({
        schemaVersion: 1,
        name: "Root CSS",
        customCss: "body { opacity: 0; }",
      }),
    ).toThrow("document root selectors");
  });

  it("exports managed wallpaper assets and falls back to the unskinned default", () => {
    const root = temporaryRoot("pix-theme-library-");
    const sourceImage = join(root, "source.png");
    const exportRoot = join(root, "exports");
    writeFileSync(sourceImage, "mock-image");
    mkdirSync(exportRoot);

    const library = new ThemeLibrary(root);
    const saved = library.save({
      config: {
        schemaVersion: 1,
        name: "Aurora glass",
      },
      backgroundPath: sourceImage,
    });
    const skin = saved.skins[0]!;
    expect(skin.backgroundUrl).toContain("/background");
    const output = library.exportDirectory(skin.id, exportRoot);
    const exportedConfig = JSON.parse(readFileSync(join(output, "theme.json"), "utf8")) as {
      image?: string;
    };

    expect(exportedConfig.image).toBe("background.png");
    expect(existsSync(join(output, "background.png"))).toBe(true);
    expect(JSON.parse(readFileSync(join(output, "manifest.json"), "utf8"))).toMatchObject({
      type: "pix-theme-skin",
      files: ["theme.json", "background.png"],
    });

    const afterRemoval = library.remove(skin.id);
    expect(afterRemoval.activeId).toBe("default");
    expect(afterRemoval.skins).toHaveLength(0);
  });

  it("edits a built-in theme in place under the same id", () => {
    const root = temporaryRoot("pix-theme-library-");
    const library = new ThemeLibrary(root);

    const snapshot = library.save({
      id: "miku-stage",
      config: {
        schemaVersion: 1,
        id: "miku-stage",
        name: "初音未来 · 我的舞台",
        light: { colors: { accent: "#00aabb" } },
      },
      backgroundBuiltinId: "miku-stage",
    });

    const edited = snapshot.skins[0]!;
    expect(edited.id).toBe("miku-stage");
    expect(edited.backgroundBuiltinId).toBe("miku-stage");
    expect(edited.backgroundUrl).toBeUndefined();
    expect(edited.config.name).toBe("初音未来 · 我的舞台");
    expect(edited.config.light?.colors?.accent).toBe("#00aabb");
    expect(snapshot.activeId).toBe("miku-stage");
    expect(snapshot.skins).toHaveLength(1);

    const again = library.save({
      id: "miku-stage",
      config: {
        schemaVersion: 1,
        id: "miku-stage",
        name: "初音未来 · 二次修改",
      },
    });
    expect(again.skins).toHaveLength(1);
    expect(again.skins[0]?.id).toBe("miku-stage");
    expect(again.skins[0]?.config.name).toBe("初音未来 · 二次修改");

    const restored = library.remove("miku-stage");
    expect(restored.skins).toHaveLength(0);
    expect(restored.activeId).toBe("miku-stage");
  });

  it("still creates uuid skins when no id is provided", () => {
    const root = temporaryRoot("pix-theme-library-");
    const library = new ThemeLibrary(root);
    const snapshot = library.save({
      config: { schemaVersion: 1, name: "Custom glass" },
      backgroundBuiltinId: "zhang-ruonan",
    });
    expect(snapshot.skins[0]?.id).toMatch(/^skin-/);
    expect(snapshot.skins[0]?.backgroundBuiltinId).toBe("zhang-ruonan");
  });

  it("migrates removed built-in presets to the unskinned default", () => {
    for (const activeId of ["classic-light", "classic-dark", "lagoon"]) {
      const root = temporaryRoot("pix-theme-library-");
      const libraryRoot = join(root, "theme-library");
      mkdirSync(libraryRoot);
      writeFileSync(
        join(libraryRoot, "index.json"),
        JSON.stringify({ version: 1, activeId, skins: [] }),
      );

      expect(new ThemeLibrary(root).list().activeId).toBe("default");
    }
  });

  it("rejects symbolic-link wallpaper sources", () => {
    if (process.platform === "win32") return;
    const root = temporaryRoot("pix-theme-library-");
    const sourceImage = join(root, "source.png");
    const linkedImage = join(root, "linked.png");
    writeFileSync(sourceImage, "mock-image");
    symlinkSync(sourceImage, linkedImage);

    const library = new ThemeLibrary(root);
    expect(() =>
      library.save({
        config: { schemaVersion: 1, name: "Linked image" },
        backgroundPath: linkedImage,
      }),
    ).toThrow("regular file");
  });
});
