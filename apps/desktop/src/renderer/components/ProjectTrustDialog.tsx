/**
 * View-mode project trust prompt when defaultProjectTrust is "ask".
 * Terminal mode uses pi's own TUI select instead.
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
import { t, type Locale } from "../lib/i18n.ts";

export function ProjectTrustDialog(props: {
  open: boolean;
  locale: Locale;
  cwd: string;
  busy?: boolean;
  onTrust: () => void;
  onDistrust: () => void;
  onLater: () => void;
}) {
  const tr = (key: Parameters<typeof t>[1]) => t(props.locale, key);
  const settledRef = useRef(false);
  const busy = props.busy === true;

  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(open) => {
        if (open) {
          settledRef.current = false;
          return;
        }
        // Esc / overlay → same as "Later" (session-only, no trust.json write).
        if (!settledRef.current && !busy) props.onLater();
      }}
    >
      <AlertDialogContent
        size="default"
        className="max-w-md gap-3 p-4"
        data-testid="project-trust-dialog"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[15px] font-semibold">
            {tr("trust.prompt.title")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
              <p className="m-0 whitespace-pre-wrap">{tr("trust.prompt.body")}</p>
              <p
                className="m-0 break-all rounded-md bg-muted/60 px-2 py-1.5 font-mono text-[12px] text-foreground"
                data-testid="project-trust-dialog-path"
              >
                {props.cwd}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <AlertDialogAction
            data-testid="project-trust-dialog-trust"
            disabled={busy}
            className="w-full"
            onClick={() => {
              settledRef.current = true;
              props.onTrust();
            }}
          >
            {busy ? tr("trust.prompt.working") : tr("trust.prompt.trust")}
          </AlertDialogAction>
          <AlertDialogCancel
            data-testid="project-trust-dialog-distrust"
            disabled={busy}
            className="w-full"
            onClick={() => {
              settledRef.current = true;
              props.onDistrust();
            }}
          >
            {tr("trust.prompt.distrust")}
          </AlertDialogCancel>
          <button
            type="button"
            data-testid="project-trust-dialog-later"
            disabled={busy}
            className="w-full rounded-md px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:opacity-50"
            onClick={() => {
              settledRef.current = true;
              props.onLater();
            }}
          >
            {tr("trust.prompt.later")}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
