/**
 * Settings → Runtimes: dedicated page for bundled Node.js + Python (default ON).
 */
import type { BundledRuntimeStatus } from "@zeno/contracts";
import { useCallback, useEffect, useState } from "react";
import { t, type Locale, type MessageKey } from "../../lib/i18n.ts";
import {
  SettingsPageShell,
  SettingsPillButton,
  SettingsRow,
  SettingsSectionBlock,
  SettingsToggle,
} from "./SettingsPrimitives.tsx";

export function RuntimesSection(props: { locale: Locale }) {
  const tr = useCallback(
    (key: MessageKey, vars?: Record<string, string>) => t(props.locale, key, vars),
    [props.locale],
  );
  const [status, setStatus] = useState<BundledRuntimeStatus | undefined>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await window.zeno.runtimes.getStatus();
      setStatus(next);
    } catch {
      setStatus(undefined);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function setPref(partial: { useBundledNode?: boolean; useBundledPython?: boolean }) {
    if (!status || busy) return;
    setBusy(true);
    try {
      const next = await window.zeno.runtimes.setPrefs({
        useBundledNode: partial.useBundledNode ?? status.prefs.useBundledNode,
        useBundledPython: partial.useBundledPython ?? status.prefs.useBundledPython,
      });
      setStatus(next);
    } finally {
      setBusy(false);
    }
  }

  const nodeAvailable = Boolean(status?.node?.path);
  const pythonAvailable = Boolean(status?.python?.path);

  /**
   * A runtime that is not installed cannot be switched on or off, so the row reports that
   * instead of drawing a toggle. An enabled-looking switch that silently refuses every
   * click — which is what a `disabled` toggle defaulting to `checked` renders as — tells
   * the user nothing about why.
   */
  function runtimeControl(options: {
    available: boolean;
    checked: boolean;
    testId: string;
    label: string;
    onChange: (on: boolean) => void;
  }) {
    if (loading) {
      // State still unknown: show neither a switch nor a verdict.
      return <span className="block min-w-[1px]" aria-hidden />;
    }
    if (!options.available) {
      return (
        <span
          className="whitespace-nowrap text-[12px] text-[var(--muted-foreground)]"
          title={tr("settings.runtimes.notInstalledHint")}
          data-testid={`${options.testId}-missing`}
        >
          {tr("settings.runtimes.notInstalled")}
        </span>
      );
    }
    return (
      <SettingsToggle
        checked={options.checked}
        disabled={busy}
        onChange={options.onChange}
        testId={options.testId}
        aria-label={options.label}
      />
    );
  }

  return (
    <SettingsPageShell
      title={tr("section.runtimes")}
      testId="settings-runtimes"
      titleAction={
        <SettingsPillButton
          label={tr("settings.runtimes.refresh")}
          testId="runtimes-refresh"
          disabled={loading || busy}
          onClick={() => void refresh()}
        />
      }
    >
      <SettingsSectionBlock label={tr("settings.runtimes.prefs")} testId="settings-runtimes-prefs">
        <SettingsRow
          title={tr("settings.runtimes.useNode")}
          description={tr("settings.runtimes.nodeDesc")}
          control={runtimeControl({
            available: nodeAvailable,
            checked: status?.prefs.useBundledNode ?? true,
            testId: "settings-runtimes-node",
            label: tr("settings.runtimes.useNode"),
            onChange: (on) => void setPref({ useBundledNode: on }),
          })}
        />
        <SettingsRow
          title={tr("settings.runtimes.usePython")}
          description={tr("settings.runtimes.pythonDesc")}
          control={runtimeControl({
            available: pythonAvailable,
            checked: status?.prefs.useBundledPython ?? true,
            testId: "settings-runtimes-python",
            label: tr("settings.runtimes.usePython"),
            onChange: (on) => void setPref({ useBundledPython: on }),
          })}
          last
        />
      </SettingsSectionBlock>
    </SettingsPageShell>
  );
}
