// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ThemeLibrarySnapshot, ThemeSkinRecord } from "@zeno/contracts";
import { createThemeSkinDraft } from "../../lib/theme-packs.ts";
import { ThemeSkinStudio } from "./ThemeSkinStudio.tsx";

type StudioProps = ComponentProps<typeof ThemeSkinStudio>;

const removeMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("zeno", { themes: { remove: removeMock } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function makeLibrary(): ThemeLibrarySnapshot {
  const record: ThemeSkinRecord = {
    id: "skin-custom-1",
    config: createThemeSkinDraft("My Skin"),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  return { activeId: "skin-custom-1", skins: [record] };
}

function renderStudio() {
  const onSelection = vi.fn();
  const onLibrary = vi.fn();
  const onPreview = vi.fn();
  const props: StudioProps = {
    locale: "zh",
    colorMode: "light",
    selection: { id: "skin-custom-1" },
    library: makeLibrary(),
    sidebarTranslucent: false,
    onSelection,
    onLibrary,
    onPreview,
  };
  render(<ThemeSkinStudio {...props} />);
  return { onSelection, onLibrary, onPreview };
}

describe("ThemeSkinStudio delete flow", () => {
  it("opens the confirm dialog and cancels without deleting", () => {
    renderStudio();
    fireEvent.click(screen.getByTestId("appearance-theme-skin-delete"));

    expect(screen.getByTestId("confirm-dialog-confirm")).toBeInTheDocument();
    expect(removeMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("confirm-dialog-cancel"));

    expect(screen.queryByTestId("confirm-dialog-confirm")).not.toBeInTheDocument();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("removes the active skin and emits the new library after confirming", async () => {
    const removed: ThemeLibrarySnapshot = { activeId: "skin-custom-2", skins: [] };
    removeMock.mockResolvedValue(removed);

    const { onLibrary, onSelection } = renderStudio();
    fireEvent.click(screen.getByTestId("appearance-theme-skin-delete"));
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));

    await waitFor(() => expect(removeMock).toHaveBeenCalledWith("skin-custom-1"));
    expect(onLibrary).toHaveBeenCalledWith(removed);
    expect(onSelection).toHaveBeenCalledWith({ id: "skin-custom-2" });
  });
});
