import { describe, expect, it } from "vite-plus/test";
import {
  classifyToolName,
  extractCommandFromArgs,
  extractCommandFromOutput,
  extractToolDiffDetails,
  formatEditToolAsDiff,
  groupConsecutiveTools,
  looksLikeDiffText,
  parseDiffDisplayLines,
  processToolView,
} from "./process-activity.ts";

describe("process activity", () => {
  it("classifies common tool names", () => {
    expect(classifyToolName("read")).toBe("read");
    expect(classifyToolName("bash")).toBe("run");
    expect(classifyToolName("grep")).toBe("search");
    expect(classifyToolName("web_search")).toBe("search");
    expect(classifyToolName("edit")).toBe("edit");
    expect(classifyToolName("write")).toBe("write");
    expect(classifyToolName("ls")).toBe("list");
  });

  it("extracts path / command / query for row previews", () => {
    expect(processToolView("read", { path: "src/index.ts" })).toMatchObject({
      kind: "read",
      path: "src/index.ts",
      preview: "index.ts",
    });
    expect(processToolView("bash", { command: "rg -n foo" })).toMatchObject({
      kind: "run",
      detail: "rg -n foo",
      preview: "rg -n foo",
    });
    expect(processToolView("grep", { path: "a.ts", query: "render" })).toMatchObject({
      kind: "search",
      path: "a.ts",
      detail: "render",
    });
  });

  it("extracts commands from nested / argv arg shapes", () => {
    expect(extractCommandFromArgs("pnpm test")).toBe("pnpm test");
    expect(extractCommandFromArgs({ cmd: "ls -la" })).toBe("ls -la");
    expect(extractCommandFromArgs({ input: { command: "git status" } })).toBe("git status");
    expect(extractCommandFromArgs({ argv: ["npm", "run", "build"] })).toBe("npm run build");
    expect(processToolView("bash", { input: { command: "echo hi" } }).preview).toBe("echo hi");
  });

  it("recovers command from output when args are missing (history)", () => {
    expect(extractCommandFromOutput("$ git status\non branch main")).toBe("git status");
    expect(extractCommandFromOutput("Command: pnpm check\nok")).toBe("pnpm check");
    expect(processToolView("bash", undefined, { output: "$ rg -n process\n1:match" }).preview).toBe(
      "rg -n process",
    );
    expect(processToolView("bash", undefined, { command: "ls" }).preview).toBe("ls");
  });

  it("marks bare tool-name fallbacks as weak (no fake path/command highlight)", () => {
    expect(processToolView("bash", undefined)).toMatchObject({
      kind: "run",
      preview: "bash",
      weak: true,
    });
    expect(processToolView("read", {})).toMatchObject({
      kind: "read",
      preview: "read",
      weak: true,
    });
    expect(processToolView("bash", { command: "echo hi" }).weak).toBeUndefined();
    expect(processToolView("read", { path: "a.ts" }).weak).toBeUndefined();
  });

  it("groups consecutive same-kind tools including shell/run", () => {
    const groups = groupConsecutiveTools([
      { kind: "tool" as const, toolName: "read" },
      { kind: "tool" as const, toolName: "read" },
      { kind: "tool" as const, toolName: "bash" },
      { kind: "tool" as const, toolName: "powershell" },
      { kind: "tool" as const, toolName: "edit" },
      { kind: "tool" as const, toolName: "edit" },
      { kind: "tool" as const, toolName: "edit" },
    ]);
    expect(groups.map((g) => g.type)).toEqual(["group", "group", "group"]);
    expect(groups[0]).toMatchObject({ type: "group", kind: "read" });
    expect(groups[1]).toMatchObject({ type: "group", kind: "run" });
    expect(groups[1]).toMatchObject({ items: [{ toolName: "bash" }, { toolName: "powershell" }] });
    expect(groups[2]).toMatchObject({ type: "group", kind: "edit" });
  });

  it("classifies powershell and extracts command + argv", () => {
    expect(classifyToolName("powershell")).toBe("run");
    expect(classifyToolName("pwsh")).toBe("run");
    expect(
      extractCommandFromArgs({
        command: "powershell",
        args: ["-NoProfile", "-Command", "Get-ChildItem"],
      }),
    ).toBe("powershell -NoProfile -Command Get-ChildItem");
    expect(
      processToolView("powershell", {
        command: "powershell",
        args: ["-Command", "Get-Process"],
      }).preview,
    ).toContain("Get-Process");
  });

  it("formats edit tool args as a plain diff without inventing file line numbers", () => {
    const diff = formatEditToolAsDiff({
      path: "src/app.ts",
      edits: [{ oldText: "return 42", newText: "return 43" }],
    });
    expect(diff).toContain("--- a/src/app.ts");
    expect(diff).toContain("+++ b/src/app.ts");
    // Args-only edit must not claim snippet-local 1..n as file line numbers.
    expect(diff).toMatch(/^-return 42$/m);
    expect(diff).toMatch(/^\+return 43$/m);
    expect(diff).not.toMatch(/^-1 return 42$/m);
    expect(diff).not.toMatch(/^\+1 return 43$/m);
    // No @@ -N,+N tracking header that would make the parser invent offsets.
    expect(diff).not.toMatch(/^@@\s+-\d+/m);

    const legacy = formatEditToolAsDiff({
      path: "a.ts",
      old_string: "foo",
      new_string: "bar",
    });
    expect(legacy).toMatch(/^-foo$/m);
    expect(legacy).toMatch(/^\+bar$/m);

    expect(looksLikeDiffText("--- a/x\n+++ b/x\n@@\n-old\n+new\n")).toBe(true);
    expect(looksLikeDiffText("+12 old\n-11 new")).toBe(true);
    expect(looksLikeDiffText("plain log line")).toBe(false);
  });

  it("formats write tool content as all-addition lines starting at file line 1", () => {
    const diff = formatEditToolAsDiff(
      {
        path: "notes.md",
        content: "# notes\nhello\n",
      },
      "write",
    );
    expect(diff).toContain("--- /dev/null");
    expect(diff).toContain("+++ b/notes.md");
    expect(diff).toContain("@@ -0,0 +1,2 @@");
    expect(diff).toMatch(/^\+1 # notes$/m);
    expect(diff).toMatch(/^\+2 hello$/m);
    // No deletion body lines (headers --- /dev/null are fine).
    expect(diff).not.toMatch(/^-[^-+]/m);
  });

  it("parses pi numbered diffs and unified hunks into file line numbers", () => {
    const pi = parseDiffDisplayLines("+12 return 43\n-11 return 42\n 10 context");
    expect(pi).toEqual([
      { kind: "add", lineNo: 12, text: "+return 43" },
      { kind: "remove", lineNo: 11, text: "-return 42" },
      { lineNo: 10, text: " context" },
    ]);

    const unified = parseDiffDisplayLines(
      ["--- a/x", "+++ b/x", "@@ -20,2 +20,2 @@", "-old", "+new", " keep"].join("\n"),
    );
    expect(unified.map((r) => [r.kind, r.lineNo, r.text])).toEqual([
      ["meta", undefined, "--- a/x"],
      ["meta", undefined, "+++ b/x"],
      ["hunk", undefined, "@@ -20,2 +20,2 @@"],
      ["remove", 20, "-old"],
      ["add", 20, "+new"],
      [undefined, 21, " keep"],
    ]);

    // Args-only fallback: plain +/- without inventing line numbers.
    const plain = parseDiffDisplayLines(
      ["--- a/x", "+++ b/x", "-return 42", "+return 43"].join("\n"),
    );
    expect(plain.map((r) => [r.kind, r.lineNo, r.text])).toEqual([
      ["meta", undefined, "--- a/x"],
      ["meta", undefined, "+++ b/x"],
      ["remove", undefined, "-return 42"],
      ["add", undefined, "+return 43"],
    ]);
  });

  it("extracts details.diff from tool result payloads", () => {
    expect(
      extractToolDiffDetails({
        diff: "+42 fixed\n-41 broken",
        firstChangedLine: 42,
      }),
    ).toContain("+42 fixed");
    expect(extractToolDiffDetails({ note: "nope" })).toBeUndefined();
  });
});
