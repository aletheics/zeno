// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { BundledRuntimeStatus } from "@zeno/contracts";
import { RuntimesSection } from "./RuntimesSection.tsx";

/* The switch stays visible when a runtime is missing, but it is disabled — so the row has
 * to carry the reason. The bug this guards: `checked` defaulted to true while `disabled`
 * was forced on by the missing path, so the row rendered as an ON switch that silently
 * refused every click, with nothing on screen saying why. */

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
    // Nothing to explain when the runtime is there.
    expect(screen.queryByTestId("settings-runtimes-node-missing")).not.toBeInTheDocument();
    expect(screen.queryByTestId("settings-runtimes-python-missing")).not.toBeInTheDocument();
  });

  it("explains the disabled switch when a runtime is not installed", async () => {
    // Neither bundled runtime present — the state this checkout was actually in, and the
    // default for anyone who has not run `runtimes:fetch`.
    await renderWith(status({}));

    // The switch stays, but cannot move...
    expect(await screen.findByTestId("settings-runtimes-node")).toBeDisabled();
    expect(screen.getByTestId("settings-runtimes-python")).toBeDisabled();
    // ...so the row states the fact, and how to fix it.
    expect(screen.getByTestId("settings-runtimes-node-missing")).toHaveTextContent(
      "runtimes:fetch",
    );
    expect(screen.getByTestId("settings-runtimes-python-missing")).toBeInTheDocument();
  });

  it("resolves each runtime independently", async () => {
    await renderWith(status({ nodePath: "/runtimes/node" }));

    expect(await screen.findByTestId("settings-runtimes-node")).toBeEnabled();
    // Only the missing one carries the note.
    expect(screen.queryByTestId("settings-runtimes-node-missing")).not.toBeInTheDocument();
    expect(screen.getByTestId("settings-runtimes-python-missing")).toBeInTheDocument();
  });

  it("does not claim a runtime is missing while the status is still loading", async () => {
    getStatus.mockReturnValue(new Promise(() => {}));
    render(<RuntimesSection locale="zh" />);

    expect(screen.getByTestId("settings-runtimes-node")).toBeDisabled();
    expect(screen.queryByTestId("settings-runtimes-node-missing")).not.toBeInTheDocument();
  });
});
