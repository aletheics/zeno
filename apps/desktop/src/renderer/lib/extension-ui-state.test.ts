import { describe, expect, it } from "vite-plus/test";
import {
  applyExtensionUiFireForget,
  emptyExtensionUiPortableState,
  extensionStatusList,
  extensionStatusListForTitlebar,
  extensionWidgetsForPlacement,
  isExtensionUiFireForgetMethod,
  isMcpChromeText,
  mcpStatusFromExtensionUi,
} from "./extension-ui-state.ts";

describe("applyExtensionUiFireForget", () => {
  it("tracks status set/clear by key", () => {
    let state = emptyExtensionUiPortableState("rt-1");
    state = applyExtensionUiFireForget(state, {
      runtimeId: "rt-1",
      method: "setStatus",
      args: { key: "mcp", text: "MCP: 1/2" },
    }).state;
    expect(extensionStatusList(state)).toEqual([{ key: "mcp", text: "MCP: 1/2" }]);
    state = applyExtensionUiFireForget(state, {
      runtimeId: "rt-1",
      method: "setStatus",
      args: { key: "mcp", text: undefined },
    }).state;
    expect(extensionStatusList(state)).toEqual([]);
  });

  it("stores string widgets and clears them", () => {
    let state = emptyExtensionUiPortableState("rt-1");
    state = applyExtensionUiFireForget(state, {
      runtimeId: "rt-1",
      method: "setWidget",
      args: {
        key: "hint",
        content: ["line a", "line b"],
        options: { placement: "aboveEditor" },
      },
    }).state;
    expect(extensionWidgetsForPlacement(state, "aboveEditor")).toHaveLength(1);
    expect(extensionWidgetsForPlacement(state, "aboveEditor")[0]?.lines).toEqual([
      "line a",
      "line b",
    ]);
    state = applyExtensionUiFireForget(state, {
      runtimeId: "rt-1",
      method: "setWidget",
      args: { key: "hint", content: undefined },
    }).state;
    expect(extensionWidgetsForPlacement(state, "aboveEditor")).toHaveLength(0);
  });

  it("resets when runtimeId changes", () => {
    let state = emptyExtensionUiPortableState("rt-old");
    state = applyExtensionUiFireForget(state, {
      runtimeId: "rt-old",
      method: "setStatus",
      args: { key: "a", text: "old" },
    }).state;
    state = applyExtensionUiFireForget(state, {
      runtimeId: "rt-new",
      method: "setStatus",
      args: { key: "b", text: "new" },
    }).state;
    expect(state.runtimeId).toBe("rt-new");
    expect(extensionStatusList(state)).toEqual([{ key: "b", text: "new" }]);
  });

  it("returns editorText for setEditorText and notify payload for notify", () => {
    const state = emptyExtensionUiPortableState("rt-1");
    const editor = applyExtensionUiFireForget(state, {
      runtimeId: "rt-1",
      method: "setEditorText",
      args: { text: "draft from extension" },
    });
    expect(editor.editorText).toBe("draft from extension");

    const notify = applyExtensionUiFireForget(state, {
      runtimeId: "rt-1",
      method: "notify",
      args: { message: "Saved", type: "info" },
    });
    expect(notify.notify).toEqual({ message: "Saved", type: "info" });
    expect(notify.state.lastNotify?.message).toBe("Saved");
  });

  it("suppresses all MCP notifies (titlebar / status strip); badge uses setStatus only", () => {
    const state = emptyExtensionUiPortableState("rt-1");
    for (const message of [
      "MCP: direct tools refreshed (+1, ~0, -0)",
      "MCP: 1/2 servers",
      "MCP: connecting…",
    ]) {
      const result = applyExtensionUiFireForget(state, {
        runtimeId: "rt-1",
        method: "notify",
        args: { message, type: "info" },
      });
      expect(result.notify).toBeUndefined();
      expect(result.state.lastNotify).toBeUndefined();
      expect(isMcpChromeText(message)).toBe(true);
    }
  });

  it("dedupes unsupported methods per runtime", () => {
    let state = emptyExtensionUiPortableState("rt-1");
    state = applyExtensionUiFireForget(state, {
      runtimeId: "rt-1",
      method: "unsupported",
      args: { method: "custom" },
    }).state;
    state = applyExtensionUiFireForget(state, {
      runtimeId: "rt-1",
      method: "unsupported",
      args: { method: "custom" },
    }).state;
    expect(state.unsupported).toEqual(["custom"]);
  });

  it("classifies fire-and-forget methods", () => {
    expect(isExtensionUiFireForgetMethod("setStatus")).toBe(true);
    expect(isExtensionUiFireForgetMethod("select")).toBe(false);
  });

  it("parses MCP status for the packages nav badge and hides it from titlebar list", () => {
    let state = emptyExtensionUiPortableState("rt-1");
    state = applyExtensionUiFireForget(state, {
      runtimeId: "rt-1",
      method: "setStatus",
      args: { key: "mcp", text: "MCP: 0/2 servers" },
    }).state;
    state = applyExtensionUiFireForget(state, {
      runtimeId: "rt-1",
      method: "setStatus",
      args: { key: "other", text: "Ready" },
    }).state;
    // Text-only MCP chrome (non-mcp key) also stays out of the titlebar.
    state = applyExtensionUiFireForget(state, {
      runtimeId: "rt-1",
      method: "setStatus",
      args: { key: "misc", text: "MCP: reconnecting" },
    }).state;

    expect(mcpStatusFromExtensionUi(state)).toEqual({
      ready: 0,
      total: 2,
      badge: "0/2",
      detail: "MCP: 0/2 servers",
    });
    expect(extensionStatusList(state).map((s) => s.key)).toEqual(["mcp", "other", "misc"]);
    expect(extensionStatusListForTitlebar(state).map((s) => s.key)).toEqual(["other"]);
  });
});
