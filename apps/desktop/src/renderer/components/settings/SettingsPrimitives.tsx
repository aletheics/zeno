/**
 * Settings chrome layout + thin wrappers around default shadcn form controls.
 * Controls intentionally use stock shadcn styling (no custom skins), except
 * filter search fields which share one pill chrome (SettingsSearchField).
 */
import * as React from "react";
import type { ReactNode } from "react";
import { CircleHelp, ExternalLink, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "../../lib/utils.ts";

/** Official pi docs used in settings help tips. */
export const PI_DOCS_SETTINGS_URL = "https://pi.dev/docs/latest/settings";
export const PI_DOCS_USAGE_URL = "https://pi.dev/docs/latest/usage";

export function openSettingsDocs(url: string): void {
  void window.pix.workspace.openExternal(url).catch(() => undefined);
}

/**
 * ? help control with app-styled tooltip. Prefer rich `children` for multi-line + links.
 * Tooltip content stays hoverable so links can be clicked.
 */
export function SettingsHelpTip(props: {
  /** Accessible name (always a plain string). */
  ariaLabel: string;
  /** Tooltip body — string or rich content. */
  children: ReactNode;
  testId?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
  contentClassName?: string;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "settings-section-label-help inline-flex shrink-0 cursor-help items-center rounded-sm text-[var(--text-subtle)] outline-none hover:text-[var(--muted-foreground)] focus-visible:ring-2 focus-visible:ring-ring/50",
              props.className,
            )}
            aria-label={props.ariaLabel}
            data-testid={props.testId ?? "settings-help-tip"}
          >
            <CircleHelp className="size-3.5" strokeWidth={1.75} aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={props.side ?? "top"}
          align={props.align ?? "start"}
          className={cn("max-w-[20rem]", props.contentClassName)}
        >
          {props.children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Inline docs link for use inside SettingsHelpTip (opens via Electron shell). */
export function SettingsDocsLink(props: { href: string; children: ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      data-testid={props.testId}
      className="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-left text-[12px] font-medium text-[var(--link)] underline-offset-2 hover:underline"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openSettingsDocs(props.href);
      }}
    >
      <span className="min-w-0">{props.children}</span>
      <ExternalLink className="size-3 shrink-0 opacity-80" strokeWidth={1.75} aria-hidden />
    </button>
  );
}

/**
 * Unified filter search field for all Settings surfaces (left rail + every page toolbar).
 * One pill shell, one height/radius/type size — never nest a full shadcn Input.
 */
export function SettingsSearchField(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  testId?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className={cn("settings-search", props.className)}>
      <Search className="settings-search-icon" strokeWidth={1.75} aria-hidden />
      <input
        type="search"
        data-testid={props.testId}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        autoFocus={props.autoFocus}
        className="settings-search-input"
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  );
}

export function SettingsPageShell(props: {
  title: string;
  testId?: string;
  titleAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="settings-page-shell" data-testid={props.testId}>
      <div className="settings-page-title-row">
        <h1 className="settings-page-title">{props.title}</h1>
        {props.titleAction ? (
          <div className="settings-page-title-action">{props.titleAction}</div>
        ) : null}
      </div>
      <div className="settings-page-sections">{props.children}</div>
    </div>
  );
}

export function SettingsSectionBlock(props: {
  label: string;
  testId?: string;
  showLabel?: boolean;
  labelVariant?: "default" | "code";
  /**
   * Hover help next to the group label.
   * Plain string for simple tips, or ReactNode for multi-line + docs links.
   */
  labelHint?: ReactNode;
  /** Accessible name when `labelHint` is not a string. */
  labelHintAria?: string;
  children: ReactNode;
}) {
  const showLabel = props.showLabel !== false;
  const hintAria =
    props.labelHintAria ?? (typeof props.labelHint === "string" ? props.labelHint : props.label);
  return (
    <section className="settings-section-block" data-testid={props.testId}>
      {showLabel ? (
        <h2
          className={cn(
            "settings-section-label",
            props.labelVariant === "code" && "settings-section-label-code",
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-1">
            <span className="min-w-0 truncate">{props.label}</span>
            {props.labelHint != null && props.labelHint !== false ? (
              <SettingsHelpTip
                ariaLabel={hintAria}
                testId={props.testId ? `${props.testId}-help` : "settings-section-help"}
              >
                {props.labelHint}
              </SettingsHelpTip>
            ) : null}
          </span>
        </h2>
      ) : null}
      <div className="settings-card">{props.children}</div>
    </section>
  );
}

function hasSettingsDescription(description: ReactNode | undefined): boolean {
  if (description == null || description === false || description === true) return false;
  if (typeof description === "string") return description.trim().length > 0;
  if (typeof description === "number") return true;
  if (Array.isArray(description)) return description.some((item) => hasSettingsDescription(item));
  return true;
}

export function SettingsRow(props: {
  title: string;
  description?: ReactNode;
  control: ReactNode;
  testId?: string;
  last?: boolean;
}) {
  const withDescription = hasSettingsDescription(props.description);
  return (
    <Field
      orientation="horizontal"
      className={cn(
        "settings-row",
        !withDescription && "settings-row-compact",
        props.last && "settings-row-last",
      )}
      data-testid={props.testId}
    >
      <FieldContent className="settings-row-copy min-w-0 flex-1">
        <FieldLabel className="settings-row-title">{props.title}</FieldLabel>
        {withDescription ? (
          <FieldDescription className="settings-row-desc">{props.description}</FieldDescription>
        ) : null}
      </FieldContent>
      <div
        className={cn(
          "settings-row-control shrink-0",
          withDescription && "settings-row-control-multiline",
        )}
      >
        {props.control}
      </div>
    </Field>
  );
}

export function SettingsToggle(props: {
  checked: boolean;
  onChange: (next: boolean) => void;
  testId?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <Switch
      checked={props.checked}
      onCheckedChange={props.onChange}
      disabled={props.disabled}
      aria-label={props["aria-label"]}
      data-testid={props.testId}
      data-on={props.checked ? "true" : "false"}
    />
  );
}

export function SettingsSelect(props: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  testId?: string;
  disabled?: boolean;
  /** Layout width only — visual style stays default shadcn Select. */
  size?: "sm" | "md" | "lg" | "default";
  className?: string;
  fullWidth?: boolean;
}) {
  // Radix Select disallows empty string item values.
  const EMPTY = "__pix_settings_empty__";
  const value = props.value === "" ? EMPTY : props.value;
  // Radix only paints SelectValue text when a matching SelectItem exists.
  // Keep orphan stored values visible (e.g. pi TUI wrote a timeout not in our list).
  let options = props.options.map((opt) => ({
    ...opt,
    value: opt.value === "" ? EMPTY : opt.value,
  }));
  if (value && !options.some((opt) => opt.value === value)) {
    options = [
      ...options,
      {
        value,
        label: props.value || value,
      },
    ];
  }
  const selected = options.find((opt) => opt.value === value);
  const widthClass = props.fullWidth
    ? "w-full min-w-0"
    : props.size === "sm"
      ? "w-28"
      : props.size === "lg"
        ? "w-44"
        : props.size === "md"
          ? "w-36"
          : undefined;
  return (
    <Select
      value={value}
      onValueChange={(next) => props.onChange(next === EMPTY ? "" : next)}
      {...(props.disabled !== undefined ? { disabled: props.disabled } : {})}
    >
      <SelectTrigger
        size="default"
        data-testid={props.testId}
        className={cn(widthClass, props.className)}
      >
        {/* Explicit children so the trigger never goes blank when item text fails to project. */}
        <SelectValue placeholder={selected?.label ?? (props.value || "—")}>
          {selected?.label ?? (props.value || "—")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="z-[11000]" position="popper" align="end">
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const SettingsInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { mono?: boolean }
>(({ className, mono, type = "text", ...props }, ref) => (
  <Input ref={ref} type={type} className={cn(mono && "font-mono", className)} {...props} />
));
SettingsInput.displayName = "SettingsInput";

export const SettingsTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => <Textarea ref={ref} className={cn(className)} {...props} />);
SettingsTextarea.displayName = "SettingsTextarea";

/**
 * Danger hover shared with auth「清除」: keep neutral chrome at rest,
 * only tint red on hover/focus (not solid destructive fill).
 */
export const SETTINGS_DANGER_HOVER_CLASS =
  "hover:border-transparent hover:bg-red-500/10 hover:text-red-400 focus-visible:ring-red-500/20 dark:hover:bg-red-500/15 dark:hover:text-red-400";

export function SettingsPillButton(props: {
  label: string;
  onClick?: () => void;
  testId?: string;
  disabled?: boolean;
  /** Danger action: normal chrome by default, red only on hover. */
  danger?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
}) {
  return (
    <Button
      type={props.type ?? "button"}
      data-testid={props.testId}
      disabled={props.disabled}
      // Keep secondary chrome for danger — destructive paints solid red at rest.
      variant="secondary"
      size="sm"
      className={cn(props.danger && SETTINGS_DANGER_HOVER_CLASS, props.className)}
      onClick={props.onClick}
    >
      {props.label}
    </Button>
  );
}

export function SettingsButton(
  props: React.ComponentProps<typeof Button> & { testId?: string; danger?: boolean },
) {
  const { testId, className, size = "sm", variant = "secondary", danger, ...rest } = props;
  return (
    <Button
      {...(testId !== undefined ? { "data-testid": testId } : {})}
      size={size}
      // Danger actions stay secondary at rest (auth clear pattern), not solid destructive.
      variant={danger ? "secondary" : variant}
      className={cn(danger && SETTINGS_DANGER_HOVER_CLASS, className)}
      {...rest}
    />
  );
}

export function SettingsIconButton(
  props: React.ComponentProps<typeof Button> & { testId?: string; danger?: boolean },
) {
  const { testId, className, size = "icon-sm", variant = "ghost", danger, ...rest } = props;
  return (
    <Button
      {...(testId !== undefined ? { "data-testid": testId } : {})}
      size={size}
      variant={variant}
      className={cn(danger && SETTINGS_DANGER_HOVER_CLASS, className)}
      {...rest}
    />
  );
}

export function SettingsLink(props: {
  children: ReactNode;
  onClick?: () => void;
  testId?: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="link"
      data-testid={props.testId}
      className={cn("h-auto p-0", props.className)}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  );
}

export {
  Button,
  buttonVariants,
  Input,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
};
