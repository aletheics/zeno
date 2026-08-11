import { useEffect } from "react";

/**
 * Scroll reveal: sets `data-reveal="in"` when the element enters the viewport.
 * CSS transitions from the default hidden state into `[data-reveal="in"]`.
 */
export function useReveal() {
  useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-reveal='in'])"),
    );
    // Also re-query all data-reveal (including empty string attribute)
    const all = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]")).filter(
      (el) => el.getAttribute("data-reveal") !== "in",
    );
    const targets = all.length > 0 ? all : nodes;
    if (targets.length === 0) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const node of targets) node.setAttribute("data-reveal", "in");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).setAttribute("data-reveal", "in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    for (const node of targets) observer.observe(node);
    return () => observer.disconnect();
  }, []);
}
