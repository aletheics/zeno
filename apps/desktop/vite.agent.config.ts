import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite-plus";

const external = [
  "electron",
  "@earendil-works/pi-coding-agent",
  "@silvia-odwyer/photon-node",
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
];

/** Copy plain ESM hook next to agent-host outputs (not bundled). */
function copyPiSdkHook(): Plugin {
  return {
    name: "copy-pi-sdk-hook",
    closeBundle() {
      const outDir = resolve(import.meta.dirname, "dist/agent-host");
      mkdirSync(outDir, { recursive: true });
      const src = resolve(import.meta.dirname, "src/agent-host/pi-sdk-hook.mjs");
      const dest = resolve(outDir, "pi-sdk-hook.mjs");
      if (existsSync(src)) copyFileSync(src, dest);
    },
  };
}

export default defineConfig({
  plugins: [copyPiSdkHook()],
  build: {
    target: "node24",
    outDir: resolve(import.meta.dirname, "dist/agent-host"),
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      // bootstrap registers optional SDK hook, then loads agent-host-app.
      entry: {
        "agent-host": resolve(import.meta.dirname, "src/agent-host/bootstrap.ts"),
        "agent-host-app": resolve(import.meta.dirname, "src/agent-host/index.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.mjs`,
    },
    rollupOptions: { external },
  },
});
