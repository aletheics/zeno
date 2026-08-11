/**
 * App-level error modal (not used for pi agent timeline failures).
 * Built on shadcn AlertDialog.
 */
import { useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ErrorDialog(props: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onClose: () => void;
  testId?: string;
}) {
  const settledRef = useRef(false);
  if (!props.message) return null;

  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(open) => {
        if (open) {
          settledRef.current = false;
          return;
        }
        if (!settledRef.current) props.onClose();
      }}
    >
      <AlertDialogContent
        size="default"
        className="box-border w-[min(28rem,calc(100vw-2rem))] max-w-[min(28rem,calc(100vw-2rem))] gap-3 overflow-hidden p-4 sm:max-w-[min(28rem,calc(100vw-2rem))]"
        data-testid={props.testId ?? "error-dialog"}
      >
        {/*
          Grid children default to min-width:auto and grow with long unbroken paths.
          Force min-w-0 on the whole chain so text can wrap inside the dialog width.
        */}
        <AlertDialogHeader className="grid w-full min-w-0 max-w-full grid-cols-1 place-items-stretch gap-1.5 text-left">
          <AlertDialogTitle className="min-w-0 max-w-full text-[15px] font-semibold break-words [overflow-wrap:anywhere]">
            {props.title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div
              className="error-dialog-message max-h-[min(50vh,360px)] w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto text-[13px] leading-relaxed text-muted-foreground"
              data-testid="error-dialog-message"
            >
              {props.message}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="w-full min-w-0">
          <AlertDialogAction
            data-testid="error-dialog-confirm"
            onClick={() => {
              settledRef.current = true;
              props.onClose();
            }}
          >
            {props.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
