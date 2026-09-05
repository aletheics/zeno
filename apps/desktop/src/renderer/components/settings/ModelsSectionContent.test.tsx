// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { HostSnapshot, ModelSummary } from "@zeno/contracts";
import { t, type MessageKey } from "../../lib/i18n.ts";
import { ModelsSectionContent, type SettingsPageProps } from "./SettingsPage.tsx";

const customModel: ModelSummary = {
  provider: "acme",
  id: "model-1",
  name: "Acme Model",
  reasoning: false,
  source: "custom",
};

const removeCustomModelMock = vi.fn();
const refreshCatalogMock = vi.fn(async () => [customModel]);
const settingsGetMock = vi.fn(async () => ({
  enabledModels: [] as string[],
  defaultProvider: undefined,
  defaultModel: undefined,
}));
const getRuntimeMock = vi.fn(async () => ({ appVersion: "1.0.0" }));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("zeno", {
    models: { refreshCatalog: refreshCatalogMock, removeCustomModel: removeCustomModelMock },
    settings: { get: settingsGetMock },
    app: { getRuntime: getRuntimeMock },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function makeProps(): SettingsPageProps {
  return {
    snapshot: undefined,
    status: "",
    locale: "zh",
    section: "models",
    colorMode: "light",
    themePreference: "system",
    themeSelection: { id: "" },
    themeLibrary: { activeId: "", skins: [] },
    sidebarTranslucent: false,
    sidebarWidthPx: 280,
    accessVisibility: { default: true, autoReview: true, full: true },
    onAccessVisibility: vi.fn(),
    accessMode: "default",
    onAccessMode: vi.fn(),
    showContextUsage: false,
    onShowContextUsage: vi.fn(),
    serviceTier: "default",
    onServiceTierChange: vi.fn(),
    onEnsureHost: vi.fn(async () => ({}) as HostSnapshot),
    onSnapshot: vi.fn(),
    onLocale: vi.fn(),
    onThemePreference: vi.fn(),
    onThemeSelection: vi.fn(),
    onThemeLibrary: vi.fn(),
    onThemePreview: vi.fn(),
    onTranslucent: vi.fn(),
    onSidebarWidth: vi.fn(),
    onToggleTrust: vi.fn(),
  };
}

function renderModels() {
  const props = makeProps();
  const auth = {
    getProvider: () => undefined,
    loading: false,
    openConfig: vi.fn(),
    refresh: vi.fn(async () => {}),
  };
  const tr = (key: MessageKey, vars?: Record<string, string>) => t("zh", key, vars);
  render(<ModelsSectionContent {...props} tr={tr} auth={auth} />);
  return { props, auth };
}

async function openCustomModelRow() {
  const toggle = await screen.findByTestId("models-custom-group-custom:acme-toggle");
  fireEvent.click(toggle);
  return screen.getByTestId("model-delete-acme-model-1");
}

describe("ModelsSectionContent removeCustomModel flow", () => {
  it("opens the confirm dialog and cancels without removing", async () => {
    renderModels();
    const deleteButton = await openCustomModelRow();
    fireEvent.click(deleteButton);

    expect(screen.getByTestId("confirm-dialog-confirm")).toBeInTheDocument();
    expect(removeCustomModelMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("confirm-dialog-cancel"));

    expect(screen.queryByTestId("confirm-dialog-confirm")).not.toBeInTheDocument();
    expect(removeCustomModelMock).not.toHaveBeenCalled();
  });

  it("removes the custom model and refreshes after confirming", async () => {
    removeCustomModelMock.mockResolvedValue(undefined);

    const { auth } = renderModels();
    const deleteButton = await openCustomModelRow();
    fireEvent.click(deleteButton);
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));

    await waitFor(() => expect(removeCustomModelMock).toHaveBeenCalledWith("acme", "model-1"));
    expect(auth.refresh).toHaveBeenCalled();
  });
});
