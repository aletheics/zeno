import type { HostEvent } from "@zeno/contracts";
import { isExtensionUiDialogMethod, promptExtensionUiDialog } from "@/lib/extension-ui-prompt";
import type { Locale } from "@/lib/i18n";
import { loadNotificationPrefs } from "@/lib/notification-prefs";
import { resolveNotification, type NotificationKind } from "@/lib/notifications";

/* How what the host tells us reaches the user: an OS notification, the status strip, or an
 * answer to an extension's dialog request.
 *
 * The decisions are pure and tested in `lib/notifications.ts`; what is left is the locale
 * read, the elevation rules, and the IPC — which is all this holds. The shell supplies the
 * locale and the status setter rather than this reaching into the store, the same boundary
 * the other hooks here keep.
 */

export function useHostMessages(options: { locale: Locale; setStatus: (status: string) => void }) {
  const { locale, setStatus } = options;

  function notify(kind: NotificationKind, body?: string): void {
    const payload = resolveNotification({ kind, body, prefs: loadNotificationPrefs(), locale });
    if (!payload) return;
    // Focus check runs in main via requireUnfocused (document.hasFocus is unreliable in Electron).
    void window.zeno.notifications.show(payload).catch(() => undefined);
  }

  /**
   * An extension's notice: always into the status strip, and error/warning escalated to an
   * OS notification. Warnings deliberately escalate through the error channel — they are
   * the same thing to a user who is not looking at the window.
   */
  function applyExtensionNotify(
    extensionNotice: { message: string; type: "info" | "warning" | "error" } | undefined,
  ): void {
    if (!extensionNotice?.message) return;
    setStatus(extensionNotice.message);
    if (extensionNotice.type === "error") {
      notify("error", extensionNotice.message);
    } else if (extensionNotice.type === "warning") {
      notify("error", extensionNotice.message);
    }
  }

  /** Answer a dialog the extension asked for. Non-dialog methods are not ours to handle. */
  async function respondToExtensionUi(
    event: Extract<HostEvent, { type: "extensionUi.request" }>,
  ): Promise<void> {
    if (!isExtensionUiDialogMethod(event.method)) return;
    const { ok, value } = await promptExtensionUiDialog({ ...event, method: event.method });
    await window.zeno.extensionUi.respond({
      runtimeId: event.runtimeId,
      requestId: event.requestId,
      ok,
      value,
    });
  }

  return { notify, applyExtensionNotify, respondToExtensionUi };
}
