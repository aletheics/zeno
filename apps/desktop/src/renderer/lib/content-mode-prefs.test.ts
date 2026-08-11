import { describe, expect, it, beforeEach } from "vite-plus/test";
import {
  contentModeSessionKey,
  isContentMode,
  loadContentMode,
  loadContentModeForSession,
  saveContentMode,
  saveContentModeForSession,
  toggleContentMode,
} from "./content-mode-prefs.ts";

describe("content-mode-prefs", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, String(v));
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
  });

  it("validates and toggles modes", () => {
    expect(isContentMode("chat")).toBe(true);
    expect(isContentMode("terminal")).toBe(true);
    expect(isContentMode("pty")).toBe(false);
    expect(toggleContentMode("chat")).toBe("terminal");
    expect(toggleContentMode("terminal")).toBe("chat");
  });

  it("persists global mode across load/save", () => {
    expect(loadContentMode()).toBe("chat");
    saveContentMode("terminal");
    expect(loadContentMode()).toBe("terminal");
    saveContentMode("chat");
    expect(loadContentMode()).toBe("chat");
  });

  it("remembers chat/terminal per session independently", () => {
    const a = "C:\\work\\a.jsonl";
    const b = "/work/b.jsonl";
    saveContentModeForSession(a, "terminal");
    saveContentModeForSession(b, "chat");
    expect(loadContentModeForSession(a)).toBe("terminal");
    expect(loadContentModeForSession(b)).toBe("chat");
    // Slash / case normalized
    expect(loadContentModeForSession("c:/work/a.jsonl")).toBe("terminal");
    expect(contentModeSessionKey(a)).toBe(contentModeSessionKey("c:/work/a.jsonl"));
    // macOS /private collapse keeps terminal preference across TUI realpaths
    saveContentModeForSession("/var/folders/xx/s.jsonl", "terminal");
    expect(loadContentModeForSession("/private/var/folders/xx/s.jsonl")).toBe("terminal");
  });

  it("defaults unknown sessions to chat (not global last-used)", () => {
    saveContentMode("terminal");
    saveContentModeForSession("/known.jsonl", "terminal");
    expect(loadContentModeForSession("/never-seen.jsonl")).toBe("chat");
    expect(loadContentModeForSession(undefined)).toBe("chat");
  });

  it("updating one session does not wipe another", () => {
    saveContentModeForSession("/a.jsonl", "terminal");
    saveContentModeForSession("/b.jsonl", "terminal");
    saveContentModeForSession("/a.jsonl", "chat");
    expect(loadContentModeForSession("/a.jsonl")).toBe("chat");
    expect(loadContentModeForSession("/b.jsonl")).toBe("terminal");
  });
});
