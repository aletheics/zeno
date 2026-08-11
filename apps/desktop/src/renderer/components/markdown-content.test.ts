import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { MarkdownContent, normalizeLatexDelimiters } from "./MarkdownContent.tsx";

function render(markdown: string, workspacePath?: string): string {
  return renderToStaticMarkup(
    createElement(MarkdownContent, {
      children: markdown,
      locale: "en",
      ...(workspacePath ? { workspacePath } : {}),
    }),
  );
}

describe("MarkdownContent", () => {
  it("renders math, highlighted code, diffs, tables, and Mermaid placeholders", () => {
    expect(render("$E = mc^2$")).toContain("katex");
    expect(render("```javascript\nconst answer = 42\n```")).toContain("content-code-block");
    const diffHtml = render("```diff\n@@ -5,1 +5,1 @@\n-old\n+new\n```");
    expect(diffHtml).toContain('data-diff="remove"');
    expect(diffHtml).toContain("content-diff-ln");
    expect(diffHtml).toContain("content-diff-text");
    expect(diffHtml).toContain("content-diff-line");
    // File line numbers from the hunk (not 1..n display index)
    expect(diffHtml).toContain(">5<");
    const tableHtml = render("| A | B |\n| - | - |\n| 1 | 2 |");
    expect(tableHtml).toContain("content-table-shell");
    expect(tableHtml).toContain("content-table-scroll");
    expect(tableHtml).toContain('data-testid="markdown-table"');
    expect(tableHtml).toContain('data-testid="markdown-table-copy"');
    expect(tableHtml).toContain('aria-label="Copy table"');
    expect(tableHtml).toContain('data-testid="markdown-table-expand"');
    expect(tableHtml).toContain('aria-label="Expand table"');
    expect(tableHtml).toContain("<thead>");
    expect(tableHtml).toContain("<tbody>");
    expect(tableHtml).not.toContain('node="[object Object]"');
    expect(render("```mermaid\ngraph TD; A--&gt;B\n```")).toContain("content-mermaid-loading");
  });

  it("renders GFM pipe tables with CJK text, code spans, and alignment", () => {
    const html = render(
      [
        "清理完成。",
        "",
        "**已清理**",
        "",
        "| 类别 | 内容 | 约释放 |",
        "| :--- | :---: | ---: |",
        "| 归档会话 | 3 个旧 `.jsonl`（保留当前会话） | ~540KB |",
        "| MCP 缓存 | `mcp-cache.json` | ~68KB |",
        "",
        "**已保留**",
      ].join("\n"),
    );
    expect(html).toContain('data-testid="markdown-table"');
    expect(html).toContain("<table");
    expect(html).toContain("归档会话");
    expect(html).toContain("<code>");
    expect(html).toContain("mcp-cache.json");
    expect(html).toMatch(/text-align:\s*left|text-align:left/);
    expect(html).toMatch(/text-align:\s*center|text-align:center/);
    expect(html).toMatch(/text-align:\s*right|text-align:right/);
    // Must not fall back to raw pipe paragraphs.
    expect(html).not.toMatch(/<p>\| 类别 \|/);
  });

  it("renders LaTeX parenthesis and bracket delimiters", () => {
    const html = render(
      [
        String.raw`Inline \(B_{\min}\le B_k\le B_{\max}\).`,
        "",
        String.raw`\[`,
        String.raw`|\alpha|=|b+m\cos\theta|\le\alpha_{\max}`,
        String.raw`\]`,
      ].join("\n"),
    );

    expect(html).toContain("katex");
    expect(html).toContain("katex-display");
    expect(html).toContain("B");
    expect(html).toContain("α");
  });

  it("preserves LaTeX-like delimiters in code and while streaming incomplete math", () => {
    const markdown = [
      "Inline code: `\\(not math\\)`",
      "",
      "```tex",
      String.raw`\[also not math\]`,
      "```",
      "",
      String.raw`Still streaming: \(x + y`,
      String.raw`Escaped literal: \\(not math\\)`,
    ].join("\n");

    expect(normalizeLatexDelimiters(markdown)).toBe(markdown);
  });

  it("blocks executable link protocols and renders local images as previewable media", () => {
    expect(render("[unsafe](javascript:alert(1))")).not.toContain("javascript:alert");
    const image = render("![preview](/tmp/design%20preview.png)");
    expect(image).toContain("content-image-button");
    expect(image).toContain("file:///tmp/design%20preview.png");
  });

  it("renders GFM footnotes as a Sources section with citation chips", () => {
    const html = render(
      [
        "See the design[^1] and docs[^docs].",
        "",
        "[^1]: First source note.",
        "[^docs]: Second source.",
      ].join("\n"),
    );
    expect(html).toContain('data-testid="markdown-footnotes"');
    expect(html).toContain("Sources");
    expect(html).toContain("content-cite-ref");
    expect(html).toContain("First source note");
    expect(html).toContain("Second source");
    expect(html).toContain("content-cite-backref");
  });

  it("renders file path source citations with line markers", () => {
    const html = render("[app.ts](src/app.ts#L12C3)", "/work/project");
    expect(html).toContain("content-source-cite");
    expect(html).toContain("content-file-link");
    expect(html).toContain("content-source-line");
    expect(html).toContain(":12:3");
    expect(html).toContain('title="/work/project/src/app.ts:12:3"');
    // Basename / path-like labels collapse to workspace-relative form (session UI).
    expect(html).toContain("src/app.ts");
  });

  it("renders markdown reference-style links", () => {
    const html = render(
      ["See [docs][ref].", "", '[ref]: https://example.com/docs "Docs"'].join("\n"),
    );
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain("docs");
  });
});
