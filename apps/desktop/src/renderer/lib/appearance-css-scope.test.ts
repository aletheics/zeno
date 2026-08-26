import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

/*
 * The app shell carries the theme attribute itself
 * (<div class="app-shell" data-theme="dark">), so whatever a [data-theme="…"]
 * block declares wins over the value inherited from <html> for the entire shell
 * subtree. applyAppearancePrefs() writes the typography tokens as inline styles
 * on <html>; re-declaring them in a theme block silently pins every font size in
 * the app to the stylesheet default and makes Appearance → Typography a no-op.
 */
const APPEARANCE_TOKENS = ["--ui-font-size", "--code-font-size", "--group-label-size"] as const;

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../styles.css"), "utf8");

/** Collect `--token: …` declarations paired with the selector of their block. */
function declarationsOf(css: string, tokens: readonly string[]) {
  const found: { token: string; selector: string }[] = [];
  const stack: string[] = [];
  let buf = "";
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      // Copy the quoted span verbatim so selectors keep their attribute values.
      const end = css.indexOf(ch, i + 1);
      const stop = end === -1 ? css.length : end;
      buf += css.slice(i, stop + 1);
      i = stop;
      continue;
    }
    if (ch === "{") {
      stack.push(buf.trim().replace(/\s+/g, " "));
      buf = "";
      continue;
    }
    if (ch === "}" || ch === ";") {
      const token = tokens.find((t) => buf.trim().startsWith(`${t}:`));
      if (token) found.push({ token, selector: stack[stack.length - 1] ?? "" });
      if (ch === "}") stack.pop();
      buf = "";
      continue;
    }
    buf += ch;
  }
  return found;
}

describe("appearance typography tokens", () => {
  it("are declared only on :root, so <html> prefs reach the shell subtree", () => {
    const declarations = declarationsOf(CSS, APPEARANCE_TOKENS);
    const byToken = Object.fromEntries(
      APPEARANCE_TOKENS.map((token) => [
        token,
        declarations.filter((d) => d.token === token).map((d) => d.selector),
      ]),
    );
    expect(byToken).toEqual({
      "--ui-font-size": [":root"],
      "--code-font-size": [":root"],
      "--group-label-size": [":root"],
    });
  });

  it("leaves the theme blocks owning color only", () => {
    // Parser self-check: theme-scoped tokens must still resolve to their blocks.
    const themed = declarationsOf(CSS, ["--group-label-color"]).map((d) => d.selector);
    expect(themed).toEqual([':root, [data-theme="dark"]', '[data-theme="light"]']);
  });
});
