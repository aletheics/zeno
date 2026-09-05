import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { defineConfig } from "vite-plus";

export default defineConfig({
  root: resolve(import.meta.dirname, "src/renderer"),
  base: "./",
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src/renderer"),
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, "dist/renderer"),
    emptyOutDir: true,
    sourcemap: true,
    // Mermaid's generated parser is a lazy 663 kB chunk (143 kB gzip); app entry chunks stay lower.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      // Real session-content demo page (same React stack as chat timeline).
      input: {
        main: resolve(import.meta.dirname, "src/renderer/index.html"),
        "session-content-demo": resolve(
          import.meta.dirname,
          "src/renderer/session-content-demo.html",
        ),
      },
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules[\\/](?:react|react-dom|scheduler|zustand|lucide-react|clsx|tailwind-merge|class-variance-authority)[\\/]/,
            },
            {
              name: "rich-content-vendor",
              test: /node_modules[\\/](?:katex|highlight\.js)[\\/]/,
            },
            {
              name: "markdown-vendor",
              test: /node_modules[\\/](?:react-markdown|remark-[^\\/]+|rehype-[^\\/]+|unified|micromark[^\\/]*|mdast-util-[^\\/]+|hast-util-[^\\/]+|unist-util-[^\\/]+|vfile[^\\/]*|property-information)[\\/]/,
            },
            {
              // Ghostty VT WASM engine — only needed when terminal mode mounts.
              name: "ghostty-web",
              test: /node_modules[\\/]ghostty-web[\\/]/,
            },
          ],
        },
      },
    },
  },
  test: {
    include: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "../agent-host/**/*.test.ts",
      "../main/**/*.test.ts",
    ],
    exclude: ["**/e2e/**", "**/node_modules/**"],
  },
});
