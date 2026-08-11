import { describe, expect, it } from "vite-plus/test";
import { scopeThemeCustomCss, validateThemeCustomCss } from "./theme-css.ts";

describe("theme custom CSS", () => {
  it("scopes safe surface rules without changing their declarations", () => {
    const css = scopeThemeCustomCss(`
      .composer-card,
      [data-kind="user"] [data-slot="bubble-content"] {
        border-radius: 24px;
        background: color-mix(in srgb, var(--primary) 20%, transparent);
      }
    `);

    expect(css).toContain('html[data-theme-skin-active="true"] .composer-card');
    expect(css).toContain(
      'html[data-theme-skin-active="true"] [data-kind="user"] [data-slot="bubble-content"]',
    );
    expect(css).toContain("border-radius: 24px");
  });

  it("rejects selectors and declarations that can escape the theme sandbox", () => {
    expect(() => validateThemeCustomCss("body { opacity: 0; }")).toThrow();
    expect(() => validateThemeCustomCss(".composer-card { position: fixed; }")).toThrow(
      "property position",
    );
    expect(() =>
      validateThemeCustomCss(
        '.composer-card { background-image: url("https://example.com/tracker.png"); }',
      ),
    ).toThrow("external resources");
    expect(() => validateThemeCustomCss("@import 'https://example.com/theme.css';")).toThrow(
      "at-rules",
    );
  });
});
