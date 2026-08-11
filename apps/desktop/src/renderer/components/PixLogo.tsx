/**
 * Zeno brand mark — matches apps/desktop/build/icon.svg (white plate + black π).
 * Used in sidebar, empty hero, and any in-app chrome. Keep geometry in sync with icon.svg.
 */
import { cn } from "../lib/utils.ts";

/**
 * Source art is 1024×1024. Bars are expressed in that space and scaled via viewBox.
 * - plate rx 229
 * - crossbar (250,298) 524×104 rx52
 * - left stem (308,350) 100×378 rx50
 * - right stem (548,350) 100×300 rx50
 */
export function PixLogo(props: { className?: string; title?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      fill="none"
      className={cn("size-5 shrink-0", props.className)}
      role="img"
      aria-label={props.title ?? "Zeno"}
    >
      <title>{props.title ?? "Zeno"}</title>
      <rect width="1024" height="1024" rx="229" ry="229" fill="#FFFFFF" />
      <g fill="#0A0A0A">
        <rect x="250" y="298" width="524" height="104" rx="52" />
        <rect x="308" y="350" width="100" height="378" rx="50" />
        <rect x="548" y="350" width="100" height="300" rx="50" />
      </g>
    </svg>
  );
}
