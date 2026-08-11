import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { ExtensionUiMethod, ExtensionUiResponse, HostEvent } from "@zeno/contracts";
import { IPC_PROTOCOL_VERSION } from "@zeno/contracts";
import { randomUUID } from "node:crypto";

export type ExtensionUiRequestEvent = Extract<HostEvent, { type: "extensionUi.request" }>;

type DialogMethod = "select" | "confirm" | "input" | "editor";

interface PendingDialog {
  fallback: unknown;
  resolve(value: unknown): void;
  timer?: NodeJS.Timeout;
  removeAbort?: () => void;
}

/**
 * Headless stand-in for pi TUI `Theme`.
 * Extensions (e.g. pi-mcp-adapter) call `ui.theme.fg("accent", text)` for status
 * strings; in desktop/RPC mode there is no ANSI terminal — return plain text so
 * init cannot throw on undefined theme.
 */
export function createPortableTheme() {
  const pass = (text: string) => text;
  const wrap = (_color: string, text: string) => text;
  return {
    name: "pix-portable",
    fg: wrap,
    bg: wrap,
    bold: pass,
    italic: pass,
    underline: pass,
    inverse: pass,
    strikethrough: pass,
    getFgAnsi: () => "",
    getBgAnsi: () => "",
    getColorMode: () => "256color" as const,
    getThinkingBorderColor: () => pass,
    getBashModeBorderColor: () => pass,
  };
}

export interface PortableExtensionUiBridge {
  readonly uiContext: ExtensionUIContext;
  respond(response: ExtensionUiResponse): boolean;
  /** Cancel pending dialogs and clear portable UI state (reload / resource refresh). */
  reload(): void;
  dispose(): void;
}

export interface PortableExtensionUiBridgeOptions {
  runtimeId: string;
  onRequest(request: ExtensionUiRequestEvent): void;
}

export function createPortableExtensionUiBridge(
  options: PortableExtensionUiBridgeOptions,
): PortableExtensionUiBridge {
  const pending = new Map<string, PendingDialog>();
  const unsupported = new Set<string>();
  const statusKeys = new Set<string>();
  const widgetKeys = new Set<string>();
  const portableTheme = createPortableTheme();
  let editorText = "";
  let titleSet = false;
  let workingMessageSet = false;
  let workingVisibleSet = false;
  let disposed = false;

  function emit(method: ExtensionUiMethod, args: unknown, timeoutMs?: number): string {
    const requestId = randomUUID();
    const request: ExtensionUiRequestEvent = {
      protocolVersion: IPC_PROTOCOL_VERSION,
      type: "extensionUi.request",
      runtimeId: options.runtimeId,
      requestId,
      method,
      args,
    };
    if (timeoutMs !== undefined) request.timeoutMs = timeoutMs;
    options.onRequest(request);
    return requestId;
  }

  function finish(requestId: string, value: unknown): void {
    const dialog = pending.get(requestId);
    if (!dialog) return;
    pending.delete(requestId);
    if (dialog.timer) clearTimeout(dialog.timer);
    dialog.removeAbort?.();
    dialog.resolve(value);
  }

  function dialog(
    method: DialogMethod,
    args: unknown,
    fallback: unknown,
    opts?: { signal?: AbortSignal; timeout?: number },
  ): Promise<unknown> {
    if (disposed || opts?.signal?.aborted) return Promise.resolve(fallback);
    return new Promise((resolve) => {
      const requestId = emit(method, args, opts?.timeout);
      const entry: PendingDialog = { fallback, resolve };
      if (opts?.timeout !== undefined && opts.timeout >= 0) {
        entry.timer = setTimeout(() => finish(requestId, fallback), opts.timeout);
      }
      if (opts?.signal) {
        const abort = () => finish(requestId, fallback);
        opts.signal.addEventListener("abort", abort, { once: true });
        entry.removeAbort = () => opts.signal?.removeEventListener("abort", abort);
      }
      pending.set(requestId, entry);
    });
  }

  function reportUnsupported(method: string): void {
    if (unsupported.has(method)) return;
    unsupported.add(method);
    emit("unsupported", { method });
  }

  function clearPortableState(): void {
    for (const key of statusKeys) emit("setStatus", { key, text: undefined });
    statusKeys.clear();
    for (const key of widgetKeys) emit("setWidget", { key, content: undefined });
    widgetKeys.clear();
    if (titleSet) {
      emit("setTitle", { title: "" });
      titleSet = false;
    }
    if (workingMessageSet) {
      emit("setWorkingMessage", { message: undefined });
      workingMessageSet = false;
    }
    if (workingVisibleSet) {
      emit("setWorkingVisible", { visible: false });
      workingVisibleSet = false;
    }
    if (editorText !== "") {
      editorText = "";
      emit("setEditorText", { text: "" });
    }
  }

  function cancelPending(): void {
    for (const [requestId, entry] of pending) finish(requestId, entry.fallback);
    pending.clear();
  }

  const portable = {
    select: (title: string, values: string[], opts?: { signal?: AbortSignal; timeout?: number }) =>
      dialog("select", { title, options: values }, undefined, opts) as Promise<string | undefined>,
    confirm: (title: string, message: string, opts?: { signal?: AbortSignal; timeout?: number }) =>
      dialog("confirm", { title, message }, false, opts) as Promise<boolean>,
    input: (
      title: string,
      placeholder?: string,
      opts?: { signal?: AbortSignal; timeout?: number },
    ) => dialog("input", { title, placeholder }, undefined, opts) as Promise<string | undefined>,
    notify: (message: string, type: "info" | "warning" | "error" = "info") =>
      emit("notify", { message, type }),
    onTerminalInput: () => {
      reportUnsupported("onTerminalInput");
      return () => undefined;
    },
    setStatus: (key: string, text: string | undefined) => {
      if (text === undefined) statusKeys.delete(key);
      else statusKeys.add(key);
      emit("setStatus", { key, text });
    },
    setWorkingMessage: (message?: string) => {
      workingMessageSet = message !== undefined;
      emit("setWorkingMessage", { message });
    },
    setWorkingVisible: (visible: boolean) => {
      workingVisibleSet = true;
      emit("setWorkingVisible", { visible });
    },
    setWorkingIndicator: (indicator?: unknown) => emit("setWorkingIndicator", { indicator }),
    setHiddenThinkingLabel: (label?: string) => emit("setHiddenThinkingLabel", { label }),
    setWidget: (key: string, content: unknown, widgetOptions?: unknown) => {
      if (content !== undefined && !Array.isArray(content)) {
        reportUnsupported("setWidget.component");
        return;
      }
      if (content === undefined) widgetKeys.delete(key);
      else widgetKeys.add(key);
      emit("setWidget", { key, content, options: widgetOptions });
    },
    setTitle: (title: string) => {
      titleSet = title.length > 0;
      emit("setTitle", { title });
    },
    pasteToEditor: (text: string) => {
      editorText += text;
      emit("setEditorText", { text: editorText });
    },
    setEditorText: (text: string) => {
      editorText = text;
      emit("setEditorText", { text });
    },
    getEditorText: () => editorText,
    editor: (title: string, prefill?: string) =>
      dialog("editor", { title, prefill }, undefined) as Promise<string | undefined>,
    custom: async () => {
      reportUnsupported("custom");
      return undefined;
    },
    addAutocompleteProvider: () => reportUnsupported("addAutocompleteProvider"),
    setFooter: () => reportUnsupported("setFooter"),
    setHeader: () => reportUnsupported("setHeader"),
    setEditorComponent: () => reportUnsupported("setEditorComponent"),
    getEditorComponent: () => undefined,
    getAllThemes: () => [],
    getTheme: (_name?: string) => portableTheme as never,
    setTheme: () => ({ success: false, error: "Theme switching is unavailable in this mode" }),
    getToolsExpanded: () => false,
    setToolsExpanded: () => reportUnsupported("setToolsExpanded"),
  };

  const uiContext = new Proxy(portable, {
    get(target, property, receiver) {
      // Must be a real object: many extensions style status/widgets via theme.fg.
      if (property === "theme") return portableTheme;
      if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
      if (typeof property === "string") {
        return (..._args: unknown[]) => {
          reportUnsupported(property);
          return undefined;
        };
      }
      return undefined;
    },
  }) as unknown as ExtensionUIContext;

  return {
    uiContext,
    respond(response) {
      if (disposed) return false;
      if (response.runtimeId !== options.runtimeId) return false;
      const dialog = pending.get(response.requestId);
      if (!dialog) return false;
      finish(response.requestId, response.ok ? response.value : dialog.fallback);
      return true;
    },
    reload() {
      if (disposed) return;
      cancelPending();
      clearPortableState();
      unsupported.clear();
    },
    dispose() {
      disposed = true;
      cancelPending();
      clearPortableState();
      pending.clear();
    },
  };
}
