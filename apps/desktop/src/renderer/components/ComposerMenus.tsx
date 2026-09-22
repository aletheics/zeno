/**
 * Row chrome for the composer’s menus.
 *
 * `MenuRow`, `AccessOption` and `FlyoutRow` are pure presentation: they take already-localized
 * strings and hand nothing back. They lived in the middle of `Composer.tsx`, which the
 * file-budget ratchet freezes at its current size — so they move out here, and that move is
 * what pays for the composer’s right-click menu. This is a move, not a rewrite.
 */
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { anchorFromElement, FloatingMenu, type AnchorRect } from "./FloatingMenu.tsx";
import { cn } from "../lib/utils.ts";

export function MenuRow(props: {
  icon?: ReactNode;
  label: string;
  description?: string;
  active?: boolean;
  muted?: boolean;
  /** Emphasize label (e.g. warning / danger) */
  emphasize?: "danger" | "none";
  onClick: () => void;
  testId?: string;
}) {
  const danger = props.emphasize === "danger";
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={props.testId}
      className={cn(
        "flex w-full cursor-pointer items-start gap-2 px-2.5 py-2 text-left transition-colors",
        props.muted
          ? "text-[var(--muted-foreground)] hover:bg-[var(--hover-fill)]"
          : "text-[var(--popover-foreground,var(--foreground))] hover:bg-[var(--hover-fill)]",
        danger && "hover:bg-red-500/10",
        props.active && !danger && "bg-[var(--accent)]",
        props.active && danger && "bg-red-500/10",
      )}
      onClick={props.onClick}
    >
      {props.icon ? (
        <span
          className={cn(
            "mt-0.5 inline-flex size-4 shrink-0",
            danger ? "text-red-500 opacity-100" : "opacity-70",
          )}
        >
          {props.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[13px] font-medium leading-snug",
            danger && "text-red-500",
          )}
        >
          {props.label}
        </span>
        {props.description ? (
          <span
            className={cn(
              "mt-0.5 block text-[11px] leading-snug",
              danger ? "text-red-500/75" : "text-[var(--text-subtle)]",
            )}
          >
            {props.description}
          </span>
        ) : null}
      </span>
      {props.active ? (
        <span className={cn("mt-0.5 text-[11px]", danger ? "text-red-500" : "text-[#0a84ff]")}>
          ✓
        </span>
      ) : null}
    </button>
  );
}

/** Full-access caution: orange-red (not pale system orange, not pure error red). */
const ACCESS_FULL_ORANGE = "text-[#ff5c1a]";
const ACCESS_FULL_ORANGE_MUTED = "text-[#ff5c1a]/90";
const ACCESS_FULL_ORANGE_HOVER = "hover:bg-[#ff5c1a]/12";

/**
 * Access-control option — same hover/active fill + radius as session rows
 * (`--hover-fill`, rounded-md). Full access keeps orange caution text.
 */
export function AccessOption(props: {
  icon: ReactNode;
  label: string;
  description: string;
  active?: boolean;
  /** Full-access caution (orange), not destructive red. */
  caution?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={props.testId}
      className={cn(
        "flex w-full cursor-pointer items-start gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left transition-colors",
        // Match session list: transparent default, hover-fill on hover/active.
        props.active ? "bg-[var(--hover-fill)]" : "bg-transparent hover:bg-[var(--hover-fill)]",
        props.caution && !props.active && ACCESS_FULL_ORANGE_HOVER,
      )}
      onClick={props.onClick}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex size-4 shrink-0",
          props.caution ? ACCESS_FULL_ORANGE : "text-[var(--muted-foreground)]",
        )}
      >
        {props.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[13px] font-medium leading-snug",
            props.caution ? ACCESS_FULL_ORANGE : "text-[var(--foreground)]",
          )}
        >
          {props.label}
        </span>
        <span
          className={cn(
            "mt-0.5 block text-[11px] leading-snug",
            props.caution ? ACCESS_FULL_ORANGE_MUTED : "text-[var(--text-subtle)]",
          )}
        >
          {props.description}
        </span>
      </span>
      {props.active ? (
        <span
          className={cn(
            "mt-0.5 shrink-0 text-[11px] font-medium",
            props.caution ? ACCESS_FULL_ORANGE : "text-[var(--foreground)]",
          )}
        >
          ✓
        </span>
      ) : null}
    </button>
  );
}

/**
 * Hover-only row → right flyout.
 * Open/close timers are owned by the parent so sibling rows can switch without flicker.
 */
export function FlyoutRow(props: {
  icon?: ReactNode;
  label: string;
  /** Current selection shown immediately left of the › arrow. */
  valueLabel?: string;
  open: boolean;
  /** Open this flyout immediately (cancels any pending close). */
  onHoverOpen: () => void;
  /** Schedule close after a short delay (cancelled if another flyout opens). */
  onHoverLeave: () => void;
  children: ReactNode;
  testId?: string;
  flyoutTestId?: string;
  minWidth?: number;
  /** When true, row is visible but does not open a flyout. */
  disabled?: boolean;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const disabled = props.disabled === true;

  useEffect(() => {
    if (!props.open || disabled) return;
    setAnchor(anchorFromElement(rowRef.current));
  }, [props.open, disabled]);

  function show() {
    if (disabled) return;
    setAnchor(anchorFromElement(rowRef.current));
    props.onHoverOpen();
  }

  return (
    <>
      <div
        ref={rowRef}
        role="menuitem"
        aria-disabled={disabled || undefined}
        data-testid={props.testId}
        data-disabled={disabled ? "true" : undefined}
        className={cn(
          "flex w-full cursor-default items-center gap-2 px-2.5 py-2 text-left text-[13px] transition-colors",
          "text-[var(--popover-foreground,var(--foreground))]",
          disabled ? "opacity-50" : "hover:bg-[var(--hover-fill)]",
          !disabled && props.open && "bg-[var(--accent)]",
        )}
        onMouseEnter={show}
        onMouseLeave={disabled ? undefined : props.onHoverLeave}
      >
        {props.icon ? (
          <span className="inline-flex size-4 shrink-0 opacity-70">{props.icon}</span>
        ) : null}
        <span className="min-w-0 flex-1 truncate font-medium leading-snug">{props.label}</span>
        {props.valueLabel ? (
          <span className="max-w-[6.5rem] shrink-0 truncate text-[12px] text-[var(--text-subtle)]">
            {props.valueLabel}
          </span>
        ) : null}
        {!disabled ? (
          <ChevronRight className="size-3.5 shrink-0 opacity-50" strokeWidth={2} />
        ) : null}
      </div>
      {!disabled ? (
        <FloatingMenu
          open={props.open && Boolean(anchor)}
          anchor={anchor}
          onClose={props.onHoverLeave}
          placement="right"
          zIndex={10_050}
          closeOnOutside={false}
          minWidth={props.minWidth ?? 180}
          className="py-1"
          {...(props.flyoutTestId ? { testId: props.flyoutTestId } : {})}
        >
          <div onMouseEnter={props.onHoverOpen} onMouseLeave={props.onHoverLeave}>
            {props.children}
          </div>
        </FloatingMenu>
      ) : null}
    </>
  );
}
