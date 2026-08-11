/**
 * Promise bridge for extension UI dialogs (select / confirm / input / editor).
 * Keeps the host event handler free of React state while App renders dialogs.
 */
import type { HostEvent } from "@zeno/contracts";

export type ExtensionUiDialogRequest = Extract<HostEvent, { type: "extensionUi.request" }> & {
  method: "select" | "confirm" | "input" | "editor";
};

export type ExtensionUiDialogResult = {
  ok: boolean;
  value: unknown;
};

type Pending = {
  request: ExtensionUiDialogRequest;
  resolve: (result: ExtensionUiDialogResult) => void;
};

let pending: Pending | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function getPendingExtensionUiDialog(): ExtensionUiDialogRequest | null {
  return pending?.request ?? null;
}

export function subscribeExtensionUiDialog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isExtensionUiDialogMethod(
  method: string,
): method is ExtensionUiDialogRequest["method"] {
  return method === "select" || method === "confirm" || method === "input" || method === "editor";
}

/**
 * Show a dialog for the given request. Concurrent calls cancel the previous
 * pending dialog (host typically issues one dialog at a time).
 */
export function promptExtensionUiDialog(
  request: ExtensionUiDialogRequest,
): Promise<ExtensionUiDialogResult> {
  if (pending) {
    const previous = pending;
    pending = null;
    previous.resolve({ ok: false, value: undefined });
  }
  return new Promise((resolve) => {
    pending = { request, resolve };
    notify();
  });
}

export function settleExtensionUiDialog(result: ExtensionUiDialogResult): void {
  if (!pending) return;
  const current = pending;
  pending = null;
  notify();
  current.resolve(result);
}

/** Parse portable select args: `{ title, options: string[] }`. */
export function parseSelectArgs(args: unknown): { title: string; options: string[] } {
  const record =
    typeof args === "object" && args !== null && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};
  const title = typeof record.title === "string" ? record.title : "Select";
  const options = Array.isArray(record.options)
    ? record.options.filter((item): item is string => typeof item === "string")
    : [];
  return { title, options };
}

export function parseConfirmArgs(args: unknown): { title: string; message: string } {
  const record =
    typeof args === "object" && args !== null && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};
  return {
    title: typeof record.title === "string" ? record.title : "Confirm",
    message: typeof record.message === "string" ? record.message : "",
  };
}

export function parseInputArgs(
  args: unknown,
  method: "input" | "editor",
): { title: string; initial: string } {
  const record =
    typeof args === "object" && args !== null && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};
  const title =
    typeof record.title === "string" ? record.title : method === "editor" ? "Editor" : "Input";
  const initial =
    method === "editor"
      ? typeof record.prefill === "string"
        ? record.prefill
        : ""
      : typeof record.placeholder === "string"
        ? record.placeholder
        : "";
  return { title, initial };
}
