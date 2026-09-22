import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The app's one context-menu row.
 *
 * Three copies of this existed and had already drifted apart — `ProjectList.tsx` (the fullest,
 * with `danger`/`disabled`), `ThreadHeader.tsx` (no such props), and a hand-rolled set inside
 * `ProjectsPage.tsx` that had slipped to a different padding and a different red. Right-click
 * menus are now appearing in more places, so the row is defined once here.
 *
 * `shortcut` is the addition the copies never had. Printing the binding beside the label is
 * how a menu teaches the keystroke — the same reason the command palette shows one, and it
 * borrows that row's treatment (`font-mono text-[11px] tracking-wide text-[var(--text-subtle)]`,
 * a theme token) rather than shadcn's `text-muted-foreground`.
 *
 * Deliberately not Radix: `FloatingMenu` handles placement and dismissal itself, because
 * Radix Popover misplaces menus under the sticky/transform ancestors in the composer dock.
 */
export function MenuItem(props: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Why the item is unavailable. A greyed row on its own tells the user nothing. */
  disabledReason?: string;
  /** Display string for the binding, e.g. `⌘C`. Use `editCombo` for platform edit keys. */
  shortcut?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={props.testId}
      disabled={props.disabled}
      aria-disabled={props.disabled || undefined}
      title={props.disabled ? props.disabledReason : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors",
        props.disabled && "cursor-not-allowed opacity-45",
        props.danger
          ? "text-red-400 enabled:hover:bg-red-500/10"
          : "text-[var(--popover-foreground)] enabled:hover:bg-[var(--hover-fill)]",
        !props.disabled && "cursor-pointer",
      )}
      onClick={props.onClick}
    >
      <span className="opacity-70">{props.icon}</span>
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      {props.shortcut ? (
        <span className="shrink-0 font-mono text-[11px] tracking-wide text-[var(--text-subtle)]">
          {props.shortcut}
        </span>
      ) : null}
    </button>
  );
}
