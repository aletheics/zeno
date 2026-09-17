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
   * The switch stays visible when a runtime is missing, but it is disabled — so the row
   * carries the reason. Without it the row reads as an ON switch that silently refuses
   * every click; developers run with no bundled runtimes by default, so this is the
   * common case, not an edge one.
   */
  function runtimeDescription(desc: string, available: boolean, testId: string) {
    if (loading || available) return desc;
    return (
      <span className="flex flex-col gap-0.5">
        <span>{desc}</span>
        <span className="text-[var(--warning)]" data-testid={`${testId}-missing`}>
          {tr("settings.runtimes.notInstalledHint")}
        </span>
      </span>
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
          description={runtimeDescription(
            tr("settings.runtimes.nodeDesc"),
            nodeAvailable,
            "settings-runtimes-node",
          )}
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
          description={runtimeDescription(
            tr("settings.runtimes.pythonDesc"),
            pythonAvailable,
            "settings-runtimes-python",
          )}
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
