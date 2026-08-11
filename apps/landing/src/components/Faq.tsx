const faqs = [
  {
    q: "Is Zeno free?",
    a: "Yes. Zeno is open source. Download it, run it locally, and use your own pi agent configuration. There is no account wall for core desktop use.",
  },
  {
    q: "Which agent does it work with?",
    a: "Zeno is a better desktop app for the pi coding agent. Configuration, packages, sessions, and tools stay on the native pi side (~/.pi/agent).",
  },
  {
    q: "Is it just a chat UI?",
    a: "No. You get a Codex-style chat surface and a first-class embedded pi TUI for the same session — so you are not locked into a lowest-common-denominator wrapper.",
  },
  {
    q: "Does it replace pi?",
    a: "No. Zeno is a desktop app for pi, not a fork. Models, API keys, settings, packages, and tools match interactive pi — not a parallel agent runtime with its own secrets store.",
  },
  {
    q: "Which platforms are supported?",
    a: "Windows, macOS, and Linux installers are built in CI (NSIS, DMG arm64+Intel, AppImage + deb). Releases are published on GitHub.",
  },
  {
    q: "Why a desktop app, not only the terminal?",
    a: "Because sessions, projects, and timelines need a calm dashboard — while the terminal remains available when you want the full CLI. Two surfaces, one agent.",
  },
];

export function Faq() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-24 sm:py-32">
      <div data-reveal="" style={{ ["--reveal-delay" as string]: "0ms" }} className="text-center">
        <h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Questions & answers
        </h2>
      </div>
      <div className="mt-12">
        {faqs.map((item, i) => (
          <div key={item.q} data-reveal="" style={{ ["--reveal-delay" as string]: `${i * 60}ms` }}>
            <details className="group border-b border-border/60">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[17px] font-medium text-foreground/90 transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                {item.q}
                <svg
                  viewBox="0 0 24 24"
                  className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </summary>
              <p className="-mt-1 pb-5 pr-8 text-[15px] leading-relaxed text-muted-foreground">
                {item.a}
              </p>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}
