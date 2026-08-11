/**
 * Discover monospace fonts available on this machine for the terminal picker.
 * Prefer Local Font Access API; fall back to canvas probing of known families.
 */

import { DEFAULT_TERMINAL_PREFS } from "./terminal-prefs.ts";

export type TerminalFontChoice = {
  /** Stable select value. */
  id: string;
  /** CSS font-family stack written to prefs. */
  family: string;
  /** Display name (usually the primary family). */
  label: string;
};

/** Common mono families to probe when queryLocalFonts is unavailable. */
const PROBE_FAMILIES = [
  "Cascadia Code",
  "Cascadia Mono",
  "Consolas",
  "Courier New",
  "DejaVu Sans Mono",
  "Fira Code",
  "Fira Mono",
  "Hack",
  "IBM Plex Mono",
  "Inconsolata",
  "Iosevka",
  "JetBrains Mono",
  "Liberation Mono",
  "Menlo",
  "Monaco",
  "Noto Sans Mono",
  "Roboto Mono",
  "SF Mono",
  "Source Code Pro",
  "Ubuntu Mono",
  // CJK-friendly mono stacks often present on Windows/macOS CN installs
  "Sarasa Mono SC",
  "Sarasa Gothic SC",
  "Microsoft YaHei Mono",
  "更纱黑体 Mono SC",
  "等距更纱黑体 SC",
];

const MONO_NAME_RE =
  /mono|consolas|courier|menlo|monaco|cascadia|fira code|jetbrains|iosevka|hack|inconsolata|source code|plex mono|dejavu|liberation|noto sans mono|sarasa|等距|更纱/i;

export const SYSTEM_TERMINAL_FONT_ID = "system";

export function systemTerminalFontChoice(label: string): TerminalFontChoice {
  return {
    id: SYSTEM_TERMINAL_FONT_ID,
    family: DEFAULT_TERMINAL_PREFS.fontFamily,
    label,
  };
}

/** Build a resilient CSS stack from a primary family name. */
export function fontStackForFamily(primary: string): string {
  const name = primary.trim();
  if (!name) return DEFAULT_TERMINAL_PREFS.fontFamily;
  // Already a multi-family stack
  if (name.includes(",")) return name;
  const quoted = /[\s]/.test(name) ? `"${name.replace(/"/g, "")}"` : name;
  return `${quoted}, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
}

/** Primary family token from a CSS stack (for matching select value). */
export function primaryFontFromStack(stack: string): string {
  const first = stack.split(",")[0]?.trim() ?? "";
  return first.replace(/^["']|["']$/g, "");
}

function canvasDetectsFamily(family: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const probe = "mmmmmmmmmmlli";
    ctx.font = "72px monospace";
    const base = ctx.measureText(probe).width;
    const quoted = /[\s]/.test(family) ? `"${family.replace(/"/g, "")}"` : family;
    ctx.font = `72px ${quoted}, monospace`;
    const mixed = ctx.measureText(probe).width;
    // If the engine used the named face, width usually differs from pure monospace fallback.
    // Also accept when document.fonts.check says the face is available.
    if (typeof document.fonts?.check === "function") {
      try {
        if (document.fonts.check(`12px ${quoted}`)) return true;
      } catch {
        // ignore
      }
    }
    return Math.abs(mixed - base) > 0.5;
  } catch {
    return false;
  }
}

function looksMonospaceName(family: string): boolean {
  return MONO_NAME_RE.test(family);
}

function isMonospaceFamily(family: string): boolean {
  if (typeof document === "undefined") return looksMonospaceName(family);
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return looksMonospaceName(family);
    const quoted = /[\s]/.test(family) ? `"${family.replace(/"/g, "")}"` : family;
    ctx.font = `32px ${quoted}`;
    const wi = ctx.measureText("i").width;
    const wW = ctx.measureText("W").width;
    // True mono: i and W same advance; allow tiny float noise.
    if (Math.abs(wi - wW) < 0.5 && wi > 0) return true;
  } catch {
    // fall through
  }
  return looksMonospaceName(family);
}

async function familiesFromLocalFonts(): Promise<string[]> {
  const query = (
    window as unknown as {
      queryLocalFonts?: () => Promise<Array<{ family: string }>>;
    }
  ).queryLocalFonts;
  if (typeof query !== "function") return [];
  try {
    const fonts = await query();
    const set = new Set<string>();
    for (const f of fonts) {
      const family = f?.family?.trim();
      if (family) set.add(family);
    }
    return [...set];
  } catch {
    return [];
  }
}

function familiesFromProbe(): string[] {
  return PROBE_FAMILIES.filter((f) => canvasDetectsFamily(f));
}

/**
 * Installed monospace-oriented font choices + system default stack.
 * Safe to call in the renderer; caches nothing (caller may memoize).
 */
export async function listInstalledTerminalFonts(
  systemLabel: string,
): Promise<TerminalFontChoice[]> {
  const system = systemTerminalFontChoice(systemLabel);
  let families = await familiesFromLocalFonts();
  if (families.length === 0) {
    families = familiesFromProbe();
  }

  const mono = families
    .filter((f) => isMonospaceFamily(f) || looksMonospaceName(f))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  // If mono filter emptied a rich list, fall back to name-heuristic only on the probe set.
  const list =
    mono.length > 0
      ? mono
      : familiesFromProbe().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const choices: TerminalFontChoice[] = [system];
  const seen = new Set<string>([SYSTEM_TERMINAL_FONT_ID]);
  for (const family of list) {
    const id = family.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    choices.push({
      id,
      family: fontStackForFamily(family),
      label: family,
    });
  }
  return choices;
}

/** Map a stored CSS stack to a choice id for the select control. */
export function matchTerminalFontChoiceId(
  fontFamily: string,
  choices: readonly TerminalFontChoice[],
): string {
  const stack = fontFamily.trim().toLowerCase();
  if (!stack) return SYSTEM_TERMINAL_FONT_ID;
  if (stack === DEFAULT_TERMINAL_PREFS.fontFamily.trim().toLowerCase()) {
    return SYSTEM_TERMINAL_FONT_ID;
  }
  const primary = primaryFontFromStack(fontFamily).toLowerCase();
  for (const c of choices) {
    if (c.id === SYSTEM_TERMINAL_FONT_ID) continue;
    if (c.id === primary) return c.id;
    if (c.family.trim().toLowerCase() === stack) return c.id;
    if (primaryFontFromStack(c.family).toLowerCase() === primary) return c.id;
  }
  // Unknown stored stack: surface as orphan option via select (id = primary).
  return primary || SYSTEM_TERMINAL_FONT_ID;
}
