import { describe, expect, it } from "vite-plus/test";
import { composerHighlightClass, tokenizeComposerHighlight } from "./composer-highlight.ts";

describe("tokenizeComposerHighlight", () => {
  it("returns empty text span for empty input", () => {
    expect(tokenizeComposerHighlight("")).toEqual([{ kind: "text", text: "" }]);
  });

  it("highlights urls, mentions, slash commands, and skills", () => {
    const spans = tokenizeComposerHighlight(
      "see https://example.com/docs and @src/app.ts then /model and /skill:review please",
    );
    expect(spans).toEqual([
      { kind: "text", text: "see " },
      { kind: "url", text: "https://example.com/docs" },
      { kind: "text", text: " and " },
      { kind: "mention", text: "@src/app.ts" },
      { kind: "text", text: " then " },
      { kind: "slash", text: "/model" },
      { kind: "text", text: " and " },
      { kind: "skill", text: "/skill:review" },
      { kind: "text", text: " please" },
    ]);
  });

  it("strips trailing sentence punctuation from urls", () => {
    expect(tokenizeComposerHighlight("open https://x.test/a.")).toEqual([
      { kind: "text", text: "open " },
      { kind: "url", text: "https://x.test/a" },
      { kind: "text", text: "." },
    ]);
  });

  it("highlights shell injection lines", () => {
    expect(tokenizeComposerHighlight("!ls -la\nthen text")).toEqual([
      { kind: "shell", text: "!ls -la" },
      { kind: "text", text: "\nthen text" },
    ]);
    expect(tokenizeComposerHighlight("!!secret")).toEqual([{ kind: "shell", text: "!!secret" }]);
    // `!=` is not shell injection.
    expect(tokenizeComposerHighlight("a != b")).toEqual([{ kind: "text", text: "a != b" }]);
  });

  it("does not treat mid-word slashes as commands", () => {
    expect(tokenizeComposerHighlight("path/to/file and /reload")).toEqual([
      { kind: "text", text: "path/to/file and " },
      { kind: "slash", text: "/reload" },
    ]);
  });

  it("maps kinds to css classes", () => {
    expect(composerHighlightClass("text")).toBe("composer-hl-text");
    expect(composerHighlightClass("skill")).toBe("composer-hl-skill");
    expect(composerHighlightClass("url")).toBe("composer-hl-url");
  });
});
