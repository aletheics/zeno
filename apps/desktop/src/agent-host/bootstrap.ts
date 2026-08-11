/**
 * Agent Host entry: optionally register pi SDK resolve hook, then load the host.
 * Must stay free of static imports of @earendil-works/pi-coding-agent.
 */
import { existsSync } from "node:fs";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = process.env.PIX_PI_SDK_SOURCE?.trim();
const root = process.env.PIX_PI_SDK_ROOT?.trim();

if (source === "global" && root) {
  const hookPath = join(here, "pi-sdk-hook.mjs");
  if (existsSync(hookPath)) {
    try {
      register(pathToFileURL(hookPath).href);
      console.log(`[agent-host] pi SDK hook → ${root}`);
    } catch (error) {
      console.warn("[agent-host] failed to register pi SDK hook:", error);
    }
  } else {
    console.warn(`[agent-host] pi SDK hook missing at ${hookPath}`);
  }
}

// Sibling module produced by vite multi-entry (not bundled into this file).
const appSpecifier = new URL(/* @vite-ignore */ "./agent-host-app.mjs", import.meta.url).href;
await import(/* @vite-ignore */ appSpecifier);
