import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "vite-plus";

const nodeBuiltins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

/**
 * Main must not bundle pi (or its CJS tree). Rolldown rewrites nested
 * `require("fs"|"child_process")` into a polyfill that throws in Electron ESM.
 * Same external policy as vite.agent.config.ts.
 */
function isExternal(id: string): boolean {
  if (id === "electron") return true;
  if (id === "electron-updater" || id.startsWith("electron-updater/")) return true;
  if (id === "node-pty" || id.startsWith("node-pty/")) return true;
  if (id.startsWith("@earendil-works/")) return true;
  if (id.startsWith("node:")) return true;
  if (nodeBuiltins.includes(id)) return true;
  // Bare Node builtins used by CJS helpers (fs, path, child_process, …)
  if (builtinModules.includes(id.split("/")[0]!)) return true;
  return false;
}

export default defineConfig({
  build: {
    target: "node24",
    outDir: resolve(import.meta.dirname, "dist/main"),
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: resolve(import.meta.dirname, "src/main/index.ts"),
      formats: ["es"],
      fileName: () => "main.mjs",
    },
    rollupOptions: {
      external: isExternal,
    },
  },
});
