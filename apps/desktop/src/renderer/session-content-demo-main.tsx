/**
 * Browser entry for the real session-content demo.
 * Outside Electron there is no preload `window.zeno` — install a stub first so
 * TimelineRow attachment previews / file opens do not throw on mount.
 */
import { StrictMode, Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { SessionContentDemoApp } from "./SessionContentDemoApp.tsx";
import { isPreviewableImagePath } from "./lib/composer-suggestions.ts";

/** Visible 96×56 demo PNG (slate panel + cyan bar) for attachment + markdown image previews. */
const DEMO_IMAGE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAAA4CAYAAAACRf2iAAAAi0lEQVR42u3bsQ1AEQBFURv8UqdnAonZ7aXzh5Agcoq7wDv1C18sU+cKRgAAQAAACAAAXQiQctNCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwA0A8pABIAAABOBNgNrH1LkAAABgCAAABACAAADQ5n5W7X3OJ+TI/wAAAABJRU5ErkJggg==";

function installBrowserPixStub(): void {
  if (typeof window === "undefined") return;
  // Only skip if a real Electron preload already installed workspace APIs.
  const existing = window.zeno as { workspace?: { readAttachmentPreview?: unknown } } | undefined;
  if (existing?.workspace && typeof existing.workspace.readAttachmentPreview === "function") {
    return;
  }

  const workspace = {
    openFile: async (path: string) => {
      console.info("[session-content-demo] openFile", path);
    },
    openExternal: async (url: string) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    // Markdown MediaContent + attachment chips both use this (file:// is blocked on http demos).
    readAttachmentPreview: async (path: string) => {
      if (isPreviewableImagePath(path)) {
        return DEMO_IMAGE_DATA_URL;
      }
      return undefined;
    },
  };

  window.zeno = { workspace } as unknown as Window["zeno"];
}

class DemoErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[session-content-demo]", error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div
          style={{
            fontFamily: "system-ui, sans-serif",
            padding: 24,
            maxWidth: 720,
            margin: "40px auto",
            color: "#f5f5f5",
            background: "#1a1a1a",
            borderRadius: 12,
            border: "1px solid #444",
          }}
        >
          <h1 style={{ fontSize: 18, marginTop: 0 }}>Demo crashed</h1>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 12,
              color: "#f07178",
              background: "#111",
              padding: 12,
              borderRadius: 8,
            }}
          >
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <p style={{ color: "#acacac", fontSize: 13 }}>
            Do not open via <code>file://</code>. Run{" "}
            <code>pnpm --filter @zeno/desktop demo:session-content</code>.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function boot(): void {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("#root missing");

  if (location.protocol === "file:") {
    rootEl.innerHTML = `
      <div style="font-family:system-ui;max-width:36rem;margin:3rem auto;padding:1.25rem;line-height:1.55;color:#e8e8e8;background:#191919;border-radius:12px;border:1px solid #333">
        <h1 style="font-size:1.15rem;margin:0 0 0.75rem">不能用 file:// 打开</h1>
        <p style="margin:0 0 0.75rem;color:#acacac">本 demo 是 ES module 构建产物，浏览器禁止从本地文件加载模块，所以会黑屏。</p>
        <p style="margin:0 0 0.5rem">在仓库根目录执行：</p>
        <pre style="background:#0d0d0d;padding:12px;border-radius:8px;overflow:auto;font-size:12px;margin:0 0 0.75rem">pnpm --filter @zeno/desktop demo:session-content</pre>
        <p style="margin:0;color:#acacac;font-size:13px">会构建并打开 <code>http://127.0.0.1:4177/session-content-demo.html</code></p>
      </div>`;
    return;
  }

  installBrowserPixStub();

  createRoot(rootEl).render(
    <StrictMode>
      <DemoErrorBoundary>
        <SessionContentDemoApp />
      </DemoErrorBoundary>
    </StrictMode>,
  );
}

boot();
