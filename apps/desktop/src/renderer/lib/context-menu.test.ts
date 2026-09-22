import { describe, expect, it } from "vite-plus/test";
import {
  anchorFromPoint,
  editCombo,
  insertAtSelection,
  isContextMenuKey,
  markdownToPlainText,
  nextMenuIndex,
  stripLocationSuffix,
} from "./context-menu.ts";

describe("anchorFromPoint", () => {
  it("collapses the far edges onto the point so the menu opens at the cursor", () => {
    // FloatingMenu positions off left/bottom; a row-sized rect would open the menu at the
    // row's corner instead of where the user right-clicked.
    expect(anchorFromPoint(120, 340)).toEqual({
      top: 340,
      left: 120,
      right: 120,
      bottom: 340,
      width: 0,
      height: 0,
    });
  });
});

describe("isContextMenuKey", () => {
  it("accepts the dedicated ContextMenu key", () => {
    expect(isContextMenuKey({ key: "ContextMenu", shiftKey: false })).toBe(true);
  });

  it("accepts Shift+F10, for keyboards with no ContextMenu key", () => {
    expect(isContextMenuKey({ key: "F10", shiftKey: true })).toBe(true);
  });

  it("does not claim bare F10 — that is not a menu gesture", () => {
    expect(isContextMenuKey({ key: "F10", shiftKey: false })).toBe(false);
  });

  it("does not claim an ordinary shifted letter", () => {
    expect(isContextMenuKey({ key: "C", shiftKey: true })).toBe(false);
  });
});

describe("editCombo", () => {
  it("prints the Command glyphs on macOS", () => {
    expect(editCombo("copy", true)).toBe("⌘C");
    expect(editCombo("paste", true)).toBe("⌘V");
    expect(editCombo("selectAll", true)).toBe("⌘A");
    expect(editCombo("cut", true)).toBe("⌘X");
  });

  it("prints Ctrl combos elsewhere", () => {
    expect(editCombo("copy", false)).toBe("Ctrl+C");
    expect(editCombo("paste", false)).toBe("Ctrl+V");
    expect(editCombo("selectAll", false)).toBe("Ctrl+A");
    expect(editCombo("cut", false)).toBe("Ctrl+X");
  });
});

describe("nextMenuIndex", () => {
  it("walks down and up", () => {
    expect(nextMenuIndex(0, 3, "ArrowDown")).toBe(1);
    expect(nextMenuIndex(1, 3, "ArrowUp")).toBe(0);
  });

  it("wraps at both ends, the way a native menu does", () => {
    expect(nextMenuIndex(2, 3, "ArrowDown")).toBe(0);
    expect(nextMenuIndex(0, 3, "ArrowUp")).toBe(2);
  });

  it("enters at the top on Down and at the bottom on Up when nothing is focused", () => {
    // The first press after opening must land somewhere rather than look inert.
    expect(nextMenuIndex(-1, 3, "ArrowDown")).toBe(0);
    expect(nextMenuIndex(-1, 3, "ArrowUp")).toBe(2);
  });

  it("recovers from an out-of-range index", () => {
    expect(nextMenuIndex(9, 3, "ArrowDown")).toBe(0);
  });

  it("reports Home and End", () => {
    expect(nextMenuIndex(1, 4, "Home")).toBe(0);
    expect(nextMenuIndex(1, 4, "End")).toBe(3);
  });

  it("has nowhere to go in an empty menu", () => {
    expect(nextMenuIndex(-1, 0, "ArrowDown")).toBe(-1);
  });
});

describe("stripLocationSuffix", () => {
  it("splits a bare line number off the path", () => {
    expect(stripLocationSuffix("src/foo.ts:42")).toEqual({ path: "src/foo.ts", line: 42 });
  });

  it("drops a trailing column, which the app cannot act on either", () => {
    expect(stripLocationSuffix("src/foo.ts:42:3")).toEqual({ path: "src/foo.ts", line: 42 });
  });

  it("leaves a path with no location alone", () => {
    expect(stripLocationSuffix("src/foo.ts")).toEqual({ path: "src/foo.ts" });
  });

  it("does not mistake a Windows drive letter for a line number", () => {
    expect(stripLocationSuffix("C:\\proj\\src\\foo.ts")).toEqual({ path: "C:\\proj\\src\\foo.ts" });
    expect(stripLocationSuffix("C:\\proj\\src\\foo.ts:12")).toEqual({
      path: "C:\\proj\\src\\foo.ts",
      line: 12,
    });
  });

  it("does not mistake a URL port for a line number", () => {
    // Stripping this would produce a broken link.
    expect(stripLocationSuffix("https://example.dev:8080")).toEqual({
      path: "https://example.dev:8080",
    });
  });

  it("leaves a colon that is not followed by digits alone", () => {
    expect(stripLocationSuffix("foo:bar")).toEqual({ path: "foo:bar" });
  });
});

describe("insertAtSelection", () => {
  it("inserts at a collapsed caret", () => {
    expect(insertAtSelection("abc", 1, 1, "X")).toEqual({ value: "aXbc", caret: 2 });
  });

  it("inserts at the very start and the very end", () => {
    expect(insertAtSelection("abc", 0, 0, "X")).toEqual({ value: "Xabc", caret: 1 });
    expect(insertAtSelection("abc", 3, 3, "X")).toEqual({ value: "abcX", caret: 4 });
  });

  it("replaces the selection it is given", () => {
    expect(insertAtSelection("abc", 0, 3, "X")).toEqual({ value: "X", caret: 1 });
    expect(insertAtSelection("abc", 1, 3, "")).toEqual({ value: "a", caret: 1 });
  });

  it("clamps a selection that runs past either end", () => {
    expect(insertAtSelection("abc", -5, 99, "X")).toEqual({ value: "X", caret: 1 });
  });

  it("treats a reversed selection as a point", () => {
    expect(insertAtSelection("abc", 2, 1, "X")).toEqual({ value: "abXc", caret: 3 });
  });
});

describe("markdownToPlainText", () => {
  it("unwraps links and images to their text", () => {
    expect(markdownToPlainText("[Docs](https://x.dev) and ![shot](a.png)")).toBe("Docs and shot");
  });

  it("removes emphasis, strike, and inline HTML", () => {
    expect(markdownToPlainText("**bold** and *it* and ~~gone~~ and <b>tagged</b>")).toBe(
      "bold and it and gone and tagged",
    );
  });

  it("removes heading, list, and quote prefixes but keeps the text", () => {
    const source = "# Title\n\n- one\n- two\n\n> quoted\n\n1. first";
    expect(markdownToPlainText(source)).toBe("Title\n\none\ntwo\n\nquoted\n\nfirst");
  });

  it("collapses a horizontal rule away entirely", () => {
    expect(markdownToPlainText("a\n\n---\n\nb")).toBe("a\n\nb");
  });

  it("keeps a fenced code body verbatim, emphasis characters included", () => {
    // The whole reason code is walked separately: `1 * 2` and `a_b` are not emphasis.
    const source = "Before\n\n```ts\nconst a = 1 * 2;\nlet b = a_b_c;\n```\n\nAfter";
    expect(markdownToPlainText(source)).toBe("Before\n\nconst a = 1 * 2;\nlet b = a_b_c;\n\nAfter");
  });

  it("keeps an inline code span verbatim", () => {
    expect(markdownToPlainText("Use `a_b_c` and `x * y` here")).toBe("Use a_b_c and x * y here");
  });

  it("leaves snake_case identifiers in prose alone", () => {
    // A naive `_em_` rule would rewrite this into `snakecasename`.
    expect(markdownToPlainText("call snake_case_name here")).toBe("call snake_case_name here");
  });

  it("still unwraps a genuine underscore emphasis run", () => {
    expect(markdownToPlainText("_em_ and a_b")).toBe("em and a_b");
  });

  it("drops link definitions, which carry no reading order", () => {
    expect(markdownToPlainText("See [docs][1].\n\n[1]: https://x.dev")).toBe("See docs.");
  });

  it("returns an empty string for empty input", () => {
    expect(markdownToPlainText("")).toBe("");
  });
});
