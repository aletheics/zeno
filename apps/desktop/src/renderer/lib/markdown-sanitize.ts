import { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";

const GFM_TABLE_TAGS = ["table", "thead", "tbody", "tfoot", "tr", "th", "td"] as const;

/**
 * Sanitize schema for conversation markdown.
 * Extends rehype-sanitize defaults so GFM footnotes / source citations keep
 * their ids, data attributes, and sr-only footnote heading, and so GFM tables
 * keep alignment + structural attributes after sanitization.
 */
export const markdownSanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: Array.from(
    new Set([...(defaultSchema.tagNames ?? []), ...GFM_TABLE_TAGS, "div", "section", "sup"]),
  ),
  attributes: {
    ...defaultSchema.attributes,
    a: [
      ...(defaultSchema.attributes?.a ?? []),
      // Footnote ref / backref (hast camelCase + literal class tokens).
      "dataFootnoteBackref",
      "dataFootnoteRef",
      ["className", "data-footnote-backref", "content-cite-ref", "content-cite-backref"],
    ],
    section: [
      ...(defaultSchema.attributes?.section ?? []),
      "dataFootnotes",
      ["className", "footnotes", "content-footnotes"],
    ],
    h2: [...(defaultSchema.attributes?.h2 ?? []), ["className", "sr-only"]],
    sup: [...(defaultSchema.attributes?.sup ?? []), ["className", "content-cite-sup"]],
    // GFM tables: keep align (→ text-align in hast-util-to-jsx-runtime) and spans.
    table: [...(defaultSchema.attributes?.table ?? []), "align"],
    thead: [...(defaultSchema.attributes?.thead ?? []), "align"],
    tbody: [...(defaultSchema.attributes?.tbody ?? []), "align"],
    tfoot: [...(defaultSchema.attributes?.tfoot ?? []), "align"],
    tr: [...(defaultSchema.attributes?.tr ?? []), "align"],
    th: [...(defaultSchema.attributes?.th ?? []), "align", "colSpan", "rowSpan", "scope", "width"],
    td: [...(defaultSchema.attributes?.td ?? []), "align", "colSpan", "rowSpan", "width"],
    div: [...(defaultSchema.attributes?.div ?? []), ["className", "content-table-scroll"]],
  },
};
