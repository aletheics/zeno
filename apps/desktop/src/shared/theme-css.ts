export const MAX_THEME_CUSTOM_CSS_LENGTH = 32 * 1024;

const SELECTOR_HOOKS = [
  ".app-shell",
  ".shell-content",
  ".pix-sidebar-",
  ".thread-",
  ".composer-",
  ".timeline",
  ".surface-panel",
  ".settings-page",
  ".page-header",
  '[data-kind="user"]',
  '[data-slot="bubble-content"]',
] as const;

const EXACT_PROPERTIES = new Set([
  "accent-color",
  "backdrop-filter",
  "background",
  "background-clip",
  "background-color",
  "background-image",
  "background-position",
  "background-repeat",
  "background-size",
  "border",
  "border-color",
  "border-radius",
  "border-style",
  "border-width",
  "box-shadow",
  "caret-color",
  "color",
  "column-gap",
  "filter",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "gap",
  "height",
  "letter-spacing",
  "line-height",
  "margin",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "opacity",
  "outline",
  "outline-color",
  "outline-offset",
  "outline-style",
  "outline-width",
  "padding",
  "row-gap",
  "text-decoration",
  "text-shadow",
  "text-transform",
  "transform",
  "transform-origin",
  "transition",
  "transition-duration",
  "transition-timing-function",
  "width",
  "-webkit-backdrop-filter",
  "-webkit-text-fill-color",
]);

const SAFE_FUNCTIONS = new Set([
  "blur",
  "brightness",
  "calc",
  "clamp",
  "color",
  "color-mix",
  "conic-gradient",
  "contrast",
  "cubic-bezier",
  "drop-shadow",
  "grayscale",
  "hsl",
  "hsla",
  "hue-rotate",
  "hwb",
  "invert",
  "lab",
  "lch",
  "linear-gradient",
  "max",
  "min",
  "oklab",
  "oklch",
  "opacity",
  "radial-gradient",
  "repeating-conic-gradient",
  "repeating-linear-gradient",
  "repeating-radial-gradient",
  "rgb",
  "rgba",
  "rotate",
  "saturate",
  "scale",
  "scalex",
  "scaley",
  "sepia",
  "translate",
  "translate3d",
  "translatex",
  "translatey",
  "var",
]);

type CssRule = { selectors: string[]; declarations: string[] };

function fail(message: string): never {
  throw new Error(`Invalid theme custom CSS: ${message}`);
}

function stripComments(value: string): string {
  const withoutComments = value.replace(/\/\*[\s\S]*?\*\//g, "");
  if (withoutComments.includes("/*") || withoutComments.includes("*/")) {
    fail("unterminated comment");
  }
  return withoutComments;
}

function safeSelector(value: string): string {
  const selector = value.trim();
  if (!selector || selector.length > 240) fail("selector is empty or too long");
  if (!/^[.\x5ba-z0-9_\s>+~:\x5d="'^$|-]+$/i.test(selector)) {
    fail("selector contains unsupported syntax");
  }
  if (/(^|[\s>+~])(html|body)(?=$|[\s>+~.:\x5b])/i.test(selector) || /:root\b/i.test(selector)) {
    fail("document root selectors are not allowed");
  }
  if (!SELECTOR_HOOKS.some((hook) => selector.includes(hook))) {
    fail("selector must target a Zeno theme surface");
  }
  return selector;
}

function safeProperty(value: string): string {
  const property = value.trim().toLowerCase();
  if (!property) fail("property name is empty");
  if (EXACT_PROPERTIES.has(property)) return property;
  if (/^(?:margin|padding)-(?:top|right|bottom|left)$/.test(property)) return property;
  if (/^border-(?:top|right|bottom|left)(?:-(?:color|style|width|radius))?$/.test(property)) {
    return property;
  }
  if (/^--skin-custom-[a-z0-9-]{1,48}$/.test(property)) return property;
  fail(`property ${property} is not allowed`);
}

function safeValue(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 1_000) fail("property value is empty or too long");
  if (/[{}<>\\]/.test(normalized)) fail("property value contains unsupported syntax");
  if (
    /(?:url|image-set|cross-fade|element|expression|paint|attr)\s*\(/i.test(normalized) ||
    /(?:https?|file|data|javascript|vbscript):/i.test(normalized) ||
    /(?:behavior|-moz-binding)\s*:/i.test(normalized)
  ) {
    fail("external resources and executable CSS are not allowed");
  }

  let depth = 0;
  for (const character of normalized) {
    if (character === "(") depth += 1;
    if (character === ")") {
      depth -= 1;
      if (depth < 0) fail("unbalanced function syntax");
    }
  }
  if (depth !== 0) fail("unbalanced function syntax");
  for (const match of normalized.matchAll(/([a-z][a-z0-9-]*)\s*\(/gi)) {
    if (!SAFE_FUNCTIONS.has(match[1]!.toLowerCase())) {
      fail(`function ${match[1]} is not allowed`);
    }
  }
  return normalized;
}

function parseRules(input: string): CssRule[] {
  const source = stripComments(input).trim();
  if (!source) return [];
  if (source.includes("@")) fail("at-rules are not allowed");

  const rules: CssRule[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf("{", cursor);
    if (open < 0) fail("rule is missing an opening brace");
    const close = source.indexOf("}", open + 1);
    if (close < 0) fail("rule is missing a closing brace");
    if (source.slice(open + 1, close).includes("{")) fail("nested rules are not allowed");

    const selectors = source.slice(cursor, open).split(",").map(safeSelector);
    const body = source.slice(open + 1, close);
    const declarations = body
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((declaration) => {
        const separator = declaration.indexOf(":");
        if (separator < 1) fail("declaration is missing a colon");
        const property = safeProperty(declaration.slice(0, separator));
        const value = safeValue(declaration.slice(separator + 1));
        return `${property}: ${value}`;
      });
    if (!declarations.length) fail("rule has no declarations");
    rules.push({ selectors, declarations });
    cursor = close + 1;
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  }
  return rules;
}

export function validateThemeCustomCss(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") fail("value must be text");
  if (value.length > MAX_THEME_CUSTOM_CSS_LENGTH) fail("stylesheet is too large");
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (
      (code < 32 && character !== "\n" && character !== "\r" && character !== "\t") ||
      code === 127
    ) {
      fail("stylesheet contains a control character");
    }
  }
  const normalized = value.trim();
  if (!normalized) return undefined;
  parseRules(normalized);
  return normalized;
}

export function scopeThemeCustomCss(
  value: unknown,
  scope = 'html[data-theme-skin-active="true"]',
): string {
  const normalized = validateThemeCustomCss(value);
  if (!normalized) return "";
  return parseRules(normalized)
    .map(
      (rule) =>
        `${rule.selectors.map((selector) => `${scope} ${selector}`).join(",\n")} {\n  ${rule.declarations.join(";\n  ")};\n}`,
    )
    .join("\n");
}
