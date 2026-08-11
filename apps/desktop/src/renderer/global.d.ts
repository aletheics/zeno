import type { ZenoDesktopApi } from "@zeno/contracts";

declare global {
  interface Window {
    zeno: ZenoDesktopApi;
  }
}

export {};
