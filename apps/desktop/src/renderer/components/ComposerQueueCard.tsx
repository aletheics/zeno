/**
 * Queued steer / follow-up strip above the composer input.
 *
 * Rows mirror Pi's native queue; only clear-all is mutable.
 * Card-level: 清空全部 (host clearQueue)
 *
 * Shared by product Composer and the session-content demo.
 */
import type { QueuedMessages } from "@zeno/contracts";
import { ListTodo } from "lucide-react";
import { t, type Locale } from "../lib/i18n.ts";
import { cn } from "../lib/utils.ts";

export type ComposerQueueItem = {
  message: string;
  kind: "steering" | "followUp";
  /** Index within steering[] or followUp[]. */
  index: number;
};

function queuedMessagePreview(message: string): string {
  return message.split("\n\n<attached-paths>", 1)[0]?.trim() || message.trim();
}

export function flattenQueuedMessages(queued: QueuedMessages): ComposerQueueItem[] {
  return [
    ...queued.steering.map((message, index) => ({
      message,
      kind: "steering" as const,
      index,
    })),
    ...queued.followUp.map((message, index) => ({
      message,
      kind: "followUp" as const,
      index,
    })),
  ];
}

export function ComposerQueueCard(props: {
  locale: Locale;
  queuedMessages: QueuedMessages;
  /** When true, show the interrupted/paused banner + Continue. */
  paused?: boolean;
  onClearQueue: () => void;
  className?: string;
}) {
  const tr = (key: Parameters<typeof t>[1], vars?: Record<string, string>) =>
    t(props.locale, key, vars);

  const queuedItems = flattenQueuedMessages(props.queuedMessages);
  if (queuedItems.length === 0) return null;

  const paused = Boolean(props.paused);

  return (
    <div
      className={cn("composer-queue-card", props.className)}
      data-testid="composer-queue-card"
      data-paused={paused ? "true" : "false"}
    >
      {paused ? (
        <div className="composer-queue-banner" data-testid="composer-queue-paused">
          <span className="composer-queue-banner-text">{tr("composer.queue.paused")}</span>
        </div>
      ) : null}

      <div className="composer-queue-toolbar">
        <span className="composer-queue-toolbar-label">
          {tr("composer.queue.count", { count: String(queuedItems.length) })}
        </span>
        <div className="composer-queue-toolbar-actions">
          <button
            type="button"
            className="composer-queue-action"
            data-testid="composer-queue-clear"
            title={tr("composer.queue.clear")}
            aria-label={tr("composer.queue.clear")}
            onClick={props.onClearQueue}
          >
            {tr("composer.queue.clearAll")}
          </button>
        </div>
      </div>

      <ul className="composer-queue-list" role="list">
        {queuedItems.map((item) => (
          <li
            key={`${item.kind}:${item.index}:${item.message}`}
            className="composer-queue-row"
            data-testid="composer-queue-item"
            data-kind={item.kind}
          >
            <ListTodo
              className="size-3.5 shrink-0 text-[var(--text-subtle)]"
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="composer-queue-item-text" title={item.message}>
              {queuedMessagePreview(item.message)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
