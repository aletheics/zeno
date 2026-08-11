import { Glass } from "./Glass.tsx";
import { ZenoMark } from "./ZenoMark.tsx";
import { SkyCanvas } from "./SkyCanvas.tsx";

const footLink = "text-muted-foreground transition-colors duration-150 hover:text-foreground";

export function SiteFooter() {
  return (
    <footer className="relative mt-20 px-3 pb-3 sm:mt-28 sm:px-4 sm:pb-4">
      <div className="relative isolate mx-auto w-full max-w-6xl">
        {/* Soft mist rising under the footer glass */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl"
          style={{
            maskImage: "linear-gradient(to top, black, transparent 80%)",
            WebkitMaskImage: "linear-gradient(to top, black, transparent 80%)",
          }}
        >
          <SkyCanvas mode="mist" className="h-full w-full -scale-y-100" />
        </div>
        <Glass className="isolate relative rounded-2xl border border-border/50 shadow-lg shadow-black/10">
          <div className="flex flex-col gap-10 px-6 py-12 sm:flex-row sm:items-start sm:justify-between sm:gap-12 sm:py-14">
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <ZenoMark className="size-7" />
                <span className="text-[15px] font-semibold tracking-tight">Zeno</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                A better desktop app for the pi agent. Built for Windows, macOS, and Linux.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-10 gap-y-8 text-sm md:grid-cols-3 md:gap-x-12">
              <div className="flex flex-col gap-2.5">
                <span className="text-sm font-semibold text-foreground">Product</span>
                <a href="#features" className={footLink}>
                  Features
                </a>
                <a href="#why" className={footLink}>
                  Why Zeno
                </a>
                <a href="#download" className={footLink}>
                  Download
                </a>
                <a href="#faq" className={footLink}>
                  FAQ
                </a>
              </div>
              <div className="flex flex-col gap-2.5">
                <span className="text-sm font-semibold text-foreground">Agent</span>
                <a
                  href="https://pi.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={footLink}
                >
                  pi coding agent
                </a>
                <a
                  href="https://github.com/aletheics/zeno"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={footLink}
                >
                  GitHub
                </a>
                <a
                  href="https://github.com/aletheics/zeno/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={footLink}
                >
                  Releases
                </a>
              </div>
              <div className="flex flex-col gap-2.5">
                <span className="text-sm font-semibold text-foreground">Legal</span>
                <a
                  href="https://github.com/aletheics/zeno/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={footLink}
                >
                  License
                </a>
              </div>
            </div>
          </div>
          <div className="border-t border-border/60">
            <div className="flex w-full flex-col gap-2 px-6 py-4 text-sm text-muted-foreground/60 sm:flex-row sm:items-center sm:justify-between sm:py-5">
              <span>© Zeno · for the pi agent</span>
              <span className="inline-flex items-center gap-1.5">Win · macOS · Linux</span>
            </div>
          </div>
        </Glass>
      </div>
    </footer>
  );
}
