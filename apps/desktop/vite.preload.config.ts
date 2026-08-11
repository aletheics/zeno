import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "vite-plus";

const external = ["electron", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

export default defineConfig({
  build: {
    outDir: resolve(import.meta.dirname, "dist/preload"),
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: resolve(import.meta.dirname, "src/preload/index.ts"),
      formats: ["cjs"],
      fileName: () => "preload.cjs",
    },
    rollupOptions: { external },
  },
});
