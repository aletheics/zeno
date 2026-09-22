// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { MessageContextMenu } from "./MessageContextMenu.tsx";
import type { ContextMenu } from "../hooks/useContextMenu.ts";

/* @testing-library/react auto-cleanup relies on global afterEach (vitest globals=false). */
afterEach(cleanup);

function openMenu(): ContextMenu {
  return {
    key: "message",
    anchor: { top: 10, left: 10, right: 10, bottom: 10, width: 0, height: 0 },
    isOpen: true,
    openAtPoint: vi.fn(),
    openAtElement: vi.fn(),
    close: vi.fn(),
  };
}

function writeText() {
  const writeTextSpy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: writeTextSpy, readText: vi.fn().mockResolvedValue("") },
  });
  return writeTextSpy;
}

describe("MessageContextMenu", () => {
  it("offers edit & resend on a user turn, but not fork", () => {
    const menu = openMenu();
    render(
      <MessageContextMenu
        menu={menu}
        locale="en"
        text="hello there"
        onCopy={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByTestId("timeline-menu-copy")).toBeTruthy();
    expect(screen.getByTestId("timeline-menu-edit")).toBeTruthy();
    // Forking an assistant entry is meaningless on a user turn.
    expect(screen.queryByTestId("timeline-menu-fork")).toBeNull();
  });

  it("offers continue-in-a-new-session on an assistant turn, but not edit", () => {
    const menu = openMenu();
    render(
      <MessageContextMenu
        menu={menu}
        locale="en"
        text="an answer"
        onCopy={vi.fn()}
        onFork={vi.fn()}
      />,
    );

    expect(screen.getByTestId("timeline-menu-fork")).toBeTruthy();
    expect(screen.queryByTestId("timeline-menu-edit")).toBeNull();
  });

  it("runs the row's own copy handler and closes", () => {
    const menu = openMenu();
    const onCopy = vi.fn();
    render(<MessageContextMenu menu={menu} locale="en" text="hello" onCopy={onCopy} />);

    fireEvent.click(screen.getByTestId("timeline-menu-copy"));

    expect(onCopy).toHaveBeenCalledOnce();
    expect(menu.close).toHaveBeenCalledOnce();
  });

  it("offers copy-as-plain-text only when it would differ from copy", () => {
    // A plain sentence has nothing to strip, so the second item would be a duplicate.
    const plain = render(
      <MessageContextMenu menu={openMenu()} locale="en" text="just words" onCopy={vi.fn()} />,
    );
    expect(screen.queryByTestId("timeline-menu-copy-plain")).toBeNull();
    plain.unmount();

    render(
      <MessageContextMenu
        menu={openMenu()}
        locale="en"
        text={"## Heading\n\nsome **bold** words"}
        onCopy={vi.fn()}
      />,
    );
    expect(screen.getByTestId("timeline-menu-copy-plain")).toBeTruthy();
  });

  it("copies markdown stripped of its syntax", () => {
    const writeTextSpy = writeText();
    const menu = openMenu();
    render(
      <MessageContextMenu
        menu={menu}
        locale="en"
        text={"## Heading\n\nsome **bold** words"}
        onCopy={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("timeline-menu-copy-plain"));

    expect(writeTextSpy).toHaveBeenCalledWith("Heading\n\nsome bold words");
    expect(menu.close).toHaveBeenCalledOnce();
  });
});
