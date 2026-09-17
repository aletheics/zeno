/**
 * The allowlist for URLs handed to the OS.
 *
 * The same three schemes were written out at three call sites — the PR helper, the
 * `workspace:open-external` IPC, and the main window's `setWindowOpenHandler` — with the
 * last one being the gate for `target="_blank"` links in rendered content. Each site had
 * its own copy, and the only thing keeping them in sync was a comment saying so.
 *
 * This returns a verdict rather than throwing so each caller keeps the message and
 * failure behaviour it already had: the PR helper distinguishes a malformed remote from a
 * bad scheme, the IPC handler throws, and the window handler silently denies.
 */

/** Schemes we are willing to hand to the OS. Anything else — `file:`, `javascript:`,
 * `data:`, and OS deep-links — must not reach `shell.openExternal` from these paths. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export type ExternalUrlVerdict =
  | { ok: true }
  | { ok: false; reason: "unparsable" }
  | { ok: false; reason: "protocol"; protocol: string };

export function checkExternalUrl(url: string): ExternalUrlVerdict {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    return { ok: false, reason: "unparsable" };
  }
  if (!ALLOWED_PROTOCOLS.has(protocol)) return { ok: false, reason: "protocol", protocol };
  return { ok: true };
}
