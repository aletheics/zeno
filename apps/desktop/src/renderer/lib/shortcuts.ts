/**
 * Keyboard shortcut registry + local overrides.
 * Combos use a portable form: "mod+key", "mod+shift+key", "mod+alt+key".
 * `mod` = Meta on macOS, Ctrl on Windows/Linux.
 */

export type ShortcutId =
  | "command-palette"
  | "new-thread"
  | "packages"
  | "resources"
  | "settings"
  | "thread"
  | "focus-composer"
  | "fork-thread"
  | "toggle-theme"
  | "toggle-env-panel"
  | "toggle-content-mode";

export type ShortcutDefinition = {
  id: ShortcutId;
  /** i18n label key */
  labelKey: string;
  /** Portable default combo, e.g. "mod+n" */
  defaultCombo: string;
};

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: "command-palette", labelKey: "shortcuts.commandPalette", defaultCombo: "mod+k" },
  { id: "new-thread", labelKey: "shortcuts.newThread", defaultCombo: "mod+n" },
  { id: "packages", labelKey: "shortcuts.packages", defaultCombo: "mod+p" },
  { id: "resources", labelKey: "shortcuts.resources", defaultCombo: "mod+shift+p" },
  { id: "settings", labelKey: "shortcuts.settings", defaultCombo: "mod+," },
  { id: "thread", labelKey: "shortcuts.thread", defaultCombo: "mod+1" },
  { id: "focus-composer", labelKey: "shortcuts.focusComposer", defaultCombo: "mod+j" },
  { id: "fork-thread", labelKey: "shortcuts.forkThread", defaultCombo: "mod+shift+f" },
  { id: "toggle-theme", labelKey: "shortcuts.toggleTheme", defaultCombo: "mod+shift+t" },
  { id: "toggle-env-panel", labelKey: "shortcuts.toggleEnvPanel", defaultCombo: "mod+." },
  {
    id: "toggle-content-mode",
    labelKey: "shortcuts.toggleContentMode",
    defaultCombo: "mod+shift+\\",
  },
];

const STORAGE_KEY = "zeno.shortcuts.overrides";
export const SHORTCUT_OVERRIDES_CHANGED_EVENT = "zeno:shortcut-overrides-changed";

/**
 * Overrides map. Missing key → use default.
 * Value `""` (empty string) → explicitly unbound (no shortcut).
 * Any other string → custom combo.
 */
export type ShortcutOverrides = Partial<Record<ShortcutId, string>>;

/** Explicit unbound sentinel stored in overrides. */
export const SHORTCUT_UNBOUND = "";

export function loadShortcutOverrides(): ShortcutOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ShortcutOverrides;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveShortcutOverrides(overrides: ShortcutOverrides): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    notifyShortcutOverridesChanged();
  } catch {
    // ignore
  }
}

export function notifyShortcutOverridesChanged(): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new Event(SHORTCUT_OVERRIDES_CHANGED_EVENT));
}

/** True when user has any override for this id (custom combo or unbound). */
export function hasShortcutOverride(
  id: ShortcutId,
  overrides: ShortcutOverrides = loadShortcutOverrides(),
): boolean {
  return Object.prototype.hasOwnProperty.call(overrides, id);
}

/** True when this shortcut is explicitly unbound (no keys). */
export function isShortcutUnbound(
  id: ShortcutId,
  overrides: ShortcutOverrides = loadShortcutOverrides(),
): boolean {
  return hasShortcutOverride(id, overrides) && (overrides[id] ?? "").trim() === "";
}

export function getEffectiveCombo(
  id: ShortcutId,
  overrides: ShortcutOverrides = loadShortcutOverrides(),
): string {
  const def = SHORTCUT_DEFINITIONS.find((d) => d.id === id);
  if (hasShortcutOverride(id, overrides)) {
    // Explicit empty = unbound; non-empty = custom binding.
    return (overrides[id] ?? "").trim();
  }
  return def?.defaultCombo || "";
}

/**
 * Set override for a shortcut.
 * - `null` → reset to app default
 * - `""` → unbound (no shortcut)
 * - other → custom combo (if equals default, clears override)
 */
export function setShortcutOverride(id: ShortcutId, combo: string | null): ShortcutOverrides {
  const next = { ...loadShortcutOverrides() };
  const def = SHORTCUT_DEFINITIONS.find((d) => d.id === id);
  if (combo === null) {
    delete next[id];
  } else if (combo.trim() === "") {
    next[id] = SHORTCUT_UNBOUND;
  } else if (combo === def?.defaultCombo) {
    delete next[id];
  } else {
    next[id] = combo;
  }
  saveShortcutOverrides(next);
  return next;
}

export function resetAllShortcuts(): ShortcutOverrides {
  saveShortcutOverrides({});
  return {};
}

/** Parse "mod+shift+f" into parts. */
export function parseCombo(combo: string): {
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
} {
  const parts = combo
    .toLowerCase()
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    mod: parts.includes("mod"),
    ctrl: parts.includes("ctrl") || parts.includes("control"),
    meta: parts.includes("meta") || parts.includes("cmd") || parts.includes("command"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt") || parts.includes("option"),
    key:
      parts
        .filter(
          (p) =>
            ![
              "mod",
              "cmd",
              "command",
              "ctrl",
              "control",
              "meta",
              "shift",
              "alt",
              "option",
            ].includes(p),
        )
        .join("+") || "",
  };
}

function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
}

export function eventToCombo(event: KeyboardEvent, isMac = isMacPlatform()): string | null {
  const key = event.key;
  if (!key || key === "Meta" || key === "Control" || key === "Shift" || key === "Alt") return null;
  const parts: string[] = [];
  if (isMac ? event.metaKey : event.ctrlKey) parts.push("mod");
  if (isMac && event.ctrlKey) parts.push("ctrl");
  if (!isMac && event.metaKey) parts.push("meta");
  if (event.shiftKey) parts.push("shift");
  if (event.altKey) parts.push("alt");
  // Normalize key
  let k = key.length === 1 ? key.toLowerCase() : key.toLowerCase();
  if (k === " ") k = "space";
  if (k === "escape") k = "esc";
  if (k === "arrowup") k = "up";
  if (k === "arrowdown") k = "down";
  if (k === "arrowleft") k = "left";
  if (k === "arrowright") k = "right";
  parts.push(k);
  const only = parts[0];
  if (parts.length === 1 && only && !only.startsWith("f")) {
    // Require at least one modifier for non-function keys
    return null;
  }
  return parts.join("+");
}

export function eventMatchesCombo(
  event: KeyboardEvent,
  combo: string,
  isMac = isMacPlatform(),
): boolean {
  // Empty / unbound combos never match.
  if (!combo || !combo.trim()) return false;
  const parsed = parseCombo(combo);
  if (!parsed.key) return false;
  const expectedMeta = parsed.meta || (parsed.mod && isMac);
  const expectedCtrl = parsed.ctrl || (parsed.mod && !isMac);
  if (expectedMeta !== event.metaKey) return false;
  if (expectedCtrl !== event.ctrlKey) return false;
  if (parsed.shift !== event.shiftKey) return false;
  if (parsed.alt !== event.altKey) return false;

  let eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
  if (eventKey === " ") eventKey = "space";
  if (eventKey === "escape") eventKey = "esc";
  if (eventKey === "arrowup") eventKey = "up";
  if (eventKey === "arrowdown") eventKey = "down";
  if (eventKey === "arrowleft") eventKey = "left";
  if (eventKey === "arrowright") eventKey = "right";

  // "," key
  if (parsed.key === "," && event.key === ",") return true;
  if (parsed.key === "." && event.key === ".") return true;
  return eventKey === parsed.key;
}

/** Individual key labels for UI keycaps (⌘ / Ctrl, ⇧ / Shift, …). */
export function comboToDisplayParts(combo: string, isMac = isMacPlatform()): string[] {
  if (!combo) return [];
  const p = parseCombo(combo);
  const bits: string[] = [];
  if (p.mod) bits.push(isMac ? "⌘" : "Ctrl");
  if (p.ctrl) bits.push(isMac ? "⌃" : "Ctrl");
  if (p.meta) bits.push(isMac ? "⌘" : "Meta");
  if (p.shift) bits.push(isMac ? "⇧" : "Shift");
  if (p.alt) bits.push(isMac ? "⌥" : "Alt");
  const keyLabel =
    p.key === "esc"
      ? "Esc"
      : p.key === "space"
        ? "Space"
        : p.key === "up"
          ? "↑"
          : p.key === "down"
            ? "↓"
            : p.key === "left"
              ? "←"
              : p.key === "right"
                ? "→"
                : p.key === ","
                  ? ","
                  : p.key === "."
                    ? "."
                    : p.key.length === 1
                      ? p.key.toUpperCase()
                      : p.key;
  if (keyLabel) bits.push(keyLabel);
  return bits;
}

/** Display string for UI (⌘ on Mac, Ctrl on Win/Linux). */
export function formatComboDisplay(
  combo: string,
  isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.platform),
): string {
  const bits = comboToDisplayParts(combo, isMac);
  if (!bits.length) return "—";
  return isMac ? bits.join("") : bits.join("+");
}

/** Find which shortcut id matches an event (first match wins). */
export function matchShortcut(
  event: KeyboardEvent,
  overrides: ShortcutOverrides = loadShortcutOverrides(),
): ShortcutId | undefined {
  for (const def of SHORTCUT_DEFINITIONS) {
    const combo = getEffectiveCombo(def.id, overrides);
    if (eventMatchesCombo(event, combo)) return def.id;
  }
  return undefined;
}
