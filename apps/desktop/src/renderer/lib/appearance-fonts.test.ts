import { describe, expect, it } from "vite-plus/test";
import {
  codeFontStackForFamily,
  matchAppearanceFontChoiceId,
  SYSTEM_APPEARANCE_FONT_ID,
  systemCodeFontChoice,
  systemUiFontChoice,
  uiFontStackForFamily,
} from "./appearance-fonts.ts";
import { DEFAULT_CODE_FONT_FAMILY, DEFAULT_UI_FONT_FAMILY } from "./appearance-prefs.ts";

describe("appearance-fonts", () => {
  it("builds and parses UI / code font stacks", () => {
    expect(uiFontStackForFamily("Helvetica")).toContain("Helvetica");
    expect(uiFontStackForFamily("PingFang SC")).toMatch(/^"PingFang SC"/);
    expect(codeFontStackForFamily("JetBrains Mono")).toMatch(/^"JetBrains Mono"/);
    expect(systemUiFontChoice("System").family).toBe(DEFAULT_UI_FONT_FAMILY);
    expect(systemCodeFontChoice("System").family).toBe(DEFAULT_CODE_FONT_FAMILY);
  });

  it("matches select ids from stored stacks", () => {
    const choices = [
      systemUiFontChoice("System"),
      {
        id: "helvetica",
        family: uiFontStackForFamily("Helvetica"),
        label: "Helvetica",
      },
      {
        id: "pingfang sc",
        family: uiFontStackForFamily("PingFang SC"),
        label: "PingFang SC",
      },
    ];
    expect(
      matchAppearanceFontChoiceId(DEFAULT_UI_FONT_FAMILY, choices, DEFAULT_UI_FONT_FAMILY),
    ).toBe(SYSTEM_APPEARANCE_FONT_ID);
    expect(
      matchAppearanceFontChoiceId(
        uiFontStackForFamily("Helvetica"),
        choices,
        DEFAULT_UI_FONT_FAMILY,
      ),
    ).toBe("helvetica");
    expect(
      matchAppearanceFontChoiceId('"PingFang SC", sans-serif', choices, DEFAULT_UI_FONT_FAMILY),
    ).toBe("pingfang sc");
  });
});
