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
      const next = await window.pix.runtimes.getStatus();
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
      const next = await window.pix.runtimes.setPrefs({
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
          control={
            <SettingsToggle
              checked={status?.prefs.useBundledNode ?? true}
              disabled={busy || loading || !nodeAvailable}
              onChange={(on) => void setPref({ useBundledNode: on })}
              testId="settings-runtimes-node"
              aria-label={tr("settings.runtimes.useNode")}
            />
          }
        />
        <SettingsRow
          title={tr("settings.runtimes.usePython")}
          description={tr("settings.runtimes.pythonDesc")}
          control={
            <SettingsToggle
              checked={status?.prefs.useBundledPython ?? true}
              disabled={busy || loading || !pythonAvailable}
              onChange={(on) => void setPref({ useBundledPython: on })}
              testId="settings-runtimes-python"
              aria-label={tr("settings.runtimes.usePython")}
            />
          }
          last
        />
      </SettingsSectionBlock>
    </SettingsPageShell>
  );
}
