/**
 * Presentation helpers for portable extension UI dialogs.
 *
 * Extensions (e.g. ask-user-question RPC fallback) send plain strings shaped like:
 *   title:   "[Header] Question?\n\n--- 1. Label preview ---\n```ts\n…\n```"
 *   option:  "1. Label — description"
 *
 * We only restructure for display. Selection still returns the original option
 * string so hosts that parse leading indices keep working.
 */

export type FormattedSelectTitle = {
  /** Optional bracket header, e.g. "Stack". */
  header?: string;
  /** Primary question / headline (first non-empty paragraph after header). */
  headline: string;
  /** Remaining plain body before preview blocks (may be multi-line). */
  body?: string;
  /** Folded preview sections from RPC hosts that lack a side-by-side pane. */
  previews: Array<{ title: string; content: string }>;
};

export type FormattedSelectOption = {
  /** Original option string — always return this on select. */
  raw: string;
  /** Leading "1." index when present. */
  index?: number;
  /** Primary label (before em-dash / en-dash). */
  label: string;
  /** Secondary description after the dash. */
  description?: string;
};

/** `--- 1. Foo preview ---` / `--- Foo preview ---` */
const PREVIEW_HEADING = /^---\s*(.+?)\s*---\s*$/;

/** `[Header] rest…` */
const BRACKET_HEADER = /^\[([^\]]+)\]\s*/;

/** `1. Label — description` / `1. Label - description` / `1. Label` */
const NUMBERED_OPTION = /^(\d+)\.\s+([\s\S]+)$/;
const OPTION_DASH = /\s+[—–-]\s+/;

/**
 * Split a select/input title into headline, optional body, and preview blocks.
 * Safe for plain titles with no structure.
 */
export function formatSelectTitle(title: string): FormattedSelectTitle {
  const trimmed = title.replace(/^\uFEFF/, "").trimEnd();
  if (!trimmed) {
    return { headline: "Select", previews: [] };
  }

  const lines = trimmed.split(/\r?\n/);
  const previews: FormattedSelectTitle["previews"] = [];
  const beforePreview: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const match = PREVIEW_HEADING.exec(lines[i]!.trim());
    if (!match) {
      beforePreview.push(lines[i]!);
      i += 1;
      continue;
    }
    const previewTitle = match[1]!.trim();
    i += 1;
    const contentLines: string[] = [];
    while (i < lines.length) {
      if (PREVIEW_HEADING.test(lines[i]!.trim())) break;
      contentLines.push(lines[i]!);
      i += 1;
    }
    // Drop a single leading blank line after the heading.
    while (contentLines.length > 0 && contentLines[0]!.trim() === "") contentLines.shift();
    // Drop trailing blanks.
    while (contentLines.length > 0 && contentLines[contentLines.length - 1]!.trim() === "") {
      contentLines.pop();
    }
    previews.push({
      title: previewTitle,
      content: contentLines.join("\n"),
    });
  }

  let headText = beforePreview.join("\n").trim();
  let header: string | undefined;
  const headerMatch = BRACKET_HEADER.exec(headText);
  if (headerMatch) {
    header = headerMatch[1]!.trim();
    headText = headText.slice(headerMatch[0].length).trim();
  }

  if (!headText) {
    return {
      ...(header ? { header } : {}),
      headline: header ?? "Select",
      previews,
    };
  }

  // First paragraph = headline; remaining paragraphs = supporting body.
  const paragraphs = headText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  let finalHeadline = paragraphs[0] ?? headText;
  let finalBody = paragraphs.length > 1 ? paragraphs.slice(1).join("\n\n") : undefined;

  // Single paragraph with internal newlines → first line headline, rest body.
  if (!finalBody && finalHeadline.includes("\n")) {
    const [first, ...rest] = finalHeadline.split("\n");
    finalHeadline = (first ?? finalHeadline).trim();
    const restText = rest.join("\n").trim();
    if (restText) finalBody = restText;
  }

  return {
    ...(header ? { header } : {}),
    headline: finalHeadline || header || "Select",
    ...(finalBody ? { body: finalBody } : {}),
    previews,
  };
}

/** Parse a select option line into index / label / description for card layout. */
export function formatSelectOption(raw: string): FormattedSelectOption {
  const text = raw.trim();
  if (!text) return { raw, label: raw };

  const numbered = NUMBERED_OPTION.exec(text);
  if (!numbered) {
    const dash = text.split(OPTION_DASH);
    if (dash.length >= 2) {
      return {
        raw,
        label: dash[0]!.trim(),
        description: dash.slice(1).join(" — ").trim(),
      };
    }
    return { raw, label: text };
  }

  const index = Number.parseInt(numbered[1]!, 10);
  const rest = numbered[2]!.trim();
  const dashParts = rest.split(OPTION_DASH);
  if (dashParts.length >= 2) {
    return {
      raw,
      index,
      label: dashParts[0]!.trim(),
      description: dashParts.slice(1).join(" — ").trim(),
    };
  }
  return { raw, index, label: rest };
}

/** Searchable text for cmdk filtering (index + label + description). */
export function selectOptionSearchValue(option: FormattedSelectOption): string {
  return [
    option.index !== undefined ? String(option.index) : "",
    option.label,
    option.description ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}
