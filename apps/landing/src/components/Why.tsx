export function Why() {
  return (
    <section id="why" className="relative scroll-mt-24 overflow-hidden">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-24 sm:py-32 lg:grid-cols-2 lg:gap-16">
        <div>
          <div data-reveal="" style={{ ["--reveal-delay" as string]: "0ms" }}>
            <p className="font-mono text-xs tracking-wide text-muted-foreground/70">Why Zeno</p>
            <p className="mt-4 text-balance text-2xl font-semibold leading-snug tracking-tight text-foreground sm:text-3xl">
              Built for pi — not a fork of it.
            </p>
          </div>
          <div
            data-reveal=""
            style={{ ["--reveal-delay" as string]: "80ms" }}
            className="mt-8 space-y-6 text-lg leading-relaxed text-muted-foreground"
          >
            <p>
              Coding agents improve fastest as CLIs. Zeno is a better desktop app for the pi agent:
              sessions, projects, composer, and terminal mode — while configuration stays on the
              native agent side.
            </p>
            <p>
              Keys, models, packages, and tools match interactive{" "}
              <span className="font-mono text-foreground/90">pi</span>. Chat when you want
              structure; embedded TUI when you want the full terminal. Local-first — no account wall
              for core use.
            </p>
          </div>
        </div>

        <div data-reveal="" style={{ ["--reveal-delay" as string]: "120ms" }} className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-10 -top-8 bottom-0 -z-10 rounded-[3rem] bg-[radial-gradient(60%_60%_at_50%_0%,oklch(0.7_0_0/0.12),transparent_70%)] blur-2xl"
          />
          <div className="overflow-hidden rounded-2xl border border-white/[0.10] shadow-[0_28px_56px_-18px_rgba(0,0,0,0.58)] ring-1 ring-inset ring-white/[0.05]">
            <img
              src="/zeno-desktop.png"
              alt="Zeno desktop shell with sidebar navigation and composer"
              className="block h-auto w-full object-cover object-top"
              decoding="async"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
