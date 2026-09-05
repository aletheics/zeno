// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { t, type MessageKey } from "../../lib/i18n.ts";
import {
  deleteThreadLocal,
  loadArchivedThreadMeta,
  loadArchivedThreads,
  saveArchivedThreadMeta,
  unarchiveThread,
} from "../../lib/project-prefs.ts";
import { loadConfirmDelete } from "../../lib/behavior-prefs.ts";
import { ArchivedSection } from "./SettingsPage.tsx";

vi.mock("../../lib/project-prefs.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/project-prefs.ts")>();
  return {
    ...actual,
    loadArchivedThreads: vi.fn(),
    loadArchivedThreadMeta: vi.fn(),
    deleteThreadLocal: vi.fn(),
    unarchiveThread: vi.fn(),
    saveArchivedThreadMeta: vi.fn(),
  };
});

vi.mock("../../lib/behavior-prefs.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/behavior-prefs.ts")>();
  return { ...actual, loadConfirmDelete: vi.fn() };
});

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderArchived() {
  const tr = (key: MessageKey, vars?: Record<string, string>) => t("zh", key, vars);
  render(<ArchivedSection locale="zh" tr={tr} />);
}

describe("ArchivedSection delete flow", () => {
  it("deletes directly without a dialog when confirm-delete is off", () => {
    vi.mocked(loadArchivedThreads).mockReturnValue(["s1"]);
    vi.mocked(loadArchivedThreadMeta).mockReturnValue({});
    vi.mocked(loadConfirmDelete).mockReturnValue(false);

    renderArchived();
    fireEvent.click(screen.getByTestId("archived-delete-all"));

    expect(screen.queryByTestId("confirm-dialog-confirm")).not.toBeInTheDocument();
    expect(deleteThreadLocal).toHaveBeenCalledWith("s1");
    expect(unarchiveThread).toHaveBeenCalledWith("s1");
    expect(saveArchivedThreadMeta).toHaveBeenCalledWith({});
  });

  it("opens the dialog and cancels without deleting", () => {
    vi.mocked(loadArchivedThreads).mockReturnValue(["s1", "s2"]);
    vi.mocked(loadArchivedThreadMeta).mockReturnValue({});
    vi.mocked(loadConfirmDelete).mockReturnValue(true);

    renderArchived();
    fireEvent.click(screen.getByTestId("archived-delete-all"));

    expect(screen.getByTestId("confirm-dialog-confirm")).toBeInTheDocument();
    expect(deleteThreadLocal).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("confirm-dialog-cancel"));

    expect(screen.queryByTestId("confirm-dialog-confirm")).not.toBeInTheDocument();
    expect(deleteThreadLocal).not.toHaveBeenCalled();
    expect(unarchiveThread).not.toHaveBeenCalled();
  });

  it("deletes a single session after confirming", () => {
    vi.mocked(loadArchivedThreads).mockReturnValue(["s1", "s2"]);
    vi.mocked(loadArchivedThreadMeta).mockReturnValue({});
    vi.mocked(loadConfirmDelete).mockReturnValue(true);

    renderArchived();
    fireEvent.click(screen.getByTestId("archived-session-delete-s1"));
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));

    expect(deleteThreadLocal).toHaveBeenCalledWith("s1");
    expect(unarchiveThread).toHaveBeenCalledWith("s1");
    expect(deleteThreadLocal).not.toHaveBeenCalledWith("s2");
  });
});
