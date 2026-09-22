// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ComposerContextMenu } from "./ComposerContextMenu.tsx";
import type { ContextMenu } from "../hooks/useContextMenu.ts";

/* @testing-library/react auto-cleanup relies on global afterEach (vitest globals=false). */
afterEach(cleanup);

function openMenu(): ContextMenu {
  return {
    key: "composer",
    anchor: { top: 10, left: 10, right: 10, bottom: 10, width: 0, height: 0 },
    isOpen: true,
    openAtPoint: vi.fn(),
    openAtElement: vi.fn(),
    close: vi.fn(),
  };
}

/** A real textarea, so `selectionStart`/`selectionEnd` behave the way the component expects. */
function composer(value: string, selection?: [number, number]) {
  const el = document.createElement("textarea");
  el.value = value;
  if (selection) el.setSelectionRange(selection[0], selection[1]);
  return { current: el };
}

function clipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const readText = vi.fn().mockResolvedValue("");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText, readText },
  });
  return { writeText, readText };
}

function renderMenu(
  overrides: Partial<Parameters<typeof ComposerContextMenu>[0]> = {},
  value = "hello",
  selection?: [number, number],
) {
  const onPromptChange = vi.fn();
  const menu = openMenu();
  render(
    <ComposerContextMenu
      menu={menu}
      locale="en"
      composerRef={composer(value, selection)}
      prompt={value}
      onPromptChange={onPromptChange}
      {...overrides}
    />,
  );
  return { menu, onPromptChange };
}

describe("ComposerContextMenu", () => {
  it("offers cut and copy only when something is selected", () => {
    // A "Copy" that cannot copy is worse than no Copy at all.
    renderMenu({}, "hello", undefined);
    expect(screen.queryByTestId("composer-menu-cut")).toBeNull();
    expect(screen.queryByTestId("composer-menu-copy")).toBeNull();
    cleanup();

    renderMenu({}, "hello", [0, 5]);
    expect(screen.getByTestId("composer-menu-cut")).toBeTruthy();
    expect(screen.getByTestId("composer-menu-copy")).toBeTruthy();
  });

  it("always offers paste", () => {
    renderMenu({}, "");
    expect(screen.getByTestId("composer-menu-paste")).toBeTruthy();
  });

  it("offers select-all and clear only when there is text", () => {
    renderMenu({}, "");
    expect(screen.queryByTestId("composer-menu-select-all")).toBeNull();
    expect(screen.queryByTestId("composer-menu-clear")).toBeNull();
    cleanup();

    renderMenu({}, "draft");
    expect(screen.getByTestId("composer-menu-select-all")).toBeTruthy();
    expect(screen.getByTestId("composer-menu-clear")).toBeTruthy();
  });

  it("copies just the selected range and closes", () => {
    const { writeText } = clipboard();
    const { menu } = renderMenu({}, "hello world", [6, 11]);

    fireEvent.click(screen.getByTestId("composer-menu-copy"));

    expect(writeText).toHaveBeenCalledWith("world");
    expect(menu.close).toHaveBeenCalledOnce();
  });

  it("cuts the selected range out of the prompt and closes", async () => {
    clipboard();
    const { onPromptChange, menu } = renderMenu({}, "hello world", [0, 6]);

    fireEvent.click(screen.getByTestId("composer-menu-cut"));

    expect(menu.close).toHaveBeenCalledOnce();
    // Cut awaits the clipboard write before touching the prompt.
    await vi.waitFor(() => expect(onPromptChange).toHaveBeenCalledWith("world"));
  });

  it("clears the prompt and closes", () => {
    const { onPromptChange, menu } = renderMenu({}, "draft text");

    fireEvent.click(screen.getByTestId("composer-menu-clear"));

    expect(onPromptChange).toHaveBeenCalledWith("");
    expect(menu.close).toHaveBeenCalledOnce();
  });

  it("selects the whole prompt and closes", () => {
    const { menu } = renderMenu({}, "draft text");

    fireEvent.click(screen.getByTestId("composer-menu-select-all"));

    expect(menu.close).toHaveBeenCalledOnce();
  });

  it("pastes clipboard text at the selection", async () => {
    const { readText } = clipboard();
    readText.mockResolvedValue("PASTED");
    const { onPromptChange, menu } = renderMenu({}, "hello world", [0, 5]);

    fireEvent.click(screen.getByTestId("composer-menu-paste"));

    expect(menu.close).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(onPromptChange).toHaveBeenCalledWith("PASTED world"));
  });

  it("turns a clipboard image into an attachment instead of inserting text", async () => {
    // The precedence `handleComposerPaste` uses: an image on the clipboard becomes an
    // attachment and no text is inserted, or pasting a screenshot would also paste junk.
    const { readText } = clipboard();
    readText.mockResolvedValue("should not be inserted");
    const saveClipboardImage = vi.fn().mockResolvedValue("/tmp/paste-1.png");
    Object.defineProperty(window, "zeno", {
      configurable: true,
      value: { workspace: { saveClipboardImage } },
    });
    const onAddAttachments = vi.fn();
    const { onPromptChange } = renderMenu({ onAddAttachments }, "draft");

    fireEvent.click(screen.getByTestId("composer-menu-paste"));

    await vi.waitFor(() => expect(onAddAttachments).toHaveBeenCalledWith(["/tmp/paste-1.png"]));
    expect(onPromptChange).not.toHaveBeenCalled();
    expect(readText).not.toHaveBeenCalled();
  });
});
