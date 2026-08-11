import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  comboToDisplayParts,
  eventMatchesCombo,
  eventToCombo,
  parseCombo,
  resetAllShortcuts,
  setShortcutOverride,
  SHORTCUT_OVERRIDES_CHANGED_EVENT,
} from "./shortcuts.ts";

const memory = new Map<string, string>();

function keyboardEvent(
  key: string,
  modifiers: Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">> = {},
): KeyboardEvent {
  return {
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...modifiers,
  } as KeyboardEvent;
}

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, String(value)),
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { dispatchEvent: vi.fn(() => true) },
  });
});

describe("shortcut modifier semantics", () => {
  it("maps mod exclusively to Meta on macOS", () => {
    expect(eventMatchesCombo(keyboardEvent("k", { metaKey: true }), "mod+k", true)).toBe(true);
    expect(eventMatchesCombo(keyboardEvent("k", { ctrlKey: true }), "mod+k", true)).toBe(false);
  });

  it("maps mod exclusively to Control on Windows and Linux", () => {
    expect(eventMatchesCombo(keyboardEvent("k", { ctrlKey: true }), "mod+k", false)).toBe(true);
    expect(eventMatchesCombo(keyboardEvent("k", { metaKey: true }), "mod+k", false)).toBe(false);
  });

  it("keeps explicit Control and Meta bindings independent", () => {
    expect(parseCombo("ctrl+k")).toMatchObject({ mod: false, ctrl: true, meta: false });
    expect(parseCombo("cmd+k")).toMatchObject({ mod: false, ctrl: false, meta: true });
    expect(eventMatchesCombo(keyboardEvent("k", { ctrlKey: true }), "ctrl+k", true)).toBe(true);
    expect(eventMatchesCombo(keyboardEvent("k", { metaKey: true }), "ctrl+k", true)).toBe(false);
    expect(eventMatchesCombo(keyboardEvent("k", { metaKey: true }), "meta+k", false)).toBe(true);
    expect(eventMatchesCombo(keyboardEvent("k", { ctrlKey: true }), "meta+k", false)).toBe(false);
  });

  it("records the platform primary modifier as mod and preserves secondary modifiers", () => {
    expect(eventToCombo(keyboardEvent("k", { metaKey: true }), true)).toBe("mod+k");
    expect(eventToCombo(keyboardEvent("k", { ctrlKey: true }), true)).toBe("ctrl+k");
    expect(eventToCombo(keyboardEvent("k", { ctrlKey: true }), false)).toBe("mod+k");
    expect(eventToCombo(keyboardEvent("k", { metaKey: true }), false)).toBe("meta+k");
  });

  it("keeps portable display labels and renders explicit modifiers", () => {
    expect(comboToDisplayParts("mod+shift+k", true)).toEqual(["⌘", "⇧", "K"]);
    expect(comboToDisplayParts("mod+shift+k", false)).toEqual(["Ctrl", "Shift", "K"]);
    expect(comboToDisplayParts("ctrl+meta+k", true)).toEqual(["⌃", "⌘", "K"]);
    expect(comboToDisplayParts("ctrl+meta+k", false)).toEqual(["Ctrl", "Meta", "K"]);
  });
});

describe("shortcut override updates", () => {
  it("notifies the renderer after overrides are saved or reset", () => {
    const dispatch = vi.mocked(window.dispatchEvent);

    setShortcutOverride("command-palette", "ctrl+k");
    resetAllShortcuts();

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls.map(([event]) => event.type)).toEqual([
      SHORTCUT_OVERRIDES_CHANGED_EVENT,
      SHORTCUT_OVERRIDES_CHANGED_EVENT,
    ]);
  });
});
