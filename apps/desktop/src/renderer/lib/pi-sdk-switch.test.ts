import { describe, expect, it } from "vite-plus/test";
import {
  forceForSwitch,
  isBusyError,
  shouldRetryOnBusy,
  type SwitchConfirm,
} from "./pi-sdk-switch.ts";

describe("pi-sdk-switch", () => {
  const pre = (isBusy: boolean): SwitchConfirm => ({
    kind: "pre",
    source: "global",
    message: "",
    isBusy,
  });
  const retry: SwitchConfirm = { kind: "retry", source: "global", message: "" };

  it("detects busy errors by prefix only", () => {
    expect(isBusyError(new Error("PI_SDK_BUSY: agent running"))).toBe(true);
    expect(isBusyError("PI_SDK_BUSY: terminal live")).toBe(true);
    expect(isBusyError(new Error("network down"))).toBe(false);
    expect(isBusyError("plain string")).toBe(false);
    expect(isBusyError(undefined)).toBe(false);
  });

  it("forces the switch only when busy or retrying", () => {
    expect(forceForSwitch(pre(true))).toBe(true);
    expect(forceForSwitch(pre(false))).toBe(false);
    expect(forceForSwitch(retry)).toBe(true);
  });

  it("retries only on a busy error during the first attempt", () => {
    expect(shouldRetryOnBusy(pre(true), new Error("PI_SDK_BUSY: x"))).toBe(true);
    expect(shouldRetryOnBusy(pre(false), new Error("PI_SDK_BUSY: x"))).toBe(true);
    expect(shouldRetryOnBusy(pre(true), new Error("boom"))).toBe(false);
    expect(shouldRetryOnBusy(retry, new Error("PI_SDK_BUSY: x"))).toBe(false);
  });
});
