/**
 * Pure helpers for proxy settings discover UX (mode must never flip on discover).
 */
import type { DesktopLocalProxyCandidate, DesktopProxyChannel } from "@zeno/contracts";

/**
 * Apply discover results onto a channel. **Mode is never changed** — only `server`
 * (and the multi-candidate list) update. Regression: first Discover under custom
 * must leave mode as `"custom"`.
 */
export function applyDiscoverResults(
  channel: DesktopProxyChannel,
  found: DesktopLocalProxyCandidate[],
): {
  channel: DesktopProxyChannel;
  candidates: DesktopLocalProxyCandidate[];
  filledUrl?: string;
} {
  const mode = channel.mode;
  if (found.length === 0) {
    return { channel: { ...channel, mode }, candidates: [] };
  }
  const best = found[0]!;
  return {
    channel: {
      ...channel,
      mode,
      server: best.url,
    },
    candidates: found.length > 1 ? found : [],
    filledUrl: best.url,
  };
}
