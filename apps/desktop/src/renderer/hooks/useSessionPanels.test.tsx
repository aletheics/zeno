// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useSessionPanels } from "./useSessionPanels.ts";

/* The panels' state and loading used to be ten `useState` cells and four loaders inline in
 * `App()`, where none of this could be reached. What is worth pinning is the loader's
 * shape, since both panels share it: ensure the host only when it is down, surface the
 * error's own message or the localized fallback, and always clear loading. */

const tree = vi.fn();
const info = vi.fn();
const ensureHost = vi.fn(async () => ({}));
const hasHost = vi.fn(() => true);

function renderPanels(locale: "zh" | "en" = "zh") {
  return renderHook(() =>
    useSessionPanels({
      locale,
      ensureHost,
      hasHost,
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal("zeno", { session: { tree, info } });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("useSessionPanels", () => {
  it("starts closed with nothing loaded", () => {
    const { result } = renderPanels();
    expect(result.current.tree).toMatchObject({ open: false, mode: "navigate", loading: false });
    expect(result.current.tree.data).toBeUndefined();
    expect(result.current.info.open).toBe(false);
    expect(result.current.rename.open).toBe(false);
  });

  it("opens the tree in a mode and loads it", async () => {
    tree.mockResolvedValue({ nodes: [] });
    const { result } = renderPanels();

    await act(async () => {
      await result.current.tree.openPanel("fork");
    });

    expect(result.current.tree.open).toBe(true);
    expect(result.current.tree.mode).toBe("fork");
    expect(result.current.tree.data).toEqual({ nodes: [] });
    expect(result.current.tree.loading).toBe(false);
    expect(result.current.tree.error).toBeUndefined();
  });

  it("starts the host only when it is not already up", async () => {
    tree.mockResolvedValue({});
    hasHost.mockReturnValue(true);
    const { result } = renderPanels();
    await act(async () => {
      await result.current.tree.openPanel();
    });
    expect(ensureHost).not.toHaveBeenCalled();

    hasHost.mockReturnValue(false);
    await act(async () => {
      await result.current.tree.refresh();
    });
    expect(ensureHost).toHaveBeenCalledTimes(1);
  });

  it("surfaces the error's own message and always clears loading", async () => {
    tree.mockRejectedValue(new Error("host said no"));
    const { result } = renderPanels();

    await act(async () => {
      await result.current.tree.openPanel();
    });

    expect(result.current.tree.error).toBe("host said no");
    expect(result.current.tree.loading).toBe(false);
  });

  it("falls back to a localized message when the failure carries none", async () => {
    info.mockRejectedValue(new Error(""));
    const { result } = renderPanels("zh");

    await act(async () => {
      await result.current.info.openPanel();
    });

    // Hardcoded English used to reach the panel here; the fallback is localized now.
    expect(result.current.info.error).toBe("加载会话信息失败");
  });

  it("clears a previous error when a refresh succeeds", async () => {
    tree.mockRejectedValueOnce(new Error("transient"));
    tree.mockResolvedValue({ nodes: [1] });
    const { result } = renderPanels();

    await act(async () => {
      await result.current.tree.openPanel();
    });
    expect(result.current.tree.error).toBe("transient");

    await act(async () => {
      await result.current.tree.refresh();
    });
    expect(result.current.tree.error).toBeUndefined();
    expect(result.current.tree.data).toEqual({ nodes: [1] });
  });

  it("reloads without changing visibility", async () => {
    tree.mockResolvedValue({});
    const { result } = renderPanels();

    await act(async () => {
      await result.current.tree.refresh();
    });

    // A refresh is not an open — the panel stays as it was.
    expect(result.current.tree.open).toBe(false);
    expect(tree).toHaveBeenCalledTimes(1);
  });

  it("keeps the two panels independent", async () => {
    tree.mockResolvedValue({});
    info.mockResolvedValue({});
    const { result } = renderPanels();

    await act(async () => {
      await result.current.tree.openPanel();
    });
    await act(async () => {
      await result.current.info.openPanel();
    });
    // Opening info must not close the tree; they are separate booleans in the shell.
    expect(result.current.tree.open).toBe(true);
    expect(result.current.info.open).toBe(true);

    act(() => result.current.tree.close());
    expect(result.current.tree.open).toBe(false);
    expect(result.current.info.open).toBe(true);
  });

  it("drives the rename dialog", () => {
    const { result } = renderPanels();
    act(() => result.current.rename.start());
    expect(result.current.rename.open).toBe(true);
    act(() => result.current.rename.cancel());
    expect(result.current.rename.open).toBe(false);
  });
});
