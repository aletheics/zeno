/**
 * Confirm modal (delete / archive when prefs require it).
 * Built on shadcn AlertDialog for focus trap + a11y.
 */
import { useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Destructive styling for delete-style actions. */
  danger?: boolean;
  testId?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const settledRef = useRef(false);

  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(open) => {
        if (open) {
          settledRef.current = false;
          return;
        }
        if (!settledRef.current) props.onCancel();
      }}
    >
      <AlertDialogContent
        size="default"
        className="max-w-sm gap-3 p-4"
        data-testid={props.testId ?? "confirm-dialog"}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[15px] font-semibold">{props.title}</AlertDialogTitle>
          <AlertDialogDescription className="text-[13px] leading-relaxed whitespace-pre-wrap">
            {props.message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            data-testid="confirm-dialog-cancel"
            onClick={() => {
              settledRef.current = true;
              props.onCancel();
            }}
          >
            {props.cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="confirm-dialog-confirm"
            variant={props.danger ? "destructive" : "default"}
            onClick={() => {
              settledRef.current = true;
              props.onConfirm();
            }}
          >
            {props.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
