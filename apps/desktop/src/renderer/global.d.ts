import type { PixDesktopApi } from "@zeno/contracts";

declare global {
  interface Window {
    pix: PixDesktopApi;
  }
}

export {};
