import { describe, expect, it, beforeEach } from "vite-plus/test";
import {
  applyAppearancePrefs,
  DEFAULT_APPEARANCE_PREFS,
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
  loadAppearancePrefs,
  normalizeAppearancePrefs,
  patchAppearancePrefs,
  resetAppearancePrefs,
} from "./appearance-prefs.ts";

describe("appearance-prefs", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, String(v));
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
    const styleMap = new Map<string, string>();
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        documentElement: {
          style: {
            setProperty: (k: string, v: string) => {
              styleMap.set(k, v);
            },
            getPropertyValue: (k: string) => styleMap.get(k) ?? "",
          },
        },
      },
    });
  });

  it("normalizes and clamps out-of-range values", () => {
    const n = normalizeAppearancePrefs({
      uiFontSize: 3,
      codeFontSize: 99,
      uiFontFamily: "  Helvetica  ",
      codeFontFamily: "",
    });
    expect(n.uiFontSize).toBe(12);
    expect(n.codeFontSize).toBe(20);
    expect(n.uiFontFamily).toBe("Helvetica");
    expect(n.codeFontFamily).toBe(DEFAULT_CODE_FONT_FAMILY);
  });

  it("rejects control characters in font families", () => {
    const n = normalizeAppearancePrefs({
      uiFontFamily: "Bad\nFont",
      codeFontFamily: "Ok Mono",
    });
    expect(n.uiFontFamily).toBe(DEFAULT_UI_FONT_FAMILY);
    expect(n.codeFontFamily).toBe("Ok Mono");
  });

  it("persists patch and reset", () => {
    expect(loadAppearancePrefs()).toEqual(DEFAULT_APPEARANCE_PREFS);
    patchAppearancePrefs({
      uiFontSize: 16,
      codeFontSize: 14,
      uiFontFamily: "Helvetica, sans-serif",
      codeFontFamily: "Menlo, monospace",
    });
    expect(loadAppearancePrefs()).toEqual({
      uiFontSize: 16,
      codeFontSize: 14,
      uiFontFamily: "Helvetica, sans-serif",
      codeFontFamily: "Menlo, monospace",
    });
    resetAppearancePrefs();
    expect(loadAppearancePrefs()).toEqual(DEFAULT_APPEARANCE_PREFS);
  });

  it("applies CSS custom properties", () => {
    applyAppearancePrefs({
      uiFontSize: 15,
      codeFontSize: 13,
      uiFontFamily: "Helvetica, sans-serif",
      codeFontFamily: "Menlo, monospace",
    });
    expect(document.documentElement.style.getPropertyValue("--ui-font-size")).toBe("15px");
    expect(document.documentElement.style.getPropertyValue("--code-font-size")).toBe("13px");
    expect(document.documentElement.style.getPropertyValue("--font-sans")).toBe(
      "Helvetica, sans-serif",
    );
    expect(document.documentElement.style.getPropertyValue("--font-mono")).toBe("Menlo, monospace");
  });

  it("fills missing font families from older prefs payloads", () => {
    const n = normalizeAppearancePrefs({ uiFontSize: 14, codeFontSize: 12 } as never);
    expect(n.uiFontFamily).toBe(DEFAULT_UI_FONT_FAMILY);
    expect(n.codeFontFamily).toBe(DEFAULT_CODE_FONT_FAMILY);
  });
});
