/**
 * In-app rename modal (Electron disables window.prompt by default).
 * Built on shadcn Dialog + Input.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function RenameDialog(props: {
  open: boolean;
  title: string;
  label?: string;
  initialValue: string;
  confirmLabel?: string;
  cancelLabel?: string;
  testId?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(props.initialValue);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    if (!props.open) return;
    settledRef.current = false;
    setValue(props.initialValue);
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [props.open, props.initialValue]);

  function submit() {
    const next = value.trim();
    if (!next) return;
    settledRef.current = true;
    props.onConfirm(next);
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
        className="max-w-sm gap-3 p-4"
        data-testid={props.testId ?? "rename-dialog"}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">{props.title}</DialogTitle>
        </DialogHeader>
        {props.label ? (
          <label className="block text-[12px] text-muted-foreground">{props.label}</label>
        ) : null}
        <Input
          ref={inputRef}
          data-testid="rename-dialog-input"
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
        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="rename-dialog-cancel"
            onClick={() => {
              settledRef.current = true;
              props.onCancel();
            }}
          >
            {props.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            type="button"
            size="sm"
            data-testid="rename-dialog-confirm"
            disabled={!value.trim()}
            onClick={submit}
          >
            {props.confirmLabel ?? "OK"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
