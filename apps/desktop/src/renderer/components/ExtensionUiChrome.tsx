/**
 * Composer-adjacent string widgets from portable extension UI.
 * Status / working / notify / title live in ThreadHeader (not the content column).
 */
import { cn } from "@/lib/utils";
import type { ExtensionUiPortableState } from "../lib/extension-ui-state.ts";
import { extensionWidgetsForPlacement } from "../lib/extension-ui-state.ts";
import type { Locale } from "../lib/i18n.ts";

export function ExtensionUiChrome(props: {
  locale: Locale;
  state: ExtensionUiPortableState;
  /** aboveEditor | belowEditor only — header chrome is ThreadHeader. */
  region: "aboveEditor" | "belowEditor";
  className?: string;
}) {
  const widgets = extensionWidgetsForPlacement(props.state, props.region);
  if (widgets.length === 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-none flex w-full flex-col gap-1.5 px-1",
        props.region === "aboveEditor" ? "pb-1.5" : "pt-1.5",
        props.className,
      )}
      data-testid={`extension-ui-chrome-${props.region}`}
    >
      {widgets.map((widget) => (
        <div
          key={widget.key}
          className="pointer-events-auto rounded-md border border-border/80 bg-muted/40 px-2.5 py-1.5 text-[12px] leading-snug text-foreground/90"
          data-testid={`extension-ui-widget-${widget.key}`}
        >
          {widget.lines.map((line, i) => (
            <p
              key={`${widget.key}-${i}`}
              className="m-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
            >
              {line}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
