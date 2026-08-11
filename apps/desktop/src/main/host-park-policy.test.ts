import { describe, expect, it } from "vite-plus/test";
import {
  findParkedSessionKeyByCwd,
  MAX_PARKED_HOSTS,
  normalizeHostCwdKey,
  pickParkedEvictionKey,
  shouldParkForeground,
} from "./host-park-policy.ts";

describe("host-park-policy", () => {
  it("normalizes cwd keys across separators and trailing slashes", () => {
    expect(normalizeHostCwdKey("C:\\proj\\a\\")).toBe(normalizeHostCwdKey("C:/proj/a"));
  });

  it("finds a parked host by workspace cwd", () => {
    const parked = [
      { sessionKey: "s1", workspaceCwd: "/proj/a", busy: false },
      { sessionKey: "s2", snapshotCwd: "/proj/b", busy: true },
    ];
    expect(findParkedSessionKeyByCwd(parked, "/proj/a")).toBe("s1");
    expect(findParkedSessionKeyByCwd(parked, "/proj/b/")).toBe("s2");
    expect(findParkedSessionKeyByCwd(parked, "/proj/c")).toBeUndefined();
  });

  it("evicts idle before busy when over capacity", () => {
    expect(MAX_PARKED_HOSTS).toBeGreaterThanOrEqual(2);
    const parked = [
      { sessionKey: "busy-old", workspaceCwd: "/a", busy: true },
      { sessionKey: "idle", workspaceCwd: "/b", busy: false },
      { sessionKey: "busy-new", workspaceCwd: "/c", busy: true },
    ];
    expect(pickParkedEvictionKey(parked)).toBe("idle");
    expect(
      pickParkedEvictionKey([
        { sessionKey: "b1", busy: true },
        { sessionKey: "b2", busy: true },
      ]),
    ).toBe("b1");
  });

  it("parks idle foreground only when allowIdle is set", () => {
    const base = {
      hasHost: true,
      hasSnapshot: true,
      hostStopping: false,
      busy: false,
      sessionKey: "s1",
    };
    expect(shouldParkForeground({ ...base, allowIdle: false })).toBe(false);
    expect(shouldParkForeground({ ...base, allowIdle: true })).toBe(true);
    expect(shouldParkForeground({ ...base, allowIdle: true, busy: true })).toBe(true);
    expect(shouldParkForeground({ ...base, allowIdle: true, sessionKey: undefined })).toBe(false);
    expect(shouldParkForeground({ ...base, allowIdle: true, hasHost: false })).toBe(false);
  });
});
