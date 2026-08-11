import { cn } from "../lib/utils.ts";

/** Zeno brand mark — same geometry as desktop app icon. */
export function PixMark(props: { className?: string; title?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      fill="none"
      className={cn("size-7 shrink-0", props.className)}
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
