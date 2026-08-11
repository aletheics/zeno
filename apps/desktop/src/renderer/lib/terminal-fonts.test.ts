import { describe, expect, it } from "vite-plus/test";
import {
  fontStackForFamily,
  matchTerminalFontChoiceId,
  primaryFontFromStack,
  SYSTEM_TERMINAL_FONT_ID,
  systemTerminalFontChoice,
} from "./terminal-fonts.ts";
import { DEFAULT_TERMINAL_PREFS } from "./terminal-prefs.ts";

describe("terminal-fonts", () => {
  it("builds and parses font stacks", () => {
    expect(fontStackForFamily("Consolas")).toContain("Consolas");
    expect(fontStackForFamily("JetBrains Mono")).toMatch(/^"JetBrains Mono"/);
    expect(primaryFontFromStack('"JetBrains Mono", monospace')).toBe("JetBrains Mono");
    expect(primaryFontFromStack(DEFAULT_TERMINAL_PREFS.fontFamily)).toBe("ui-monospace");
  });

  it("matches select ids from stored stacks", () => {
    const choices = [
      systemTerminalFontChoice("System"),
      {
        id: "consolas",
        family: fontStackForFamily("Consolas"),
        label: "Consolas",
      },
      {
        id: "jetbrains mono",
        family: fontStackForFamily("JetBrains Mono"),
        label: "JetBrains Mono",
      },
    ];
    expect(matchTerminalFontChoiceId(DEFAULT_TERMINAL_PREFS.fontFamily, choices)).toBe(
      SYSTEM_TERMINAL_FONT_ID,
    );
    expect(matchTerminalFontChoiceId(fontStackForFamily("Consolas"), choices)).toBe("consolas");
    expect(matchTerminalFontChoiceId('"JetBrains Mono", monospace', choices)).toBe(
      "jetbrains mono",
    );
  });
});
