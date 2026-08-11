import { describe, expect, it } from "vite-plus/test";
import {
  buildPiTuiArgs,
  normalizeSessionKey,
  PiTuiExclusiveGuard,
  planPiTuiLaunch,
} from "./pi-tui-session.ts";

describe("pi-tui-session", () => {
  it("builds pi --session args from the real session file path", () => {
    const file = "C:\\Users\\me\\Zeno\\conversations\\s1.jsonl";
    expect(buildPiTuiArgs(file)).toEqual(["--session", file]);
    expect(() => buildPiTuiArgs("  ")).toThrow(/sessionFile/i);
  });

  it("plans a launch that reuses the same session path and cwd", () => {
    const plan = planPiTuiLaunch({
      sessionFile: "/tmp/work/session.jsonl",
      cwd: "/tmp/work",
      cols: 120,
      rows: 40,
    });
    expect(plan.sessionFile).toBe("/tmp/work/session.jsonl");
    expect(plan.cwd).toBe("/tmp/work");
    expect(plan.args).toEqual(["--session", "/tmp/work/session.jsonl"]);
    expect(plan.sessionKey).toBe(normalizeSessionKey("/tmp/work/session.jsonl"));
    expect(plan.cols).toBe(120);
    expect(plan.rows).toBe(40);
  });

  it("normalizes session keys so path separators do not dual-attach", () => {
    expect(normalizeSessionKey("C:\\a\\b.jsonl")).toBe(normalizeSessionKey("C:/a/b.jsonl"));
  });

  it("collapses macOS /private firmlink so park keys match across hops", () => {
    expect(normalizeSessionKey("/private/var/folders/xx/s.jsonl")).toBe(
      normalizeSessionKey("/var/folders/xx/s.jsonl"),
    );
  });

  it("enforces mutual exclusion: one TUI owner, host prompt blocked while active", () => {
    const guard = new PiTuiExclusiveGuard();
    const a = normalizeSessionKey("/sessions/a.jsonl");
    const b = normalizeSessionKey("/sessions/b.jsonl");

    expect(guard.tryAcquire(a)).toEqual({ ok: true });
    expect(guard.isActive()).toBe(true);
    expect(guard.owns(a)).toBe(true);
    // Same session re-open is idempotent
    expect(guard.tryAcquire(a)).toEqual({ ok: true });
    // Different session blocked
    const denied = guard.tryAcquire(b);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toMatch(/already open/i);

    expect(() => guard.assertHostPromptAllowed()).toThrow(/Terminal mode owns/i);

    // Session hop must transfer (not refuse) — same as terminal.open IPC.
    expect(guard.transferTo(b)).toEqual({ ok: true });
    expect(guard.owns(b)).toBe(true);
    expect(guard.owns(a)).toBe(false);

    guard.release(b);
    expect(guard.isActive()).toBe(false);
    expect(() => guard.assertHostPromptAllowed()).not.toThrow();
    expect(guard.tryAcquire(b).ok).toBe(true);
    guard.release();
    expect(guard.isActive()).toBe(false);
  });

  it("switch path reuses the same session file (plan identity)", () => {
    const sessionFile = "/proj/.pi/sessions/abc.jsonl";
    const cwd = "/proj";
    const enter = planPiTuiLaunch({ sessionFile, cwd });
    const leaveThenReenter = planPiTuiLaunch({ sessionFile, cwd });
    expect(leaveThenReenter.sessionFile).toBe(enter.sessionFile);
    expect(leaveThenReenter.sessionKey).toBe(enter.sessionKey);
    expect(leaveThenReenter.args).toEqual(enter.args);
  });
});
