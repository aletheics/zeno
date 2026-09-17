// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useBootstrapGate, type BootstrapPhases } from "./useBootstrapGate.ts";

/* This ran as a 55-line inline effect in `App()` with an eslint-disabled `[]` dep array,
 * so nothing about it — the step order, the cancellation, or the recovery path — could be
 * exercised. The recovery path is the one that matters most: when a step fails the shell
 * is still supposed to come up rather than strand the user on the overlay. */

function phases(overrides: Partial<BootstrapPhases> = {}): BootstrapPhases {
  return {
    workspaces: vi.fn(async () => {}),
    host: vi.fn(async () => {}),
    config: vi.fn(async () => {}),
    hydrate: vi.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

/** The gate holds "ready" for a beat, so let it elapse — and drain the promise chain
 * between timers, which the sync variant of advanceTimersByTime does not do. */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
}

describe("useBootstrapGate", () => {
  it("runs the phases in order and becomes ready", async () => {
    const order: string[] = [];
    const p = phases({
      workspaces: vi.fn(async () => void order.push("workspaces")),
      host: vi.fn(async () => void order.push("host")),
      config: vi.fn(async () => void order.push("config")),
      hydrate: vi.fn(async () => void order.push("hydrate")),
    });
    const onStatus = vi.fn();

    const { result } = renderHook(() =>
      useBootstrapGate({ getLocale: () => "zh", phases: p, onStatus }),
    );

    expect(result.current.ready).toBe(false);
    await settle();

    expect(order).toEqual(["workspaces", "host", "config", "hydrate"]);
    expect(result.current.ready).toBe(true);
    expect(result.current.error).toBeUndefined();
    // Ends on the ready string, and each step was mirrored outward.
    expect(onStatus).toHaveBeenLastCalledWith("准备就绪");
    expect(onStatus).toHaveBeenCalledTimes(5);
  });

  it("runs exactly once, even when the caller re-renders", async () => {
    // The effect was `[]` on purpose: re-arming it would restart the host mid-boot.
    const p = phases();
    const { result, rerender } = renderHook(
      ({ locale }: { locale: "zh" | "en" }) =>
        useBootstrapGate({ getLocale: () => locale, phases: p, onStatus: vi.fn() }),
      { initialProps: { locale: "zh" as "zh" | "en" } },
    );
    await settle();
    rerender({ locale: "en" });
    await settle();

    expect(p.workspaces).toHaveBeenCalledTimes(1);
    expect(result.current.ready).toBe(true);
  });

  it("surfaces the failure but still brings the shell up", async () => {
    const host = vi.fn(async () => {
      throw new Error("pi missing");
    });
    const p = phases({ host });
    const onStatus = vi.fn();

    const { result } = renderHook(() =>
      useBootstrapGate({ getLocale: () => "zh", phases: p, onStatus }),
    );
    await settle();

    expect(result.current.ready).toBe(true);
    expect(result.current.degraded).toBe(true);
    expect(result.current.error).toBe("pi missing");
    expect(result.current.status).toContain("pi missing");
  });

  it("reapplies the sequence when a later phase fails", async () => {
    const p = phases({
      config: vi.fn(async () => {
        throw new Error("catalogue unreadable");
      }),
    });

    const { result } = renderHook(() =>
      useBootstrapGate({ getLocale: () => "zh", phases: p, onStatus: vi.fn() }),
    );
    await settle();

    // Failed pass, then a recovery pass over the whole sequence.
    expect(p.workspaces).toHaveBeenCalledTimes(2);
    expect(p.host).toHaveBeenCalledTimes(2);
    expect(p.config).toHaveBeenCalledTimes(2);
    expect(result.current.ready).toBe(true);
    expect(result.current.error).toBe("catalogue unreadable");
  });

  it("still becomes ready when the first phase fails, though nothing after it runs", async () => {
    // The recovery pass starts from the first phase too, so a failure there cannot be
    // recovered past — the guarantee is only that the shell still comes up.
    const p = phases({
      workspaces: vi.fn(async () => {
        throw new Error("no home dir");
      }),
    });

    const { result } = renderHook(() =>
      useBootstrapGate({ getLocale: () => "zh", phases: p, onStatus: vi.fn() }),
    );
    await settle();

    expect(result.current.ready).toBe(true);
    expect(result.current.degraded).toBe(true);
    expect(p.workspaces).toHaveBeenCalledTimes(2);
    expect(p.host).not.toHaveBeenCalled();
  });

  it("stays quiet when the shell goes away mid-boot", async () => {
    let resolveWorkspaces: () => void = () => {};
    const workspaces = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveWorkspaces = resolve;
        }),
    );
    const p = phases({ workspaces });
    const onStatus = vi.fn();

    const { unmount } = renderHook(() =>
      useBootstrapGate({ getLocale: () => "zh", phases: p, onStatus }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    const callsAtUnmount = onStatus.mock.calls.length;
    unmount();

    await act(async () => {
      resolveWorkspaces();
      await vi.advanceTimersByTimeAsync(250);
    });

    // Unmount cancels: no further status, and the host step is never started.
    expect(onStatus).toHaveBeenCalledTimes(callsAtUnmount);
    expect(p.host).not.toHaveBeenCalled();
  });

  it("is not degraded when every phase succeeds", async () => {
    const { result } = renderHook(() =>
      useBootstrapGate({
        getLocale: () => "zh",
        phases: phases(),
        onStatus: vi.fn(),
      }),
    );
    await settle();
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.degraded).toBe(false);
  });
});
