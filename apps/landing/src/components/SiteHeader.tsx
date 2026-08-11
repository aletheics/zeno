import { Glass } from "./Glass.tsx";
import { PixMark } from "./PixMark.tsx";

const DOWNLOAD_HREF = "https://github.com/num-scope/pix/releases/latest";

const navLink =
  "rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted/40 hover:text-foreground";

export function SiteHeader() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-4 sm:pt-4">
      <header className="pointer-events-auto relative mx-auto h-14 w-full max-w-6xl rounded-2xl">
        <div aria-hidden="true" className="absolute inset-0">
          <Glass className="h-full rounded-2xl border border-border/50 shadow-lg shadow-black/10" />
        </div>
        <div className="relative z-10 flex h-full items-center gap-3 px-3 sm:gap-4 sm:px-4">
          <a
            href="/"
            aria-label="Zeno — home"
            className="flex shrink-0 items-center gap-2.5 text-foreground transition-opacity duration-150 hover:opacity-80"
          >
            <PixMark className="size-7" />
            <span className="text-[15px] font-semibold tracking-tight">Zeno</span>
          </a>
          <nav className="ml-auto hidden items-center gap-0.5 sm:flex">
            <a href="#features" className={navLink}>
              Features
            </a>
            <a href="#why" className={navLink}>
              Why Zeno
            </a>
            <a
              href="https://github.com/num-scope/pix"
              target="_blank"
              rel="noopener noreferrer"
              className={navLink}
            >
              GitHub
            </a>
            <a href="#download" className={navLink}>
              Download
            </a>
          </nav>
          <a
            href={DOWNLOAD_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-transform duration-150 hover:-translate-y-px active:translate-y-0 sm:ml-0"
          >
            Download
          </a>
        </div>
      </header>
    </div>
  );
}
