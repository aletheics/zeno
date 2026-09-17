// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { BundledRuntimeStatus } from "@zeno/contracts";
import { RuntimesSection } from "./RuntimesSection.tsx";

/* A runtime that is not installed cannot be switched, so the row must say so rather than
 * draw a toggle. The bug this guards: `checked` defaulted to true while `disabled` was
 * forced on by the missing path, so the row rendered as an ON switch that silently
 * refused every click. */

const getStatus = vi.fn();

function status(overrides: {
  nodePath?: string | undefined;
  pythonPath?: string | undefined;
  useBundledNode?: boolean;
  useBundledPython?: boolean;
}): BundledRuntimeStatus {
  const { nodePath, pythonPath, useBundledNode = true, useBundledPython = true } = overrides;
  return {
    prefs: { useBundledNode, useBundledPython },
    available: Boolean(nodePath || pythonPath),
    node: { enabled: useBundledNode, ...(nodePath ? { path: nodePath } : {}) },
    python: { enabled: useBundledPython, ...(pythonPath ? { path: pythonPath } : {}) },
  };
}

async function renderWith(value: BundledRuntimeStatus) {
  getStatus.mockResolvedValue(value);
  render(<RuntimesSection locale="zh" />);
  // The switch/verdict only renders once the status resolves.
  await waitFor(() => expect(getStatus).toHaveBeenCalled());
}

beforeEach(() => {
  getStatus.mockReset();
  vi.stubGlobal("zeno", { runtimes: { getStatus, setPrefs: vi.fn() } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RuntimesSection", () => {
  it("offers a switch when the bundled runtime is installed", async () => {
    await renderWith(status({ nodePath: "/runtimes/node", pythonPath: "/runtimes/python" }));

    expect(await screen.findByTestId("settings-runtimes-node")).toBeEnabled();
    expect(screen.getByTestId("settings-runtimes-python")).toBeEnabled();
    expect(screen.queryByTestId("settings-runtimes-node-missing")).not.toBeInTheDocument();
  });

  it("reports an uninstalled runtime instead of drawing a dead switch", async () => {
    // Neither bundled runtime present — the state this checkout was actually in.
    await renderWith(status({}));

    expect(await screen.findByTestId("settings-runtimes-node-missing")).toHaveTextContent("未安装");
    expect(screen.getByTestId("settings-runtimes-python-missing")).toBeInTheDocument();
    // No switch at all, so nothing can look operable and refuse input.
    expect(screen.queryByTestId("settings-runtimes-node")).not.toBeInTheDocument();
    expect(screen.queryByTestId("settings-runtimes-python")).not.toBeInTheDocument();
  });

  it("resolves each runtime independently", async () => {
    await renderWith(status({ nodePath: "/runtimes/node" }));

    expect(await screen.findByTestId("settings-runtimes-node")).toBeEnabled();
    expect(screen.getByTestId("settings-runtimes-python-missing")).toBeInTheDocument();
  });

  it("shows neither a switch nor a verdict while the status is still loading", async () => {
    getStatus.mockReturnValue(new Promise(() => {}));
    render(<RuntimesSection locale="zh" />);

    expect(screen.queryByTestId("settings-runtimes-node")).not.toBeInTheDocument();
    expect(screen.queryByTestId("settings-runtimes-node-missing")).not.toBeInTheDocument();
  });
});
