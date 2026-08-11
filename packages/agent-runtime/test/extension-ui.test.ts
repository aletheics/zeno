import { describe, expect, it } from "vite-plus/test";
import { createPortableExtensionUiBridge } from "../src/extension-ui-bridge.ts";

describe("U01-U04 portable Extension UI bridge", () => {
  it("correlates dialog responses and rejects stale runtime responses", async () => {
    const requests: Array<{ requestId: string; method: string; runtimeId: string }> = [];
    const bridge = createPortableExtensionUiBridge({
      runtimeId: "runtime-current",
      onRequest: (request) => requests.push(request),
    });

    const selection = bridge.uiContext.select("Choose", ["alpha", "beta"]);
    const request = requests.at(-1);
    expect(request).toMatchObject({ method: "select", runtimeId: "runtime-current" });
    if (!request) throw new Error("Select request was not emitted");
    // Host/renderer must receive the options array (zeno#32).
    expect(request).toMatchObject({
      args: { title: "Choose", options: ["alpha", "beta"] },
    });
    expect(
      bridge.respond({
        runtimeId: "runtime-stale",
        requestId: request.requestId,
        ok: true,
        value: "alpha",
      }),
    ).toBe(false);
    expect(
      bridge.respond({
        runtimeId: "runtime-current",
        requestId: request.requestId,
        ok: true,
        value: "beta",
      }),
    ).toBe(true);
    await expect(selection).resolves.toBe("beta");
    expect(
      bridge.respond({
        runtimeId: "runtime-current",
        requestId: request.requestId,
        ok: true,
        value: "alpha",
      }),
    ).toBe(false);
    bridge.dispose();
  });

  it("uses RPC-equivalent defaults for timeout, abort, dispose, and unsupported UI", async () => {
    const requests: Array<{ requestId: string; method: string; args: unknown }> = [];
    const bridge = createPortableExtensionUiBridge({
      runtimeId: "runtime-defaults",
      onRequest: (request) => requests.push(request),
    });

    await expect(bridge.uiContext.confirm("Confirm", "Continue?", { timeout: 5 })).resolves.toBe(
      false,
    );
    const abortController = new AbortController();
    const input = bridge.uiContext.input("Input", "value", { signal: abortController.signal });
    abortController.abort();
    await expect(input).resolves.toBeUndefined();

    const pending = bridge.uiContext.select("Pending", ["one"]);
    const selectReq = requests.find((request) => request.method === "select");
    expect(selectReq?.args).toEqual({ title: "Pending", options: ["one"] });
    bridge.dispose();
    await expect(pending).resolves.toBeUndefined();
    expect(requests.map((request) => request.method)).toEqual(["confirm", "input", "select"]);

    const unsupportedRequests: string[] = [];
    const fallback = createPortableExtensionUiBridge({
      runtimeId: "runtime-fallback",
      onRequest: (request) => {
        if (request.method === "unsupported")
          unsupportedRequests.push(JSON.stringify(request.args));
      },
    });
    await expect(fallback.uiContext.custom(() => undefined as never)).resolves.toBeUndefined();
    await expect(fallback.uiContext.custom(() => undefined as never)).resolves.toBeUndefined();
    fallback.uiContext.setWidget("component", (() => undefined) as never);
    fallback.uiContext.setWidget("component", (() => undefined) as never);
    fallback.uiContext.setFooter((() => undefined) as never);
    fallback.uiContext.setFooter((() => undefined) as never);
    fallback.uiContext.setHeader((() => undefined) as never);
    fallback.uiContext.setHeader((() => undefined) as never);
    fallback.uiContext.setEditorComponent((() => undefined) as never);
    fallback.uiContext.setEditorComponent((() => undefined) as never);
    expect(unsupportedRequests).toHaveLength(5);
    expect(unsupportedRequests[0]).toContain("custom");
    expect(unsupportedRequests[1]).toContain("setWidget.component");
    expect(unsupportedRequests[2]).toContain("setFooter");
    expect(unsupportedRequests[3]).toContain("setHeader");
    expect(unsupportedRequests[4]).toContain("setEditorComponent");
    fallback.dispose();
  });

  it("projects portable fire-and-forget state without component payloads", () => {
    const requests: Array<{ method: string; args: unknown }> = [];
    const bridge = createPortableExtensionUiBridge({
      runtimeId: "runtime-state",
      onRequest: (request) => requests.push(request),
    });

    bridge.uiContext.notify("Saved", "info");
    bridge.uiContext.setStatus("fixture", "Ready");
    bridge.uiContext.setWorkingMessage("Working");
    bridge.uiContext.setWorkingVisible(false);
    bridge.uiContext.setWidget("fixture", ["line one", "line two"], { placement: "belowEditor" });
    bridge.uiContext.setTitle("Zeno fixture");
    bridge.uiContext.setEditorText("draft");
    bridge.uiContext.pasteToEditor(" plus");

    expect(requests.map((request) => request.method)).toEqual([
      "notify",
      "setStatus",
      "setWorkingMessage",
      "setWorkingVisible",
      "setWidget",
      "setTitle",
      "setEditorText",
      "setEditorText",
    ]);
    expect(bridge.uiContext.getEditorText()).toBe("draft plus");
    expect(JSON.stringify(requests)).not.toContain("function");
    bridge.dispose();
  });

  it("exposes a portable theme so extensions can style status without TUI", () => {
    const requests: Array<{ method: string; args: unknown }> = [];
    const bridge = createPortableExtensionUiBridge({
      runtimeId: "runtime-theme",
      onRequest: (request) => requests.push(request),
    });

    // pi-mcp-adapter: ui.setStatus("mcp", ui.theme.fg("accent", `MCP: …`))
    const theme = bridge.uiContext.theme as {
      fg: (color: string, text: string) => string;
      bold: (text: string) => string;
    };
    expect(theme).toBeTruthy();
    const styled = theme.fg("accent", "MCP: 1/2 servers");
    expect(styled).toBe("MCP: 1/2 servers");
    expect(theme.bold("x")).toBe("x");
    // ExtensionUIContext.getTheme requires a name argument in pi types.
    expect(bridge.uiContext.getTheme("zeno-portable")).toBe(theme);

    bridge.uiContext.setStatus("mcp", styled);
    expect(requests.some((r) => r.method === "setStatus")).toBe(true);
    bridge.dispose();
  });
});
