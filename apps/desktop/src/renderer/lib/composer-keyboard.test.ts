import { describe, expect, it } from "vite-plus/test";
import { isImeCompositionEvent } from "./composer-keyboard.ts";

describe("isImeCompositionEvent", () => {
  it("recognizes active IME composition", () => {
    expect(isImeCompositionEvent({ isComposing: true, keyCode: 13 })).toBe(true);
  });

  it("recognizes the legacy IME key code when composition ends before Enter", () => {
    expect(isImeCompositionEvent({ isComposing: false, keyCode: 229 })).toBe(true);
  });

  it("allows a normal Enter keydown", () => {
    expect(isImeCompositionEvent({ isComposing: false, keyCode: 13 })).toBe(false);
  });
});
