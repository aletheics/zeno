/**
 * Composer attachment strip: shadcn Attachment chips with horizontal scroll
 * and image thumbnails via AttachmentMedia variant="image".
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  Presentation,
  X,
} from "lucide-react";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment";
import {
  attachmentLabel,
  attachmentPresentation,
  isPreviewableImagePath,
  type AttachmentKind,
} from "../lib/composer-suggestions.ts";
import { t, type Locale } from "../lib/i18n.ts";
import { ImagePreviewDialog } from "./ContentPreviewDialog.tsx";

function kindIcon(kind: AttachmentKind): ReactNode {
  const props = { className: "size-4", strokeWidth: 1.75 } as const;
  if (kind === "folder") return <Folder {...props} />;
  if (kind === "image") return <FileImage {...props} />;
  if (kind === "code") return <FileCode2 {...props} />;
  if (kind === "archive") return <FileArchive {...props} />;
  if (kind === "spreadsheet") return <FileSpreadsheet {...props} />;
  if (kind === "presentation") return <Presentation {...props} />;
  if (kind === "document" || kind === "pdf" || kind === "text") {
    return <FileText {...props} />;
  }
  return <File {...props} />;
}

function useAttachmentPreviews(paths: string[]): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  const key = paths.join("\0");

  useEffect(() => {
    let cancelled = false;
    const imagePaths = paths.filter(isPreviewableImagePath);
    if (imagePaths.length === 0) {
      setMap({});
      return;
    }
    void (async () => {
      const entries = await Promise.all(
        imagePaths.map(async (path) => {
          try {
            const url = await window.zeno.workspace.readAttachmentPreview(path);
            return url ? ([path, url] as const) : undefined;
          } catch {
            return undefined;
          }
        }),
      );
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      setMap(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paths joined into key
  }, [key]);

  return map;
}

export function ComposerAttachmentList(props: {
  paths: string[];
  locale: Locale;
  onRemove: (path: string) => void;
}) {
  const previews = useAttachmentPreviews(props.paths);
  const [previewPath, setPreviewPath] = useState<string>();
  const tr = (key: Parameters<typeof t>[1]) => t(props.locale, key);
  const previewSource = previewPath ? previews[previewPath] : undefined;

  return (
    <>
      <div
        className="composer-attachments min-w-0 max-w-full px-3 pt-2.5 pb-0.5"
        data-testid="composer-attachments"
      >
        {/*
        AttachmentGroup defaults: horizontal snap scroll when chips overflow.
        Do not set overflow-x-visible — that was why many attachments clipped.
      */}
        <AttachmentGroup className="composer-attachment-group max-w-full gap-2 py-0">
          {props.paths.map((path) => {
            const presentation = attachmentPresentation(path);
            const preview = previews[path];
            const isImage = presentation.kind === "image" || Boolean(preview);

            return (
              <Attachment
                key={path}
                state="done"
                size="sm"
                orientation={isImage && preview ? "vertical" : "horizontal"}
                data-kind={presentation.kind}
                data-testid="composer-attachment-card"
                className={
                  isImage && preview
                    ? "w-[7.5rem] max-w-[7.5rem] shrink-0"
                    : "max-w-[min(240px,100%)] shrink-0"
                }
                title={path}
              >
                {preview ? (
                  <AttachmentTrigger
                    data-testid="attachment-image-preview"
                    onClick={() => setPreviewPath(path)}
                    aria-label={`${tr("timeline.imagePreview")}: ${attachmentLabel(path)}`}
                  />
                ) : null}
                {preview ? (
                  <AttachmentMedia variant="image">
                    <img src={preview} alt="" draggable={false} />
                  </AttachmentMedia>
                ) : (
                  <AttachmentMedia variant="icon">{kindIcon(presentation.kind)}</AttachmentMedia>
                )}
                <AttachmentContent>
                  <AttachmentTitle>{attachmentLabel(path)}</AttachmentTitle>
                  {!preview ? (
                    <AttachmentDescription>{presentation.typeLabel}</AttachmentDescription>
                  ) : null}
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label={tr("composer.attach.remove")}
                    className="text-muted-foreground opacity-70 hover:text-destructive hover:opacity-100"
                    onClick={() => props.onRemove(path)}
                  >
                    <X className="size-3.5" strokeWidth={2} />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            );
          })}
        </AttachmentGroup>
      </div>
      <ImagePreviewDialog
        open={Boolean(previewPath && previewSource)}
        onOpenChange={(open) => {
          if (!open) setPreviewPath(undefined);
        }}
        source={previewSource ?? ""}
        alt={previewPath ? attachmentLabel(previewPath) : undefined}
        locale={props.locale}
      />
    </>
  );
}
