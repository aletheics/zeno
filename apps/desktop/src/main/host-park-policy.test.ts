import { describe, expect, it } from "vite-plus/test";
import {
  findParkedSessionKeyByCwd,
  idleParkedCount,
  MAX_PARKED_HOSTS,
  normalizeHostCwdKey,
  PARKED_IDLE_TTL_MS,
  pickExpiredIdleParkKeys,
  pickParkedEvictionKey,
  shouldForwardParkedRuntimeEvent,
  shouldParkForeground,
  type ParkedHostRef,
} from "./host-park-policy.ts";

function ref(partial: Partial<ParkedHostRef> & { sessionKey: string }): ParkedHostRef {
  return {
    busy: false,
    parkedAt: 0,
    ...partial,
  };
}

describe("host-park-policy", () => {
  it("normalizes cwd keys across separators and trailing slashes", () => {
    expect(normalizeHostCwdKey("C:\\proj\\a\\")).toBe(normalizeHostCwdKey("C:/proj/a"));
  });

  it("finds a parked host by workspace cwd", () => {
    const parked = [
      ref({ sessionKey: "s1", workspaceCwd: "/proj/a" }),
      ref({ sessionKey: "s2", snapshotCwd: "/proj/b", busy: true }),
    ];
    expect(findParkedSessionKeyByCwd(parked, "/proj/a")).toBe("s1");
    expect(findParkedSessionKeyByCwd(parked, "/proj/b/")).toBe("s2");
    expect(findParkedSessionKeyByCwd(parked, "/proj/c")).toBeUndefined();
  });

  it("evicts the oldest idle park and never a busy one", () => {
    expect(MAX_PARKED_HOSTS).toBeGreaterThanOrEqual(2);
    const parked = [
      ref({ sessionKey: "busy-old", workspaceCwd: "/a", busy: true, parkedAt: 1 }),
      ref({ sessionKey: "idle-new", workspaceCwd: "/b", parkedAt: 30, idleSince: 30 }),
      ref({ sessionKey: "idle-old", workspaceCwd: "/c", parkedAt: 10, idleSince: 10 }),
      ref({ sessionKey: "busy-new", workspaceCwd: "/d", busy: true, parkedAt: 40 }),
    ];
    expect(pickParkedEvictionKey(parked)).toBe("idle-old");
    expect(
      pickParkedEvictionKey([
        ref({ sessionKey: "b1", busy: true, parkedAt: 1 }),
        ref({ sessionKey: "b2", busy: true, parkedAt: 2 }),
      ]),
    ).toBeUndefined();
    expect(idleParkedCount(parked)).toBe(2);
  });

  it("reaps idle parks after the warm TTL and leaves busy ones", () => {
    expect(PARKED_IDLE_TTL_MS).toBe(10 * 60 * 1000);
    const now = 20 * 60 * 1000;
    const parked = [
      ref({ sessionKey: "expired", parkedAt: 0, idleSince: 0 }),
      ref({ sessionKey: "fresh", parkedAt: now - 1_000, idleSince: now - 1_000 }),
      ref({ sessionKey: "busy", busy: true, parkedAt: 0 }),
    ];
    expect(pickExpiredIdleParkKeys(parked, now)).toEqual(["expired"]);
    expect(pickExpiredIdleParkKeys(parked, now, 0)).toEqual([]);
  });

  it("forwards parked lifecycle events and skips agent.started", () => {
    expect(shouldForwardParkedRuntimeEvent("agent.settled")).toBe(true);
    expect(shouldForwardParkedRuntimeEvent("retry.started")).toBe(true);
    expect(shouldForwardParkedRuntimeEvent("tool.started")).toBe(true);
    expect(shouldForwardParkedRuntimeEvent("message.delta")).toBe(true);
    expect(shouldForwardParkedRuntimeEvent("agent.started")).toBe(false);
    expect(shouldForwardParkedRuntimeEvent("queue.updated")).toBe(false);
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
