/**
 * Desktop notification preferences (localStorage — not pi settings).
 */

export type NotificationPrefs = {
  /** Master switch for OS notifications. */
  enabled: boolean;
  /** Notify when an agent turn settles successfully. */
  onComplete: boolean;
  /** Notify when an agent turn fails. */
  onError: boolean;
  /** Notify when host crashes / restarts unexpectedly. */
  onHostCrash: boolean;
  /** Only show OS notifications when the window is unfocused. */
  onlyWhenUnfocused: boolean;
  /** Play a short system sound with the notification (best-effort). */
  sound: boolean;
};

/** Bumped when defaults change so stale localStorage does not keep broken prefs. */
const KEY = "pix.notifications.prefs.v2";

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  onComplete: true,
  onError: true,
  onHostCrash: true,
  // Default off so task complete/error notifications work while using the app.
  // Users can enable "only when unfocused" in Settings → Notifications.
  onlyWhenUnfocused: false,
  sound: true,
};

export function loadNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS };
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      enabled: parsed.enabled !== false,
      onComplete: parsed.onComplete !== false,
      onError: parsed.onError !== false,
      onHostCrash: parsed.onHostCrash !== false,
      // Prefer explicit false; missing key follows new default (off).
      onlyWhenUnfocused: parsed.onlyWhenUnfocused === true,
      // Prefer explicit false; missing key enables sound (helps macOS banner visibility).
      sound: parsed.sound !== false,
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function patchNotificationPrefs(patch: Partial<NotificationPrefs>): NotificationPrefs {
  const next = { ...loadNotificationPrefs(), ...patch };
  saveNotificationPrefs(next);
  return next;
}
