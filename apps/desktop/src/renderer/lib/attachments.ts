/**
 * The composer's pending attachment list.
 *
 * The same dedupe-and-cap expression was written out four times in `App()`, with the two
 * sides in a *different order* depending on why paths were being added:
 *
 *   restore after a failed send:  [...restored, ...current]
 *   add from the picker:          [...current, ...picked]
 *
 * That order is load-bearing, because the cap truncates: whichever side is listed first is
 * what survives a full list. Written inline it looks like an accident; named, it is a rule.
 *
 * Note this is not the same rule as `mergeAttachmentPaths` in `lib/live-stream.ts`, which
 * merges optimistic rows with the host echo for display — it trims and drops empties but
 * has no cap. The two are deliberately separate.
 */

/** How many paths the composer will hold. */
export const MAX_ATTACHMENTS = 12;

function dedupeOrdered(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

/**
 * Add paths the user just picked. Existing ones are listed first, so a list already at the
 * cap keeps what it had rather than dropping entries for the newest pick.
 */
export function addAttachments(current: readonly string[], picked: readonly string[]): string[] {
  return dedupeOrdered([...current, ...picked]).slice(0, MAX_ATTACHMENTS);
}

/**
 * Put back the paths from a send that failed. They are listed first: these are what the
 * user actually tried to send, so they must win the cap over whatever else is listed.
 */
export function restoreAttachments(
  current: readonly string[],
  restored: readonly string[],
): string[] {
  return dedupeOrdered([...restored, ...current]).slice(0, MAX_ATTACHMENTS);
}

/** Drop one path, e.g. when the user removes a chip. */
export function removeAttachment(current: readonly string[], path: string): string[] {
  return current.filter((item) => item !== path);
}
