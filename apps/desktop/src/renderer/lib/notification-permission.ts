import { isMacDesktopChrome } from "./desktop-chrome.ts";

type NotificationPermissionApi = {
  readonly permission: NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
};

function browserNotificationApi(): NotificationPermissionApi | undefined {
  if (typeof Notification === "undefined") return undefined;
  if (typeof Notification.requestPermission !== "function") return undefined;
  return Notification;
}

/**
 * macOS requires an explicit renderer permission request before main-process
 * notifications can be posted. Other platforms keep using Electron's native API.
 */
export async function requestMacNotificationPermission(
  isMac = isMacDesktopChrome(),
  api: NotificationPermissionApi | undefined = browserNotificationApi(),
): Promise<boolean> {
  if (!isMac) return true;
  if (!api) return false;
  if (api.permission === "granted") return true;
  if (api.permission === "denied") return false;

  try {
    return (await api.requestPermission()) === "granted";
  } catch {
    return false;
  }
}
