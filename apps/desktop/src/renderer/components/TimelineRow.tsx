import { memo, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock,
  Copy,
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  GitBranch,
  List,
  LoaderCircle,
  Minimize2,
  Pencil,
  Presentation,
  RotateCcw,
  Search,
  SquarePen,
  GitFork,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Message, MessageContent, MessageFooter } from "@/components/ui/message";
import { ContentCodeBlock } from "./ContentCodeBlock.tsx";
import { ImagePreviewDialog } from "./ContentPreviewDialog.tsx";
import { MarkdownContent } from "./MarkdownContent.tsx";
import {
  attachmentLabel,
  attachmentPresentation,
  isPreviewableImagePath,
  type AttachmentKind,
} from "../lib/composer-suggestions.ts";
import { formatWorkspaceRelativePath } from "../lib/content-rendering.ts";
import { t, type Locale, type MessageKey } from "../lib/i18n.ts";
import {
  classifyToolName,
  extractCommandFromArgs,
  extractToolDiffDetails,
  formatEditToolAsDiff,
  groupConsecutiveTools,
  isWeakToolLabel,
  looksLikeDiffText,
  processToolView,
  type ProcessToolKind,
  type ProcessToolView,
} from "../lib/process-activity.ts";
import {
  elapsedDurationLabel,
  formatDurationMs,
  formatMessageTime,
  groupDurationMs,
  hasIndependentToolDuration,
  resolveProcessActivity,
  toolDurationMs,
  type ProcessActivity,
  type ProcessActivityPhase,
  type TimelineItem,
} from "../lib/timeline.ts";
import { cn } from "../lib/utils.ts";

/** Tick wall-clock once per second while `active` so elapsed labels stay live. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function activityLabel(
  locale: Locale,
  activity: ProcessActivity,
  duration: string | undefined,
): string {
  const tr = (key: MessageKey, vars?: Record<string, string>) => t(locale, key, vars);
  const phase = activity.phase;
  const tool = activity.toolName?.trim() || "tool";
  const detail = activity.toolSummary?.trim();

  if (phase === "executing") {
    if (detail && duration) {
      return tr("timeline.activity.executingDetailWithDuration", { tool, detail, duration });
    }
    if (detail) return tr("timeline.activity.executingDetail", { tool, detail });
    if (duration) return tr("timeline.activity.executingWithDuration", { tool, duration });
    return tr("timeline.activity.executing", { tool });
  }

  const withDur = (base: MessageKey, withDuration: MessageKey) =>
    duration ? tr(withDuration, { duration }) : tr(base);

  switch (phase) {
    case "thinking":
      return withDur("timeline.activity.thinking", "timeline.activity.thinkingWithDuration");
    case "processing":
      return withDur("timeline.activity.processing", "timeline.activity.processingWithDuration");
    case "responding":
      return withDur("timeline.activity.responding", "timeline.activity.respondingWithDuration");
    case "waiting":
      return withDur("timeline.activity.waiting", "timeline.activity.waitingWithDuration");
    case "recovering":
      return withDur("timeline.activity.recovering", "timeline.activity.recoveringWithDuration");
    case "compacting":
      return withDur("timeline.activity.compacting", "timeline.activity.compactingWithDuration");
    case "summarizing":
      return withDur("timeline.activity.summarizing", "timeline.activity.summarizingWithDuration");
    case "processed":
    default:
      return duration
        ? tr("timeline.processedWithDuration", { duration })
        : tr("timeline.processed");
  }
}

/** Icons only for trailing live status — process header (“已处理”) is text-only. */
function liveStatusIcon(phase: ProcessActivityPhase): ReactNode {
  const common = { className: "size-3.5 opacity-80", strokeWidth: 1.75 } as const;
  if (phase === "processed") return null;
  if (phase === "thinking") return <Brain {...common} />;
  if (phase === "executing") return <Terminal {...common} />;
  if (phase === "compacting") return <Minimize2 {...common} />;
  if (phase === "summarizing") return <GitBranch {...common} />;
  // Waiting for user input — Lucide Clock (not a Unicode glyph).
  if (phase === "waiting") return <Clock {...common} />;
  // Auto-retry after a model error.
  if (phase === "recovering") {
    return <RotateCcw {...common} className="size-3.5 animate-spin opacity-80" />;
  }
  return <LoaderCircle {...common} className="size-3.5 animate-spin opacity-80" />;
}

/** Monochrome kind glyph — matches composer chips / shadcn Attachment. */
function attachmentIcon(kind: AttachmentKind) {
  const props = { className: "size-3.5", strokeWidth: 1.75 } as const;
  if (kind === "folder") return <Folder {...props} />;
  if (kind === "image") return <FileImage {...props} />;
  if (kind === "code") return <FileCode2 {...props} />;
  if (kind === "archive") return <FileArchive {...props} />;
  if (kind === "spreadsheet") return <FileSpreadsheet {...props} />;
  if (kind === "presentation") return <Presentation {...props} />;
  if (kind === "document" || kind === "pdf" || kind === "text") {
    return <FileText {...props} />;
  }
  return <File {...props} />;
}

function useTimelineAttachmentPreviews(paths: string[]): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  const key = paths.join("\0");
  useEffect(() => {
    let cancelled = false;
    const images = paths.filter(isPreviewableImagePath);
    if (images.length === 0) {
      setMap({});
      return;
    }
    void Promise.all(
      images.map(async (path) => {
        try {
          const url = await window.pix?.workspace?.readAttachmentPreview?.(path);
          return url ? ([path, url] as const) : undefined;
        } catch {
          return undefined;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const e of entries) if (e) next[e[0]] = e[1];
      setMap(next);
    });
    return () => {
      cancelled = true;
    };
    // paths joined into key
  }, [key]);
  return map;
}

function AttachmentList(props: { paths: string[]; locale: Locale }) {
  const previews = useTimelineAttachmentPreviews(props.paths);
  const [previewPath, setPreviewPath] = useState<string>();
  const previewSource = previewPath ? previews[previewPath] : undefined;

  return (
    <>
      <AttachmentGroup className="max-w-full items-start" data-testid="timeline-attachments">
        {props.paths.map((path) => {
          const presentation = attachmentPresentation(path);
          const preview = previews[path];
          const isImage = presentation.kind === "image";
          return (
            <Attachment
              key={path}
              state="done"
              size={isImage ? "default" : "sm"}
              orientation={isImage ? "vertical" : "horizontal"}
              data-kind={presentation.kind}
              data-preview={preview ? "true" : "false"}
              className="cursor-pointer"
              {...(!isImage ? { title: path } : {})}
            >
              <AttachmentTrigger
                data-testid={isImage && preview ? "attachment-image-preview" : undefined}
                onClick={() => {
                  if (isImage && preview) setPreviewPath(path);
                  else void window.pix?.workspace?.openFile?.(path);
                }}
                aria-label={
                  isImage && preview
                    ? `${t(props.locale, "timeline.imagePreview")}: ${attachmentLabel(path)}`
                    : attachmentLabel(path)
                }
              />
              {isImage ? (
                <AttachmentMedia variant={preview ? "image" : "icon"}>
                  {preview ? (
                    <img src={preview} alt="" draggable={false} />
                  ) : (
                    attachmentIcon("image")
                  )}
                </AttachmentMedia>
              ) : (
                <>
                  <AttachmentMedia variant="icon">
                    {attachmentIcon(presentation.kind)}
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>{attachmentLabel(path)}</AttachmentTitle>
                    <AttachmentDescription>{presentation.typeLabel}</AttachmentDescription>
                  </AttachmentContent>
                </>
              )}
            </Attachment>
          );
        })}
      </AttachmentGroup>
      <ImagePreviewDialog
        open={Boolean(previewPath && previewSource)}
        onOpenChange={(open) => {
          if (!open) setPreviewPath(undefined);
        }}
        source={previewSource ?? ""}
        alt={previewPath ? attachmentLabel(previewPath) : undefined}
        locale={props.locale}
      />
    </>
  );
}

function structuredText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unserializable value]";
  }
}

function toolSummary(value: unknown): string {
  if (typeof value === "string") return value.split("\n", 1)[0] ?? value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const row = value as Record<string, unknown>;
  for (const key of ["command", "path", "file_path", "query", "url", "description"]) {
    if (typeof row[key] === "string" && row[key].trim()) return row[key].trim();
  }
  const text = structuredText(value).replace(/\s+/g, " ");
  return text.length > 120 ? `${text.slice(0, 119)}…` : text;
}

function ToolSection(props: { title: string; children: ReactNode }) {
  return (
    <section className="content-tool-section">
      <div className="content-tool-section-title">{props.title}</div>
      {props.children}
    </section>
  );
}

function ToolCard(props: { item: Extract<TimelineItem, { kind: "tool" }>; locale: Locale }) {
  const { item } = props;
  const summary = toolSummary(item.args);
  const [open, setOpen] = useState(item.status === "running");
  const statusLabel =
    item.status === "running"
      ? t(props.locale, "timeline.toolRunning")
      : item.status === "error"
        ? t(props.locale, "timeline.toolFailed")
        : t(props.locale, "timeline.toolCompleted");

  useEffect(() => {
    if (item.status === "running") setOpen(true);
  }, [item.status]);

  return (
    <article className="content-tool-wrap" data-kind="tool" data-status={item.status}>
      <Collapsible open={open} onOpenChange={setOpen} className="content-tool-card">
        <CollapsibleTrigger className="content-tool-card-trigger flex w-full items-center gap-2 text-left">
          <span className="content-tool-status" aria-hidden>
            {item.status === "running" ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : item.status === "error" ? (
              <X className="size-3" />
            ) : (
              <Check className="size-3" />
            )}
          </span>
          <Terminal className="size-3.5 shrink-0 opacity-60" strokeWidth={1.75} />
          <span className="shrink-0 font-medium text-foreground">{item.toolName}</span>
          {summary ? <span className="content-tool-summary">{summary}</span> : null}
          <Badge variant="secondary" className="content-tool-state ml-auto font-normal">
            {statusLabel}
          </Badge>
          <ChevronDown
            className={cn(
              "content-details-chevron size-3.5 shrink-0 transition-transform",
              open && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="content-tool-body">
          {item.args !== undefined ? (
            <ToolSection title={t(props.locale, "timeline.toolInput")}>
              <pre className="pix-scroll">
                {(() => {
                  // read/list: path only — same as process-step expand (not args JSON).
                  const kind = classifyToolName(item.toolName);
                  if (kind === "read" || kind === "list") {
                    const path = toolSummary(item.args);
                    return path || structuredText(item.args);
                  }
                  if (kind === "run") {
                    return extractCommandFromArgs(item.args) || structuredText(item.args);
                  }
                  return structuredText(item.args);
                })()}
              </pre>
            </ToolSection>
          ) : null}
          {item.output ? (
            <ToolSection title={t(props.locale, "timeline.toolOutput")}>
              <pre className="pix-scroll">{item.output}</pre>
            </ToolSection>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </article>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type MetaActionKind = "time" | "copy" | "edit" | "fork";

function MetaActions(props: {
  locale: Locale;
  /** Render order of hover actions (role-specific). */
  order: MetaActionKind[];
  time?: string | undefined;
  onCopy?: (() => void) | undefined;
  onEdit?: (() => void) | undefined;
  onFork?: (() => void) | undefined;
  copied?: boolean | undefined;
  className?: string | undefined;
}) {
  const timeLabel = formatMessageTime(props.time, props.locale === "zh" ? "zh" : "en");

  function renderAction(kind: MetaActionKind) {
    if (kind === "time") {
      return timeLabel ? (
        <span key="time" className="timeline-meta-time">
          {timeLabel}
        </span>
      ) : null;
    }
    if (kind === "copy" && props.onCopy) {
      return (
        <Button
          key="copy"
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn("timeline-meta-btn", props.copied && "timeline-meta-btn-done")}
          title={
            props.copied ? t(props.locale, "timeline.copied") : t(props.locale, "timeline.copy")
          }
          aria-label={t(props.locale, "timeline.copy")}
          onClick={(e) => {
            e.stopPropagation();
            props.onCopy?.();
          }}
        >
          {props.copied ? (
            <Check className="size-3.5" strokeWidth={2} />
          ) : (
            <Copy className="size-3.5" strokeWidth={1.6} />
          )}
        </Button>
      );
    }
    if (kind === "edit" && props.onEdit) {
      return (
        <Button
          key="edit"
          type="button"
          variant="ghost"
          size="icon-xs"
          className="timeline-meta-btn"
          title={t(props.locale, "timeline.edit")}
          aria-label={t(props.locale, "timeline.edit")}
          onClick={(e) => {
            e.stopPropagation();
            props.onEdit?.();
          }}
        >
          <SquarePen className="size-3.5" strokeWidth={1.6} />
        </Button>
      );
    }
    if (kind === "fork" && props.onFork) {
      return (
        <Button
          key="fork"
          type="button"
          variant="ghost"
          size="icon-xs"
          className="timeline-meta-btn"
          title={t(props.locale, "timeline.fork")}
          aria-label={t(props.locale, "timeline.fork")}
          data-testid="timeline-fork"
          onClick={(e) => {
            e.stopPropagation();
            props.onFork?.();
          }}
        >
          <GitFork className="size-3.5" strokeWidth={1.6} />
        </Button>
      );
    }
    return null;
  }

  return (
    <div className={cn("timeline-meta-actions", props.className)}>
      {props.order.map((kind) => renderAction(kind))}
    </div>
  );
}

export const TimelineRow = memo(function TimelineRow(props: {
  item: TimelineItem;
  locale: Locale;
  workspacePath?: string | undefined;
  /** Edit + resubmit a user message (same-session navigateTree + prompt). */
  onEditUser?: (
    item: Extract<TimelineItem, { kind: "user" }>,
    text: string,
  ) => void | Promise<void>;
  /** Fork at an assistant entry into a new session file (pi fork). */
  onForkAssistant?: (item: Extract<TimelineItem, { kind: "assistant" }>) => void | Promise<void>;
  editingLocked?: boolean;
}) {
  const { item } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.kind === "user" ? item.text : "");
  const [copied, setCopied] = useState(false);
  const editRootRef = useRef<HTMLDivElement | null>(null);
  const editActionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (item.kind === "user") setDraft(item.text);
  }, [item]);

  /**
   * After expanding into edit mode the row gets taller. If it was near the bottom
   * of the viewport, that growth would push the editor into the composer fade zone.
   * Scroll the viewport just enough upward so the whole edit block (textarea +
   * cancel/send) stays in the same safe band above the sticky dock — never pull
   * it down into the fade.
   */
  useEffect(() => {
    if (!editing) return;
    const root = editRootRef.current;
    if (!root) return;

    const ensureAboveComposer = () => {
      const viewport = root.closest(
        '[data-slot="message-scroller-viewport"]',
      ) as HTMLElement | null;
      if (!viewport) return;

      const dock = viewport.querySelector(".composer-dock") as HTMLElement | null;
      const vr = viewport.getBoundingClientRect();
      const er = root.getBoundingClientRect();
      const dockTop = dock?.getBoundingClientRect().top ?? vr.bottom;
      // Safe band: above sticky composer (+ small gap). Never require scrolling down.
      const safeBottom = Math.min(dockTop, vr.bottom) - 12;
      const safeTop = vr.top + 16;

      let delta = 0;
      if (er.bottom > safeBottom) {
        // Editor grew into the dock/fade — shift content up.
        delta = er.bottom - safeBottom;
      }
      // Only scroll up further if the top was pushed off-screen by that adjustment.
      if (er.top - delta < safeTop) {
        delta = er.top - safeTop;
      }
      // Never scroll down (positive delta moves content up via increasing scrollTop).
      if (delta > 1) {
        viewport.scrollTop += delta;
      }
    };

    // Layout after textarea mounts (taller than the bubble).
    const t0 = window.requestAnimationFrame(() => {
      ensureAboveComposer();
      window.requestAnimationFrame(ensureAboveComposer);
    });
    const t1 = window.setTimeout(ensureAboveComposer, 50);
    return () => {
      window.cancelAnimationFrame(t0);
      window.clearTimeout(t1);
    };
  }, [editing]);

  async function handleCopy(text: string) {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  }

  if (item.kind === "user") {
    if (editing) {
      return (
        <Message
          ref={editRootRef}
          align="end"
          className="relative z-3 mt-1 mb-7"
          data-kind="user"
          data-editing="true"
          data-testid="timeline-user-edit-row"
        >
          <MessageContent>
            <textarea
              className="timeline-user-edit-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(8, Math.max(2, draft.split("\n").length + 1))}
              autoFocus
              data-testid="timeline-user-edit"
            />
            <MessageFooter
              ref={editActionsRef}
              className="timeline-user-edit-actions w-full px-0"
              data-testid="timeline-user-edit-actions"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="timeline-user-edit-cancel"
                disabled={props.editingLocked}
                onClick={() => {
                  setDraft(item.text);
                  setEditing(false);
                }}
              >
                {t(props.locale, "common.cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                className="timeline-user-edit-send"
                disabled={props.editingLocked || !draft.trim()}
                onClick={() => {
                  void (async () => {
                    await props.onEditUser?.(item, draft.trim());
                    setEditing(false);
                  })();
                }}
              >
                {t(props.locale, "timeline.send")}
              </Button>
            </MessageFooter>
          </MessageContent>
        </Message>
      );
    }

    return (
      <Message align="end" className="mt-1 mb-7" data-kind="user">
        <MessageContent>
          {item.attachments?.length ? (
            <AttachmentList paths={item.attachments} locale={props.locale} />
          ) : null}
          {item.text ? (
            <Bubble align="end" variant="secondary">
              <BubbleContent>
                <p className="m-0 whitespace-pre-wrap">{item.text}</p>
              </BubbleContent>
            </Bubble>
          ) : null}
          <MessageFooter className="px-0">
            {/* User: 日期时间 · 复制 · 编辑重发 */}
            <MetaActions
              locale={props.locale}
              order={["time", "copy", "edit"]}
              {...(item.timestamp ? { time: item.timestamp } : {})}
              {...(item.text ? { onCopy: () => void handleCopy(item.text) } : {})}
              {...(props.onEditUser ? { onEdit: () => setEditing(true) } : {})}
              copied={copied}
            />
          </MessageFooter>
        </MessageContent>
      </Message>
    );
  }

  if (item.kind === "assistant") {
    return (
      <article className="timeline-assistant-row group/msg" data-kind="assistant">
        <div className="timeline-assistant-body">
          <MarkdownContent
            className="w-full leading-relaxed text-foreground"
            workspacePath={props.workspacePath}
            locale={props.locale}
          >
            {item.text}
          </MarkdownContent>
          {/* AI: 复制 · fork · 日期时间 */}
          <MetaActions
            locale={props.locale}
            order={["copy", "fork", "time"]}
            {...(item.timestamp ? { time: item.timestamp } : {})}
            {...(item.text ? { onCopy: () => void handleCopy(item.text) } : {})}
            {...(props.onForkAssistant
              ? {
                  onFork: () => {
                    void props.onForkAssistant?.(item);
                  },
                }
              : {})}
            copied={copied}
            className="timeline-meta-actions-assistant"
          />
        </div>
      </article>
    );
  }

  if (item.kind === "thinking") {
    return (
      <article className="content-thinking-wrap" data-kind="thinking">
        <Collapsible className="content-thinking">
          <CollapsibleTrigger className="content-thinking-trigger flex w-full items-center gap-2 text-left">
            <Brain className="size-3.5" strokeWidth={1.75} />
            <span>{t(props.locale, "timeline.thinking")}</span>
            <ChevronDown className="content-details-chevron ml-auto size-3.5" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <MarkdownContent
              className="content-thinking-body"
              workspacePath={props.workspacePath}
              locale={props.locale}
            >
              {item.text}
            </MarkdownContent>
          </CollapsibleContent>
        </Collapsible>
      </article>
    );
  }
  if (item.kind === "tool") return <ToolCard item={item} locale={props.locale} />;

  // Compaction lifecycle — shadcn Marker (docs: in-progress default, done = separator).
  if (item.title === "Compaction") {
    const label = compactionMarkerLabel(props.locale, item.text);
    const failed = item.tone === "error" || /abort|fail|error/i.test(item.text);
    const started = !failed && /started/i.test(item.text) && !/completed|done/i.test(item.text);
    if (started) {
      return (
        <Marker
          variant="default"
          shimmer
          className="timeline-live-status min-h-0 gap-1.5 py-1 text-[12.5px] text-muted-foreground"
          data-kind="system"
          data-testid="timeline-compaction-marker"
          data-tone="info"
          data-phase="compacting"
          role="status"
        >
          <MarkerIcon className="size-3.5">
            <Minimize2 className="size-3.5 opacity-80" strokeWidth={1.75} />
          </MarkerIcon>
          <MarkerContent className="min-w-0 truncate">{label}</MarkerContent>
        </Marker>
      );
    }
    return (
      <Marker
        variant="separator"
        className={cn(
          "timeline-compaction-marker my-3 min-h-0 text-[12px]",
          failed && "text-destructive",
        )}
        data-kind="system"
        data-testid="timeline-compaction-marker"
        data-tone={failed ? "error" : "info"}
      >
        <MarkerContent className="px-2">{label}</MarkerContent>
      </Marker>
    );
  }

  // Shell / errors / other system notes — default Marker card.
  // Extension custom message/entry use the same generic serializable fallback
  // (no TUI renderer factories); content is still sanitized Markdown.
  const extension = item.extension === true;
  const systemTitle = item.title
    ? extension
      ? t(props.locale, "extensionUi.customMessage", { type: item.title })
      : item.title
    : undefined;
  return (
    <Marker
      variant="default"
      className={cn(
        "content-system-card items-start gap-2",
        item.tone === "error" && "is-error text-destructive",
        extension && "content-system-card-extension",
      )}
      data-kind="system"
      {...(extension ? { "data-extension": "true" } : {})}
    >
      {item.tone === "error" ? (
        <MarkerIcon>
          <CircleAlert className="size-4" strokeWidth={1.75} />
        </MarkerIcon>
      ) : null}
      <MarkerContent className="min-w-0 flex-1">
        {systemTitle ? <div className="content-system-title">{systemTitle}</div> : null}
        {item.text ? (
          <MarkdownContent
            className="content-system-body"
            workspacePath={props.workspacePath}
            locale={props.locale}
          >
            {item.text}
          </MarkdownContent>
        ) : null}
      </MarkerContent>
    </Marker>
  );
});

/** Localized label for compaction system rows (host projects English text). */
function compactionMarkerLabel(locale: Locale, text: string): string {
  const body = text.trim();
  if (/abort/i.test(body)) return t(locale, "timeline.compaction.aborted");
  if (/fail|error/i.test(body) && !/started/i.test(body)) {
    return body || t(locale, "timeline.compaction.aborted");
  }
  if (/completed|done/i.test(body)) return t(locale, "timeline.compaction.completed");
  if (/started/i.test(body)) return t(locale, "timeline.compaction.started");
  return body || t(locale, "timeline.compaction.completed");
}

function processToolIcon(kind: ProcessToolKind): ReactNode {
  const props = { className: "size-3.5 shrink-0", strokeWidth: 1.75 } as const;
  switch (kind) {
    case "read":
      return <BookOpen {...props} />;
    case "run":
      return <Terminal {...props} />;
    case "search":
      return <Search {...props} />;
    case "edit":
      return <Pencil {...props} />;
    case "write":
      return <FilePenLineIcon {...props} />;
    case "list":
      return <List {...props} />;
    default:
      return <Wrench {...props} />;
  }
}

/** FilePen not always available naming — use Pencil+FileText fallback via SquarePen. */
function FilePenLineIcon(props: { className?: string; strokeWidth?: number }) {
  return <SquarePen className={props.className} strokeWidth={props.strokeWidth ?? 1.75} />;
}

type ToolRowParts = {
  /**
   * Leading action phrase — pick natural wording per kind/status
   * (运行 / 正在运行; 读取 path; 在 path 中搜索 …). Error never changes copy.
   */
  verb: string;
  /** Optional path rendered as accent link */
  path?: string;
  /** Middle glue after path, e.g. 中搜索 */
  mid?: string;
  /** Trailing detail (command / query / free text) */
  detail?: string;
  /** Visual weight for the detail span. */
  detailTone?: "command" | "query" | "plain" | "muted";
  /** Optional trailing fragment (reserved; error no longer uses “失败” here). */
  suffix?: string;
};

/**
 * Bare tool ids (bash/read) after a verb are noise — omit, or paint muted if kept.
 * Real commands/paths keep command/query/path styling.
 */
function detailFromView(
  toolName: string,
  view: ProcessToolView,
  prefer: "command" | "query" | "plain",
): Pick<ToolRowParts, "detail" | "detailTone"> {
  const text = (view.preview || view.detail || "").trim();
  if (!text) return {};
  const weak = view.weak === true || isWeakToolLabel(text, toolName);
  // "执行 bash" / "读取 read" — drop the redundant tool name entirely.
  if (weak && isWeakToolLabel(text, toolName)) {
    return {};
  }
  if (weak) {
    return { detail: text, detailTone: "muted" };
  }
  return { detail: text, detailTone: prefer };
}

function processStatusVerb(
  locale: Locale,
  kind: ProcessToolKind,
  toolName: string,
  status: "running" | "error",
): string {
  const tr = (key: MessageKey, vars?: Record<string, string>) => t(locale, key, vars);
  const running: Record<ProcessToolKind, MessageKey> = {
    read: "timeline.process.readRunning",
    run: "timeline.process.runRunning",
    search: "timeline.process.searchRunning",
    edit: "timeline.process.editRunning",
    write: "timeline.process.writeRunning",
    list: "timeline.process.listRunning",
    generic: "timeline.process.genericRunning",
  };
  const failed: Record<ProcessToolKind, MessageKey> = {
    read: "timeline.process.readFailed",
    run: "timeline.process.runFailed",
    search: "timeline.process.searchFailed",
    edit: "timeline.process.editFailed",
    write: "timeline.process.writeFailed",
    list: "timeline.process.listFailed",
    generic: "timeline.process.genericFailed",
  };
  const key = status === "running" ? running[kind] : failed[kind];
  return tr(key, { tool: toolName });
}

function toolRowParts(
  locale: Locale,
  toolName: string,
  view: ProcessToolView,
  status: "running" | "completed" | "error",
): ToolRowParts {
  const tr = (key: MessageKey, vars?: Record<string, string>) => t(locale, key, vars);
  let parts: ToolRowParts;
  if (view.kind === "read") {
    parts = view.path
      ? { verb: tr("timeline.process.read"), path: view.path }
      : { verb: tr("timeline.process.read"), ...detailFromView(toolName, view, "plain") };
  } else if (view.kind === "run") {
    const runDetail = detailFromView(toolName, view, "command");
    // 有具体命令：运行 git status · 无命令时：运行命令（避免只剩「运行」二字不知对象）
    parts = runDetail.detail
      ? { verb: tr("timeline.process.run"), ...runDetail }
      : { verb: tr("timeline.process.runOpen") };
  } else if (view.kind === "search") {
    if (view.weak || isWeakToolLabel(view.detail, toolName)) {
      parts = { verb: tr("timeline.process.search") };
    } else if (view.path) {
      parts = {
        // ZH: 在 a.ts 中搜索 “render” · EN: Searched a.ts for “render”
        verb: locale === "zh" ? "在" : tr("timeline.process.search"),
        path: view.path,
        mid: locale === "zh" ? "中搜索" : "for",
        detail: `“${view.detail}”`,
        detailTone: "query",
      };
    } else {
      parts = {
        verb: tr("timeline.process.search"),
        detail: `“${view.detail}”`,
        detailTone: "query",
      };
    }
  } else if (view.kind === "edit") {
    parts = view.path
      ? { verb: tr("timeline.process.edit"), path: view.path }
      : { verb: tr("timeline.process.edit"), ...detailFromView(toolName, view, "plain") };
  } else if (view.kind === "write") {
    parts = view.path
      ? { verb: tr("timeline.process.write"), path: view.path }
      : { verb: tr("timeline.process.write"), ...detailFromView(toolName, view, "plain") };
  } else if (view.kind === "list") {
    parts = view.path
      ? { verb: tr("timeline.process.list"), path: view.path }
      : { verb: tr("timeline.process.list"), ...detailFromView(toolName, view, "plain") };
  } else {
    parts = {
      verb: tr("timeline.process.generic", { tool: toolName }),
      ...detailFromView(toolName, view, "plain"),
    };
  }

  if (status === "running") {
    // 正在执行 pnpm check / Reading path
    const running = { ...parts, verb: processStatusVerb(locale, view.kind, toolName, "running") };
    // Search mid while running: 在 path 中搜索 (no 了)
    if (view.kind === "search" && parts.path && locale === "zh") {
      return { ...running, mid: "中搜索" };
    }
    return running;
  }
  if (status === "error") {
    // Never append “失败” / “Failed to …” in the label — error is color-only (is-error).
    // Same wording as completed; details live in the expand panels.
    return parts;
  }
  return parts;
}

/** Expanded-row title: 运行命令 / 读取文件 …（时长仅本条；失败不改文案） */
function processOpenTitle(
  locale: Locale,
  kind: ProcessToolKind,
  toolName: string,
  status: "running" | "completed" | "error" = "completed",
): string {
  const tr = (key: MessageKey, vars?: Record<string, string>) => t(locale, key, vars);
  if (status === "running") {
    return processStatusVerb(locale, kind, toolName, "running");
  }
  // completed + error share open titles (no “运行失败” / “Failed”).
  switch (kind) {
    case "read":
      return tr("timeline.process.readOpen");
    case "run":
      return tr("timeline.process.runOpen");
    case "search":
      return tr("timeline.process.searchOpen");
    case "edit":
      return tr("timeline.process.editOpen");
    case "write":
      return tr("timeline.process.writeOpen");
    case "list":
      return tr("timeline.process.listOpen");
    default:
      return tr("timeline.process.genericOpen", { tool: toolName });
  }
}

/** Short tool-type chip (bash / powershell / read …). */
function processToolTypeLabel(toolName: string): string {
  const name = toolName.trim();
  if (!name) return "tool";
  const base = name.includes("/") ? (name.split("/").pop() ?? name) : name;
  return base.length > 18 ? `${base.slice(0, 17)}…` : base;
}

function groupSummaryLabel(locale: Locale, kind: ProcessToolKind, count: number): string {
  const key: MessageKey =
    kind === "read"
      ? "timeline.process.group.read"
      : kind === "run"
        ? "timeline.process.group.run"
        : kind === "search"
          ? "timeline.process.group.search"
          : kind === "edit"
            ? "timeline.process.group.edit"
            : kind === "write"
              ? "timeline.process.group.write"
              : kind === "list"
                ? "timeline.process.group.list"
                : "timeline.process.group.generic";
  return t(locale, key, { count: String(count) });
}

function ProcessPathLink(props: {
  path: string;
  workspacePath?: string | undefined;
  className?: string | undefined;
}) {
  // Same relative shortening as markdown source citations (not bare basename).
  const label = formatWorkspaceRelativePath(props.path, props.workspacePath);
  return (
    <button
      type="button"
      className={cn("process-step-path", props.className)}
      title={props.path}
      onClick={(e) => {
        e.stopPropagation();
        void window.pix?.workspace?.openFile?.(props.path);
      }}
    >
      {label}
    </button>
  );
}

/**
 * Expand body: command/args + result.
 * Edit tools prefer a unified-style diff (rendered via ContentCodeBlock language=diff).
 * History often only has output — reconstruct a minimal input from path/command when args missing.
 */
function processToolExpandBodies(
  item: Extract<TimelineItem, { kind: "tool" }>,
  view: ProcessToolView,
): { input?: string; output?: string; diff?: string } {
  // edit / write / patch: render as ContentCodeBlock diff (not JSON dump).
  // - edit: oldText → newText (red/green)
  // - write: full new content as all-additions (+)
  const toolKind = view.kind === "generic" ? classifyToolName(item.toolName) : view.kind;
  const output = item.output?.trim() ? item.output : undefined;

  if (toolKind === "edit" || toolKind === "write") {
    // Prefer agent details.diff (pi display format with real file line numbers).
    const fromDetails = extractToolDiffDetails(item.details);
    if (fromDetails) {
      return {
        diff: fromDetails,
        ...(output && !looksLikeDiffText(output) ? { output } : {}),
      };
    }
    // Tool text output that is already a patch / numbered display diff.
    if (output && looksLikeDiffText(output)) {
      return { diff: output };
    }
    const fromArgs = formatEditToolAsDiff(item.args, item.toolName);
    if (fromArgs) {
      return {
        diff: fromArgs,
        ...(output ? { output } : {}),
      };
    }
  }

  // read / list: only the file path — never dump full args JSON in the expand panel.
  if (toolKind === "read" || toolKind === "list") {
    const path = view.path?.trim() || undefined;
    return {
      ...(path ? { input: path } : {}),
      ...(output ? { output } : {}),
    };
  }

  let input: string | undefined;
  if (item.args !== undefined) {
    // Prefer a single-line command string for shell tools when we can extract it.
    if (view.kind === "run") {
      const cmd = extractCommandFromArgs(item.args);
      input = cmd || structuredText(item.args);
    } else if (view.path) {
      input = view.path;
    } else {
      input = structuredText(item.args);
    }
  } else if (!view.weak) {
    if (view.kind === "run" && view.detail.trim()) input = view.detail;
    else if (view.path) input = view.path;
    else if (view.kind === "search" && view.detail.trim()) input = view.detail;
    else if (view.detail.trim()) input = view.detail;
  }
  // Tool result that is already a patch (e.g. apply_patch output / git-style).
  if (output && looksLikeDiffText(output) && (view.kind === "edit" || view.kind === "write")) {
    return {
      ...(input ? { input } : {}),
      diff: output,
    };
  }
  return {
    ...(input ? { input } : {}),
    ...(output ? { output } : {}),
  };
}

/** Bordered pre panel; optional hover copy (top-right) for result blocks. */
function ProcessStepPanel(props: {
  text: string;
  locale: Locale;
  copyable?: boolean | undefined;
  className?: string | undefined;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyText(props.text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  }

  return (
    <div className={cn("process-step-panel", props.copyable && "is-copyable", props.className)}>
      {props.copyable ? (
        <button
          type="button"
          className="process-step-panel-copy"
          onClick={(e) => void handleCopy(e)}
          aria-label={t(
            props.locale,
            copied ? "timeline.process.copiedOutput" : "timeline.process.copyOutput",
          )}
          title={t(
            props.locale,
            copied ? "timeline.process.copiedOutput" : "timeline.process.copyOutput",
          )}
        >
          {copied ? (
            <Check className="size-3" strokeWidth={2} />
          ) : (
            <Copy className="size-3" strokeWidth={2} />
          )}
          <span>
            {t(
              props.locale,
              copied ? "timeline.process.copiedOutput" : "timeline.process.copyOutput",
            )}
          </span>
        </button>
      ) : null}
      <pre className="process-step-panel-pre">{props.text}</pre>
    </div>
  );
}

function ProcessToolRow(props: {
  item: Extract<TimelineItem, { kind: "tool" }>;
  locale: Locale;
  workspacePath?: string | undefined;
  nested?: boolean | undefined;
  /** Sibling tools in the same group — used to detect shared parallel start times. */
  groupSiblings?: Array<Extract<TimelineItem, { kind: "tool" }>> | undefined;
}) {
  const view = processToolView(
    props.item.toolName,
    props.item.args,
    props.item.output ? { output: props.item.output } : undefined,
  );
  const parts = toolRowParts(props.locale, props.item.toolName, view, props.item.status);
  const expand = processToolExpandBodies(props.item, view);
  const [open, setOpen] = useState(false);
  const hasBody = Boolean(expand.input || expand.output || expand.diff);

  const running = props.item.status === "running";
  // Duration only from real tool timestamps (start + end, or start→now while running).
  // Never invent end time for completed tools that lack endedAt.
  const now = useNow(running && Boolean(props.item.timestamp));
  const siblings = props.groupSiblings ?? [props.item];
  // Parallel toolCalls share one assistant start — don't show the same batch span on every child.
  const independent = hasIndependentToolDuration(props.item, siblings);
  const durationMs = independent || !props.nested ? toolDurationMs(props.item, now) : undefined;
  const duration =
    durationMs !== undefined ? formatDurationMs(durationMs, props.locale) : undefined;

  const openTitleBase = processOpenTitle(
    props.locale,
    view.kind,
    props.item.toolName,
    props.item.status,
  );
  // Per-tool duration only when this row is expanded and time is independently measured.
  const openTitle =
    open && duration != null && duration !== ""
      ? t(props.locale, "timeline.process.titleWithDuration", {
          title: openTitleBase,
          duration,
        })
      : openTitleBase;

  const typeLabel = hasBody ? processToolTypeLabel(props.item.toolName) : undefined;

  // Nested under a group: no in-flow icon so the verb shares the left edge with the group label.
  // Running spinner sits in the left gutter via CSS, not the text column.
  const row = (
    <Marker
      variant="default"
      className={cn(
        "process-step-row min-h-0 gap-2 text-[13px]",
        props.nested && "process-step-row-nested",
        props.item.status === "error" && "is-error",
        running && "is-running",
        open && "is-open",
      )}
      data-kind="tool"
      data-tool-kind={view.kind}
      data-status={props.item.status}
      data-nested={props.nested ? "true" : undefined}
      data-open={open ? "true" : undefined}
    >
      {props.nested ? (
        running ? (
          <MarkerIcon className="process-step-icon process-step-icon-nested size-3.5 text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} />
          </MarkerIcon>
        ) : null
      ) : (
        <MarkerIcon className="process-step-icon size-3.5 text-muted-foreground">
          {running ? (
            <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} />
          ) : (
            processToolIcon(view.kind)
          )}
        </MarkerIcon>
      )}
      <MarkerContent className="process-step-content min-w-0 flex-1">
        {open ? (
          <span className={cn("process-step-verb", running && "shimmer")}>{openTitle}</span>
        ) : running ? (
          // One shimmer node owns all glyphs (shadcn). Nested .shimmer on path/detail
          // made text fully transparent when background-clip did not paint on <button>.
          <span className="process-step-verb shimmer">
            {parts.verb}
            {parts.path ? ` ${formatWorkspaceRelativePath(parts.path, props.workspacePath)}` : ""}
            {parts.mid ? ` ${parts.mid}` : ""}
            {parts.detail ? ` ${parts.detail}` : ""}
            {parts.suffix ? ` ${parts.suffix}` : ""}
          </span>
        ) : (
          <>
            <span className="process-step-verb">{parts.verb}</span>
            {parts.path ? (
              <>
                {" "}
                <ProcessPathLink path={parts.path} workspacePath={props.workspacePath} />
              </>
            ) : null}
            {parts.mid ? (
              <>
                {" "}
                <span className="process-step-verb">{parts.mid}</span>
              </>
            ) : null}
            {parts.detail ? (
              <>
                {" "}
                <span
                  className={cn(
                    "process-step-detail",
                    parts.detailTone === "command" && "process-step-detail-command",
                    parts.detailTone === "query" && "process-step-detail-query",
                    parts.detailTone === "muted" && "process-step-detail-muted",
                  )}
                >
                  {parts.detail}
                </span>
              </>
            ) : null}
            {parts.suffix ? (
              <>
                {" "}
                <span className="process-step-verb process-step-suffix">{parts.suffix}</span>
              </>
            ) : null}
          </>
        )}
      </MarkerContent>
      {typeLabel ? (
        <span className="process-step-type" title={props.item.toolName}>
          {typeLabel}
        </span>
      ) : null}
      {hasBody ? (
        <ChevronRight
          className={cn(
            "process-step-expand size-3.5 shrink-0 opacity-50 transition-transform",
            open && "rotate-90",
          )}
          strokeWidth={2}
        />
      ) : null}
    </Marker>
  );

  if (!hasBody) return row;

  const inputText =
    expand.input &&
    (view.kind === "run" && !expand.input.startsWith("$") && !expand.input.startsWith("{")
      ? `$ ${expand.input}`
      : expand.input);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn("process-step-collapsible", props.nested && "process-step-collapsible-nested")}
      data-nested={props.nested ? "true" : undefined}
    >
      <CollapsibleTrigger className="process-step-trigger w-full text-left">
        {row}
      </CollapsibleTrigger>
      {/*
        Nested under a multi-step group: body shares the child row’s text edge
        (no second icon+gap pad). Top-level tools keep icon-column indent.
      */}
      <CollapsibleContent
        className={cn("process-step-body", props.nested && "process-step-body-nested")}
      >
        {expand.diff ? (
          <div className="process-step-diff" data-testid="process-step-diff">
            <ContentCodeBlock code={expand.diff} language="diff" locale={props.locale} />
          </div>
        ) : null}
        {!expand.diff && inputText ? (
          <ProcessStepPanel
            text={inputText}
            locale={props.locale}
            className="process-step-panel-input"
          />
        ) : null}
        {expand.output ? (
          <ProcessStepPanel
            text={expand.output}
            locale={props.locale}
            copyable
            className="process-step-panel-output"
          />
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProcessToolGroup(props: {
  kind: ProcessToolKind;
  items: Array<Extract<TimelineItem, { kind: "tool" }>>;
  locale: Locale;
  workspacePath?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const anyRunning = props.items.some((i) => i.status === "running");
  const anyError = props.items.some((i) => i.status === "error");
  // Expanded only: group duration from real timestamps (parallel clusters counted once).
  const now = useNow(open && anyRunning);
  const totalMs = open ? groupDurationMs(props.items, now) : undefined;
  const durationLabel = totalMs !== undefined ? formatDurationMs(totalMs, props.locale) : undefined;
  const baseLabel = groupSummaryLabel(props.locale, props.kind, props.items.length);
  const label =
    open && durationLabel != null && durationLabel !== ""
      ? t(props.locale, "timeline.process.titleWithDuration", {
          title: baseLabel,
          duration: durationLabel,
        })
      : baseLabel;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="process-step-group">
      <CollapsibleTrigger className="process-step-trigger w-full text-left">
        <Marker
          variant="default"
          shimmer={anyRunning}
          className={cn(
            "process-step-row process-step-group-row min-h-0 gap-2 text-[12.5px]",
            anyError && "is-error",
            anyRunning && "is-running",
            open && "is-open",
          )}
          data-kind="tool-group"
          data-tool-kind={props.kind}
        >
          <MarkerIcon className="process-step-icon size-3.5 text-muted-foreground">
            {anyRunning ? (
              <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} />
            ) : (
              processToolIcon(props.kind)
            )}
          </MarkerIcon>
          {/* Text directly in MarkerContent so Marker shimmer utility applies once. */}
          <MarkerContent className="process-step-verb min-w-0 flex-1 truncate">
            {label}
          </MarkerContent>
          <ChevronRight
            className={cn(
              "process-step-expand size-3.5 shrink-0 opacity-50 transition-transform",
              open && "rotate-90",
            )}
            strokeWidth={2}
          />
        </Marker>
      </CollapsibleTrigger>
      <CollapsibleContent className="process-step-group-body">
        {props.items.map((item) => (
          <ProcessToolRow
            key={item.id}
            item={item}
            locale={props.locale}
            workspacePath={props.workspacePath}
            nested
            groupSiblings={props.items}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProcessThinking(props: {
  item: Extract<TimelineItem, { kind: "thinking" }>;
  locale: Locale;
  workspacePath?: string | undefined;
}) {
  return (
    <div className="process-step-thinking" data-kind="thinking">
      <MarkdownContent
        className="process-step-thinking-body"
        workspacePath={props.workspacePath}
        locale={props.locale}
      >
        {props.item.text}
      </MarkdownContent>
    </div>
  );
}

/** Render process items as Codex-style narrative + activity rows. */
function ProcessSteps(props: {
  items: Array<Extract<TimelineItem, { kind: "thinking" | "tool" }>>;
  locale: Locale;
  workspacePath?: string | undefined;
}) {
  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < props.items.length) {
    const item = props.items[i]!;
    if (item.kind === "thinking") {
      nodes.push(
        <ProcessThinking
          key={item.id}
          item={item}
          locale={props.locale}
          workspacePath={props.workspacePath}
        />,
      );
      i += 1;
      continue;
    }
    // Collect consecutive tools for grouping.
    const tools: Array<Extract<TimelineItem, { kind: "tool" }>> = [];
    while (i < props.items.length && props.items[i]!.kind === "tool") {
      tools.push(props.items[i]! as Extract<TimelineItem, { kind: "tool" }>);
      i += 1;
    }
    for (const group of groupConsecutiveTools(tools)) {
      if (group.type === "single") {
        nodes.push(
          <ProcessToolRow
            key={group.item.id}
            item={group.item}
            locale={props.locale}
            workspacePath={props.workspacePath}
          />,
        );
      } else {
        nodes.push(
          <ProcessToolGroup
            key={`group-${group.items[0]!.id}`}
            kind={group.kind}
            items={group.items}
            locale={props.locale}
            workspacePath={props.workspacePath}
          />,
        );
      }
    }
  }
  return <div className="process-steps">{nodes}</div>;
}

/**
 * Collapsible process block.
 * Header is text-only (“已处理 12 秒” / live phase labels) — no leading icon.
 * Duration is this reply segment only (first thinking/tool → done / now).
 * Body: Codex-style narrative + compact tool activity rows.
 *
 * Expands by default while the turn is active; auto-collapses when the turn ends
 * (success, failure, abort — any terminal status). User can still toggle via summary.
 * Header label still tracks live phase while the turn is active.
 */
export const TimelineProcessBlock = memo(function TimelineProcessBlock(props: {
  locale: Locale;
  items: Array<Extract<TimelineItem, { kind: "thinking" | "tool" }>>;
  startedAt?: string | undefined;
  endedAt?: string | undefined;
  open?: boolean | undefined;
  running?: boolean | undefined;
  waiting?: boolean | undefined;
  /** Prefer live event phase (e.g. responding) over last process item. */
  livePhase?: ProcessActivityPhase | undefined;
  /** Fallback when timestamps are missing (history). */
  durationLabel?: string | undefined;
  workspacePath?: string | undefined;
}) {
  // Keep ticking while the turn is still open (including “responding” after tools).
  const active = Boolean(props.open && (props.running || props.waiting));
  const now = useNow(active);
  const activity = resolveProcessActivity(props.items, {
    ...(props.open !== undefined ? { open: props.open } : {}),
    ...(props.running !== undefined ? { running: props.running } : {}),
    ...(props.waiting !== undefined ? { waiting: props.waiting } : {}),
    ...(props.livePhase !== undefined ? { livePhase: props.livePhase } : {}),
  });
  const liveDuration =
    elapsedDurationLabel(props.startedAt, active ? undefined : props.endedAt, now, props.locale) ??
    props.durationLabel;
  const label = activityLabel(props.locale, activity, liveDuration);

  // Default-open while the agent is working this turn; force-close when the turn ends.
  const [detailsOpen, setDetailsOpen] = useState(active);
  const prevActiveRef = useRef(active);
  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = active;
    if (active && !wasActive) {
      setDetailsOpen(true);
    } else if (!active && wasActive) {
      // Collapse on any terminal outcome (completed / failed / aborted / idle).
      setDetailsOpen(false);
    }
  }, [active]);

  return (
    <div
      className="timeline-process"
      data-testid="timeline-process"
      data-phase={activity.phase}
      data-active={active ? "true" : "false"}
      data-details-open={detailsOpen ? "true" : "false"}
    >
      <details
        className="timeline-process-details"
        open={detailsOpen}
        onToggle={(event) => {
          setDetailsOpen(event.currentTarget.open);
        }}
      >
        {/*
          Underline = Marker variant="border" only (border-b + pb-2).
          Do not pass py-0 / pb-0 — tailwind-merge would kill the variant’s pb-2 and
          make the rule sit flush against the label.
        */}
        <summary className="timeline-process-summary group/process-trigger w-full text-left">
          <Marker
            variant="border"
            className="timeline-process-marker w-full text-[12.5px] text-muted-foreground"
          >
            <MarkerContent className="timeline-process-label min-w-0 flex-1 truncate">
              {label}
            </MarkerContent>
            <ChevronRight
              className="timeline-process-chevron size-3.5 shrink-0 opacity-60"
              strokeWidth={2}
            />
          </Marker>
        </summary>
        <div className="timeline-process-body">
          <ProcessSteps
            items={props.items}
            locale={props.locale}
            workspacePath={props.workspacePath}
          />
        </div>
      </details>
    </div>
  );
});

/**
 * Trailing live status Marker when no open process group covers the phase.
 * Busy phases (thinking / executing / compacting / …) use default Marker + shimmer.
 */
export const TimelineLiveStatus = memo(function TimelineLiveStatus(props: {
  locale: Locale;
  activity: ProcessActivity & { startedAt?: string };
}) {
  const active = props.activity.phase !== "processed";
  const now = useNow(active);
  const duration = elapsedDurationLabel(props.activity.startedAt, undefined, now, props.locale);
  const label = activityLabel(props.locale, props.activity, duration);
  const icon = liveStatusIcon(props.activity.phase);

  return (
    <Marker
      variant="default"
      shimmer={active}
      className="timeline-live-status min-h-0 gap-1.5 py-1 text-[12.5px] text-muted-foreground"
      data-testid="timeline-live-status"
      data-phase={props.activity.phase}
      role="status"
      aria-live="polite"
    >
      {icon ? <MarkerIcon className="size-3.5">{icon}</MarkerIcon> : null}
      <MarkerContent className="min-w-0 truncate">{label}</MarkerContent>
    </Marker>
  );
});
