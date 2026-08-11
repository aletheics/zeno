import type { HostEvent } from "@zeno/contracts";
import { useMemo, type ReactNode, type Ref } from "react";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { cn } from "@/lib/utils";
import {
  buildTimelineBlocks,
  deriveLiveActivity,
  processBlockCoversLiveActivity,
  type TimelineItem,
} from "@/lib/timeline";
import { TimelineLiveStatus, TimelineProcessBlock, TimelineRow } from "./TimelineRow.tsx";
import type { Locale } from "@/lib/i18n";

type UserTimelineItem = Extract<TimelineItem, { kind: "user" }>;
type AssistantTimelineItem = Extract<TimelineItem, { kind: "assistant" }>;

export type SessionTimelineContentProps = {
  items: TimelineItem[];
  events: HostEvent[];
  running: boolean;
  waiting: boolean;
  locale: Locale;
  sessionKey?: string;
  workspacePath?: string;
  ready?: boolean;
  editingLocked?: boolean;
  onEditUser?: (item: UserTimelineItem, text: string) => void | Promise<void>;
  onForkAssistant?: (item: AssistantTimelineItem) => void | Promise<void>;
  endRef?: Ref<HTMLDivElement>;
  emptyState?: ReactNode;
  footer?: ReactNode;
  testId?: string;
};

export type SessionTimelineScrollerProps = SessionTimelineContentProps & {
  autoScroll: boolean;
  viewportRef?: Ref<HTMLDivElement>;
  viewportClassName?: string;
  viewportSizing?: "fill" | "content";
  viewportBusy?: boolean;
  viewportReady?: boolean;
};

export const SESSION_SCROLL_BOTTOM_GAP_PX = 64;

/** Full product scroll surface shared by the desktop app and the browser demo */
export function SessionTimelineScroller(props: SessionTimelineScrollerProps) {
  const {
    autoScroll,
    viewportRef,
    viewportClassName,
    viewportSizing = "fill",
    viewportBusy,
    viewportReady,
    ...contentProps
  } = props;

  return (
    <MessageScrollerProvider
      autoScroll={autoScroll}
      defaultScrollPosition="end"
      scrollEdgeThreshold={SESSION_SCROLL_BOTTOM_GAP_PX}
    >
      <MessageScroller className="size-full min-h-0">
        <MessageScrollerViewport
          ref={viewportRef}
          className={cn(
            "timeline-scroll thread-pane-scroll min-h-0",
            viewportSizing === "content" ? "h-auto w-full" : "size-full",
            viewportClassName,
          )}
          aria-busy={viewportBusy}
          data-ready={viewportReady == null ? undefined : viewportReady ? "true" : "false"}
        >
          <SessionTimelineContent {...contentProps} />
        </MessageScrollerViewport>
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

/** Product session timeline shared by the desktop app and the browser demo */
export function SessionTimelineContent(props: SessionTimelineContentProps) {
  const {
    items,
    events,
    running,
    waiting,
    locale,
    sessionKey = "",
    ready = true,
    editingLocked = running,
    emptyState,
    footer,
    testId = "timeline",
  } = props;
  const blocks = useMemo(() => buildTimelineBlocks(items), [items]);
  const liveActivity = useMemo(
    () => deriveLiveActivity({ items, events, running, waiting }),
    [items, events, running, waiting],
  );
  const hasActivity = items.length > 0;
  const showLiveStatus =
    liveActivity != null && !processBlockCoversLiveActivity(blocks, liveActivity);

  return (
    <MessageScrollerContent
      className={cn(
        "thread-content-column thread-content-column-stack gap-0",
        hasActivity && "thread-messages-active pt-6 pb-0",
      )}
      data-testid={testId}
      data-content-mode="chat"
    >
      {hasActivity ? (
        <>
          {blocks.map((block) => {
            const messageId = block.type === "process" ? block.id : block.item.id;
            return (
              <MessageScrollerItem
                key={messageId}
                messageId={messageId}
                scrollAnchor={false}
                className="w-full"
              >
                {block.type === "process" ? (
                  <TimelineProcessBlock
                    locale={locale}
                    items={block.items}
                    open={block.open}
                    running={running}
                    waiting={waiting}
                    {...(block.open && liveActivity?.phase
                      ? { livePhase: liveActivity.phase }
                      : {})}
                    {...(block.startedAt ? { startedAt: block.startedAt } : {})}
                    {...(block.endedAt ? { endedAt: block.endedAt } : {})}
                    {...(block.durationLabel ? { durationLabel: block.durationLabel } : {})}
                    {...(props.workspacePath ? { workspacePath: props.workspacePath } : {})}
                  />
                ) : (
                  <TimelineRow
                    item={block.item}
                    locale={locale}
                    editingLocked={editingLocked}
                    {...(props.workspacePath ? { workspacePath: props.workspacePath } : {})}
                    {...(props.onEditUser ? { onEditUser: props.onEditUser } : {})}
                    {...(props.onForkAssistant ? { onForkAssistant: props.onForkAssistant } : {})}
                  />
                )}
              </MessageScrollerItem>
            );
          })}
          {showLiveStatus && liveActivity ? (
            <MessageScrollerItem
              messageId={`${sessionKey || "live"}:live-status`}
              className="w-full"
            >
              <TimelineLiveStatus locale={locale} activity={liveActivity} />
            </MessageScrollerItem>
          ) : null}
          <div ref={props.endRef} className="h-px w-full shrink-0" aria-hidden />
        </>
      ) : ready ? (
        emptyState
      ) : null}
      {footer}
    </MessageScrollerContent>
  );
}
