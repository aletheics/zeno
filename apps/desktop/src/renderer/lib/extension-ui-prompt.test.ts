import { describe, expect, it, beforeEach } from "vite-plus/test";
import { IPC_PROTOCOL_VERSION } from "@zeno/contracts";
import {
  getPendingExtensionUiDialog,
  isExtensionUiDialogMethod,
  parseConfirmArgs,
  parseInputArgs,
  parseSelectArgs,
  promptExtensionUiDialog,
  settleExtensionUiDialog,
  subscribeExtensionUiDialog,
  type ExtensionUiDialogRequest,
} from "./extension-ui-prompt.ts";

function selectRequest(options: string[]): ExtensionUiDialogRequest {
  return {
    protocolVersion: IPC_PROTOCOL_VERSION,
    type: "extensionUi.request",
    runtimeId: "rt-1",
    requestId: "req-1",
    method: "select",
    args: { title: "Pick one", options },
  };
}

describe("parseSelectArgs", () => {
  it("extracts title and string options", () => {
    expect(parseSelectArgs({ title: "Choose", options: ["a", "b"] })).toEqual({
      title: "Choose",
      options: ["a", "b"],
    });
  });

  it("preserves ask-user-question style option lines (index + label + description)", () => {
    // Mirrors @juicesharp/rpiv-ask-user-question rpc-fallback formatOptionLine.
    const options = [
      "1. TypeScript — Prefer typed source",
      "2. JavaScript — Keep the current stack",
      "3. Type something.",
    ];
    const parsed = parseSelectArgs({
      title: "[Stack] Which language?\n\n--- 1. TypeScript preview ---\n```ts\nconst x = 1\n```",
      options,
    });
    expect(parsed.title).toContain("Which language?");
    expect(parsed.options).toEqual(options);
    expect(parsed.options).toHaveLength(3);
  });

  it("keeps every option when the host emits the portable bridge payload", () => {
    // Portable bridge: dialog("select", { title, options: values })
    const payload = { title: "Pick a path", options: ["alpha", "beta", "gamma"] };
    expect(parseSelectArgs(payload).options).toEqual(["alpha", "beta", "gamma"]);
  });

  it("drops non-string options so they are not silently empty", () => {
    expect(
      parseSelectArgs({ title: "Q", options: ["ok", 1, null, { label: "x" }, "two"] }),
    ).toEqual({
      title: "Q",
      options: ["ok", "two"],
    });
  });

  it("defaults when args are missing or malformed", () => {
    expect(parseSelectArgs(undefined)).toEqual({ title: "Select", options: [] });
    expect(parseSelectArgs({ options: "not-array" })).toEqual({ title: "Select", options: [] });
    expect(parseSelectArgs({ title: 42, options: [] })).toEqual({ title: "Select", options: [] });
  });
});

describe("parseConfirmArgs / parseInputArgs", () => {
  it("parses confirm fields", () => {
    expect(parseConfirmArgs({ title: "Sure?", message: "Really" })).toEqual({
      title: "Sure?",
      message: "Really",
    });
  });

  it("parses input placeholder and editor prefill", () => {
    expect(parseInputArgs({ title: "Name", placeholder: "hint" }, "input")).toEqual({
      title: "Name",
      initial: "hint",
    });
    expect(parseInputArgs({ title: "Edit", prefill: "body" }, "editor")).toEqual({
      title: "Edit",
      initial: "body",
    });
  });
});

describe("promptExtensionUiDialog bridge", () => {
  beforeEach(() => {
    // Drain any leftover pending from a previous test.
    settleExtensionUiDialog({ ok: false, value: undefined });
  });

  it("exposes the pending request to subscribers and settles with the selected value", async () => {
    const seen: unknown[] = [];
    const unsub = subscribeExtensionUiDialog(() => {
      seen.push(getPendingExtensionUiDialog()?.args);
    });

    const resultPromise = promptExtensionUiDialog(
      selectRequest(["1. Alpha — first", "2. Beta — second"]),
    );
    expect(getPendingExtensionUiDialog()?.method).toBe("select");
    const parsed = parseSelectArgs(getPendingExtensionUiDialog()?.args);
    expect(parsed.options).toEqual(["1. Alpha — first", "2. Beta — second"]);

    settleExtensionUiDialog({ ok: true, value: "2. Beta — second" });
    await expect(resultPromise).resolves.toEqual({ ok: true, value: "2. Beta — second" });
    expect(getPendingExtensionUiDialog()).toBeNull();
    expect(seen.length).toBeGreaterThanOrEqual(1);
    unsub();
  });

  it("returns cancel for select without inventing a value outside options", async () => {
    const resultPromise = promptExtensionUiDialog(selectRequest(["only-one"]));
    settleExtensionUiDialog({ ok: false, value: undefined });
    await expect(resultPromise).resolves.toEqual({ ok: false, value: undefined });
  });

  it("cancels a previous pending dialog when a new one is prompted", async () => {
    const first = promptExtensionUiDialog(selectRequest(["a"]));
    const second = promptExtensionUiDialog({
      ...selectRequest(["b"]),
      requestId: "req-2",
    });
    settleExtensionUiDialog({ ok: true, value: "b" });
    await expect(first).resolves.toEqual({ ok: false, value: undefined });
    await expect(second).resolves.toEqual({ ok: true, value: "b" });
  });

  it("exposes all options on the pending select request for the host UI", async () => {
    const options = ["1. Red", "2. Green", "3. Blue"];
    const pending = promptExtensionUiDialog(selectRequest(options));
    const request = getPendingExtensionUiDialog();
    expect(request?.method).toBe("select");
    // Host renders from these args — empty/missing options is the #32 failure mode.
    expect(parseSelectArgs(request?.args).options).toEqual(options);
    settleExtensionUiDialog({ ok: true, value: options[0] });
    await pending;
  });
});

describe("isExtensionUiDialogMethod", () => {
  it("accepts dialog methods only", () => {
    expect(isExtensionUiDialogMethod("select")).toBe(true);
    expect(isExtensionUiDialogMethod("notify")).toBe(false);
  });
});
