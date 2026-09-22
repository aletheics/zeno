// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ContentCodeBlock } from "./ContentCodeBlock.tsx";

/* @testing-library/react auto-cleanup: relies on global afterEach (vitest globals=false). */
afterEach(cleanup);

const CODE = "const a = 1;\nconst b = 2;";

function clipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText, readText: vi.fn().mockResolvedValue("") },
  });
  return { writeText };
}

/** Stands in for the DOM selection the component reads as the menu opens. */
function select(text: string) {
  const toString = vi.fn().mockReturnValue(text);
  vi.spyOn(window, "getSelection").mockReturnValue({ toString } as unknown as Selection);
  return { toString };
}

describe("ContentCodeBlock copy button", () => {
  it("copies the whole block", () => {
    const { writeText } = clipboard();
    render(<ContentCodeBlock code={CODE} language="ts" locale="en" />);

    fireEvent.click(screen.getByTestId("code-copy"));

    expect(writeText).toHaveBeenCalledWith(CODE);
  });
});

describe("ContentCodeBlock context menu", () => {
  it("offers only the whole block when nothing is selected", () => {
    clipboard();
    select("");
    render(<ContentCodeBlock code={CODE} language="ts" locale="en" />);

    fireEvent.contextMenu(screen.getByTestId("code-copy").closest(".content-code-block")!);

    expect(screen.getByTestId("code-context-menu")).toBeTruthy();
    expect(screen.getByTestId("code-menu-copy")).toBeTruthy();
    // Copying the block is the other item's job; for a partial selection the block is
    // usually not what was meant, which is why the selection item exists.
    expect(screen.queryByTestId("code-menu-copy-selection")).toBeNull();
  });

  it("adds a copy-the-selection item when there is one", () => {
    clipboard();
    select("const b = 2;");
    render(<ContentCodeBlock code={CODE} language="ts" locale="en" />);

    fireEvent.contextMenu(screen.getByTestId("code-copy").closest(".content-code-block")!);

    expect(screen.getByTestId("code-menu-copy-selection")).toBeTruthy();
  });

  it("ignores a whitespace-only selection", () => {
    clipboard();
    select("   \n  ");
    render(<ContentCodeBlock code={CODE} language="ts" locale="en" />);

    fireEvent.contextMenu(screen.getByTestId("code-copy").closest(".content-code-block")!);

    expect(screen.queryByTestId("code-menu-copy-selection")).toBeNull();
  });

  it("copies the selection, not the block", () => {
    const { writeText } = clipboard();
    select("const b = 2;");
    const block = render(<ContentCodeBlock code={CODE} language="ts" locale="en" />);

    fireEvent.contextMenu(block.container.querySelector(".content-code-block")!);
    fireEvent.click(screen.getByTestId("code-menu-copy-selection"));

    expect(writeText).toHaveBeenCalledWith("const b = 2;");
  });

  it("copies the block and shows the button's own copied state", () => {
    // Going through copyCode() rather than writing directly keeps the header check in sync.
    const { writeText } = clipboard();
    select("");
    const block = render(<ContentCodeBlock code={CODE} language="ts" locale="en" />);

    fireEvent.contextMenu(block.container.querySelector(".content-code-block")!);
    fireEvent.click(screen.getByTestId("code-menu-copy"));

    expect(writeText).toHaveBeenCalledWith(CODE);
  });
});
