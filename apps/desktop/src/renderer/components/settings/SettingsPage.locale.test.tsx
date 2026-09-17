// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { HostSnapshot } from "@zeno/contracts";
import { SettingsPage, type SettingsPageProps } from "./SettingsPage.tsx";
import { t } from "../../lib/i18n.ts";

function makeProps(overrides: Partial<SettingsPageProps> = {}): SettingsPageProps {
  return {
    snapshot: undefined,
    status: "",
    locale: "zh",
    localePreference: "auto",
    section: "general",
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
    onLocalePreference: vi.fn(),
    onThemePreference: vi.fn(),
    onThemeSelection: vi.fn(),
    onThemeLibrary: vi.fn(),
    onThemePreview: vi.fn(),
    onTranslucent: vi.fn(),
    onSidebarWidth: vi.fn(),
    onToggleTrust: vi.fn(),
    ...overrides,
  };
}

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
    settings: { get: vi.fn(async () => ({ enabledModels: [] })) },
    app: { getRuntime: vi.fn(async () => ({ appVersion: "1.0.0" })) },
    packages: { list: vi.fn(async () => []) },
    resources: { list: vi.fn(async () => ({ resources: [] })) },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function localeTrigger(): HTMLElement {
  return screen.getByTestId("appearance-locale");
}

describe("language setting", () => {
  it("offers follow-system alongside the explicit locales", () => {
    render(<SettingsPage {...makeProps()} />);
    fireEvent.click(localeTrigger());
    // Radix portals the list, so each label appears twice: once projected by the
    // trigger, once as the option. Scope to the options inside the listbox.
    const list = screen.getByRole("listbox");
    const labels = [...list.querySelectorAll("[role='option']")].map((o) => o.textContent);
    expect(labels).toEqual([
      t("zh", "appearance.languageAuto"),
      t("zh", "appearance.languageZh"),
      t("zh", "appearance.languageEn"),
    ]);
  });

  it("shows the stored preference, not the resolved locale", () => {
    // Resolved locale is zh, but the user picked "Follow system" — the trigger must
    // reflect the preference so picking auto is visible and stays selected.
    render(<SettingsPage {...makeProps({ locale: "zh", localePreference: "auto" })} />);
    expect(localeTrigger()).toHaveTextContent(t("zh", "appearance.languageAuto"));
  });

  it("shows an explicit preference when one is set", () => {
    render(<SettingsPage {...makeProps({ locale: "zh", localePreference: "en" })} />);
    expect(localeTrigger()).toHaveTextContent(t("zh", "appearance.languageEn"));
  });

  it("reports the chosen preference upward", () => {
    const props = makeProps({ localePreference: "en" });
    render(<SettingsPage {...props} />);
    fireEvent.click(localeTrigger());
    fireEvent.click(screen.getByText(t("zh", "appearance.languageAuto")));
    expect(props.onLocalePreference).toHaveBeenCalledWith("auto");
  });
});
