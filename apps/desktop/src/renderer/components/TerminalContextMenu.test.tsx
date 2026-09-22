// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { TerminalContextMenu, type TerminalLike } from "./TerminalContextMenu.tsx";
import type { ContextMenu } from "../hooks/useContextMenu.ts";

/* @testing-library/react auto-cleanup: relies on global afterEach (vitest globals=false). */
afterEach(cleanup);

function openMenu(): ContextMenu {
  return {
    key: "terminal",
    anchor: { top: 10, left: 10, right: 10, bottom: 10, width: 0, height: 0 },
    isOpen: true,
    openAtPoint: vi.fn(),
    openAtElement: vi.fn(),
    close: vi.fn(),
  };
}

function clipboard(read = "") {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const readText = vi.fn().mockResolvedValue(read);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText, readText },
  });
  return { writeText, readText };
}

/**
 * A terminal double. The spies come back as plain locals rather than being read off the object:
 * `TerminalLike` mirrors ghostty’s method signatures, and referencing `term.paste` as a
 * value trips the unbound-method lint rule.
 */
function terminal() {
  const getSelection = vi.fn(() => "");
  const paste = vi.fn();
  const selectAll = vi.fn();
  const term: TerminalLike = { getSelection, paste, selectAll };
  return { term, getSelection, paste, selectAll };
}

describe("TerminalContextMenu", () => {
  it("offers copy only when something is selected", () => {
    clipboard();
    const menu = openMenu();
    render(
      <TerminalContextMenu
        menu={menu}
        locale="en"
        selection=""
        getTerminal={() => terminal().term}
      />,
    );

    // Nothing selected means nothing to copy — the item would be a no-op.
    expect(screen.queryByTestId("terminal-menu-copy")).toBeNull();
    expect(screen.getByTestId("terminal-menu-paste")).toBeTruthy();
    expect(screen.getByTestId("terminal-menu-select-all")).toBeTruthy();
  });

  it("copies the captured selection and closes", () => {
    const { writeText } = clipboard();
    const menu = openMenu();
    render(
      <TerminalContextMenu
        menu={menu}
        locale="en"
        selection="npm run build"
        getTerminal={() => terminal().term}
      />,
    );

    fireEvent.click(screen.getByTestId("terminal-menu-copy"));

    expect(writeText).toHaveBeenCalledWith("npm run build");
    expect(menu.close).toHaveBeenCalledOnce();
  });

  it("ignores a whitespace-only selection", () => {
    clipboard();
    // Braced, because a JSX attribute string keeps `\n` as two literal characters.
    render(
      <TerminalContextMenu
        menu={openMenu()}
        locale="en"
        selection={"  \n "}
        getTerminal={() => terminal().term}
      />,
    );

    expect(screen.queryByTestId("terminal-menu-copy")).toBeNull();
  });

  it("pastes through term.paste, which applies bracketed paste", async () => {
    // Writing to onData instead would feed a multi-line paste to the PTY line by line.
    const { readText } = clipboard("line one\nline two");
    const { term, paste } = terminal();
    const menu = openMenu();
    render(<TerminalContextMenu menu={menu} locale="en" selection="" getTerminal={() => term} />);

    fireEvent.click(screen.getByTestId("terminal-menu-paste"));

    expect(menu.close).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(paste).toHaveBeenCalledWith("line one\nline two"));
    expect(readText).toHaveBeenCalledOnce();
  });

  it("does not paste an empty clipboard", async () => {
    clipboard("");
    const { term, paste } = terminal();
    render(
      <TerminalContextMenu menu={openMenu()} locale="en" selection="" getTerminal={() => term} />,
    );

    fireEvent.click(screen.getByTestId("terminal-menu-paste"));
    await Promise.resolve();

    expect(paste).not.toHaveBeenCalled();
  });

  it("selects everything in the terminal", () => {
    clipboard();
    const { term, selectAll } = terminal();
    const menu = openMenu();
    render(<TerminalContextMenu menu={menu} locale="en" selection="" getTerminal={() => term} />);

    fireEvent.click(screen.getByTestId("terminal-menu-select-all"));

    expect(selectAll).toHaveBeenCalledOnce();
    expect(menu.close).toHaveBeenCalledOnce();
  });

  it("still closes when the terminal went away with the menu open", () => {
    // A session switch can dispose the terminal while the menu is up.
    clipboard();
    const menu = openMenu();
    render(<TerminalContextMenu menu={menu} locale="en" selection="" getTerminal={() => null} />);

    fireEvent.click(screen.getByTestId("terminal-menu-select-all"));

    expect(menu.close).toHaveBeenCalledOnce();
  });
});
