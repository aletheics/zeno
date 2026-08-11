import { describe, expect, it } from "vite-plus/test";
import {
  LINUX_CAPTION_BUTTONS_WIDTH_PX,
  MAC_TRAFFIC_LIGHT_GUTTER_PX,
  MAC_TRAFFIC_LIGHT_INSET_X_PX,
  NON_MAC_TITLEBAR_LEADING_GUTTER_PX,
  TITLEBAR_HEIGHT_PX,
  getMacTrafficLightPosition,
  isMacDesktopChrome,
  isWindowsDesktopChrome,
  titlebarControlTopPx,
  titlebarLeadingGutterPx,
} from "./desktop-chrome.ts";

describe("desktop chrome geometry", () => {
  it("centers traffic lights on the 46px titlebar", () => {
    expect(TITLEBAR_HEIGHT_PX).toBe(46);
    const pos = getMacTrafficLightPosition();
    expect(pos.x).toBe(MAC_TRAFFIC_LIGHT_INSET_X_PX);
    expect(pos.y + 7).toBe(TITLEBAR_HEIGHT_PX / 2);
  });

  it("places toggle after a 90px gutter on mac and a small pad elsewhere", () => {
    expect(MAC_TRAFFIC_LIGHT_GUTTER_PX).toBe(90);
    expect(MAC_TRAFFIC_LIGHT_GUTTER_PX).toBeGreaterThan(MAC_TRAFFIC_LIGHT_INSET_X_PX + 40);
    expect(NON_MAC_TITLEBAR_LEADING_GUTTER_PX).toBe(12);
    expect(titlebarLeadingGutterPx(true)).toBe(MAC_TRAFFIC_LIGHT_GUTTER_PX);
    expect(titlebarLeadingGutterPx(false)).toBe(NON_MAC_TITLEBAR_LEADING_GUTTER_PX);
    expect(titlebarControlTopPx(28)).toBe(9);
    expect(LINUX_CAPTION_BUTTONS_WIDTH_PX).toBeGreaterThan(100);
  });

  it("detects mac / windows desktop chrome from platform / UA", () => {
    expect(isMacDesktopChrome("MacIntel", "Mozilla/5.0 (Macintosh; Intel Mac OS X)")).toBe(true);
    expect(isMacDesktopChrome("Win32", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
    expect(isWindowsDesktopChrome("Win32", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(true);
    expect(isWindowsDesktopChrome("MacIntel", "Mozilla/5.0 (Macintosh; Intel Mac OS X)")).toBe(
      false,
    );
  });
});
