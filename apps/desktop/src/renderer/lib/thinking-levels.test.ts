import { describe, expect, it } from "vite-plus/test";
import {
  clampToAvailableThinkingLevel,
  modelSupportsThinking,
  resolveDisplayThinkingLevels,
} from "./thinking-levels.ts";

describe("thinking-levels", () => {
  it("uses model-available levels when present", () => {
    expect(resolveDisplayThinkingLevels(["off", "low", "high"])).toEqual(["off", "low", "high"]);
  });

  it("shows only off until the host confirms model capabilities", () => {
    expect(resolveDisplayThinkingLevels(undefined)).toEqual(["off"]);
    expect(resolveDisplayThinkingLevels([])).toEqual(["off"]);
  });

  it("clamps current level onto the available list", () => {
    expect(clampToAvailableThinkingLevel("high", ["off", "low"])).toBe("off");
    expect(clampToAvailableThinkingLevel("low", ["off", "low", "high"])).toBe("low");
  });

  it("detects models that only support off as non-thinking", () => {
    expect(modelSupportsThinking(["off"])).toBe(false);
    expect(modelSupportsThinking(["off", "medium"])).toBe(true);
  });
});
