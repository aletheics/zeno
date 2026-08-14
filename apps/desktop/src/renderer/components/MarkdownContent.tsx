/** Streaming-safe rich content renderer for assistant messages. */
import {
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { BookMarked, Check, Copy, ExternalLink, FileCode2, Maximize2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { Button } from "@/components/ui/button";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { ContentCodeBlock } from "./ContentCodeBlock.tsx";
import { ContentPreviewDialog, ImagePreviewDialog } from "./ContentPreviewDialog.tsx";
import {
  contentMediaKind,
  contentSourceUrl,
  formatFileLinkLabel,
  parseContentLink,
} from "../lib/content-rendering.ts";
import { markdownSanitizeSchema } from "../lib/markdown-sanitize.ts";
import { t, type Locale } from "../lib/i18n.ts";
import { cn } from "../lib/utils.ts";

/** Browsers block file:// media when the page is served over http(s) (session-content demo). */
function pageBlocksFileMedia(): boolean {
  if (typeof window === "undefined") return false;
  const protocol = window.location.protocol;
  return protocol === "http:" || protocol === "https:";
}

const PREVIEWABLE_IMAGE = /\.(?:png|jpe?g|gif|webp|bmp)$/i;

/** Absolute local image path for workspace.readAttachmentPreview, when applicable. */
function localPreviewableImagePath(
  src: string | undefined,
  workspacePath?: string,
): string | undefined {
  if (!src?.trim()) return undefined;
  if (contentMediaKind(src) === "video") return undefined;
  if (/^(https?:|data:|blob:)/i.test(src.trim())) return undefined;
  const target = parseContentLink(src.trim(), workspacePath);
  if (target.kind !== "file") return undefined;
  if (!PREVIEWABLE_IMAGE.test(target.path)) return undefined;
  return target.path;
}

function safeMarkdownUrl(url: string, key: string): string {
  if (/^(javascript:|vbscript:)/i.test(url)) return "";
  if (key === "src" && /^data:/i.test(url) && !/^data:image\//i.test(url)) return "";
  return url;
}

type CodeFence = { marker: "`" | "~"; length: number };

function codeFenceAtLineStart(source: string, index: number): CodeFence | undefined {
  if (index > 0 && source[index - 1] !== "\n") return undefined;

  let markerIndex = index;
  while (markerIndex < index + 3 && source[markerIndex] === " ") markerIndex += 1;
  const marker = source[markerIndex];
  if (marker !== "`" && marker !== "~") return undefined;

  let end = markerIndex;
  while (source[end] === marker) end += 1;
  return end - markerIndex >= 3 ? { marker, length: end - markerIndex } : undefined;
}

function fencedCodeEnd(source: string, openingLineStart: number, fence: CodeFence): number {
  let lineStart = source.indexOf("\n", openingLineStart);
  if (lineStart < 0) return source.length;
  lineStart += 1;

  while (lineStart < source.length) {
    const lineEnd = source.indexOf("\n", lineStart);
    const contentEnd = lineEnd < 0 ? source.length : lineEnd;
    let markerIndex = lineStart;
    while (markerIndex < lineStart + 3 && source[markerIndex] === " ") markerIndex += 1;

    let markerEnd = markerIndex;
    while (source[markerEnd] === fence.marker) markerEnd += 1;
    const remainder = source.slice(markerEnd, contentEnd);
    if (markerEnd - markerIndex >= fence.length && /^[\t ]*$/.test(remainder)) {
      return lineEnd < 0 ? source.length : lineEnd + 1;
    }
    if (lineEnd < 0) return source.length;
    lineStart = lineEnd + 1;
  }

  return source.length;
}

function inlineCodeEnd(source: string, opening: number): number | undefined {
  let openingEnd = opening;
  while (source[openingEnd] === "`") openingEnd += 1;
  const delimiterLength = openingEnd - opening;
  let candidate = openingEnd;

  while (candidate < source.length) {
    candidate = source.indexOf("`", candidate);
    if (candidate < 0) return undefined;
    let candidateEnd = candidate;
    while (source[candidateEnd] === "`") candidateEnd += 1;
    if (candidateEnd - candidate === delimiterLength) return candidateEnd;
    candidate = candidateEnd;
  }

  return undefined;
}

function isActiveBackslash(source: string, index: number): boolean {
  let preceding = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    preceding += 1;
  }
  return preceding % 2 === 0;
}

function latexDelimiterEnd(source: string, start: number, close: ")" | "]"): number | undefined {
  let candidate = start;
  while (candidate < source.length) {
    candidate = source.indexOf(`\\${close}`, candidate);
    if (candidate < 0) return undefined;
    if (isActiveBackslash(source, candidate)) return candidate;
    candidate += 2;
  }
  return undefined;
}

/** Convert common LaTeX delimiters to remark-math syntax without touching code. */
export function normalizeLatexDelimiters(markdown: string): string {
  let result = "";
  let cursor = 0;

  while (cursor < markdown.length) {
    const fence = codeFenceAtLineStart(markdown, cursor);
    if (fence) {
      const end = fencedCodeEnd(markdown, cursor, fence);
      result += markdown.slice(cursor, end);
      cursor = end;
      continue;
    }

    if (markdown[cursor] === "`") {
      const end = inlineCodeEnd(markdown, cursor);
      if (end != null) {
        result += markdown.slice(cursor, end);
        cursor = end;
        continue;
      }
    }

    const next = markdown[cursor + 1];
    if (
      markdown[cursor] === "\\" &&
      (next === "(" || next === "[") &&
      isActiveBackslash(markdown, cursor)
    ) {
      const close = next === "(" ? ")" : "]";
      const end = latexDelimiterEnd(markdown, cursor + 2, close);
      if (end != null) {
        const delimiter = next === "(" ? "$" : "$$";
        result += `${delimiter}${markdown.slice(cursor + 2, end)}${delimiter}`;
        cursor = end + 2;
        continue;
      }
    }

    result += markdown[cursor];
    cursor += 1;
  }

  return result;
}

function propFlag(value: unknown): boolean {
  return value === true || value === "" || value === "true";
}

function scrollToMarkdownAnchor(from: HTMLElement, href: string): boolean {
  if (!href.startsWith("#") || href.length < 2) return false;
  const id = decodeURIComponent(href.slice(1));
  if (!id) return false;
  const root = from.closest(".zeno-md");
  if (!root) return false;
  let target: Element | null = null;
  try {
    target = root.querySelector(`#${CSS.escape(id)}`);
  } catch {
    target = root.querySelector(`[id="${id.replace(/"/g, '\\"')}"]`);
  }
  if (!target || !(target instanceof HTMLElement)) return false;
  target.scrollIntoView({ behavior: "smooth", block: "nearest" });
  target.classList.add("content-cite-flash");
  window.setTimeout(() => target.classList.remove("content-cite-flash"), 1200);
  return true;
}

function MarkdownLink(props: {
  href?: string | undefined;
  children: ReactNode;
  workspacePath?: string | undefined;
  className?: string | undefined;
  title?: string | undefined;
  /** GFM footnote reference / backref flags (hast → React). */
  "data-footnote-ref"?: unknown;
  "data-footnote-backref"?: unknown;
  dataFootnoteRef?: unknown;
  dataFootnoteBackref?: unknown;
  id?: string | undefined;
  "aria-describedby"?: string | undefined;
  "aria-label"?: string | undefined;
}) {
  const href = props.href ?? "";
  const className = props.className ?? "";
  const isFootnoteRef =
    propFlag(props["data-footnote-ref"]) ||
    propFlag(props.dataFootnoteRef) ||
    className.includes("data-footnote-ref");
  const isFootnoteBackref =
    propFlag(props["data-footnote-backref"]) ||
    propFlag(props.dataFootnoteBackref) ||
    className.includes("data-footnote-backref");

  const target = parseContentLink(href, props.workspacePath);
  if (target.kind === "blocked" && !isFootnoteRef && !isFootnoteBackref) {
    return <span>{props.children}</span>;
  }

  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (isFootnoteRef || isFootnoteBackref || target.kind === "anchor") {
      event.preventDefault();
      scrollToMarkdownAnchor(event.currentTarget, href);
      return;
    }
    event.preventDefault();
    if (target.kind === "external") {
      void window.zeno?.workspace?.openExternal?.(target.href);
    } else if (target.kind === "file") {
      void window.zeno?.workspace?.openFile?.(target.path, {
        ...(target.line ? { line: target.line } : {}),
        ...(target.column ? { column: target.column } : {}),
      });
    }
  }

  if (isFootnoteRef) {
    return (
      <a
        href={href}
        id={props.id}
        onClick={open}
        className={cn("content-cite-ref", className)}
        data-footnote-ref
        aria-describedby={props["aria-describedby"]}
        title={props.title}
      >
        {props.children}
      </a>
    );
  }

  if (isFootnoteBackref) {
    return (
      <a
        href={href}
        id={props.id}
        onClick={open}
        className={cn("content-cite-backref", className)}
        data-footnote-backref
        aria-label={props["aria-label"]}
        title={props.title}
      >
        {props.children}
      </a>
    );
  }

  const fileTitle =
    target.kind === "file"
      ? target.line
        ? `${target.path}:${target.line}${target.column ? `:${target.column}` : ""}`
        : target.path
      : undefined;

  // Flatten simple text children so path labels can be shortened like tool rows.
  const childrenText = (() => {
    if (typeof props.children === "string" || typeof props.children === "number") {
      return String(props.children);
    }
    if (Array.isArray(props.children)) {
      return props.children
        .map((child) =>
          typeof child === "string" || typeof child === "number" ? String(child) : "",
        )
        .join("");
    }
    return "";
  })();
  const fileLabel =
    target.kind === "file"
      ? formatFileLinkLabel(childrenText, target.path, props.workspacePath)
      : undefined;

  return (
    <a
      href={href}
      id={props.id}
      onClick={open}
      className={cn(target.kind === "file" && "content-file-link content-source-cite", className)}
      title={props.title ?? fileTitle}
    >
      {target.kind === "file" ? (
        <FileCode2 className="content-source-cite-icon" aria-hidden strokeWidth={1.75} />
      ) : null}
      <span className="content-source-cite-label">
        {target.kind === "file" && fileLabel ? fileLabel : props.children}
      </span>
      {target.kind === "file" && target.line != null ? (
        <span className="content-source-line" aria-hidden>
          :{target.line}
          {target.column != null ? `:${target.column}` : ""}
        </span>
      ) : null}
      {target.kind === "external" ? (
        <ExternalLink className="ml-0.5 inline size-[0.8em] align-baseline opacity-60" />
      ) : null}
    </a>
  );
}

function MediaContent(props: {
  src?: string | undefined;
  alt?: string | undefined;
  title?: string | undefined;
  workspacePath?: string | undefined;
  locale: Locale;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const kind = contentMediaKind(props.src ?? "");
  const fallback = props.src ? contentSourceUrl(props.src, props.workspacePath) : "";
  const filePath = useMemo(
    () => localPreviewableImagePath(props.src, props.workspacePath),
    [props.src, props.workspacePath],
  );
  // http(s) pages cannot load file:// — resolve via IPC/stub data URL instead (demo + safety).
  const needsPreviewBridge = pageBlocksFileMedia() && Boolean(filePath);
  const [source, setSource] = useState(() => (needsPreviewBridge ? "" : fallback));

  useEffect(() => {
    if (!needsPreviewBridge || !filePath) {
      setSource(fallback);
      return;
    }
    let cancelled = false;
    setSource("");
    void window.zeno?.workspace
      ?.readAttachmentPreview?.(filePath)
      .then((url) => {
        if (cancelled) return;
        setSource(url || fallback);
      })
      .catch(() => {
        if (!cancelled) setSource(fallback);
      });
    return () => {
      cancelled = true;
    };
  }, [needsPreviewBridge, filePath, fallback]);

  // file:// may still fail (missing path / sandbox): last-resort data URL from preview API.
  async function handleImageError() {
    if (!filePath || source.startsWith("data:")) return;
    try {
      const url = await window.zeno?.workspace?.readAttachmentPreview?.(filePath);
      if (url) setSource(url);
    } catch {
      // leave broken state
    }
  }

  if (!fallback && !source) return null;
  if (kind === "video") {
    return (
      <video
        className="content-video"
        src={fallback}
        controls
        preload="metadata"
        title={props.title}
      >
        {props.alt}
      </video>
    );
  }

  if (!source) {
    return (
      <div
        className="content-image-button content-image-loading"
        aria-busy="true"
        title={props.title || props.alt || t(props.locale, "timeline.imagePreview")}
      />
    );
  }

  return (
    <>
      <button
        type="button"
        className="content-image-button"
        onClick={() => setPreviewOpen(true)}
        title={props.title || props.alt || t(props.locale, "timeline.imagePreview")}
      >
        <img
          src={source}
          alt={props.alt ?? ""}
          loading="lazy"
          onError={() => void handleImageError()}
        />
        <span className="content-image-expand" aria-hidden>
          <Maximize2 className="size-3.5" />
        </span>
      </button>
      <ImagePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        source={source}
        alt={props.alt}
        locale={props.locale}
        onError={() => void handleImageError()}
      />
    </>
  );
}

function FootnotesSection(props: {
  children: ReactNode;
  locale: Locale;
  className?: string | undefined;
  id?: string | undefined;
}) {
  return (
    <section
      className={cn("content-footnotes footnotes", props.className)}
      data-footnotes
      data-testid="markdown-footnotes"
      id={props.id}
    >
      <Marker variant="default" className="content-footnotes-marker min-h-0 gap-1.5 text-[12px]">
        <MarkerIcon className="size-3.5">
          <BookMarked className="size-3.5 opacity-80" strokeWidth={1.75} />
        </MarkerIcon>
        <MarkerContent>{t(props.locale, "timeline.sources")}</MarkerContent>
      </Marker>
      {props.children}
    </section>
  );
}

/** Drop react-markdown / hast runtime props that must not hit the DOM. */
function domProps<T extends Record<string, unknown>>(props: T): Omit<T, "node"> {
  const { node: _node, ...rest } = props;
  return rest;
}

function tableClipboardText(table: HTMLTableElement): string {
  return Array.from(table.rows)
    .map((row) =>
      Array.from(row.cells)
        .map((cell) => cell.innerText.replace(/\s+/g, " ").trim())
        .join("\t"),
    )
    .join("\n");
}

function MarkdownTable(props: {
  children: ReactNode;
  locale: Locale;
  tableProps: Record<string, unknown>;
}) {
  const compactTable = useRef<HTMLTableElement>(null);
  const expandedTable = useRef<HTMLTableElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const tableProps = domProps(props.tableProps);
  const copyLabel = t(props.locale, copied ? "timeline.tableCopied" : "timeline.tableCopy");

  async function copyTable(table: HTMLTableElement | null) {
    if (!table) return;
    try {
      await navigator.clipboard.writeText(tableClipboardText(table));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  }

  const actions = (getTable: () => HTMLTableElement | null, allowExpand: boolean) => (
    <div className="content-table-actions" role="group">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => void copyTable(getTable())}
        aria-label={copyLabel}
        title={copyLabel}
        data-testid="markdown-table-copy"
      >
        {copied ? <Check /> : <Copy />}
      </Button>
      {allowExpand ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => setExpanded(true)}
          aria-label={t(props.locale, "timeline.tableExpand")}
          title={t(props.locale, "timeline.tableExpand")}
          data-testid="markdown-table-expand"
        >
          <Maximize2 />
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="content-table-wrap" data-testid="markdown-table">
      <div className="content-table-shell">
        <div className="content-table-scroll">
          <table {...tableProps} ref={compactTable}>
            {props.children}
          </table>
        </div>
      </div>
      {/* Outside the table border, right of the header — vertical stack, hover-only. */}
      <div className="content-table-aside" aria-hidden={false}>
        {actions(() => compactTable.current, true)}
      </div>
      <ContentPreviewDialog
        open={expanded}
        onOpenChange={setExpanded}
        title={t(props.locale, "timeline.tableExpand")}
        closeLabel={t(props.locale, "timeline.tableClose")}
        className="zeno-md"
      >
        <div className="content-table-expanded" data-testid="markdown-table-expanded">
          {/* No copy in expanded view — close only. */}
          <div className="content-table-scroll content-table-expanded-scroll">
            <table {...tableProps} ref={expandedTable}>
              {props.children}
            </table>
          </div>
        </div>
      </ContentPreviewDialog>
    </div>
  );
}

export const MarkdownContent = memo(function MarkdownContent(props: {
  children: string;
  className?: string | undefined;
  workspacePath?: string | undefined;
  locale?: Locale | undefined;
}) {
  // Defer the expensive markdown parse during streaming. The assistant text grows
  // token-by-token and re-parsing remark/rehype/katex on every delta stalls the
  // renderer, producing a "stall then dump everything at once" feel. The deferred
  // value keeps the rendered markdown one commit behind while React stays
  // responsive and always flushes the final text.
  const deferredText = useDeferredValue(props.children ?? "");
  return (
    <MarkdownContentBody
      className={props.className}
      workspacePath={props.workspacePath}
      locale={props.locale}
    >
      {deferredText}
    </MarkdownContentBody>
  );
});

const MarkdownContentBody = memo(function MarkdownContentBody(props: {
  children: string;
  className?: string | undefined;
  workspacePath?: string | undefined;
  locale?: Locale | undefined;
}) {
  const text = normalizeLatexDelimiters(props.children ?? "");
  const locale = props.locale ?? "en";
  if (!text) return null;

  return (
    <div className={cn("zeno-md", props.className)} data-testid="markdown-content">
      <ReactMarkdown
        // remark-gfm enables GFM tables, strikethrough, task lists, and autolinks.
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeSanitize, markdownSanitizeSchema], rehypeKatex]}
        urlTransform={safeMarkdownUrl}
        components={{
          a({ href, children, className, title, id, ...rest }) {
            const restProps = rest as Record<string, unknown>;
            return (
              <MarkdownLink
                href={href}
                workspacePath={props.workspacePath}
                className={className}
                title={title}
                id={id}
                data-footnote-ref={restProps["data-footnote-ref"] ?? restProps.dataFootnoteRef}
                data-footnote-backref={
                  restProps["data-footnote-backref"] ?? restProps.dataFootnoteBackref
                }
                dataFootnoteRef={restProps.dataFootnoteRef}
                dataFootnoteBackref={restProps.dataFootnoteBackref}
                aria-describedby={
                  typeof restProps["aria-describedby"] === "string"
                    ? restProps["aria-describedby"]
                    : typeof restProps.ariaDescribedBy === "string"
                      ? restProps.ariaDescribedBy
                      : undefined
                }
                aria-label={
                  typeof restProps["aria-label"] === "string"
                    ? restProps["aria-label"]
                    : typeof restProps.ariaLabel === "string"
                      ? restProps.ariaLabel
                      : undefined
                }
              >
                {children}
              </MarkdownLink>
            );
          },
          code({ className, children }) {
            const match = /(?:^|\s)language-([^\s]+)/.exec(className ?? "");
            const code = (Array.isArray(children) ? children : [children])
              .map((child) =>
                typeof child === "string" || typeof child === "number" ? `${child}` : "",
              )
              .join("")
              .replace(/\n$/, "");
            if (match || code.includes("\n")) {
              return <ContentCodeBlock code={code} language={match?.[1]} locale={locale} />;
            }
            return <code className={className}>{children}</code>;
          },
          img({ src, alt, title }) {
            return (
              <MediaContent
                src={src}
                alt={alt}
                title={title}
                workspacePath={props.workspacePath}
                locale={locale}
              />
            );
          },
          pre({ children }) {
            return <>{children}</>;
          },
          table({ children, ...tableProps }) {
            return (
              <MarkdownTable locale={locale} tableProps={tableProps as Record<string, unknown>}>
                {children}
              </MarkdownTable>
            );
          },
          thead({ children, ...elProps }) {
            return <thead {...domProps(elProps as Record<string, unknown>)}>{children}</thead>;
          },
          tbody({ children, ...elProps }) {
            return <tbody {...domProps(elProps as Record<string, unknown>)}>{children}</tbody>;
          },
          tr({ children, ...elProps }) {
            return <tr {...domProps(elProps as Record<string, unknown>)}>{children}</tr>;
          },
          th({ children, ...elProps }) {
            return <th {...domProps(elProps as Record<string, unknown>)}>{children}</th>;
          },
          td({ children, ...elProps }) {
            return <td {...domProps(elProps as Record<string, unknown>)}>{children}</td>;
          },
          section({ className, children, id, ...rest }) {
            const restProps = rest as Record<string, unknown>;
            const isFootnotes =
              (typeof className === "string" && className.includes("footnotes")) ||
              propFlag(restProps["data-footnotes"]) ||
              propFlag(restProps.dataFootnotes);
            if (isFootnotes) {
              return (
                <FootnotesSection locale={locale} className={className} id={id}>
                  {children}
                </FootnotesSection>
              );
            }
            return (
              <section className={className} id={id}>
                {children}
              </section>
            );
          },
          sup({ className, children }) {
            return <sup className={cn("content-cite-sup", className)}>{children}</sup>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
