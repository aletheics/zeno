// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

// @testing-library/react auto-cleanup relies on global afterEach (vitest globals=false).
afterEach(cleanup);

describe("ConfirmDialog", () => {
  it("renders title, message and action labels", () => {
    render(
      <ConfirmDialog
        open
        title="删除会话"
        message="确定要删除 foo 吗？"
        confirmLabel="删除"
        cancelLabel="取消"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText("删除会话")).toBeInTheDocument();
    expect(screen.getByText("确定要删除 foo 吗？")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-dialog-confirm")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-dialog-cancel")).toBeInTheDocument();
  });

  it("calls onConfirm when the confirm action is clicked", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="t"
        message="m"
        confirmLabel="确认"
        cancelLabel="取消"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel when the cancel action is clicked", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="t"
        message="m"
        confirmLabel="确认"
        cancelLabel="取消"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId("confirm-dialog-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
