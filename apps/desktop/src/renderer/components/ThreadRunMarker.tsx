/**
 * Sidebar row run-state glyph (ui-spec §5.2). Not a badge — icon/dot only.
 */
import { Check, OctagonX, Square } from "lucide-react";
import type { ReactNode } from "react";
import type { MessageKey } from "../lib/i18n.ts";
import type { SessionMarker } from "../lib/session-markers.ts";
import type { ThreadRunState } from "../lib/timeline.ts";
import { cn } from "../lib/utils.ts";
import { ZenoBlob } from "./ZenoBlob.tsx";

export function ThreadRunMarker(props: {
  marker: SessionMarker | undefined;
  /** Accessible + tooltip label already resolved by parent. */
  label?: string | undefined;
  className?: string | undefined;
}) {
  const state = props.marker?.state;
  if (!state || state === "idle") return null;

  const title = props.label;
  const common = cn("size-3 shrink-0", props.className);

  const wrap = (node: ReactNode) => (
    <span className="inline-flex shrink-0" title={title} aria-label={title}>
      {node}
    </span>
  );

  switch (state) {
    case "running":
      return wrap(<ZenoBlob state="running" className={cn(props.className, "text-blue-400")} />);
    case "waiting":
      // Drowsy blob — half-closed eyes, minimal wobble.
      return wrap(
        <ZenoBlob state="waiting" className={cn(props.className, "text-amber-400/90")} />,
      );
    case "completed":
      return wrap(<Check className={cn(common, "text-emerald-500/90")} strokeWidth={2.25} />);
    case "failed":
    case "crashed":
      return wrap(<OctagonX className={cn(common, "text-red-500/90")} strokeWidth={2} />);
    case "aborted":
      return wrap(
        <Square
          className={cn(common, "fill-current text-[var(--muted-foreground)] opacity-70")}
          strokeWidth={0}
        />,
      );
    case "recovering":
      return wrap(
        <ZenoBlob state="recovering" className={cn(props.className, "text-blue-400/80")} />,
      );
    default:
      return null;
  }
}

export function markerLabel(
  state: ThreadRunState | undefined,
  tr: (key: MessageKey, vars?: Record<string, string>) => string,
  reason?: string,
): string | undefined {
  if (!state || state === "idle") return undefined;
  const key: MessageKey | undefined =
    state === "running"
      ? "thread.state.running"
      : state === "waiting"
        ? "thread.state.waiting"
        : state === "completed"
          ? "thread.state.completed"
          : state === "failed"
            ? "thread.state.failed"
            : state === "aborted"
              ? "thread.state.aborted"
              : state === "crashed"
                ? "thread.state.crashed"
                : state === "recovering"
                  ? "thread.state.recovering"
                  : undefined;
  if (!key) return undefined;
  const base = tr(key);
  return reason?.trim() ? `${base}: ${reason.trim()}` : base;
}
