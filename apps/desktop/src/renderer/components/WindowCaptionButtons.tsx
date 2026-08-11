/**
 * Self-drawn window caption buttons for Linux (titleBarStyle: hidden, no titleBarOverlay).
 * Windows uses native caption buttons via Electron titleBarOverlay.
 */
import { useEffect, useState } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import { TITLEBAR_HEIGHT_PX, titlebarControlTopPx } from "../lib/desktop-chrome.ts";
import { cn } from "../lib/utils.ts";

export function WindowCaptionButtons() {
  const [visible, setVisible] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        const runtime = await window.pix.app.getRuntime();
        if (cancelled || !runtime.customWindowControls) return;
        setVisible(true);
        document.documentElement.dataset.customWindowControls = "true";
        const isMax = await window.pix.window.isMaximized();
        if (!cancelled) setMaximized(isMax);
        unsub = window.pix.window.onStateChange((state) => {
          setMaximized(state.isMaximized);
        });
      } catch {
        // Browser / tests without full desktop API.
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
      delete document.documentElement.dataset.customWindowControls;
    };
  }, []);

  if (!visible) return null;

  const btnSize = 28;
  const top = titlebarControlTopPx(btnSize);

  return (
    <div
      className="window-caption-buttons no-drag"
      data-testid="window-caption-buttons"
      style={{ height: TITLEBAR_HEIGHT_PX, top: 0 }}
      role="group"
      aria-label="Window"
    >
      <button
        type="button"
        className="window-caption-btn"
        style={{ width: btnSize, height: btnSize, marginTop: top }}
        title="Minimize"
        aria-label="Minimize"
        data-testid="window-minimize"
        onClick={() => void window.pix.window.minimize()}
      >
        <Minus className="size-3.5" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className="window-caption-btn"
        style={{ width: btnSize, height: btnSize, marginTop: top }}
        title={maximized ? "Restore" : "Maximize"}
        aria-label={maximized ? "Restore" : "Maximize"}
        data-testid="window-maximize"
        onClick={() => void window.pix.window.toggleMaximize()}
      >
        {maximized ? (
          <Copy className="size-3.5 scale-x-[-1]" strokeWidth={1.75} />
        ) : (
          <Square className="size-3" strokeWidth={1.75} />
        )}
      </button>
      <button
        type="button"
        className={cn("window-caption-btn window-caption-btn-close")}
        style={{ width: btnSize, height: btnSize, marginTop: top }}
        title="Close"
        aria-label="Close"
        data-testid="window-close"
        onClick={() => void window.pix.window.close()}
      >
        <X className="size-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}
