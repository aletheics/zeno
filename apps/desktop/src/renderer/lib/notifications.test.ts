import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from "./notification-prefs.ts";
import { resolveNotification, shouldNotify, type NotificationKind } from "./notifications.ts";

const prefs = (patch: Partial<NotificationPrefs> = {}): NotificationPrefs => ({
  ...DEFAULT_NOTIFICATION_PREFS,
  ...patch,
});

const KINDS: NotificationKind[] = ["complete", "error", "crash"];

/* The matrix used to live inline in main.tsx's `maybeNotify`, behind a store read and an
 * IPC call, so none of it could be exercised. */

describe("shouldNotify", () => {
  it("lets everything through with default preferences", () => {
    for (const kind of KINDS) {
      expect(shouldNotify(prefs(), kind), kind).toBe(true);
    }
  });

  it("treats the master switch as overriding every per-kind flag", () => {
    const off = prefs({ enabled: false, onComplete: true, onError: true, onHostCrash: true });
    for (const kind of KINDS) {
      expect(shouldNotify(off, kind), kind).toBe(false);
    }
  });

  it("gates each kind on its own flag, independently", () => {
    expect(shouldNotify(prefs({ onComplete: false }), "complete")).toBe(false);
    expect(shouldNotify(prefs({ onComplete: false }), "error")).toBe(true);

    expect(shouldNotify(prefs({ onError: false }), "error")).toBe(false);
    expect(shouldNotify(prefs({ onError: false }), "crash")).toBe(true);

    expect(shouldNotify(prefs({ onHostCrash: false }), "crash")).toBe(false);
    expect(shouldNotify(prefs({ onHostCrash: false }), "complete")).toBe(true);
  });
});

describe("resolveNotification", () => {
  it("returns nothing when the kind is suppressed", () => {
    expect(
      resolveNotification({ kind: "error", prefs: prefs({ onError: false }), locale: "zh" }),
    ).toBeNull();
    expect(
      resolveNotification({ kind: "complete", prefs: prefs({ enabled: false }), locale: "zh" }),
    ).toBeNull();
  });

  it("maps each kind to its localized title", () => {
    const titleOf = (kind: NotificationKind) =>
      resolveNotification({ kind, prefs: prefs(), locale: "zh" })?.title;

    expect(titleOf("complete")).toBe("任务完成");
    expect(titleOf("error")).toBe("任务失败");
    expect(titleOf("crash")).toBe("Agent Host 异常");
    // Every kind resolves a real string, never a raw key.
    for (const kind of KINDS) {
      expect(titleOf(kind), kind).not.toContain("notify.");
    }
  });

  it("falls back to the title when the body is absent or blank", () => {
    const base = { kind: "complete" as const, prefs: prefs(), locale: "zh" as const };
    expect(resolveNotification(base)?.body).toBe("任务完成");
    expect(resolveNotification({ ...base, body: "   " })?.body).toBe("任务完成");
    expect(resolveNotification({ ...base, body: "  done  " })?.body).toBe("done");
  });

  it("carries the sound and focus preferences through", () => {
    const quiet = resolveNotification({
      kind: "error",
      prefs: prefs({ sound: false, onlyWhenUnfocused: true }),
      locale: "en",
    });
    expect(quiet).toMatchObject({ silent: true, requireUnfocused: true });

    const loud = resolveNotification({
      kind: "error",
      prefs: prefs({ sound: true }),
      locale: "en",
    });
    expect(loud).toMatchObject({ silent: false, requireUnfocused: false });
  });

  it("localizes the title by locale", () => {
    const base = { kind: "crash" as const, prefs: prefs() };
    expect(resolveNotification({ ...base, locale: "zh" })?.title).toBe("Agent Host 异常");
    expect(resolveNotification({ ...base, locale: "en" })?.title).toBe("Agent Host issue");
  });
});
