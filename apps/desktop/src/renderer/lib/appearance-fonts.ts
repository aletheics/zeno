/**
 * Discover fonts available on this machine for the appearance typography pickers.
 * UI: sans-oriented families. Code: monospace (reuses terminal discovery).
 * Prefer Local Font Access API; fall back to canvas probing of known families.
 */

import { DEFAULT_CODE_FONT_FAMILY, DEFAULT_UI_FONT_FAMILY } from "./appearance-prefs.ts";
import {
  fontStackForFamily as monoFontStackForFamily,
  listInstalledTerminalFonts,
  primaryFontFromStack,
  SYSTEM_TERMINAL_FONT_ID,
  type TerminalFontChoice,
} from "./terminal-fonts.ts";

export type AppearanceFontChoice = {
  /** Stable select value. */
  id: string;
  /** CSS font-family stack written to prefs. */
  family: string;
  /** Display name (usually the primary family). */
  label: string;
};

export const SYSTEM_APPEARANCE_FONT_ID = "system";

/** Common UI (sans) families to probe when queryLocalFonts is unavailable. */
const UI_PROBE_FAMILIES = [
  "Inter",
  "SF Pro Text",
  "SF Pro Display",
  "Segoe UI",
  "Helvetica Neue",
  "Helvetica",
  "Arial",
  "Roboto",
  "Noto Sans",
  "Noto Sans CJK SC",
  "Noto Sans SC",
  "Source Han Sans SC",
  "PingFang SC",
  "Hiragino Sans GB",
  "Microsoft YaHei",
  "Microsoft YaHei UI",
  "WenQuanYi Micro Hei",
  "IBM Plex Sans",
  "Source Sans 3",
  "Source Sans Pro",
  "Ubuntu",
  "Cantarell",
  "Optima",
  "Avenir Next",
  "Avenir",
  "Gill Sans",
  "Trebuchet MS",
  "Verdana",
  "Tahoma",
];

const MONO_NAME_RE =
  /mono|consolas|courier|menlo|monaco|cascadia|fira code|jetbrains|iosevka|hack|inconsolata|source code|plex mono|dejavu|liberation|noto sans mono|sarasa|等距|更纱|sf mono/i;

export function systemUiFontChoice(label: string): AppearanceFontChoice {
  return {
    id: SYSTEM_APPEARANCE_FONT_ID,
    family: DEFAULT_UI_FONT_FAMILY,
    label,
  };
}

export function systemCodeFontChoice(label: string): AppearanceFontChoice {
  return {
    id: SYSTEM_APPEARANCE_FONT_ID,
    family: DEFAULT_CODE_FONT_FAMILY,
    label,
  };
}

/** Build a resilient UI (sans) CSS stack from a primary family name. */
export function uiFontStackForFamily(primary: string): string {
  const name = primary.trim();
  if (!name) return DEFAULT_UI_FONT_FAMILY;
  if (name.includes(",")) return name;
  const quoted = /[\s]/.test(name) ? `"${name.replace(/"/g, "")}"` : name;
  return `${quoted}, "SF Pro Text", "Segoe UI", system-ui, -apple-system, sans-serif`;
}

/** Build a resilient mono CSS stack (same strategy as terminal fonts). */
export function codeFontStackForFamily(primary: string): string {
  const name = primary.trim();
  if (!name) return DEFAULT_CODE_FONT_FAMILY;
  if (name.includes(",")) return name;
  return monoFontStackForFamily(name);
}

function canvasDetectsFamily(family: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const probe = "mmmmmmmmmmlli";
    ctx.font = "72px sans-serif";
    const base = ctx.measureText(probe).width;
    const quoted = /[\s]/.test(family) ? `"${family.replace(/"/g, "")}"` : family;
    ctx.font = `72px ${quoted}, sans-serif`;
    const mixed = ctx.measureText(probe).width;
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

function familiesFromUiProbe(): string[] {
  return UI_PROBE_FAMILIES.filter((f) => canvasDetectsFamily(f));
}

/**
 * Installed UI (sans-oriented) font choices + system default stack.
 */
export async function listInstalledUiFonts(systemLabel: string): Promise<AppearanceFontChoice[]> {
  const system = systemUiFontChoice(systemLabel);
  let families = await familiesFromLocalFonts();
  if (families.length === 0) {
    families = familiesFromUiProbe();
  }

  // Prefer non-mono faces when Local Font Access returned a rich list.
  const sans = families
    .filter((f) => !looksMonospaceName(f))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const list =
    sans.length > 0
      ? sans
      : familiesFromUiProbe().sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" }),
        );

  const choices: AppearanceFontChoice[] = [system];
  const seen = new Set<string>([SYSTEM_APPEARANCE_FONT_ID]);
  for (const family of list) {
    const id = family.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    choices.push({
      id,
      family: uiFontStackForFamily(family),
      label: family,
    });
  }
  return choices;
}

/**
 * Installed monospace font choices for code blocks + system default stack.
 * Reuses terminal discovery, then rewrites the system entry to the appearance mono default.
 */
export async function listInstalledCodeFonts(systemLabel: string): Promise<AppearanceFontChoice[]> {
  const list = await listInstalledTerminalFonts(systemLabel);
  return list.map((choice: TerminalFontChoice): AppearanceFontChoice => {
    if (choice.id === SYSTEM_TERMINAL_FONT_ID) {
      return systemCodeFontChoice(systemLabel);
    }
    return {
      id: choice.id,
      family: choice.family,
      label: choice.label,
    };
  });
}

/** Map a stored CSS stack to a choice id for the select control. */
export function matchAppearanceFontChoiceId(
  fontFamily: string,
  choices: readonly AppearanceFontChoice[],
  systemFamily: string,
): string {
  const stack = fontFamily.trim().toLowerCase();
  if (!stack) return SYSTEM_APPEARANCE_FONT_ID;
  if (stack === systemFamily.trim().toLowerCase()) {
    return SYSTEM_APPEARANCE_FONT_ID;
  }
  const primary = primaryFontFromStack(fontFamily).toLowerCase();
  for (const c of choices) {
    if (c.id === SYSTEM_APPEARANCE_FONT_ID) continue;
    if (c.id === primary) return c.id;
    if (c.family.trim().toLowerCase() === stack) return c.id;
    if (primaryFontFromStack(c.family).toLowerCase() === primary) return c.id;
  }
  return primary || SYSTEM_APPEARANCE_FONT_ID;
}
