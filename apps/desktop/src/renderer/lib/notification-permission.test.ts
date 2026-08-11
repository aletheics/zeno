import { describe, expect, it, vi } from "vite-plus/test";
import { requestMacNotificationPermission } from "./notification-permission.ts";

describe("macOS notification permission", () => {
  it("requests permission when macOS has not decided yet", async () => {
    const requestPermission = vi.fn(async () => "granted" as NotificationPermission);

    await expect(
      requestMacNotificationPermission(true, {
        permission: "default",
        requestPermission,
      }),
    ).resolves.toBe(true);
    expect(requestPermission).toHaveBeenCalledOnce();
  });

  it("does not re-request a denied permission", async () => {
    const requestPermission = vi.fn(async () => "granted" as NotificationPermission);

    await expect(
      requestMacNotificationPermission(true, {
        permission: "denied",
        requestPermission,
      }),
    ).resolves.toBe(false);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("leaves Windows and Linux on Electron's native notification path", async () => {
    await expect(requestMacNotificationPermission(false, undefined)).resolves.toBe(true);
  });
});
