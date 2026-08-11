import { describe, expect, it } from "vite-plus/test";
import {
  addResourceQuery,
  applyPathTokenCompletion,
  attachmentLabel,
  attachmentPresentation,
  filterResourceCommands,
  filterSlashCommands,
  isPreviewableImagePath,
  isPromptImagePath,
  pathTokenBeforeCursor,
  promptWithAttachedPaths,
  slashCommandQuery,
  SUPPORTED_ATTACHMENT_EXTENSIONS,
} from "./composer-suggestions.ts";

describe("composer suggestions", () => {
  it("only opens command panels for a single active trigger token", () => {
    expect(slashCommandQuery("/rev")).toBe("rev");
    expect(slashCommandQuery("/review now")).toBeUndefined();
    expect(addResourceQuery("@skill")).toBe("skill");
    expect(addResourceQuery("please @skill")).toBeUndefined();
  });

  it("filters names and descriptions with prefix matches first", () => {
    const commands = [
      { name: "skill:review", description: "Inspect changes", source: "skill" as const },
      { name: "release", description: "Review release", source: "prompt" as const },
    ];
    expect(filterSlashCommands(commands, "rev").map((command) => command.name)).toEqual([
      "release",
      "skill:review",
    ]);
  });

  it("keeps skills on slash and never exposes pi commands under @", () => {
    const commands = [
      { name: "skill:review", description: "Inspect changes", source: "skill" as const },
      { name: "review", description: "Review workspace", source: "prompt" as const },
      { name: "reload", description: "Reload extensions", source: "extension" as const },
      { name: "tree", description: "Session tree", source: "extension" as const },
    ];

    expect(filterSlashCommands(commands, "").map((command) => command.name)).toContain(
      "skill:review",
    );
    // `@` is attach-only — no prompts, skills, extensions, or builtin pi commands.
    expect(filterResourceCommands(commands, "")).toEqual([]);
    expect(filterResourceCommands(commands, "rev")).toEqual([]);
  });

  it("does not truncate skills with a small flat list cap when listing all", () => {
    const commands = Array.from({ length: 40 }, (_, i) => ({
      name: i < 20 ? `cmd-${i}` : `skill:s${i}`,
      description: `desc ${i}`,
      source: (i < 20 ? "prompt" : "skill") as "prompt" | "skill",
    }));
    const all = filterSlashCommands(commands, "");
    expect(all.filter((c) => c.source === "skill")).toHaveLength(20);
    const filtered = filterSlashCommands(commands, "skill:s3");
    expect(filtered.every((c) => c.name.includes("skill:s3") || c.description.includes("3"))).toBe(
      true,
    );
  });

  it("formats readable path context and portable labels", () => {
    expect(attachmentLabel("C:\\work\\notes.md")).toBe("notes.md");
    expect(promptWithAttachedPaths("Inspect", ["/tmp/a&b.md"])).toContain(
      "<path>/tmp/a&amp;b.md</path>",
    );
    expect(isPromptImagePath("/tmp/photo.webp")).toBe(true);
    expect(isPromptImagePath("/tmp/vector.svg")).toBe(false);
    expect(isPreviewableImagePath("/tmp/vector.svg")).toBe(true);
    expect(isPreviewableImagePath("/tmp/photo.avif")).toBe(true);
    expect(isPreviewableImagePath("/tmp/notes.txt")).toBe(false);
  });

  it("exports every recognized attachment extension for complete demo coverage", () => {
    expect(SUPPORTED_ATTACHMENT_EXTENSIONS).toHaveLength(
      new Set(SUPPORTED_ATTACHMENT_EXTENSIONS).size,
    );
    for (const extension of SUPPORTED_ATTACHMENT_EXTENSIONS) {
      expect(attachmentPresentation(`/tmp/sample.${extension}`).kind).not.toBe("file");
    }
  });

  it("detects path tokens and applies Tab completions", () => {
    expect(pathTokenBeforeCursor("see src/co", 10)).toMatchObject({
      query: "src/co",
      atMention: false,
    });
    expect(pathTokenBeforeCursor("hi @util", 8)).toMatchObject({
      query: "util",
      atMention: true,
    });
    const applied = applyPathTokenCompletion("see src/co", 10, "src/composer.ts");
    expect(applied?.value).toBe("see src/composer.ts");
    expect(applied?.cursor).toBe("see src/composer.ts".length);
  });

  it.each([
    ["report.xlsx", "spreadsheet", "Excel"],
    ["photo.png", "image", "PNG"],
    ["brief.pdf", "pdf", "PDF"],
    ["deck.pptx", "presentation", "PowerPoint"],
    ["proposal.docx", "document", "Word"],
    ["bundle.zip", "archive", "ZIP"],
    ["notes.txt", "text", "Text"],
    ["README.md", "text", "Markdown"],
    ["Main.java", "code", "Java"],
    ["app.js", "code", "JavaScript"],
    ["worker.py", "code", "Python"],
  ])("classifies %s as a %s card", (file, kind, typeLabel) => {
    expect(attachmentPresentation(`/tmp/${file}`)).toEqual({ kind, typeLabel });
  });
});
