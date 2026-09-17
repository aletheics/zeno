import { buildTimelineBlocks, type TimelineItem } from "./timeline.ts";

export type ConversationMinimapMarker = {
  id: string;
  role: "user" | "assistant";
  preview: string;
};

export const CONVERSATION_MINIMAP_PREVIEW_MAX_CHARS = 280;

/** A rail is only worth showing once there is real scroll range and something to jump between. */
export function shouldRenderConversationMinimap({
  markerCount,
  overflows,
}: {
  markerCount: number;
  overflows: boolean;
}): boolean {
  return markerCount >= 2 && overflows;
}

function clipPreview(text: string): string {
  return text.trim().slice(0, CONVERSATION_MINIMAP_PREVIEW_MAX_CHARS);
}

function appendPreview(current: string, next: string): string {
  if (!next || current.length >= CONVERSATION_MINIMAP_PREVIEW_MAX_CHARS) {
    return current;
  }
  return `${current}${current ? "\n\n" : ""}${next}`.slice(
    0,
    CONVERSATION_MINIMAP_PREVIEW_MAX_CHARS,
  );
}

/**
 * Build one user marker and one assistant marker per conversational turn.
 *
 * Walks `TimelineBlock[]` rather than the flat item list, because the renderer does
 * not give every assistant message its own addressable row: `buildTimelineBlocks`
 * folds each turn's intermediate assistant text into the process block as `narrative`
 * steps, and only the turn's final assistant becomes an item block carrying a
 * `data-message-id`. A marker holding a first-assistant id would point at an id with no
 * DOM node, so `scrollToMessage` would silently no-op.
 *
 * Therefore the turn's assistant marker adopts the id of the last rendered assistant
 * row it sees, while its preview keeps merging the turn's assistant text.
 */
export function buildConversationMinimapMarkers(
  items: TimelineItem[],
): ConversationMinimapMarker[] {
  const markers: ConversationMinimapMarker[] = [];
  /** Index of the marker collecting the current turn's assistant text. */
  let assistantIndex: number | null = null;

  for (const block of buildTimelineBlocks(items)) {
    // Process blocks group thinking/tool steps and carry no addressable row of their own.
    if (block.type !== "item") continue;
    const item = block.item;

    if (item.kind === "user") {
      markers.push({ id: item.id, role: "user", preview: clipPreview(item.text) });
      assistantIndex = null;
      continue;
    }
    if (item.kind !== "assistant") continue;

    const content = item.text.trim();
    if (assistantIndex === null) {
      // Don't anchor a marker to an empty row; a later assistant in this turn may still
      // have text.
      if (!content) continue;
      markers.push({ id: item.id, role: "assistant", preview: clipPreview(content) });
      assistantIndex = markers.length - 1;
      continue;
    }

    const marker = markers[assistantIndex];
    if (!marker) continue;
    // The latest rendered assistant row is the one the turn "lands" on.
    marker.id = item.id;
    if (content) marker.preview = appendPreview(marker.preview, content);
  }

  return markers;
}
