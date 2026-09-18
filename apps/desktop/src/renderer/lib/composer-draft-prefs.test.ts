import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  EMPTY_COMPOSER_DRAFT,
  isEmptyComposerDraft,
  loadComposerDraftForSession,
  saveComposerDraftForSession,
} from "./composer-draft-prefs.ts";
import { MAX_ATTACHMENTS } from "./attachments.ts";

/* The behaviour that was missing: a draft belongs to the session it was typed in. Switching
 * away and back must return it, and one session must never show another's text. */

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

describe("composer drafts", () => {
  it("has nothing for a session that was never typed into", () => {
    expect(loadComposerDraftForSession("/s/a.jsonl")).toEqual(EMPTY_COMPOSER_DRAFT);
    expect(loadComposerDraftForSession(undefined)).toEqual(EMPTY_COMPOSER_DRAFT);
    expect(loadComposerDraftForSession("")).toEqual(EMPTY_COMPOSER_DRAFT);
  });

  it("returns each session its own draft", () => {
    saveComposerDraftForSession("/s/a.jsonl", { prompt: "draft A", attachments: [] });
    saveComposerDraftForSession("/s/b.jsonl", { prompt: "draft B", attachments: ["/p/one"] });

    expect(loadComposerDraftForSession("/s/a.jsonl").prompt).toBe("draft A");
    expect(loadComposerDraftForSession("/s/b.jsonl")).toEqual({
      prompt: "draft B",
      attachments: ["/p/one"],
    });
  });

  it("keys the same session identically whatever the path spelling", () => {
    // Matches the normalisation session-scoped prefs already use, so a session reached by a
    // different slash style or through /private is still the same session.
    saveComposerDraftForSession("C:\\s\\a.jsonl", { prompt: "typed", attachments: [] });
    expect(loadComposerDraftForSession("c:/s/a.jsonl/").prompt).toBe("typed");
  });

  it("forgets a draft once it is emptied", () => {
    saveComposerDraftForSession("/s/a.jsonl", { prompt: "typed", attachments: [] });
    saveComposerDraftForSession("/s/a.jsonl", EMPTY_COMPOSER_DRAFT);

    expect(loadComposerDraftForSession("/s/a.jsonl")).toEqual(EMPTY_COMPOSER_DRAFT);
  });

  it("treats whitespace-only text with no attachments as empty", () => {
    expect(isEmptyComposerDraft({ prompt: "   ", attachments: [] })).toBe(true);
    // Attachments alone are still something the user set up.
    expect(isEmptyComposerDraft({ prompt: "", attachments: ["/p/one"] })).toBe(false);
  });

  it("does not hand back the caller's array, so a later edit cannot corrupt the store", () => {
    saveComposerDraftForSession("/s/a.jsonl", { prompt: "x", attachments: ["/p/one"] });
    loadComposerDraftForSession("/s/a.jsonl").attachments.push("/p/two");

    expect(loadComposerDraftForSession("/s/a.jsonl").attachments).toEqual(["/p/one"]);
  });

  it("drops entries that cannot be restored instead of throwing", () => {
    localStorage.setItem(
      "zeno.composerDraft.bySession",
      JSON.stringify({ "/s/a.jsonl": "not a draft", "/s/b.jsonl": { prompt: 42 } }),
    );
    expect(loadComposerDraftForSession("/s/a.jsonl")).toEqual(EMPTY_COMPOSER_DRAFT);
    expect(loadComposerDraftForSession("/s/b.jsonl")).toEqual(EMPTY_COMPOSER_DRAFT);
  });

  it("survives unparsable storage", () => {
    localStorage.setItem("zeno.composerDraft.bySession", "{not json");
    expect(loadComposerDraftForSession("/s/a.jsonl")).toEqual(EMPTY_COMPOSER_DRAFT);
  });

  it("caps attachments at what the composer itself allows", () => {
    const many = Array.from({ length: MAX_ATTACHMENTS + 5 }, (_, i) => `/p/${i}`);
    saveComposerDraftForSession("/s/a.jsonl", { prompt: "", attachments: many });
    expect(loadComposerDraftForSession("/s/a.jsonl").attachments).toHaveLength(MAX_ATTACHMENTS);
  });
});
