import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  isAccessMode,
  loadAccessMode,
  loadAccessModeForSession,
  resolveAccessMode,
  saveAccessModeForSession,
} from "./settings-prefs.ts";

/* The permission mode used to be one global value, so setting it in one session set it for
 * every session — which is what "the other session's 自动 turned into 默认" looks like from
 * the outside. These cover the isolation, and the deliberate fallback. */

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

describe("isAccessMode", () => {
  it("accepts only the three modes", () => {
    expect(isAccessMode("default")).toBe(true);
    expect(isAccessMode("autoReview")).toBe(true);
    expect(isAccessMode("full")).toBe(true);
    expect(isAccessMode("nope")).toBe(false);
    expect(isAccessMode(undefined)).toBe(false);
  });
});

describe("per-session access mode", () => {
  it("gives each session its own mode", () => {
    saveAccessModeForSession("/s/a.jsonl", "autoReview");
    saveAccessModeForSession("/s/b.jsonl", "default");

    expect(loadAccessModeForSession("/s/a.jsonl")).toBe("autoReview");
    expect(loadAccessModeForSession("/s/b.jsonl")).toBe("default");
  });

  it("does not let one session overwrite another", () => {
    // The reported bug, as a test: setting one session must leave the other alone.
    saveAccessModeForSession("/s/a.jsonl", "autoReview");
    saveAccessModeForSession("/s/b.jsonl", "default");
    saveAccessModeForSession("/s/b.jsonl", "full");

    expect(loadAccessModeForSession("/s/a.jsonl")).toBe("autoReview");
  });

  it("falls back to the last-used mode for a session that has none", () => {
    // Deliberate, and unlike content-mode: a permission mode is a standing preference, so a
    // session you have never touched should start from your last choice.
    saveAccessModeForSession("/s/a.jsonl", "autoReview");
    expect(loadAccessModeForSession("/s/never-seen.jsonl")).toBe("autoReview");
    expect(loadAccessMode()).toBe("autoReview");
  });

  it("falls back to the global when no session is bound", () => {
    saveAccessModeForSession("/s/a.jsonl", "full");
    expect(loadAccessModeForSession(undefined)).toBe("full");
    expect(loadAccessModeForSession("")).toBe("full");
  });

  it("keys the same session identically whatever the path spelling", () => {
    saveAccessModeForSession("C:\\s\\a.jsonl", "full");

    // Assert the stored key itself: reading the value back would also succeed through the
    // global fallback, so a value-only assertion cannot tell normalisation from its absence.
    const stored = JSON.parse(localStorage.getItem("zeno.accessMode.bySession") ?? "{}");
    expect(Object.keys(stored)).toEqual(["c:/s/a.jsonl"]);
    expect(loadAccessModeForSession("c:/s/a.jsonl/")).toBe("full");
  });

  it("ignores an unreadable stored value rather than trusting it", () => {
    localStorage.setItem("zeno.accessMode.bySession", JSON.stringify({ "/s/a.jsonl": "banana" }));
    // Falls through to the global rather than handing back a mode that does not exist.
    expect(loadAccessModeForSession("/s/a.jsonl")).toBe("default");
  });

  it("survives unparsable storage", () => {
    localStorage.setItem("zeno.accessMode.bySession", "{not json");
    expect(loadAccessModeForSession("/s/a.jsonl")).toBe("default");
  });

  it("still resolves a restored mode against the current visibility policy", () => {
    // A session may remember a mode that settings have since hidden; the caller clamps it.
    saveAccessModeForSession("/s/a.jsonl", "full");
    const hidden = { default: true, autoReview: false, full: false };
    expect(resolveAccessMode(loadAccessModeForSession("/s/a.jsonl"), hidden)).toBe("default");
  });
});
