// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { CommandContextMenu, PathContextMenu } from "./ToolContextMenu.tsx";
import type { ContextMenu } from "../hooks/useContextMenu.ts";

/* @testing-library/react auto-cleanup: relies on global afterEach (vitest globals=false). */
afterEach(cleanup);

function openMenu(): ContextMenu {
  return {
    key: "tool-path",
    anchor: { top: 10, left: 10, right: 10, bottom: 10, width: 0, height: 0 },
    isOpen: true,
    openAtPoint: vi.fn(),
    openAtElement: vi.fn(),
    close: vi.fn(),
  };
}

function clipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText, readText: vi.fn().mockResolvedValue("") },
  });
  return { writeText };
}

/** Stubs the two workspace channels the path menu drives, and records what they got. */
function workspace() {
  const openFile = vi.fn().mockResolvedValue(undefined);
  const revealInFolder = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window, "zeno", {
    configurable: true,
    value: { workspace: { openFile, revealInFolder } },
  });
  return { openFile, revealInFolder };
}

describe("PathContextMenu", () => {
  it("copies the absolute path, not the shortened label", () => {
    // The row shows `src/foo.ts`; what a user can paste elsewhere is the full path.
    const { writeText } = clipboard();
    const menu = openMenu();
    render(<PathContextMenu menu={menu} locale="en" path="/home/me/proj/src/foo.ts" />);

    fireEvent.click(screen.getByTestId("tool-path-menu-copy"));

    expect(writeText).toHaveBeenCalledWith("/home/me/proj/src/foo.ts");
    expect(menu.close).toHaveBeenCalledOnce();
  });

  it("opens the file in the editor", () => {
    clipboard();
    const { openFile } = workspace();
    const menu = openMenu();
    render(<PathContextMenu menu={menu} locale="en" path="/tmp/a.ts" />);

    fireEvent.click(screen.getByTestId("tool-path-menu-open"));

    expect(openFile).toHaveBeenCalledWith("/tmp/a.ts");
    expect(menu.close).toHaveBeenCalledOnce();
  });

  it("reveals the file in its folder", () => {
    clipboard();
    const { revealInFolder } = workspace();
    const menu = openMenu();
    render(<PathContextMenu menu={menu} locale="en" path="/tmp/a.ts" />);

    fireEvent.click(screen.getByTestId("tool-path-menu-reveal"));

    // showItemInFolder selects a file in its parent just as well as it opens a folder.
    expect(revealInFolder).toHaveBeenCalledWith("/tmp/a.ts");
    expect(menu.close).toHaveBeenCalledOnce();
  });

  it("opens the file when the path carries a line number", () => {
    // A read tool is often handed `src/foo.ts:42`; openPath cannot use the suffix.
    clipboard();
    const { openFile } = workspace();
    render(<PathContextMenu menu={openMenu()} locale="en" path="/tmp/a.ts:42" />);

    fireEvent.click(screen.getByTestId("tool-path-menu-open"));

    expect(openFile).toHaveBeenCalledWith("/tmp/a.ts");
  });

  it("keeps the line number when copying, because that is what is useful to paste", () => {
    const { writeText } = clipboard();
    render(<PathContextMenu menu={openMenu()} locale="en" path="/tmp/a.ts:42" />);

    fireEvent.click(screen.getByTestId("tool-path-menu-copy"));

    expect(writeText).toHaveBeenCalledWith("/tmp/a.ts:42");
  });

  it("does not surface a rejection when the path cannot be opened", async () => {
    clipboard();
    const openFile = vi.fn().mockRejectedValue(new Error("no such file"));
    Object.defineProperty(window, "zeno", {
      configurable: true,
      value: { workspace: { openFile, revealInFolder: vi.fn() } },
    });
    render(<PathContextMenu menu={openMenu()} locale="en" path="/tmp/gone.ts" />);

    // An unhandled rejection here would be a console error and nothing else.
    fireEvent.click(screen.getByTestId("tool-path-menu-open"));
    await Promise.resolve();
  });
});

describe("CommandContextMenu", () => {
  it("copies the command and closes", () => {
    const { writeText } = clipboard();
    const menu = openMenu();
    render(<CommandContextMenu menu={menu} locale="en" command="git status --short" />);

    fireEvent.click(screen.getByTestId("tool-command-menu-copy"));

    expect(writeText).toHaveBeenCalledWith("git status --short");
    expect(menu.close).toHaveBeenCalledOnce();
  });
});
