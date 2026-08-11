import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { defineConfig } from "vite-plus";

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5174,
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
  },
});
