/**
 * Extension UI `input` / `editor` free-text dialog.
 * Electron disables `window.prompt`; empty submit is allowed (RPC multi-select).
 * Titles may include `[header]` + multi-line body; preview blocks use sanitized MD.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatSelectTitle } from "../lib/extension-ui-format.ts";
import type { Locale } from "../lib/i18n.ts";
import { MarkdownContent } from "./MarkdownContent.tsx";

const PREVIEW_MD_CLASS =
  "extension-ui-md max-h-[120px] overflow-auto text-[12px] leading-relaxed text-foreground/90 " +
  "[&_.content-code-block]:my-1.5 [&_.content-code-block]:text-[11px] " +
  "[&_pre]:my-1.5 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 " +
  "[&_table]:my-1.5 [&_h1]:my-1 [&_h2]:my-1 [&_h3]:my-1";

export function ExtensionUiInputDialog(props: {
  open: boolean;
  title: string;
  initialValue: string;
  multiline?: boolean;
  locale?: Locale;
  confirmLabel?: string;
  cancelLabel?: string;
  testId?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(props.initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const settledRef = useRef(false);
  const formattedTitle = useMemo(() => formatSelectTitle(props.title), [props.title]);

  useEffect(() => {
    if (!props.open) return;
    settledRef.current = false;
    setValue(props.initialValue);
    const id = window.setTimeout(() => {
      const el = props.multiline ? textareaRef.current : inputRef.current;
      el?.focus();
      el?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [props.open, props.initialValue, props.multiline]);

  function submit() {
    settledRef.current = true;
    props.onConfirm(value);
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (open) {
          settledRef.current = false;
          return;
        }
        if (!settledRef.current) props.onCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={props.multiline ? "max-w-lg gap-3 p-4" : "max-w-md gap-3 p-4"}
        data-testid={props.testId ?? "extension-ui-input-dialog"}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-2 text-left">
          {formattedTitle.header ? (
            <p className="m-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {formattedTitle.header}
            </p>
          ) : null}
          <DialogTitle className="text-[15px] leading-snug font-semibold break-words [overflow-wrap:anywhere]">
            {formattedTitle.headline}
          </DialogTitle>
          {formattedTitle.body || formattedTitle.previews.length > 0 ? (
            <div className="max-h-[min(220px,30vh)] space-y-2 overflow-y-auto">
              {formattedTitle.body ? (
                <p className="m-0 text-[13px] leading-relaxed whitespace-pre-wrap text-muted-foreground break-words [overflow-wrap:anywhere]">
                  {formattedTitle.body}
                </p>
              ) : null}
              {formattedTitle.previews.map((preview, i) => (
                <div
                  key={`${i}:${preview.title}`}
                  className="rounded-md border border-[var(--border)] bg-muted/40 px-2.5 py-2"
                >
                  <p className="m-0 mb-1.5 text-[11px] font-medium text-muted-foreground">
                    {preview.title}
                  </p>
                  {preview.content ? (
                    <MarkdownContent className={PREVIEW_MD_CLASS} locale={props.locale ?? "en"}>
                      {preview.content}
                    </MarkdownContent>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </DialogHeader>
        {props.multiline ? (
          <Textarea
            ref={textareaRef}
            data-testid="extension-ui-input-field"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={8}
            className="min-h-[160px] resize-y text-[13px]"
          />
        ) : (
          <Input
            ref={inputRef}
            data-testid="extension-ui-input-field"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            className="h-9 text-[13px]"
          />
        )}
        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="extension-ui-input-cancel"
            onClick={() => {
              settledRef.current = true;
              props.onCancel();
            }}
          >
            {props.cancelLabel ?? "Cancel"}
          </Button>
          <Button type="button" size="sm" data-testid="extension-ui-input-confirm" onClick={submit}>
            {props.confirmLabel ?? "OK"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
