import type { ReactEventHandler, ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { t, type Locale } from "../lib/i18n.ts";
import { cn } from "../lib/utils.ts";

/**
 * Full-screen content preview (expanded table / image).
 *
 * Close is a viewport-fixed empty <button> (no SVG / child hit targets) at the
 * top-right of the overlay — standard lightbox placement, clear of the card and
 * of Electron titlebar drag when given no-drag.
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
        <div className="content-preview-dialog-stage">{props.children}</div>
        {/*
          Sibling of the stage (not inside the card): fixed to the viewport corner.
          Empty button — full border-box is the hit target; X via ::after only.
        */}
        <button
          type="button"
          className="content-preview-dialog-close"
          aria-label={props.closeLabel}
          title={props.closeLabel}
          data-testid="content-preview-close"
          onClick={() => props.onOpenChange(false)}
        />
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
