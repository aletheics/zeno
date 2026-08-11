import type { HostEvent, RuntimeEvent } from "@zeno/contracts";

/** Soft cap after coalescing. Continuous streams collapse to one event each. */
export const HOST_EVENT_RETENTION = 400;

type RuntimeHostEvent = Extract<HostEvent, { type: "runtime.event" }>;

function isRuntimeEvent(event: HostEvent): event is RuntimeHostEvent {
  return event.type === "runtime.event";
}

function isTextDelta(
  event: RuntimeEvent,
): event is Extract<RuntimeEvent, { type: "message.delta" | "thinking.delta" }> {
  return event.type === "message.delta" || event.type === "thinking.delta";
}

/**
 * Append a host event into the renderer ring buffer.
 *
 * Critical: consecutive `message.delta` / `thinking.delta` are merged so a long
 * stream does not push early tokens out of a fixed-size window. Without this,
 * the projected assistant text loses its prefix token-by-token (“eaten from the head”).
 */
export function appendHostEvent(current: HostEvent[], event: HostEvent): HostEvent[] {
  if (isRuntimeEvent(event) && isTextDelta(event.event)) {
    const last = current[current.length - 1];
    if (
      last &&
      isRuntimeEvent(last) &&
      last.runtimeId === event.runtimeId &&
      isTextDelta(last.event) &&
      last.event.type === event.event.type
    ) {
      const merged: RuntimeHostEvent = {
        ...event,
        // Keep earliest sequence so ordering stays stable for gap detection.
        sequence: last.sequence,
        event: {
          type: event.event.type,
          delta: last.event.delta + event.event.delta,
        },
      };
      const next = current.slice(0, -1);
      next.push(merged);
      return next.length > HOST_EVENT_RETENTION
        ? next.slice(next.length - HOST_EVENT_RETENTION)
        : next;
    }
  }

  if (current.length < HOST_EVENT_RETENTION) {
    return [...current, event];
  }
  return [...current.slice(current.length - (HOST_EVENT_RETENTION - 1)), event];
}
