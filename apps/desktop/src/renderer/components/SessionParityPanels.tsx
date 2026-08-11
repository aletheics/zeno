/**
 * Session tree + session info surfaces (pi parity).
 * List is flat (no tree indentation/connectors) — order is still branch walk order.
 */
import type {
  SessionInfoView,
  SessionTreeNodeView,
  SessionTreeRoleKind,
  SessionTreeView,
} from "@zeno/contracts";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Bot,
  GitBranch,
  LoaderCircle,
  Minimize2,
  RefreshCw,
  Settings2,
  Tag,
  User,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsInput, SettingsSelect } from "./settings/SettingsPrimitives.tsx";
import { t, type Locale, type MessageKey } from "../lib/i18n.ts";
import { cn } from "../lib/utils.ts";

type TreeBusyPhase = "idle" | "navigate" | "summarize" | "fork";

function roleLabel(locale: Locale, kind: SessionTreeRoleKind | undefined): string {
  const key: MessageKey =
    kind === "user"
      ? "sessionTree.role.user"
      : kind === "assistant"
        ? "sessionTree.role.assistant"
        : kind === "tool"
          ? "sessionTree.role.tool"
          : kind === "compaction"
            ? "sessionTree.role.compaction"
            : kind === "branch_summary"
              ? "sessionTree.role.branch"
              : kind === "system"
                ? "sessionTree.role.system"
                : "sessionTree.role.other";
  return t(locale, key);
}

function roleIcon(kind: SessionTreeRoleKind | undefined): ReactNode {
  const props = { className: "size-3 shrink-0", strokeWidth: 2.25 } as const;
  switch (kind) {
    case "user":
      return <User {...props} />;
    case "assistant":
      return <Bot {...props} />;
    case "tool":
      return <Wrench {...props} />;
    case "compaction":
      return <Minimize2 {...props} />;
    case "branch_summary":
      return <GitBranch {...props} />;
    case "system":
      return <Settings2 {...props} />;
    default:
      return <Tag {...props} />;
  }
}

export function SessionTreePanel(props: {
  open: boolean;
  locale: Locale;
  tree: SessionTreeView | undefined;
  loading?: boolean | undefined;
  error?: string | undefined;
  mode?: "navigate" | "fork";
  onClose: () => void;
  onNavigate: (
    node: SessionTreeNodeView,
    options?: { summarize?: boolean; customInstructions?: string },
  ) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
}) {
  const [summaryMode, setSummaryMode] = useState<"none" | "auto" | "custom">("none");
  const [customInstructions, setCustomInstructions] = useState("");
  const [busy, setBusy] = useState<TreeBusyPhase>("idle");

  // Reset progress chrome when the dialog is closed/reopened.
  useEffect(() => {
    if (!props.open) setBusy("idle");
  }, [props.open]);

  if (!props.open) return null;
  const tr = (key: MessageKey, vars?: Record<string, string>) => t(props.locale, key, vars);
  const forkMode = props.mode === "fork";
  const isBusy = busy !== "idle";
  const fileLabel = props.tree?.sessionFile
    ? props.tree.sessionFile.split(/[/\\]/).pop() || props.tree.sessionFile
    : props.tree?.sessionId?.slice(0, 8);

  async function handleNavigate(
    node: SessionTreeNodeView,
    options?: { summarize?: boolean; customInstructions?: string },
  ) {
    if (isBusy) return;
    const phase: TreeBusyPhase = forkMode ? "fork" : options?.summarize ? "summarize" : "navigate";
    setBusy(phase);
    try {
      await props.onNavigate(node, options);
    } finally {
      // Parent closes the panel on success; if it stays open (cancel/error), clear busy.
      setBusy("idle");
    }
  }

  const busyLabel =
    busy === "summarize"
      ? tr("sessionTree.busy.summarizing")
      : busy === "fork"
        ? tr("sessionTree.busy.forking")
        : busy === "navigate"
          ? tr("sessionTree.busy.navigating")
          : "";

  // Full-screen mask only — no in-dialog progress chrome while busy.
  if (isBusy) {
    return (
      <div
        className="palette-backdrop session-tree-busy-backdrop"
        data-testid="session-tree-panel"
        data-busy={busy}
        role="alertdialog"
        aria-modal="true"
        aria-busy="true"
        aria-label={busyLabel}
      >
        <div
          className="session-tree-busy"
          data-testid="session-tree-busy"
          data-phase={busy}
          role="status"
          aria-live="polite"
        >
          <LoaderCircle className="size-6 shrink-0 animate-spin" strokeWidth={1.75} />
          <span className="session-tree-busy-label">{busyLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="palette-backdrop"
      data-testid="session-tree-panel"
      data-busy="idle"
      onClick={props.onClose}
    >
      <div
        className="palette-panel session-tree-panel"
        role="dialog"
        aria-modal="true"
        aria-label={tr(forkMode ? "sessionTree.forkTitle" : "sessionTree.title")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="session-tree-header">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold tracking-tight">
              {tr(forkMode ? "sessionTree.forkTitle" : "sessionTree.title")}
            </div>
            <div
              className="mt-1 truncate text-[12px] leading-snug text-[var(--text-subtle)]"
              title={props.tree?.sessionFile ?? props.tree?.sessionId}
            >
              {fileLabel ?? "—"}
              {props.tree
                ? ` · ${tr("sessionTree.nodes", { count: String(props.tree.nodes.length) })}`
                : ""}
            </div>
          </div>
          {/* Refresh reloads tree from the live session (new turns / forks / labels). */}
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              data-testid="session-tree-refresh"
              disabled={props.loading}
              title={tr("sessionTree.refreshHint")}
              aria-label={tr("sessionTree.refresh")}
              onClick={() => void props.onRefresh()}
            >
              <RefreshCw
                className={cn("size-4", props.loading && "animate-spin")}
                strokeWidth={1.75}
              />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              data-testid="session-tree-close"
              title={tr("sessionTree.close")}
              aria-label={tr("sessionTree.close")}
              onClick={props.onClose}
            >
              <X className="size-4" strokeWidth={1.75} />
            </Button>
          </div>
        </div>

        {props.error ? (
          <div className="px-4 py-2 text-sm text-red-500" data-testid="session-tree-error">
            {props.error}
          </div>
        ) : null}

        {forkMode ? (
          <div className="px-4 py-2.5 text-[12px] leading-relaxed text-[var(--muted-foreground)]">
            {tr("sessionTree.forkHint")}
          </div>
        ) : null}

        {!forkMode ? (
          <div className="flex flex-col gap-2.5 border-y border-[var(--border-subtle)] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-[12px] text-[var(--muted-foreground)]">
                {tr("sessionTree.summary")}
              </span>
              <SettingsSelect
                testId="session-tree-summary-mode"
                size="md"
                className="min-w-[10rem]"
                value={summaryMode}
                onChange={(v) => setSummaryMode(v as "none" | "auto" | "custom")}
                options={[
                  { value: "none", label: tr("sessionTree.summary.none") },
                  { value: "auto", label: tr("sessionTree.summary.auto") },
                  { value: "custom", label: tr("sessionTree.summary.custom") },
                ]}
              />
            </div>
            {summaryMode === "custom" ? (
              <SettingsInput
                data-testid="session-tree-summary-custom"
                value={customInstructions}
                onChange={(event) => setCustomInstructions(event.target.value)}
                placeholder={tr("sessionTree.summary.placeholder")}
                className="h-9 w-full"
              />
            ) : null}
          </div>
        ) : null}

        <ul className="session-tree-list" data-testid="session-tree-list">
          {props.loading ? (
            <li className="session-tree-empty">{tr("sessionTree.loading")}</li>
          ) : !props.tree || props.tree.nodes.length === 0 ? (
            <li className="session-tree-empty">{tr("sessionTree.empty")}</li>
          ) : (
            props.tree.nodes.map((node) => {
              const kind = node.roleKind ?? "other";
              const roleText = roleLabel(props.locale, kind);
              const customLabel = node.label?.trim();
              const fullText = (node.preview || node.id).trim();
              return (
                <li key={node.id}>
                  <button
                    type="button"
                    className={cn(
                      "session-tree-item",
                      node.active && "session-tree-item-active",
                      node.onActivePath && !node.active && "session-tree-item-path",
                    )}
                    data-testid={`session-tree-node-${node.id}`}
                    data-active={node.active ? "true" : "false"}
                    data-role={kind}
                    disabled={forkMode && kind !== "user"}
                    onClick={() =>
                      void handleNavigate(
                        node,
                        forkMode
                          ? undefined
                          : summaryMode === "none"
                            ? { summarize: false }
                            : summaryMode === "auto"
                              ? { summarize: true }
                              : {
                                  summarize: true,
                                  customInstructions: customInstructions.trim(),
                                },
                      )
                    }
                    // Native tooltip: full message when the row is ellipsized.
                    title={fullText}
                  >
                    <span
                      className={cn("session-tree-badge", `session-tree-badge-${kind}`)}
                      aria-label={roleText}
                    >
                      {roleIcon(kind)}
                      <span className="session-tree-badge-text">{roleText}</span>
                    </span>
                    {customLabel ? (
                      <span
                        className="session-tree-user-label"
                        title={tr("sessionTree.userLabel", { name: customLabel })}
                      >
                        <Tag className="size-3 shrink-0" strokeWidth={2.25} />
                        <span className="session-tree-user-label-text">{customLabel}</span>
                      </span>
                    ) : null}
                    <span className="session-tree-preview">{fullText || node.id.slice(0, 8)}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

export function SessionInfoPanel(props: {
  open: boolean;
  locale: Locale;
  info: SessionInfoView | undefined;
  loading?: boolean | undefined;
  error?: string | undefined;
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
  onRename: (name: string) => void | Promise<void>;
  onExport: (format: "html" | "jsonl") => void | Promise<void>;
  onShare?: () => void | Promise<void>;
  onClone: () => void | Promise<void>;
  onCompact: () => void | Promise<void>;
}) {
  const [name, setName] = useState(props.info?.sessionName ?? "");
  useEffect(() => {
    setName(props.info?.sessionName ?? "");
  }, [props.info?.sessionName, props.open]);

  if (!props.open) return null;
  const tr = (key: MessageKey, vars?: Record<string, string>) => t(props.locale, key, vars);
  const tokens = props.info?.tokens;
  const pathFull = props.info?.path ?? props.info?.sessionFile;
  const fileLabel = pathFull
    ? pathFull.split(/[/\\]/).pop() || pathFull
    : props.info?.sessionId?.slice(0, 8);

  return (
    <div className="palette-backdrop" data-testid="session-info-panel" onClick={props.onClose}>
      <div
        className="palette-panel session-tree-panel session-info-panel"
        role="dialog"
        aria-modal="true"
        aria-label={tr("sessionInfo.title")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="session-tree-header">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold tracking-tight">
              {tr("sessionInfo.title")}
            </div>
            <div
              className="mt-1 truncate text-[12px] leading-snug text-[var(--text-subtle)]"
              title={pathFull ?? props.info?.sessionId}
            >
              {fileLabel ?? "—"}
              {props.info != null
                ? ` · ${tr("sessionInfo.messages")}: ${props.info.messageCount}`
                : ""}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              data-testid="session-info-refresh"
              disabled={props.loading}
              title={tr("sessionInfo.refreshHint")}
              aria-label={tr("sessionInfo.refresh")}
              onClick={() => void props.onRefresh()}
            >
              <RefreshCw
                className={cn("size-4", props.loading && "animate-spin")}
                strokeWidth={1.75}
              />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              data-testid="session-info-close"
              title={tr("sessionInfo.close")}
              aria-label={tr("sessionInfo.close")}
              onClick={props.onClose}
            >
              <X className="size-4" strokeWidth={1.75} />
            </Button>
          </div>
        </div>

        {props.error ? (
          <div className="px-4 py-2 text-sm text-red-500" data-testid="session-info-error">
            {props.error}
          </div>
        ) : null}

        {props.loading && !props.info ? (
          <div className="session-tree-empty" data-testid="session-info-loading">
            {tr("sessionInfo.loading")}
          </div>
        ) : !props.info ? (
          <div className="session-tree-empty">{tr("sessionInfo.loading")}</div>
        ) : (
          <div className="session-tree-list session-info-body" data-testid="session-info-body">
            <div className="session-info-field">
              <div className="session-info-label">{tr("sessionInfo.path")}</div>
              <div
                className="session-info-value session-info-value-mono break-all"
                data-testid="session-info-path"
                title={pathFull ?? undefined}
              >
                {pathFull ?? "—"}
              </div>
            </div>

            <div className="session-info-field">
              <div className="session-info-label">{tr("sessionInfo.id")}</div>
              <div
                className="session-info-value session-info-value-mono"
                data-testid="session-info-id"
              >
                {props.info.sessionId}
              </div>
            </div>

            <div className="session-info-field">
              <div className="session-info-label">{tr("sessionInfo.name")}</div>
              <div className="mt-1.5 flex items-center gap-2">
                <SettingsInput
                  data-testid="session-info-name-input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={tr("sessionInfo.namePlaceholder")}
                  className="h-9 min-w-0 flex-1"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void props.onRename(name.trim());
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  data-testid="session-info-name-save"
                  onClick={() => void props.onRename(name.trim())}
                >
                  {tr("sessionInfo.save")}
                </Button>
              </div>
            </div>

            <div className="session-info-stats">
              <div className="session-info-stat">
                <div className="session-info-label">{tr("sessionInfo.messages")}</div>
                <div className="session-info-stat-value" data-testid="session-info-messages">
                  {props.info.messageCount}
                </div>
              </div>
              <div className="session-info-stat">
                <div className="session-info-label">{tr("sessionInfo.cost")}</div>
                <div className="session-info-stat-value" data-testid="session-info-cost">
                  {props.info.cost.toFixed(4)}
                </div>
              </div>
              <div className="session-info-stat">
                <div className="session-info-label">{tr("sessionInfo.tokens")}</div>
                <div className="session-info-stat-value" data-testid="session-info-tokens">
                  {tokens?.total ?? 0}
                </div>
              </div>
              <div className="session-info-stat">
                <div className="session-info-label">{tr("sessionInfo.context")}</div>
                <div className="session-info-stat-value" data-testid="session-info-context">
                  {props.info.context?.percent != null
                    ? `${Math.round(props.info.context.percent)}%`
                    : "—"}
                </div>
              </div>
            </div>

            <div className="session-info-actions">
              {props.onShare ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="session-info-share"
                  onClick={() => void props.onShare?.()}
                >
                  {tr("sessionInfo.share")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="session-info-export-jsonl"
                onClick={() => void props.onExport("jsonl")}
              >
                {tr("sessionInfo.exportJsonl")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="session-info-export-html"
                onClick={() => void props.onExport("html")}
              >
                {tr("sessionInfo.exportHtml")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="session-info-clone"
                onClick={() => void props.onClone()}
              >
                {tr("sessionInfo.clone")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="session-info-compact"
                onClick={() => void props.onCompact()}
              >
                {tr("sessionInfo.compact")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
