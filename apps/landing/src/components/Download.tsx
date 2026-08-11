import { Glass } from "./Glass.tsx";

const DOWNLOAD_HREF = "https://github.com/num-scope/pix/releases/latest";
const REPO_HREF = "https://github.com/num-scope/pix";

export function Download() {
  return (
    <section className="relative px-6 py-24 sm:py-32">
      <div
        data-reveal=""
        style={{ ["--reveal-delay" as string]: "0ms" }}
        className="mx-auto max-w-3xl text-center"
      >
        <h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Free on your machine. Open source on GitHub.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Download installers for Windows, macOS, and Linux — or build from source. Local-first; no
          account required to run.
        </p>
      </div>
      <div
        data-reveal=""
        style={{ ["--reveal-delay" as string]: "120ms" }}
        id="download"
        className="scroll-mt-24 mt-10 text-center"
      >
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={DOWNLOAD_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-primary px-7 text-[15px] font-medium text-primary-foreground shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            Download latest
          </a>
          <Glass
            as="a"
            intensity="cta"
            href={REPO_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-6 text-[15px] font-medium text-foreground/90 transition-transform hover:-translate-y-0.5"
          >
            View source
          </Glass>
        </div>
        <p className="mt-5 text-sm text-muted-foreground/70">
          Free download · Win NSIS · macOS DMG · Linux AppImage + deb
        </p>
      </div>
    </section>
  );
}
