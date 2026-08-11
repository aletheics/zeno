/**
 * Standalone statement band — matches production marketing quote section:
 * max-w-4xl, py-28/36, text-3xl → sm:2.6rem, Instrument Serif italic accent.
 */
export function PurposeQuote() {
  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-28 text-center sm:py-36">
      <div data-reveal="" style={{ ["--reveal-delay" as string]: "0ms" }}>
        <p className="text-balance text-3xl font-medium leading-snug tracking-tight sm:text-[2.6rem] sm:leading-[1.15]">
          No diff viewers. No extra chrome.{" "}
          <span className="font-display text-[1.1em] italic text-muted-foreground">
            On purpose.
          </span>{" "}
          Your agent already lives in the code. Zeno stays focused on the conversation.
        </p>
      </div>
    </section>
  );
}
