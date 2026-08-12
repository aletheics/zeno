/**
 * Enable env-based HTTP(S) proxy for undici/fetch used by pi / OpenAI SDK.
 * Must be imported before network calls. Relies on HTTP_PROXY/HTTPS_PROXY set by main.
 *
 * Sets NODE_USE_ENV_PROXY so Node/undici honor proxy env when supported.
 */

import { createRequire } from "node:module";

// On Windows, monkey-patch child_process so spawned commands (npm, pnpm, etc.)
// never flash a console window. Must run before @earendil-works/pi-coding-agent
// is imported, as it uses cross-spawn → cmd.exe without windowsHide: true.
if (process.platform === "win32") {
  const cp = createRequire(import.meta.url)("node:child_process") as typeof import("node:child_process");
  const origSpawn = cp.spawn;
  (cp as Record<string, unknown>).spawn = function (
    command: string,
    args?: readonly string[],
    options?: Parameters<typeof origSpawn>[2],
  ) {
    return origSpawn(command, args as string[], {
      windowsHide: true,
      ...options,
    });
  };
  const origSpawnSync = cp.spawnSync;
  (cp as Record<string, unknown>).spawnSync = function (
    command: string,
    args?: readonly string[],
    options?: Parameters<typeof origSpawnSync>[2],
  ) {
    return origSpawnSync(command, args as string[], {
      windowsHide: true,
      ...options,
    });
  };
}

try {
  const hasProxy = Boolean(
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy,
  );
  if (hasProxy) {
    process.env.NODE_USE_ENV_PROXY = process.env.NODE_USE_ENV_PROXY || "1";
    console.log("[agent-host] HTTP proxy env active (NODE_USE_ENV_PROXY=1)");
  }
} catch {
  // ignore bootstrap failures — network falls back to direct
}
