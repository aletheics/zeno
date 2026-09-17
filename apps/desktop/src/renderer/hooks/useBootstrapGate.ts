import { useEffect, useRef, useState } from "react";
import { t, type Locale } from "@/lib/i18n";

/* The cold-start gate, lifted out of `App()`: sequence the opening work behind a status
 * overlay, and make sure the shell comes up even when a step fails.
 *
 * The shell supplies the work; this owns the ordering, the cancellation, and the
 * failure-then-best-effort-retry path. Keeping the sequence testable matters because it is
 * what a user stares at when the app seems not to start. */

/** How long "ready" stays readable before the shell appears over it. */
const READY_BEAT_MS = 180;

export type BootstrapPhase = () => Promise<unknown>;

export type BootstrapPhases = {
  /** Discover recent workspaces. */
  workspaces: BootstrapPhase;
  /** Ensure the Agent Host / pi runtime is up. */
  host: BootstrapPhase;
  /** Load the conversation catalogue. */
  config: BootstrapPhase;
  /** Project an auto-resumed session, which starts before this window subscribes. */
  hydrate: BootstrapPhase;
};

export function useBootstrapGate(options: {
  /** Read fresh at each step: a language switch mid-boot should be reflected. */
  getLocale: () => Locale;
  phases: BootstrapPhases;
  /** Mirror the human-readable status somewhere visible outside the overlay. */
  onStatus: (status: string) => void;
}) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState(() => t(options.getLocale(), "boot.starting"));
  const [detail, setDetail] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  /* The effect below must run exactly once — its predecessor in `App()` was deliberately
   * `[]` with an eslint-disable, because re-running cold start would restart the host and
   * replay every status. Injected callbacks therefore go through a ref rather than the
   * dependency array, so the latest closures are used without re-arming the effect. */
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    let cancelled = false;
    const setBoot = (next: string, nextDetail?: string) => {
      if (cancelled) return;
      setStatus(next);
      setDetail(nextDetail);
      latest.current.onStatus(next);
    };

    void (async () => {
      const { getLocale, phases } = latest.current;
      try {
        setBoot(t(getLocale(), "boot.starting"));
        if (cancelled) return;

        setBoot(t(getLocale(), "boot.workspaces"));
        await phases.workspaces();
        if (cancelled) return;

        setBoot(t(getLocale(), "boot.host"));
        await phases.host();
        if (cancelled) return;

        setBoot(t(getLocale(), "boot.config"));
        await phases.config();
        if (cancelled) return;
        await phases.hydrate();
        if (cancelled) return;

        setBoot(t(getLocale(), "boot.ready"));
        // Brief beat so "ready" is readable before the shell appears.
        await new Promise((resolve) => window.setTimeout(resolve, READY_BEAT_MS));
      } catch (caught) {
        if (cancelled) return;
        const message = caught instanceof Error ? caught.message : String(caught);
        setBoot(t(getLocale(), "boot.failed", { detail: message }));
        setError(message);
        // Still try to bring the shell up, so a failed step does not strand the user on
        // the overlay forever. Secondary failures are ignored.
        try {
          const { phases: retry } = latest.current;
          await retry.workspaces();
          await retry.host();
          await retry.config();
          await retry.hydrate();
        } catch {
          // ignore
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    ready,
    status,
    detail,
    error,
    /** True once a step failed, even though the shell is allowed to come up. */
    degraded: error !== undefined,
  };
}
