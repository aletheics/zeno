import type { ReactEventHandler, ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { t, type Locale } from "../lib/i18n.ts";
import { cn } from "../lib/utils.ts";

/**
 * Full-screen content preview (expanded table / image).
 *
 * Close button sits at the top-right of the content card (not the viewport),
 * so it moves with the table and is always within reach.
 */
export function ContentPreviewDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
  className?: string | undefined;
  testId?: string | undefined;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "content-preview-dialog top-0 left-0 max-w-none translate-x-0 translate-y-0 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 sm:max-w-none",
          props.className,
        )}
        aria-label={props.title}
        data-testid={props.testId}
        // Keep focus on the dialog shell; don't move focus into table cells on open.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">{props.title}</DialogTitle>
        <div className="content-preview-dialog-stage">
          <div className="content-preview-dialog-card">
            {props.children}
            <button
              type="button"
              className="content-preview-dialog-close"
              aria-label={props.closeLabel}
              title={props.closeLabel}
              data-testid="content-preview-close"
              onClick={() => props.onOpenChange(false)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ImagePreviewDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: string;
  alt?: string | undefined;
  locale: Locale;
  onError?: ReactEventHandler<HTMLImageElement> | undefined;
}) {
  const title = props.alt || t(props.locale, "timeline.imagePreview");
  return (
    <ContentPreviewDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={title}
      closeLabel={t(props.locale, "timeline.imagePreviewClose")}
      className="content-image-preview-dialog"
      testId="image-preview-dialog"
    >
      <div className="content-image-preview-surface">
        <img
          src={props.source}
          alt={props.alt ?? ""}
          className="content-image-preview-image"
          onError={props.onError}
        />
      </div>
    </ContentPreviewDialog>
  );
}
