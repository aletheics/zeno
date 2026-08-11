export function AlwaysRunning() {
  return (
    <section className="relative overflow-hidden px-6 py-24 sm:py-32">
      <div className="mx-auto grid w-full max-w-5xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div data-reveal="" style={{ ["--reveal-delay" as string]: "0ms" }}>
          <p className="font-mono text-xs tracking-wide text-muted-foreground/70">Always ready</p>
          <h2 className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Close the noise. Keep the agent.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            Zeno is a better desktop app for the pi agent — not a harness that reimplements it. When
            you need focus, collapse to the session that matters; when you need the CLI, open
            terminal mode on the same thread.
          </p>
        </div>
        <div data-reveal="" style={{ ["--reveal-delay" as string]: "100ms" }}>
          <div className="overflow-hidden rounded-2xl border border-white/[0.10] shadow-[0_28px_56px_-18px_rgba(0,0,0,0.58)] ring-1 ring-inset ring-white/[0.05]">
            <img
              src="/terminal-session.png"
              alt="Zeno ready to start a conversation with project context"
              className="block h-auto w-full object-cover object-top"
              decoding="async"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
