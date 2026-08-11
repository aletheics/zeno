/**
 * Tokenize composer prompt text for lightweight syntax highlighting
 * (links, @paths, slash commands / skills, shell injections).
 */

export type ComposerHighlightKind = "text" | "url" | "mention" | "slash" | "skill" | "shell";

export interface ComposerHighlightSpan {
  kind: ComposerHighlightKind;
  text: string;
}

const URL_TRAIL_PUNCT = new Set(".,;:!?)]}>'\"");

function isBoundaryBefore(input: string, index: number): boolean {
  if (index <= 0) return true;
  return /[\s([{"'`]/u.test(input.charAt(index - 1));
}

function isLineStart(input: string, index: number): boolean {
  if (index <= 0) return true;
  return input.charAt(index - 1) === "\n";
}

function canStartSpecial(input: string, index: number): boolean {
  const ch = input.charAt(index);
  if (!ch) return false;
  if (ch === "!" && isLineStart(input, index)) {
    return input.startsWith("!!", index) || input.charAt(index + 1) !== "=";
  }
  if (ch === "h" && (input.startsWith("http://", index) || input.startsWith("https://", index))) {
    return true;
  }
  if (ch === "@" && isBoundaryBefore(input, index)) return true;
  if (ch === "/" && isBoundaryBefore(input, index)) {
    const next = input.charAt(index + 1);
    return Boolean(next && /[A-Za-z0-9]/u.test(next));
  }
  return false;
}

function pushSpan(spans: ComposerHighlightSpan[], kind: ComposerHighlightKind, text: string): void {
  if (!text) return;
  const last = spans[spans.length - 1];
  if (last && last.kind === kind) {
    last.text += text;
    return;
  }
  spans.push({ kind, text });
}

function takeUrl(input: string, start: number): { end: number; url: string; trail: string } {
  let end = start;
  while (end < input.length && !/\s/u.test(input.charAt(end))) end += 1;
  let url = input.slice(start, end);
  let trail = "";
  while (url.length > 0 && URL_TRAIL_PUNCT.has(url.charAt(url.length - 1))) {
    // Keep a trailing ")" only when the URL still has an unmatched "(".
    if (url.endsWith(")")) {
      const opens = (url.match(/\(/g) ?? []).length;
      const closes = (url.match(/\)/g) ?? []).length;
      if (opens >= closes) break;
    }
    trail = `${url.slice(-1)}${trail}`;
    url = url.slice(0, -1);
  }
  return { end, url, trail };
}

/**
 * Split prompt into highlight spans. Adjacent same-kind spans are merged.
 * Empty input yields a single empty text span (stable for render).
 */
export function tokenizeComposerHighlight(input: string): ComposerHighlightSpan[] {
  if (!input) return [{ kind: "text", text: "" }];

  const spans: ComposerHighlightSpan[] = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    // Shell injection: leading `!` / `!!` on a line (matches composer shell parse).
    if (isLineStart(input, i) && input.charAt(i) === "!") {
      if (input.startsWith("!!", i) || input.charAt(i + 1) !== "=") {
        let end = i;
        while (end < n && input.charAt(end) !== "\n") end += 1;
        pushSpan(spans, "shell", input.slice(i, end));
        i = end;
        continue;
      }
    }

    // http(s) URL
    if (input.startsWith("http://", i) || input.startsWith("https://", i)) {
      const { end, url, trail } = takeUrl(input, i);
      if (url) pushSpan(spans, "url", url);
      if (trail) pushSpan(spans, "text", trail);
      i = end;
      continue;
    }

    // @path / @file mention
    if (input.charAt(i) === "@" && isBoundaryBefore(input, i)) {
      let end = i + 1;
      while (end < n && !/\s/u.test(input.charAt(end))) end += 1;
      if (end > i + 1) {
        pushSpan(spans, "mention", input.slice(i, end));
        i = end;
        continue;
      }
    }

    // /slash or /skill:name
    if (input.charAt(i) === "/" && isBoundaryBefore(input, i)) {
      if (input.startsWith("/skill:", i)) {
        let end = i + "/skill:".length;
        while (end < n && !/\s/u.test(input.charAt(end))) end += 1;
        pushSpan(spans, "skill", input.slice(i, end));
        i = end;
        continue;
      }
      const next = input.charAt(i + 1);
      if (next && /[A-Za-z0-9]/u.test(next)) {
        let end = i + 1;
        while (end < n && /[A-Za-z0-9:_./-]/u.test(input.charAt(end))) end += 1;
        pushSpan(spans, "slash", input.slice(i, end));
        i = end;
        continue;
      }
    }

    // Plain text until the next special token.
    let end = i + 1;
    while (end < n && !canStartSpecial(input, end)) end += 1;
    pushSpan(spans, "text", input.slice(i, end));
    i = end;
  }

  return spans.length > 0 ? spans : [{ kind: "text", text: "" }];
}

/** CSS class for a highlight span (used by the mirror layer). */
export function composerHighlightClass(kind: ComposerHighlightKind): string {
  if (kind === "text") return "composer-hl-text";
  return `composer-hl-${kind}`;
}
