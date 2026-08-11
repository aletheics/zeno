import { describe, expect, it } from "vite-plus/test";
import type { HostSnapshot } from "@zeno/contracts";
import {
  buildUnifiedSlashCatalog,
  filterUnifiedSlash,
  parseShellInjection,
  parseSlashLine,
  resolveBuiltinSlash,
} from "./slash-parity.ts";

function snap(partial: Partial<HostSnapshot> = {}): HostSnapshot {
  return {
    runtimeId: "r",
    sequence: 0,
    cwd: "/tmp",
    agentDir: "/tmp/agent",
    sessionId: "s",
    slashCommands: [
      { name: "my-prompt", description: "A prompt", source: "prompt", argumentHint: "<arg>" },
      { name: "skill:demo", description: "A skill", source: "skill" },
    ],
    queuedMessages: { steering: [], followUp: [] },
    activeTools: [],
    projectTrusted: true,
    resources: { extensions: 0, skills: 1, prompts: 1, themes: 0, contextFiles: 0 },
    configuredPackages: { global: 0, project: 0 },
    diagnostics: [],
    ...partial,
  };
}

describe("slash-parity catalog", () => {
  it("builds unified slash list from snapshot skills/prompts plus builtins", () => {
    const catalog = buildUnifiedSlashCatalog(snap(), "en");
    expect(catalog.some((item) => item.name === "my-prompt")).toBe(true);
    expect(catalog.some((item) => item.name === "skill:demo")).toBe(true);
    expect(catalog.some((item) => item.name === "tree")).toBe(true);
    expect(catalog.some((item) => item.name === "compact")).toBe(true);
    expect(filterUnifiedSlash(catalog, "comp").some((item) => item.name === "compact")).toBe(true);
    const zh = buildUnifiedSlashCatalog(snap(), "zh");
    expect(zh.find((item) => item.name === "tree")?.description).toContain("会话树");
  });

  it("keeps a colliding extension command authoritative", () => {
    const catalog = buildUnifiedSlashCatalog(
      snap({
        slashCommands: [
          { name: "tree", description: "Extension tree command", source: "extension" },
        ],
      }),
      "zh",
    );
    expect(catalog.find((item) => item.name === "tree")).toMatchObject({
      source: "extension",
      description: "Extension tree command",
    });
  });

  it("resolves builtin slash actions used by composer", () => {
    expect(resolveBuiltinSlash("tree", "")).toEqual({ type: "tree" });
    expect(resolveBuiltinSlash("name", "hello")).toEqual({ type: "name", name: "hello" });
    expect(resolveBuiltinSlash("compact", "keep recent")).toEqual({
      type: "compact",
      instructions: "keep recent",
    });
    expect(resolveBuiltinSlash("export", "html")).toEqual({ type: "export", format: "html" });
    expect(resolveBuiltinSlash("import", '"sessions/demo.jsonl"')).toEqual({
      type: "import",
      path: "sessions/demo.jsonl",
    });
    expect(resolveBuiltinSlash("share", "")).toEqual({ type: "share" });
    expect(resolveBuiltinSlash("skill:demo", "x").type).toBe("runtime");
    expect(resolveBuiltinSlash("tree", "", "extension")).toEqual({
      type: "runtime",
      command: "tree",
      args: "",
    });
  });

  it("parses slash lines and shell prefixes", () => {
    expect(parseSlashLine("/name my session")).toEqual({ name: "name", args: "my session" });
    expect(parseShellInjection("!!echo hi")).toEqual({
      kind: "hidden-shell",
      command: "echo hi",
    });
  });
});
