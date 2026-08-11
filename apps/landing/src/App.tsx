import { AlwaysRunning } from "./components/AlwaysRunning.tsx";
import { Download } from "./components/Download.tsx";
import { Faq } from "./components/Faq.tsx";
import { Features } from "./components/Features.tsx";
import { Hero } from "./components/Hero.tsx";
import { HeroAtmosphere } from "./components/HeroAtmosphere.tsx";
import { PurposeQuote } from "./components/PurposeQuote.tsx";
import { SiteFooter } from "./components/SiteFooter.tsx";
import { SiteHeader } from "./components/SiteHeader.tsx";
import { Why } from "./components/Why.tsx";
import { useReveal } from "./hooks/useReveal.ts";

export function App() {
  useReveal();

  return (
    <div className="relative isolate min-h-dvh overflow-x-clip bg-background text-foreground">
      {/* Page dot grid — appears below the fold via mask */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20"
        style={{
          backgroundImage: "radial-gradient(oklch(1 0 0 / 0.1) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
          maskImage: "linear-gradient(to bottom, transparent 64rem, black 90rem)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 64rem, black 90rem)",
        }}
      />

      <HeroAtmosphere />

      <SiteHeader />
      <div aria-hidden="true" className="h-[68px] sm:h-[72px]" />

      <main>
        <Hero />
        <Features />
        <Why />
        <AlwaysRunning />
        <PurposeQuote />
        <Download />
        <Faq />
      </main>

      <SiteFooter />
    </div>
  );
}
