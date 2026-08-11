/**
 * Extension UI `select` — searchable option list with structured content layout.
 * Electron disables `window.prompt`; options must be real clickable choices
 * (ADR-008 / ui-spec §14: searchable Dialog/Command list).
 *
 * Header / question / options stay plain text. Preview blocks use the same
 * sanitized MarkdownContent pipeline as the chat timeline (no raw HTML).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  formatSelectOption,
  formatSelectTitle,
  selectOptionSearchValue,
} from "../lib/extension-ui-format.ts";
import type { Locale } from "../lib/i18n.ts";
import { MarkdownContent } from "./MarkdownContent.tsx";

/** Compact markdown surface for dialog previews (code / tables / math). */
const PREVIEW_MD_CLASS =
  "extension-ui-md max-h-[140px] overflow-auto text-[12px] leading-relaxed text-foreground/90 " +
  "[&_.content-code-block]:my-1.5 [&_.content-code-block]:text-[11px] " +
  "[&_pre]:my-1.5 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 " +
  "[&_table]:my-1.5 [&_h1]:my-1 [&_h2]:my-1 [&_h3]:my-1";

export function ExtensionUiSelectDialog(props: {
  open: boolean;
  title: string;
  options: string[];
  locale?: Locale;
  cancelLabel?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  testId?: string;
  onSelect: (value: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const settledRef = useRef(false);

  const formattedTitle = useMemo(() => formatSelectTitle(props.title), [props.title]);
  const formattedOptions = useMemo(
    () => props.options.map((raw) => formatSelectOption(raw)),
    [props.options],
  );
  const showSearch = formattedOptions.length > 4;

  useEffect(() => {
    if (!props.open) return;
    settledRef.current = false;
    setQuery("");
  }, [props.open, props.title, props.options]);

  function settleSelect(value: string) {
    settledRef.current = true;
    props.onSelect(value);
  }

  function settleCancel() {
    settledRef.current = true;
    props.onCancel();
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (open) {
          settledRef.current = false;
          return;
        }
        if (!settledRef.current) settleCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        data-testid={props.testId ?? "extension-ui-select-dialog"}
        className={cn(
          "top-1/2 left-1/2 z-[11000] w-[min(560px,94vw)] max-w-[calc(100%-2rem)]",
          "translate-x-[-50%] translate-y-[-50%] gap-0 overflow-hidden p-0",
          "rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface-panel)]",
          "text-[var(--foreground)] shadow-[var(--shadow-soft)]",
          "duration-150 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100",
          "[&_[data-slot=command-input-wrapper]]:border-b [&_[data-slot=command-input-wrapper]]:border-[var(--border)]",
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-2 border-b border-[var(--border)] px-4 py-3.5 text-left">
          {formattedTitle.header ? (
            <p
              className="m-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
              data-testid="extension-ui-select-header"
            >
              {formattedTitle.header}
            </p>
          ) : null}
          <DialogTitle
            className="text-[15px] leading-snug font-semibold break-words [overflow-wrap:anywhere]"
            data-testid="extension-ui-select-title"
          >
            {formattedTitle.headline}
          </DialogTitle>
          {formattedTitle.body ? (
            <p
              className="m-0 max-h-[min(96px,16vh)] overflow-y-auto text-[13px] leading-relaxed whitespace-pre-wrap text-muted-foreground break-words [overflow-wrap:anywhere]"
              data-testid="extension-ui-select-body"
            >
              {formattedTitle.body}
            </p>
          ) : null}
          {formattedTitle.previews.length > 0 ? (
            <div
              className="flex max-h-[min(220px,28vh)] flex-col gap-2 overflow-y-auto pr-0.5"
              data-testid="extension-ui-select-previews"
            >
              {formattedTitle.previews.map((preview, i) => (
                <div
                  key={`${i}:${preview.title}`}
                  className="rounded-md border border-[var(--border)] bg-muted/40 px-2.5 py-2"
                  data-testid={`extension-ui-select-preview-${i}`}
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
          <DialogDescription className="sr-only">
            {props.options.length > 0
              ? `Choose one of ${props.options.length} options`
              : "No options available"}
          </DialogDescription>
        </DialogHeader>

        <Command
          shouldFilter
          className="rounded-none border-0 bg-transparent shadow-none"
          label={formattedTitle.headline}
        >
          {showSearch ? (
            <CommandInput
              autoFocus
              data-testid="extension-ui-select-search"
              placeholder={props.searchPlaceholder ?? "Filter options…"}
              value={query}
              onValueChange={setQuery}
            />
          ) : null}
          <CommandList
            className="max-h-[min(380px,48vh)] p-1"
            data-testid="extension-ui-select-options"
          >
            <CommandEmpty>{props.emptyLabel ?? "No matching options"}</CommandEmpty>
            <CommandGroup className="p-0">
              {formattedOptions.map((option, index) => (
                <CommandItem
                  key={`${index}:${option.raw}`}
                  value={selectOptionSearchValue(option)}
                  data-testid={`extension-ui-select-option-${index}`}
                  className={cn(
                    "cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5",
                    "aria-selected:bg-accent data-[selected=true]:bg-accent",
                  )}
                  onSelect={() => settleSelect(option.raw)}
                >
                  {option.index !== undefined ? (
                    <span
                      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium tabular-nums text-muted-foreground"
                      aria-hidden
                    >
                      {option.index}
                    </span>
                  ) : (
                    <span
                      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium tabular-nums text-muted-foreground"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-snug font-medium break-words [overflow-wrap:anywhere]">
                      {option.label}
                    </span>
                    {option.description ? (
                      <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground break-words [overflow-wrap:anywhere]">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>

        <div className="flex justify-end border-t border-[var(--border)] px-3 py-2">
          <button
            type="button"
            data-testid="extension-ui-select-cancel"
            className="rounded-md px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            onClick={settleCancel}
          >
            {props.cancelLabel ?? "Cancel"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
