import type { ReactNode } from "react";
import { SkyCanvas } from "./SkyCanvas.tsx";

type Feature = {
  title: string;
  body: string;
  icon: ReactNode;
  delay: string;
  extra?: ReactNode;
};

const features: Feature[] = [
  {
    title: "Sessions that stick.",
    body: "Projects and threads stay organized in the sidebar. Pick up where you left off — workspace, model, and history restore with the desktop app.",
    delay: "0ms",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 4v5h-5" />
      </svg>
    ),
  },
  {
    title: "See everything at a glance.",
    body: "Which runs are busy, which need input, which are done. The sidebar and timeline read like a dashboard so nothing waits unnoticed.",
    delay: "60ms",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    extra: (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-status-busy" />
          Busy
        </span>
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-status-done" />
          Done
        </span>
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-status-attention" />
          Needs you
        </span>
      </div>
    ),
  },
  {
    title: "Terminal is first-class.",
    body: "Drop into embedded pi TUI for the same session when you want the real CLI surface — not a lowest-common-denominator chat wrapper.",
    delay: "120ms",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="m7 15 3-3-3-3" />
        <path d="M12 15h5" />
      </svg>
    ),
  },
  {
    title: "Native pi, not a fork.",
    body: "Models, API keys, settings, packages, and tools live where pi expects them. Zeno is a desktop app for the agent — not a parallel config universe.",
    delay: "180ms",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3v18" />
        <path d="M5 8h14" />
        <path d="M7 12h10" />
        <path d="M9 16h6" />
      </svg>
    ),
  },
  {
    title: "Projects as home bases.",
    body: "Open a workspace, keep threads per project, and jump between them without losing context. Built for how you actually juggle repos.",
    delay: "240ms",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
  {
    title: "Windows, macOS, Linux.",
    body: "Packaged installers for the platforms you ship on — NSIS, DMG, AppImage, and deb — ready for your release pipeline.",
    delay: "300ms",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8" />
        <path d="M12 16v4" />
      </svg>
    ),
  },
];

/**
 * Feature cards — surface color / border / inset / hover / reveal delays match production marketing markup.
 * Section backdrop: inverted WebGL mist (not sky), height 72%, vertical soft mask.
 */
export function Features() {
  return (
    <section id="features" className="relative isolate scroll-mt-24 overflow-hidden">
      {/* Drifting mist wash behind the card grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent, black 35%, black 55%, transparent 72%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent, black 35%, black 55%, transparent 72%)",
        }}
      >
        <SkyCanvas mode="mist" className="absolute inset-x-0 top-0 h-[72%] w-full -scale-y-100" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-6 pb-24 pt-10 sm:pb-32 sm:pt-14">
        <div
          data-reveal=""
          style={{ ["--reveal-delay" as string]: "0ms" }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Built for the way you actually run agents.
          </h2>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              data-reveal=""
              style={{ ["--reveal-delay" as string]: f.delay }}
              className="flex scroll-mt-24 flex-col gap-4 rounded-2xl border border-white/[0.08] bg-[oklch(0.17_0.005_285_/_0.92)] p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-colors hover:bg-[oklch(0.19_0.005_285_/_0.94)]"
            >
              <span className="flex size-10 items-center justify-center rounded-xl border border-border/60 bg-foreground/[0.03] text-foreground/80">
                {f.icon}
              </span>
              <h3 className="text-xl font-semibold tracking-tight">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              {f.extra}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
