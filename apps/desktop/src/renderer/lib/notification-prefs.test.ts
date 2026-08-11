import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_NOTIFICATION_PREFS,
  loadNotificationPrefs,
  patchNotificationPrefs,
  saveNotificationPrefs,
} from "./notification-prefs.ts";

const KEY = "pix.notifications.prefs.v2";

const memory = new Map<string, string>();

function installLocalStorage(): void {
  memory.clear();
  const storage = {
    getItem(key: string) {
      return memory.has(key) ? (memory.get(key) ?? null) : null;
    },
    setItem(key: string, value: string) {
      memory.set(key, String(value));
    },
    removeItem(key: string) {
      memory.delete(key);
    },
    clear() {
      memory.clear();
    },
    key(index: number) {
      return [...memory.keys()][index] ?? null;
    },
    get length() {
      return memory.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}

beforeEach(() => {
  installLocalStorage();
});

afterEach(() => {
  memory.clear();
});

describe("notification prefs", () => {
  it("defaults to enabled notifications that fire even when focused", () => {
    expect(DEFAULT_NOTIFICATION_PREFS.enabled).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFS.onlyWhenUnfocused).toBe(false);
    expect(DEFAULT_NOTIFICATION_PREFS.sound).toBe(true);
    expect(loadNotificationPrefs()).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it("persists onlyWhenUnfocused when explicitly enabled", () => {
    const next = patchNotificationPrefs({ onlyWhenUnfocused: true, sound: false });
    expect(next.onlyWhenUnfocused).toBe(true);
    expect(next.sound).toBe(false);
    expect(loadNotificationPrefs().onlyWhenUnfocused).toBe(true);
    expect(loadNotificationPrefs().sound).toBe(false);
  });

  it("treats missing onlyWhenUnfocused as off (new default)", () => {
    saveNotificationPrefs({
      enabled: true,
      onComplete: true,
      onError: true,
      onHostCrash: true,
      onlyWhenUnfocused: false,
      sound: true,
    });
    // Simulate older partial object without the keys.
    localStorage.setItem(
      KEY,
      JSON.stringify({ enabled: true, onComplete: true, onError: true, onHostCrash: true }),
    );
    const prefs = loadNotificationPrefs();
    expect(prefs.onlyWhenUnfocused).toBe(false);
    expect(prefs.sound).toBe(true);
  });
});
