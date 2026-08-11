/**
 * Settings → Pi: SDK source (builtin / global), active version, config files.
 * Descriptions use a stacked layout: status line, optional hint, mono path.
 */
import type { PiConfigFileInfo, PiSdkCandidate, PiSdkSource, PiSdkStatus } from "@zeno/contracts";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { t, type Locale, type MessageKey } from "../../lib/i18n.ts";
import { cn } from "../../lib/utils.ts";
import { useShellStore } from "../../store/shell-store.ts";
import {
  SettingsPageShell,
  SettingsPillButton,
  SettingsRow,
  SettingsSectionBlock,
} from "./SettingsPrimitives.tsx";

function configTitleKey(id: string): MessageKey {
  return `piSdk.config.${id}` as MessageKey;
}

function formatBytes(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMtime(ms: number | undefined, locale: Locale): string {
  if (ms === undefined || !Number.isFinite(ms)) return "";
  try {
    return new Date(ms).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function isBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith("PI_SDK_BUSY:");
}

function busySummary(
  tr: (key: MessageKey, vars?: Record<string, string>) => string,
  status: PiSdkStatus | undefined,
): string | undefined {
  const activity = status?.activity;
  if (!activity?.busy) return undefined;
  const parts: string[] = [];
  if (activity.agentBusy) parts.push(tr("piSdk.busyAgent"));
  if (activity.parkedBusyCount > 0) {
    parts.push(tr("piSdk.busyParked", { count: String(activity.parkedBusyCount) }));
  }
  if (activity.terminalLive) parts.push(tr("piSdk.busyTerminal"));
  return parts.length > 0 ? parts.join(" · ") : tr("piSdk.busyHint");
}

type DescTone = "default" | "muted" | "warn" | "ok" | "error";

function toneClass(tone: DescTone | undefined): string {
  switch (tone) {
    case "warn":
      return "text-amber-600 dark:text-amber-500";
    case "ok":
      return "text-emerald-600 dark:text-emerald-500";
    case "error":
      return "text-destructive";
    case "muted":
      return "text-[var(--text-subtle)]";
    default:
      // Version numbers / main status — same weight as settings description body.
      return "text-[var(--muted-foreground)]";
  }
}

/** Stacked description: primary (version/status), optional hint, mono path. */
function DescStack(props: {
  primary?: string | undefined;
  hint?: string | undefined;
  path?: string | undefined;
  /** Color for the primary line (versions stay default/muted, not green). */
  primaryTone?: DescTone | undefined;
  /** Color for the secondary hint (warn only when action is needed). */
  hintTone?: DescTone | undefined;
  /** @deprecated use primaryTone */
  tone?: DescTone | undefined;
}) {
  const primaryTone = props.primaryTone ?? props.tone ?? "default";
  const hintTone = props.hintTone ?? "muted";

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      {props.primary ? (
        <span className={cn("text-[12px] leading-snug", toneClass(primaryTone))}>
          {props.primary}
        </span>
      ) : null}
      {props.hint ? (
        <span className={cn("text-[11.5px] leading-snug", toneClass(hintTone))}>{props.hint}</span>
      ) : null}
      {props.path ? (
        <span
          className="truncate font-mono text-[11px] leading-snug text-[var(--text-subtle)]"
          title={props.path}
        >
          {props.path}
        </span>
      ) : null}
    </span>
  );
}

function emptyControl(): ReactNode {
  return <span className="block min-w-[1px]" aria-hidden />;
}

/**
 * Status under the source title. Active/available is shown by the right control
 * ("使用中" / "切换"), not repeated in the description.
 */
function sourceStatusLine(
  tr: (key: MessageKey, vars?: Record<string, string>) => string,
  candidate: PiSdkCandidate,
  isActive: boolean,
  showBusyHint: boolean,
): {
  primary: string | undefined;
  primaryTone: DescTone;
  hint?: string;
  hintTone?: DescTone;
} {
  if (!candidate.available) {
    // Button already says "Install"; only surface extra errors (e.g. missing npm).
    const detail =
      candidate.error && !/not installed|click install/i.test(candidate.error)
        ? candidate.error
        : undefined;
    return {
      primary: tr("piSdk.unavailable"),
      primaryTone: "muted",
      ...(detail ? { hint: detail, hintTone: "warn" as const } : {}),
    };
  }
  const version = candidate.version ? `v${candidate.version}` : undefined;
  const busyHint = !isActive && showBusyHint ? tr("piSdk.busyHintShort") : undefined;
  return {
    primary: version,
    // Version number stays neutral; "in use" is shown on the right control.
    primaryTone: "default",
    ...(busyHint ? { hint: busyHint, hintTone: "warn" as const } : {}),
  };
}

export function PiSdkSection(props: { locale: Locale }) {
  const tr = (key: MessageKey, vars?: Record<string, string>) => t(props.locale, key, vars);
  const showAppError = useShellStore((s) => s.showAppError);
  const setStatus = useShellStore((s) => s.setStatus);
  const shellRunning = useShellStore((s) => s.running);
  const runningSessionCount = useShellStore((s) => Object.keys(s.runningSessions).length);
  const [status, setSdkStatus] = useState<PiSdkStatus | undefined>();
  const [files, setFiles] = useState<PiConfigFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [next, list] = await Promise.all([
        window.pix.piSdk.getStatus(),
        window.pix.piSdk.listConfigFiles(),
      ]);
      setSdkStatus(next);
      setFiles(list);
    } catch (error) {
      showAppError(error instanceof Error ? error.message : tr("piSdk.switchFailed"));
    } finally {
      setLoading(false);
    }
  }, [showAppError, props.locale]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activityBusy = Boolean(status?.activity?.busy);
  const uiBusyHint = activityBusy || shellRunning || runningSessionCount > 0;

  async function switchTo(source: PiSdkSource) {
    if (!status || status.activeSource === source || busy) return;
    const candidate = status.candidates.find((c) => c.source === source);
    if (!candidate?.available) return;

    let latest = status;
    try {
      latest = await window.pix.piSdk.getStatus();
      setSdkStatus(latest);
    } catch {
      // keep previous status
    }

    const isBusy = Boolean(latest.activity?.busy) || shellRunning || runningSessionCount > 0;
    const confirmMsg = isBusy ? tr("piSdk.switchConfirmBusy") : tr("piSdk.switchConfirm");
    if (!window.confirm(confirmMsg)) return;

    setBusy(true);
    try {
      const next = await window.pix.piSdk.setSource(source, { force: isBusy });
      setSdkStatus(next);
      setFiles(await window.pix.piSdk.listConfigFiles());
      setStatus(
        tr("piSdk.using") +
          ` · ${source === "builtin" ? tr("piSdk.builtin") : tr("piSdk.global")}` +
          (next.activeVersion ? ` ${next.activeVersion}` : ""),
      );
    } catch (error) {
      if (isBusyError(error)) {
        if (window.confirm(tr("piSdk.switchConfirmBusy"))) {
          try {
            const next = await window.pix.piSdk.setSource(source, { force: true });
            setSdkStatus(next);
            setFiles(await window.pix.piSdk.listConfigFiles());
            return;
          } catch (retryError) {
            showAppError(
              retryError instanceof Error ? retryError.message : tr("piSdk.switchFailed"),
            );
          }
        } else {
          setStatus(tr("piSdk.switchBusyRefused"));
        }
      } else {
        showAppError(error instanceof Error ? error.message : tr("piSdk.switchFailed"));
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function installOrUpdateGlobal(mode: "install" | "update") {
    setBusy(true);
    try {
      const result = await window.pix.piSdk.installGlobal();
      if (result.error) {
        showAppError(result.error);
      } else {
        const next = await window.pix.piSdk.checkLatest();
        setSdkStatus(next);
        setFiles(await window.pix.piSdk.listConfigFiles());
        if (mode === "update" && (result.version || next.latestVersion)) {
          setStatus(
            tr("piSdk.updateDone", {
              version: result.version ?? next.latestVersion ?? "",
            }),
          );
        }
      }
      await refresh();
    } catch (error) {
      showAppError(error instanceof Error ? error.message : tr("piSdk.switchFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function checkLatest() {
    setBusy(true);
    try {
      const next = await window.pix.piSdk.checkLatest();
      setSdkStatus(next);
    } catch (error) {
      showAppError(error instanceof Error ? error.message : tr("piSdk.switchFailed"));
    } finally {
      setBusy(false);
    }
  }

  const appliedMismatch = Boolean(status?.needsRestart);
  const busyLine = busySummary(tr, status);
  /** One-line notice above sources when applying or work is in progress. */
  const runtimeNotice = busyLine
    ? busyLine
    : appliedMismatch
      ? tr("piSdk.needsRestart")
      : loading
        ? tr("piSdk.loading")
        : undefined;

  const latestPrimary = status?.latestVersion
    ? `v${status.latestVersion}`
    : status?.latestError
      ? `${tr("piSdk.latestUnknown")} · ${status.latestError}`
      : loading
        ? tr("piSdk.loading")
        : tr("piSdk.latestUnknown");
  const latestHint = status?.globalUpdateAvailable
    ? tr("piSdk.latestBehindGlobal", { version: status.latestVersion ?? "?" })
    : status?.builtinBehindLatest
      ? tr("piSdk.latestBehindBuiltin")
      : status?.latestVersion
        ? tr("piSdk.upToDate")
        : undefined;

  return (
    <SettingsPageShell
      title={tr("section.pi")}
      testId="settings-pi-sdk"
      titleAction={
        <div className="flex flex-wrap items-center gap-1.5">
          <SettingsPillButton
            label={tr("piSdk.checkLatest")}
            testId="pi-sdk-check-latest"
            disabled={loading || busy}
            onClick={() => void checkLatest()}
          />
          <SettingsPillButton
            label={tr("piSdk.refresh")}
            testId="pi-sdk-refresh"
            disabled={loading || busy}
            onClick={() => void refresh()}
          />
        </div>
      }
    >
      <SettingsSectionBlock label={tr("piSdk.sources")} testId="pi-sdk-sources">
        {runtimeNotice ? (
          <SettingsRow
            title={tr("piSdk.status")}
            description={<DescStack primary={runtimeNotice} primaryTone="warn" />}
            control={emptyControl()}
            testId="pi-sdk-runtime-notice"
          />
        ) : null}
        <SettingsRow
          title={tr("piSdk.latest")}
          description={
            <DescStack
              primary={latestPrimary}
              primaryTone={
                status?.latestError ? "warn" : status?.latestVersion ? "default" : "muted"
              }
              hint={latestHint}
              hintTone={
                status?.globalUpdateAvailable || status?.builtinBehindLatest ? "warn" : "muted"
              }
            />
          }
          control={
            status?.globalUpdateAvailable ? (
              <SettingsPillButton
                label={busy ? tr("piSdk.updating") : tr("piSdk.updateGlobal")}
                testId="pi-sdk-update-global-latest"
                disabled={busy || loading}
                onClick={() => void installOrUpdateGlobal("update")}
              />
            ) : (
              emptyControl()
            )
          }
          testId="pi-sdk-latest"
        />
        {(status?.candidates ?? []).map((candidate) => {
          const isActive = status?.activeSource === candidate.source;
          const title = candidate.source === "builtin" ? tr("piSdk.builtin") : tr("piSdk.global");
          const line = sourceStatusLine(tr, candidate, isActive, !isActive && uiBusyHint);
          const path = candidate.cliPath || candidate.packageRoot;
          const isGlobal = candidate.source === "global";
          const globalNeedsInstall = isGlobal && !candidate.available;
          const globalNeedsUpdate = isGlobal && Boolean(status?.globalUpdateAvailable);

          let control: ReactNode;
          if (globalNeedsInstall) {
            control = (
              <SettingsPillButton
                label={busy ? tr("piSdk.installing") : tr("piSdk.installGlobal")}
                testId="pi-sdk-install-global"
                disabled={busy || loading}
                onClick={() => void installOrUpdateGlobal("install")}
              />
            );
          } else if (globalNeedsUpdate) {
            control = (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <SettingsPillButton
                  label={busy ? tr("piSdk.updating") : tr("piSdk.updateGlobal")}
                  testId="pi-sdk-update-global"
                  disabled={busy || loading}
                  onClick={() => void installOrUpdateGlobal("update")}
                />
                {!isActive ? (
                  <SettingsPillButton
                    label={tr("piSdk.use")}
                    testId="pi-sdk-use-global"
                    disabled={busy || loading}
                    onClick={() => void switchTo("global")}
                  />
                ) : (
                  <SettingsPillButton
                    label={tr("piSdk.using")}
                    testId="pi-sdk-global-active"
                    disabled
                  />
                )}
              </div>
            );
          } else if (isActive) {
            control = (
              <SettingsPillButton
                label={tr("piSdk.using")}
                testId={`pi-sdk-${candidate.source}-active`}
                disabled
              />
            );
          } else {
            control = (
              <SettingsPillButton
                label={tr("piSdk.use")}
                testId={`pi-sdk-use-${candidate.source}`}
                disabled={busy || loading || !candidate.available}
                onClick={() => void switchTo(candidate.source)}
              />
            );
          }

          return (
            <SettingsRow
              key={candidate.source}
              title={title}
              description={
                <DescStack
                  primary={line.primary}
                  primaryTone={line.primaryTone}
                  hint={line.hint}
                  hintTone={line.hintTone}
                  path={path}
                />
              }
              control={control}
              last={false}
            />
          );
        })}
        <SettingsRow
          title={tr("piSdk.agentDir")}
          description={<DescStack path={status?.agentDir} />}
          control={emptyControl()}
          last
        />
      </SettingsSectionBlock>

      <SettingsSectionBlock label={tr("piSdk.configFiles")} testId="pi-sdk-config-files">
        {files.length === 0 && loading ? (
          <SettingsRow
            title={tr("piSdk.loading")}
            description={<DescStack primary="…" />}
            control={emptyControl()}
            last
          />
        ) : (
          files.map((file, index) => {
            const meta = file.exists
              ? [formatBytes(file.sizeBytes), formatMtime(file.mtimeMs, props.locale)]
                  .filter(Boolean)
                  .join(" · ")
              : tr("piSdk.config.missing");
            return (
              <SettingsRow
                key={file.id}
                title={tr(configTitleKey(file.id))}
                description={
                  <DescStack
                    primary={meta}
                    path={file.path}
                    tone={file.exists ? "default" : "warn"}
                  />
                }
                control={
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <SettingsPillButton
                      label={tr("piSdk.config.reveal")}
                      testId={`pi-sdk-reveal-${file.id}`}
                      disabled={!file.exists || busy}
                      onClick={() => {
                        void window.pix.piSdk.revealConfig(file.id).catch((error) => {
                          showAppError(error instanceof Error ? error.message : String(error));
                        });
                      }}
                    />
                    {file.openable ? (
                      <SettingsPillButton
                        label={tr("piSdk.config.open")}
                        testId={`pi-sdk-open-${file.id}`}
                        disabled={!file.exists || busy}
                        onClick={() => {
                          void window.pix.piSdk.openConfig(file.id).catch((error) => {
                            showAppError(error instanceof Error ? error.message : String(error));
                          });
                        }}
                      />
                    ) : null}
                  </div>
                }
                last={index === files.length - 1}
              />
            );
          })
        )}
      </SettingsSectionBlock>
    </SettingsPageShell>
  );
}
