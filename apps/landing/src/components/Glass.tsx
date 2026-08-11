import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "../lib/utils.ts";

type GlassProps<T extends ElementType = "div"> = {
  as?: T;
  children?: ReactNode;
  className?: string;
  /**
   * header — fallback glass (blur 8 / sat 1.5 / tint bg-background/40)
   * cta — secondary button glass (blur 12 / sat 1.2 / tint bg-background/25)
   */
  intensity?: "header" | "cta";
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "className">;

/** Frosted glass shell: blur + translucent fill + dual inset highlight. */
export function Glass<T extends ElementType = "div">({
  as,
  children,
  className,
  intensity = "header",
  ...rest
}: GlassProps<T>) {
  const Comp = as ?? "div";
  // Matches production fallback path: blur(n*4) when displacement map is unavailable.
  const blur = intensity === "cta" ? "blur(12px) saturate(1.2)" : "blur(8px) saturate(1.5)";
  const fill = intensity === "cta" ? "bg-background/25" : "bg-background/40";

  return (
    <Comp data-slot="glass" className={cn("relative isolate", className)} {...rest}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit]"
        style={{
          backdropFilter: blur,
          WebkitBackdropFilter: blur,
        }}
      />
      <span
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-0 -z-10 rounded-[inherit]", fill)}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.40),inset_0_-1px_0_0_rgba(255,255,255,0.08),inset_0_0_24px_-10px_rgba(255,255,255,0.35)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.16),inset_0_-1px_0_0_rgba(255,255,255,0.04),inset_0_0_24px_-10px_rgba(255,255,255,0.10)]"
      />
      {children}
    </Comp>
  );
}
