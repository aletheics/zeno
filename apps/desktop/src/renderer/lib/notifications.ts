/**
 * Deciding whether — and how — to raise an OS notification.
 *
 * Split out of `main.tsx` so the preference matrix and the title mapping can be tested
 * without a store or an Electron bridge. The impure half (reading the locale, calling
 * `window.zeno.notifications.show`) stays at the call site; `lib/` does not import the
 * shell store.
 */
import { t, type Locale, type MessageKey } from "./i18n.ts";
import type { NotificationPrefs } from "./notification-prefs.ts";

export type NotificationKind = "complete" | "error" | "crash";

/** Exactly what `window.zeno.notifications.show` consumes. */
export type NotificationPayload = {
  title: string;
  body: string;
  silent: boolean;
  requireUnfocused: boolean;
};

const TITLE_KEYS = {
  complete: "notify.completeTitle",
  error: "notify.errorTitle",
  crash: "notify.crashTitle",
} as const satisfies Record<NotificationKind, MessageKey>;

/** Master switch first, then the flag for this kind. */
export function shouldNotify(prefs: NotificationPrefs, kind: NotificationKind): boolean {
  if (!prefs.enabled) return false;
  if (kind === "complete") return prefs.onComplete;
  if (kind === "error") return prefs.onError;
  return prefs.onHostCrash;
}

/**
 * The payload to show, or `null` when these preferences suppress the kind.
 *
 * Returning null rather than throwing keeps the "suppressed" case indistinguishable from
 * "nothing to do" at the call site — a suppressed notification is not a failure.
 */
export function resolveNotification(options: {
  kind: NotificationKind;
  prefs: NotificationPrefs;
  locale: Locale;
  body?: string | undefined;
}): NotificationPayload | null {
  const { kind, prefs, locale } = options;
  if (!shouldNotify(prefs, kind)) return null;
  const title = t(locale, TITLE_KEYS[kind]);
  return {
    title,
    // A blank body still needs text; the title is the fallback.
    body: options.body?.trim() || title,
    silent: !prefs.sound,
    requireUnfocused: prefs.onlyWhenUnfocused,
  };
}
