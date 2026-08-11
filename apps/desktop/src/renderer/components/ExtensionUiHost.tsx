/**
 * Renders portable extension UI dialogs (select / confirm / input / editor)
 * driven by the promise bridge in extension-ui-prompt.ts.
 */
import { useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { ExtensionUiInputDialog } from "./ExtensionUiInputDialog.tsx";
import { ExtensionUiSelectDialog } from "./ExtensionUiSelectDialog.tsx";
import {
  getPendingExtensionUiDialog,
  parseConfirmArgs,
  parseInputArgs,
  parseSelectArgs,
  settleExtensionUiDialog,
  subscribeExtensionUiDialog,
  type ExtensionUiDialogRequest,
} from "../lib/extension-ui-prompt.ts";
import { t, type Locale } from "../lib/i18n.ts";

export function ExtensionUiHost(props: { locale: Locale }) {
  const [request, setRequest] = useState<ExtensionUiDialogRequest | null>(() =>
    getPendingExtensionUiDialog(),
  );

  useEffect(() => {
    return subscribeExtensionUiDialog(() => {
      setRequest(getPendingExtensionUiDialog());
    });
  }, []);

  const cancelLabel = t(props.locale, "common.cancel");
  const confirmLabel = t(props.locale, "common.confirm");

  if (!request) return null;

  if (request.method === "select") {
    const { title, options } = parseSelectArgs(request.args);
    return (
      <ExtensionUiSelectDialog
        open
        title={title}
        options={options}
        locale={props.locale}
        cancelLabel={cancelLabel}
        onSelect={(value) => settleExtensionUiDialog({ ok: true, value })}
        onCancel={() => settleExtensionUiDialog({ ok: false, value: undefined })}
      />
    );
  }

  if (request.method === "confirm") {
    const { title, message } = parseConfirmArgs(request.args);
    return (
      <ConfirmDialog
        open
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        testId="extension-ui-confirm-dialog"
        onConfirm={() => settleExtensionUiDialog({ ok: true, value: true })}
        onCancel={() => settleExtensionUiDialog({ ok: true, value: false })}
      />
    );
  }

  // input | editor — free-text dialog (Electron has no window.prompt).
  const { title, initial } = parseInputArgs(request.args, request.method);
  return (
    <ExtensionUiInputDialog
      open
      title={title}
      initialValue={initial}
      multiline={request.method === "editor"}
      locale={props.locale}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      testId={
        request.method === "editor" ? "extension-ui-editor-dialog" : "extension-ui-input-dialog"
      }
      onConfirm={(value) => settleExtensionUiDialog({ ok: true, value })}
      onCancel={() => settleExtensionUiDialog({ ok: false, value: undefined })}
    />
  );
}
