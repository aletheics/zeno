import { describe, expect, it } from "vite-plus/test";
import {
  formatSelectOption,
  formatSelectTitle,
  selectOptionSearchValue,
} from "./extension-ui-format.ts";

describe("formatSelectTitle", () => {
  it("keeps a plain one-line title as the headline", () => {
    expect(formatSelectTitle("Pick one")).toEqual({
      headline: "Pick one",
      previews: [],
    });
  });

  it("extracts bracket header and question", () => {
    expect(formatSelectTitle("[Stack] Which language?")).toEqual({
      header: "Stack",
      headline: "Which language?",
      previews: [],
    });
  });

  it("splits ask-user-question style title with preview blocks", () => {
    const title = [
      "[UI] Prefer which layout?",
      "",
      "--- 1. Compact preview ---",
      "```tsx",
      "<Row dense />",
      "```",
      "",
      "--- 2. Spacious preview ---",
      "More room for copy.",
    ].join("\n");

    const formatted = formatSelectTitle(title);
    expect(formatted.header).toBe("UI");
    expect(formatted.headline).toBe("Prefer which layout?");
    expect(formatted.previews).toEqual([
      { title: "1. Compact preview", content: "```tsx\n<Row dense />\n```" },
      { title: "2. Spacious preview", content: "More room for copy." },
    ]);
  });

  it("puts multi-line body after the first line when no blank-line paragraphs", () => {
    const formatted = formatSelectTitle("Question line\nextra context line");
    expect(formatted.headline).toBe("Question line");
    expect(formatted.body).toBe("extra context line");
    expect(formatted.previews).toEqual([]);
  });
});

describe("formatSelectOption", () => {
  it("parses numbered label — description lines", () => {
    expect(formatSelectOption("1. TypeScript — Prefer typed source")).toEqual({
      raw: "1. TypeScript — Prefer typed source",
      index: 1,
      label: "TypeScript",
      description: "Prefer typed source",
    });
  });

  it("parses en-dash and hyphen separators", () => {
    expect(formatSelectOption("2. JavaScript – keep stack").description).toBe("keep stack");
    expect(formatSelectOption("3. Other - free text").description).toBe("free text");
  });

  it("keeps plain options as label only", () => {
    expect(formatSelectOption("alpha choice")).toEqual({
      raw: "alpha choice",
      label: "alpha choice",
    });
  });

  it("preserves raw for host parseIndex compatibility", () => {
    const raw = "2. Beta — second";
    expect(formatSelectOption(raw).raw).toBe(raw);
  });
});

describe("selectOptionSearchValue", () => {
  it("includes index label and description for filtering", () => {
    const opt = formatSelectOption("1. Red — warm");
    expect(selectOptionSearchValue(opt)).toContain("1");
    expect(selectOptionSearchValue(opt)).toContain("Red");
    expect(selectOptionSearchValue(opt)).toContain("warm");
  });
});
