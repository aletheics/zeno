/**
 * The parts of an app-styled context menu that can be decided without a DOM.
 *
 * Right-click menus are rendered with `FloatingMenu` (never an Electron `Menu.popup` — see
 * `AGENTS.md`: 不要用系统默认控件做产品交互). That leaves a handful of decisions that are
 * pure: where the menu points, whether a keystroke should open it, which combo to print
 * next to an item, and what a "copy as plain text" of a message should say. Those live
 * here so they can be tested without mounting a portal.
 *
 * A note on the shape: `ContextMenuAnchor` is structurally identical to `AnchorRect` in
 * `components/FloatingMenu.tsx`. It is redeclared rather than imported so that `lib/` keeps
 * no dependency on a component module; TypeScript accepts it at the `anchor` prop.
 */

import { formatComboDisplay } from "./shortcuts.ts";

export type ContextMenuAnchor = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

/**
 * Anchor a menu to a pointer. `FloatingMenu` only reads `left` and `bottom` (plus `width`
 * for `matchAnchorWidth`), so the far edges collapse onto the point — giving the menu a
 * zero-size anchor is what makes it open *at the cursor* rather than at a row's edge.
 */
export function anchorFromPoint(clientX: number, clientY: number): ContextMenuAnchor {
  return {
    top: clientY,
    left: clientX,
    right: clientX,
    bottom: clientY,
    width: 0,
    height: 0,
  };
}

/**
 * True for the two keystrokes that mean "open the context menu here": the dedicated
 * ContextMenu key, and Shift+F10 (the convention for keyboards without it).
 *
 * Takes a structural event rather than a DOM `KeyboardEvent` so it stays testable.
 */
export function isContextMenuKey(event: { key: string; shiftKey: boolean }): boolean {
  return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
}

export type EditAction = "cut" | "copy" | "paste" | "selectAll";

/**
 * These combos are the *platform's* editing bindings, not app commands — deliberately kept
 * out of `ShortcutId` in `lib/shortcuts.ts`. Adding them there would list them in
 * Settings → Shortcuts and invite rebinding, which cannot work: they are handled by the OS
 * and by Chromium's own text field, not by the app.
 */
const EDIT_COMBOS: Record<EditAction, string> = {
  cut: "mod+x",
  copy: "mod+c",
  paste: "mod+v",
  selectAll: "mod+a",
};

/** The display string to print beside an editing item, e.g. `⌘C` on macOS, `Ctrl+C` elsewhere. */
export function editCombo(action: EditAction, isMac?: boolean): string {
  return formatComboDisplay(EDIT_COMBOS[action], isMac);
}

export type MenuNavKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

/**
 * Which item a navigation key moves to, wrapping at both ends the way a native menu does.
 * `-1` means "nothing focused yet" — Down then enters at the top and Up at the bottom, so
 * the first press after opening always lands somewhere rather than appearing to do nothing.
 */
export function nextMenuIndex(current: number, count: number, key: MenuNavKey): number {
  if (count <= 0) return -1;
  const at = current < 0 || current >= count ? undefined : current;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return at === undefined ? 0 : (at + 1) % count;
  return at === undefined ? count - 1 : (at - 1 + count) % count;
}

/**
 * Tool output writes locations as `path:line` or `path:line:column`, but the app cannot open
 * a specific line: `shell.openPath` takes no line argument, and the `location` parameter that
 * `packages/contracts` declares on `openFile` is dropped by the main-process handler. So the
 * line is parsed and discarded — callers use `path` for "open" and "reveal" alike. The column
 * goes the same way, for the same reason.
 */
export function stripLocationSuffix(value: string): { path: string; line?: number } {
  // A URL's `:port` is not a line number, and stripping it would break the link.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return { path: value };
  const match = /:(\d+)(?::\d+)?$/.exec(value);
  if (!match) return { path: value };
  return { path: value.slice(0, match.index), line: Number(match[1]) };
}

export type InsertResult = { value: string; caret: number };

/**
 * Splice `text` over the selection and report where the caret lands. Replacing the whole
 * value through `onPromptChange` plus a restored caret is how the composer inserts anything
 * (see `selectCommand` / `completePathWithTab`), and it keeps the `@` mention highlight layer
 * correct for free — that layer re-tokenizes the entire string on every change.
 */
export function insertAtSelection(
  value: string,
  start: number,
  end: number,
  text: string,
): InsertResult {
  const length = value.length;
  const from = Math.max(0, Math.min(start, length));
  const to = Math.max(from, Math.min(end, length));
  return {
    value: `${value.slice(0, from)}${text}${value.slice(to)}`,
    caret: from + text.length,
  };
}

/** A fenced block (group 1 = body), or one inline code span (group 2 = body). */
const CODE_SPAN = /^[ \t]*(?:```|~~~)[^\n]*\n([\s\S]*?)^[ \t]*(?:```|~~~)[ \t]*$|`([^`\n]+)`/gm;

/** Drop the markdown syntax that is not content, leaving everything else as written. */
function stripMarkdownSyntax(text: string): string {
  return (
    text
      // Images before links, or the link pattern would match the tail of `![alt](url)`.
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
      // Link definitions carry no reading-order content.
      .replace(/^[ \t]*\[[^\]]+\]:[ \t]*\S+.*$/gm, "")
      .replace(/<((?:https?|mailto):[^>\s]+)>/g, "$1")
      // Inline HTML is presentation, not content.
      .replace(/<\/?[a-zA-Z][^>]*>/g, "")
      .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
      .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
      .replace(/^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, "")
      .replace(/^([ \t]*)[-*+][ \t]+/gm, "$1")
      .replace(/^([ \t]*)\d+[.)][ \t]+/gm, "$1")
      .replace(/\*\*([^*\n]+)\*\*/g, "$1")
      .replace(/__([^_\n]+)__/g, "$1")
      .replace(/~~([^~\n]+)~~/g, "$1")
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
      // Guarded so `snake_case_identifiers` survive; only a bare `_` pair is eaten.
      .replace(/(?<![A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/g, "$1")
  );
}

/**
 * Strip markdown down to what it reads as.
 *
 * "Copy" on a message hands over `item.text`, which for an assistant turn is the raw markdown
 * source — so copy-as-plain-text needs a markdown→text pass that exists nowhere else in the
 * app. This is deliberately conservative: it removes syntax that is *not* content (fences,
 * link targets, emphasis runs, heading/list/quote prefixes) and leaves everything else,
 * tables included, exactly as written.
 *
 * Code is walked separately and passed through untouched. Emphasis runs are extremely common
 * inside code samples, so rewriting the sample someone is trying to copy would be worse than
 * leaving a stray `*` in prose.
 */
export function markdownToPlainText(markdown: string): string {
  const parts: string[] = [];
  let cursor = 0;
  for (const match of markdown.matchAll(CODE_SPAN)) {
    parts.push(stripMarkdownSyntax(markdown.slice(cursor, match.index)));
    // A fenced body keeps its own lines; an inline span is a single line by construction.
    parts.push(match[1] === undefined ? (match[2] ?? "") : match[1].replace(/\n$/, ""));
    cursor = match.index + match[0].length;
  }
  parts.push(stripMarkdownSyntax(markdown.slice(cursor)));

  return parts
    .join("")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
