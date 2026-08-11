/**
 * Docked right env rail: squeezes the thread content (not an overlay).
 * Height follows content. Submenus are FloatingMenu portals (not clipped by the panel).
 */
import type { DetectedApp, GitBranchInfo, GitContextInfo, GitStatusSummary } from "@zeno/contracts";
import {
  Check,
  ChevronRight,
  ExternalLink,
  FileDiff,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Laptop,
  Monitor,
  Plus,
  Search,
  Settings as SettingsIcon,
  SquareTerminal,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { t, type Locale, type MessageKey } from "../lib/i18n.ts";
import { loadEnvPanelVisibility, type EnvPanelVisibility } from "../lib/env-panel-prefs.ts";
import { cn } from "../lib/utils.ts";
import { useShellStore } from "../store/shell-store.ts";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog.tsx";
import { anchorFromEvent, FloatingMenu, type AnchorRect } from "./FloatingMenu.tsx";

export const ENV_PANEL_WIDTH_PX = 300;
/** Outer right margin of the env card (matches `mr-4`). */
export const ENV_PANEL_EDGE_GAP_PX = 16;
/** Minimum width left for timeline/composer when env rail is docked (matches composer default). */
export const ENV_PANEL_MIN_CONTENT_PX = 630;
/** Preferred conversation column width (timeline `min(760px,100%)`). */
export const ENV_PANEL_CONTENT_IDEAL_PX = 760;

/** How the env panel sits relative to the conversation column. */
export type EnvPanelLayoutMode = "float" | "dock" | "none";

/**
 * float — enough right gutter that a 760px-centered column is not covered (no squeeze).
 * dock  — panel would cover content if floated; take flex space and squeeze conversation.
 * none  — cannot keep min content + panel; caller should auto-hide.
 */
export function envPanelLayoutForWidth(columnWidthPx: number): EnvPanelLayoutMode {
  const w = Math.max(0, Math.round(columnWidthPx));
  const panelBudget = ENV_PANEL_WIDTH_PX + ENV_PANEL_EDGE_GAP_PX;
  const contentIdeal = Math.min(ENV_PANEL_CONTENT_IDEAL_PX, w);
  // Centered content free margin on each side.
  const sideGutter = Math.max(0, (w - contentIdeal) / 2);
  if (sideGutter >= panelBudget) return "float";
  if (w >= ENV_PANEL_MIN_CONTENT_PX + panelBudget) return "dock";
  return "none";
}

type FlyoutId = "changes" | "local" | "branch" | "git" | "openIn" | null;
type CommitMode = "commit" | "commitAndPush";

function normalizeCwdKey(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function isValidBranchName(name: string): boolean {
  const n = name.trim();
  if (!n || n.length > 120) return false;
  if (n.startsWith(".") || n.endsWith(".lock")) return false;
  if (n.includes("..") || n.includes("//") || n.includes("@{")) return false;
  if (n.endsWith("/") || n.endsWith(".")) return false;
  if (/[\s~^:?*[\\]/.test(n) || n.includes("\0")) return false;
  return true;
}

export function EnvPanel(props: {
  locale: Locale;
  cwd: string | undefined;
  open: boolean;
  /** float = overlay in right gutter (no squeeze); dock = flex sibling (squeezes). */
  layout?: "float" | "dock";
  onOpenSettings?: () => void;
  onOpenProject?: (path: string) => void;
}) {
  const layout = props.layout ?? "dock";
  const tr = (key: MessageKey, vars?: Record<string, string>) => t(props.locale, key, vars);
  const showAppError = useShellStore((s) => s.showAppError);
  const [worktreeDialogOpen, setWorktreeDialogOpen] = useState(false);
  const [visibility, setVisibility] = useState<EnvPanelVisibility>(loadEnvPanelVisibility);
  const [status, setStatus] = useState<GitStatusSummary | undefined>();
  const [gitContext, setGitContext] = useState<GitContextInfo>({
    branch: "—",
    worktree: "本地",
    isMainWorktree: true,
  });
  const [apps, setApps] = useState<DetectedApp[]>([]);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  /** Only true during mutating git actions — never for background refresh / icon load. */
  const [busy, setBusy] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMode, setCommitMode] = useState<CommitMode>("commit");
  const [commitGenerating, setCommitGenerating] = useState(false);
  const [branchQuery, setBranchQuery] = useState("");
  const [flyout, setFlyout] = useState<FlyoutId>(null);
  const [flyoutAnchor, setFlyoutAnchor] = useState<AnchorRect | null>(null);

  /**
   * Refresh env data without greying out rows. App list (icons) is loaded after
   * git status so the panel stays interactive immediately.
   */
  const refresh = useCallback(async () => {
    if (!props.cwd) {
      setStatus(undefined);
      setApps([]);
      setBranches([]);
      setGitContext({ branch: "—", worktree: "本地", isMainWorktree: true });
      return;
    }
    try {
      const [st, ctx, br] = await Promise.all([
        window.zeno.workspace.gitStatus(props.cwd).catch(() => undefined),
        window.zeno.workspace
          .getGitContext(props.cwd)
          .catch((): GitContextInfo => ({ branch: "—", worktree: "本地", isMainWorktree: true })),
        window.zeno.workspace.listGitBranches(props.cwd).catch(() => [] as GitBranchInfo[]),
      ]);
      setStatus(st);
      setGitContext(ctx);
      setBranches(br);
    } catch {
      // keep previous
    }
    // Icons / app discovery can be slow — never block the whole panel on it.
    void window.zeno.workspace
      .listOpenTargets(props.cwd)
      .then((targets) => setApps(targets))
      .catch(() => setApps([]));
  }, [props.cwd]);

  useEffect(() => {
    if (!props.open) {
      setFlyout(null);
      setFlyoutAnchor(null);
      setCommitOpen(false);
      return;
    }
    setVisibility(loadEnvPanelVisibility());
    void refresh();
  }, [props.open, props.cwd, refresh]);

  useEffect(() => {
    const onPrefs = () => setVisibility(loadEnvPanelVisibility());
    window.addEventListener("zeno-env-panel-prefs", onPrefs);
    return () => window.removeEventListener("zeno-env-panel-prefs", onPrefs);
  }, []);

  async function runGit(action: () => Promise<GitStatusSummary>) {
    setBusy(true);
    try {
      setStatus(await action());
      setCommitMsg("");
      setCommitOpen(false);
      setCommitMode("commit");
      // Refresh git state only — keep rows enabled; don't re-lock for icons.
      if (props.cwd) {
        const [st, ctx, br] = await Promise.all([
          window.zeno.workspace.gitStatus(props.cwd).catch(() => undefined),
          window.zeno.workspace
            .getGitContext(props.cwd)
            .catch((): GitContextInfo => ({ branch: "—", worktree: "本地", isMainWorktree: true })),
          window.zeno.workspace.listGitBranches(props.cwd).catch(() => [] as GitBranchInfo[]),
        ]);
        setStatus(st);
        setGitContext(ctx);
        setBranches(br);
      }
    } catch (error) {
      showAppError(error instanceof Error ? error.message : tr("env.error.git"));
    } finally {
      setBusy(false);
    }
  }

  function closeFlyout() {
    setFlyout(null);
    setFlyoutAnchor(null);
    setBranchQuery("");
  }

  function openFlyout(id: Exclude<FlyoutId, null>, event: ReactMouseEvent) {
    event.stopPropagation();
    if (flyout === id) {
      closeFlyout();
      return;
    }
    setFlyoutAnchor(anchorFromEvent(event.currentTarget));
    setFlyout(id);
  }

  const filteredBranches = useMemo(() => {
    // Local only — hide origin/* remote-tracking branches.
    const locals = branches.filter((b) => {
      if (b.remote) return false;
      if (/^(origin|upstream)\//.test(b.name)) return false;
      return true;
    });
    const q = branchQuery.trim().toLowerCase();
    if (!q) return locals;
    return locals.filter((b) => b.name.toLowerCase().includes(q));
  }, [branches, branchQuery]);

  const canCreateBranch = useMemo(() => {
    const name = branchQuery.trim();
    if (!isValidBranchName(name)) return false;
    return !branches.some((b) => b.name === name || b.name.endsWith(`/${name}`));
  }, [branchQuery, branches]);

  if (!props.open) return null;

  const plusIns = status?.insertions ?? 0;
  const plusDel = status?.deletions ?? 0;
  const changeTrailing =
    status && !status.clean ? (
      <span className="tabular-nums text-[12px]">
        {plusIns > 0 ? <span className="text-emerald-500">+{plusIns.toLocaleString()}</span> : null}
        {plusIns > 0 && plusDel > 0 ? " " : null}
        {plusDel > 0 ? <span className="text-red-400">-{plusDel.toLocaleString()}</span> : null}
        {plusIns === 0 && plusDel === 0 ? (
          <span className="text-[var(--text-subtle)]">{status.changes.length}</span>
        ) : null}
      </span>
    ) : null;

  const localLabel =
    gitContext.isMainWorktree === false && gitContext.worktree
      ? gitContext.worktree
      : tr("composer.local.label");

  const flyoutContent =
    flyout === "changes" ? (
      !status ? (
        <p className="m-0 px-2.5 py-2 text-[12px] text-[var(--text-subtle)]">{tr("env.notGit")}</p>
      ) : status.clean ? (
        <p className="m-0 px-2.5 py-2 text-[12px] text-[var(--text-subtle)]">{tr("env.clean")}</p>
      ) : (
        <ul className="m-0 max-h-[min(50vh,320px)] list-none space-y-0.5 overflow-y-auto p-1.5">
          {status.changes.map((c) => (
            <li
              key={`${c.status}:${c.path}`}
              className="flex min-w-0 gap-1.5 rounded-md px-1.5 py-1 font-mono text-[11px]"
            >
              <span className="w-4 shrink-0 text-[var(--text-subtle)]">{c.status}</span>
              <span className="min-w-0 truncate">{c.path}</span>
            </li>
          ))}
        </ul>
      )
    ) : flyout === "local" ? (
      <div className="flex flex-col gap-0.5 p-1">
        <ActionRow
          icon={<Monitor className="size-3.5" strokeWidth={1.75} />}
          label={tr("composer.local.menuLocal")}
          disabled={busy || gitContext.isMainWorktree !== false}
          onClick={() => {
            const main = gitContext.mainWorktreePath;
            if (!main || !props.cwd) return;
            if (normalizeCwdKey(main) === normalizeCwdKey(props.cwd)) {
              closeFlyout();
              return;
            }
            closeFlyout();
            props.onOpenProject?.(main);
          }}
        />
        <ActionRow
          icon={<Folder className="size-3.5" strokeWidth={1.75} />}
          label={tr("composer.local.menuNewWorktree")}
          disabled={busy || !props.cwd}
          onClick={() => {
            if (!props.cwd) return;
            closeFlyout();
            // Same create dialog as project ⋯ / composer local menu.
            window.setTimeout(() => setWorktreeDialogOpen(true), 0);
          }}
        />
        {props.cwd ? (
          <p className="m-0 break-all px-2 pb-1.5 pt-1 font-mono text-[10px] text-[var(--text-subtle)]">
            {props.cwd}
          </p>
        ) : null}
      </div>
    ) : flyout === "branch" ? (
      // Same UX as composer protrusion branch menu: search → local list → create footer.
      <>
        <div className="flex items-center gap-2 px-3 py-2.5 text-[var(--muted-foreground)]">
          <Search className="size-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
          <input
            autoFocus
            value={branchQuery}
            onChange={(e) => setBranchQuery(e.target.value)}
            placeholder={tr("composer.branch.search")}
            data-testid="env-branch-search"
            disabled={busy}
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[var(--foreground)] outline-none placeholder:text-[var(--text-subtle)] disabled:opacity-50"
          />
        </div>
        <div className="zeno-scroll max-h-[260px] overscroll-contain py-0.5">
          {filteredBranches.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-[var(--text-subtle)]">
              {tr("composer.branch.empty")}
            </p>
          ) : (
            filteredBranches.map((b) => (
              <button
                key={b.name}
                type="button"
                role="menuitem"
                data-testid="env-branch-item"
                disabled={busy}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors disabled:opacity-50",
                  b.current
                    ? "bg-[var(--accent)] text-[var(--foreground)]"
                    : "text-[var(--foreground)] hover:bg-[var(--hover-fill)]",
                )}
                onClick={() => {
                  if (b.current) {
                    closeFlyout();
                    return;
                  }
                  void (async () => {
                    if (!props.cwd || busy) return;
                    setBusy(true);
                    try {
                      const next = await window.zeno.workspace.checkoutGitBranch(b.name, props.cwd);
                      setGitContext(next);
                      closeFlyout();
                      void refresh();
                    } catch (error) {
                      showAppError(
                        error instanceof Error ? error.message : tr("composer.branch.failed"),
                      );
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                <GitBranch className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                {b.current ? (
                  <Check className="size-3.5 shrink-0 opacity-80" strokeWidth={2} />
                ) : null}
              </button>
            ))
          )}
        </div>
        {canCreateBranch ? (
          <div className="border-t border-[var(--divider,var(--border))]">
            <button
              type="button"
              role="menuitem"
              data-testid="env-branch-create"
              disabled={busy}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[var(--foreground)] transition-colors hover:bg-[var(--hover-fill)] disabled:opacity-50"
              onClick={() => {
                void (async () => {
                  const name = branchQuery.trim();
                  if (!props.cwd || !isValidBranchName(name)) return;
                  setBusy(true);
                  try {
                    const next = await window.zeno.workspace.createGitBranch(name, {
                      checkout: true,
                      cwd: props.cwd,
                    });
                    setGitContext(next);
                    setBranchQuery("");
                    closeFlyout();
                    void refresh();
                  } catch (error) {
                    showAppError(
                      error instanceof Error ? error.message : tr("composer.branch.failed"),
                    );
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              <Plus className="size-3.5 shrink-0 opacity-80" strokeWidth={2} />
              <span className="min-w-0 flex-1 truncate">
                {tr("composer.branch.createCheckout", { name: branchQuery.trim() })}
              </span>
            </button>
          </div>
        ) : null}
      </>
    ) : flyout === "git" ? (
      <div className="flex flex-col gap-0.5 p-1">
        <ActionRow
          icon={<GitCommitHorizontal className="size-3.5" strokeWidth={1.75} />}
          label={tr("env.commit")}
          disabled={busy}
          onClick={() => {
            closeFlyout();
            setCommitMode("commit");
            setCommitOpen(true);
          }}
        />
        <ActionRow
          icon={<Upload className="size-3.5" strokeWidth={1.75} />}
          label={tr("env.push")}
          disabled={busy}
          onClick={() => {
            closeFlyout();
            void runGit(() => window.zeno.workspace.gitPush(props.cwd));
          }}
        />
        <ActionRow
          icon={<GitCommitHorizontal className="size-3.5" strokeWidth={1.75} />}
          label={tr("env.commitAndPush")}
          disabled={busy}
          onClick={() => {
            closeFlyout();
            setCommitMode("commitAndPush");
            setCommitOpen(true);
          }}
        />
        <ActionRow
          icon={<GitBranch className="size-3.5" strokeWidth={1.75} />}
          label={tr("env.pull")}
          disabled={busy}
          onClick={() => {
            closeFlyout();
            void runGit(() => window.zeno.workspace.gitPull(props.cwd));
          }}
        />
        <ActionRow
          icon={<GitPullRequest className="size-3.5" strokeWidth={1.75} />}
          label={tr("env.createPr")}
          disabled={busy}
          onClick={() => {
            closeFlyout();
            void window.zeno.workspace
              .openCreatePullRequest(props.cwd)
              .catch((error) =>
                showAppError(error instanceof Error ? error.message : tr("env.error.git")),
              );
          }}
        />
      </div>
    ) : flyout === "openIn" ? (
      <div className="flex max-h-[min(50vh,280px)] flex-col gap-0.5 overflow-y-auto p-1">
        {apps.length === 0 ? (
          <p className="m-0 px-2 py-1.5 text-[12px] text-[var(--text-subtle)]">
            {tr("env.noApps")}
          </p>
        ) : (
          apps.map((app) => (
            <button
              key={app.id}
              type="button"
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-[var(--hover-fill)]"
              disabled={busy}
              onClick={() => {
                closeFlyout();
                void window.zeno.workspace
                  .openInApp(app.id, props.cwd)
                  .catch((error) =>
                    showAppError(error instanceof Error ? error.message : tr("env.error.open")),
                  );
              }}
            >
              <OpenInAppIcon app={app} />
              <span className="min-w-0 flex-1 truncate">
                {app.kind === "finder"
                  ? tr("env.showIn", { name: app.name })
                  : tr("env.openInApp", { name: app.name })}
              </span>
            </button>
          ))
        )}
      </div>
    ) : null;

  return (
    <aside
      className={cn(
        // grid: header auto + body scrolls when card hits max-height (avoids zero-height flex bugs).
        "env-panel surface-panel z-20 grid max-h-[calc(100%-16px)] shrink-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden shadow-none",
        // float: overlay in the right gutter (height follows content, capped by max-h).
        // dock: in-flow sibling that squeezes the conversation column.
        layout === "float"
          ? "pointer-events-auto absolute top-2 right-4"
          : "relative my-2 mr-4 self-start",
      )}
      style={{ width: ENV_PANEL_WIDTH_PX } satisfies CSSProperties}
      data-testid="env-panel"
      data-open="true"
      data-layout={layout}
    >
      {/* Group header (same size as sidebar「项目」) + settings gear */}
      <div className="flex h-9 shrink-0 items-center gap-1 px-2.5 pt-1.5">
        <span className="min-w-0 flex-1 truncate text-[13px] font-normal text-[var(--text-subtle)]">
          {tr("env.title")}
        </span>
        {props.onOpenSettings ? (
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--hover-fill)] hover:text-[var(--foreground)]"
            title={tr("env.openSettings")}
            aria-label={tr("env.openSettings")}
            data-testid="env-panel-settings"
            onClick={props.onOpenSettings}
          >
            <SettingsIcon className="size-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 overflow-y-auto overscroll-contain px-1 pb-1.5">
        {!props.cwd ? (
          <p className="m-0 px-2 py-2 text-[12px] text-[var(--muted-foreground)]">
            {tr("env.noCwd")}
          </p>
        ) : (
          <div className="flex flex-col">
            {visibility.changes ? (
              <MenuRow
                icon={<FileDiff className="size-3.5" strokeWidth={1.75} />}
                label={tr("env.changes")}
                trailing={changeTrailing}
                active={flyout === "changes"}
                onClick={(e) => openFlyout("changes", e)}
                disabled={busy}
              />
            ) : null}
            {visibility.cwd ? (
              <MenuRow
                icon={<Monitor className="size-3.5" strokeWidth={1.75} />}
                label={localLabel}
                active={flyout === "local"}
                onClick={(e) => openFlyout("local", e)}
                disabled={busy}
              />
            ) : null}
            {visibility.branch ? (
              <MenuRow
                icon={<GitBranch className="size-3.5" strokeWidth={1.75} />}
                label={status?.branch || gitContext.branch || tr("env.branchUnknown")}
                active={flyout === "branch"}
                onClick={(e) => openFlyout("branch", e)}
                disabled={busy}
              />
            ) : null}
            {visibility.gitActions ? (
              <MenuRow
                icon={<GitCommitHorizontal className="size-3.5" strokeWidth={1.75} />}
                label={tr("env.gitActions")}
                active={flyout === "git"}
                onClick={(e) => openFlyout("git", e)}
                disabled={busy}
              />
            ) : null}
            {visibility.openIn ? (
              <MenuRow
                icon={<ExternalLink className="size-3.5" strokeWidth={1.75} />}
                label={tr("env.openIn")}
                active={flyout === "openIn"}
                onClick={(e) => openFlyout("openIn", e)}
                disabled={busy}
              />
            ) : null}
            {visibility.localServices ? (
              <MenuRow
                icon={<Laptop className="size-3.5" strokeWidth={1.75} />}
                label={tr("env.localServices")}
                trailing={
                  <span className="text-[11px] text-[var(--text-subtle)]">
                    {tr("env.localServicesEmpty")}
                  </span>
                }
                muted
                showChevron={false}
              />
            ) : null}
          </div>
        )}
      </div>

      <FloatingMenu
        open={Boolean(flyout && flyoutAnchor && props.cwd)}
        anchor={flyoutAnchor}
        onClose={closeFlyout}
        placement="left"
        minWidth={flyout === "branch" ? 280 : 220}
        zIndex={12_000}
        testId={flyout ? `env-flyout-${flyout}` : "env-flyout"}
        className={
          flyout === "branch"
            ? "!rounded-[var(--radius-panel)] !border-[var(--border)] !bg-[var(--surface-panel)] !py-0 overflow-hidden shadow-[var(--shadow-soft)]"
            : "!rounded-[var(--radius-panel)] !bg-[var(--surface-panel)] !py-0"
        }
      >
        {flyoutContent}
      </FloatingMenu>

      <CommitDialog
        open={commitOpen}
        locale={props.locale}
        busy={busy}
        generating={commitGenerating}
        value={commitMsg}
        mode={commitMode}
        {...(props.cwd !== undefined ? { cwd: props.cwd } : {})}
        onChange={setCommitMsg}
        onCancel={() => {
          if (commitGenerating) return;
          setCommitOpen(false);
          setCommitMode("commit");
          setCommitMsg("");
        }}
        onConfirm={async () => {
          let msg = commitMsg.trim();
          if (!msg) {
            setCommitGenerating(true);
            try {
              msg = (await window.zeno.workspace.gitGenerateCommitMessage(props.cwd)).trim();
              setCommitMsg(msg);
            } catch (error) {
              showAppError(error instanceof Error ? error.message : tr("env.commitGenerateFailed"));
              return;
            } finally {
              setCommitGenerating(false);
            }
          }
          if (!msg) {
            showAppError(tr("env.commitGenerateFailed"));
            return;
          }
          if (commitMode === "commitAndPush") {
            await runGit(() => window.zeno.workspace.gitCommitAndPush(msg, props.cwd));
          } else {
            await runGit(() => window.zeno.workspace.gitCommit(msg, props.cwd));
          }
        }}
      />

      <CreateWorktreeDialog
        open={worktreeDialogOpen && Boolean(props.cwd)}
        locale={props.locale}
        projectPath={props.cwd ?? ""}
        onCancel={() => setWorktreeDialogOpen(false)}
        onError={(message) => showAppError(message)}
        onConfirm={({ path }) => {
          setWorktreeDialogOpen(false);
          props.onOpenProject?.(path);
        }}
      />
    </aside>
  );
}

/** App icon with data-URL + onError fallback to lucide (broken extract → blank img). */
function OpenInAppIcon(props: { app: DetectedApp }) {
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(props.app.iconDataUrl) && !failed;
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)]">
      {showImg ? (
        <img
          src={props.app.iconDataUrl}
          alt=""
          className="size-5 object-contain"
          draggable={false}
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : props.app.kind === "finder" ? (
        <Folder className="size-3.5 opacity-70" strokeWidth={1.75} />
      ) : props.app.kind === "terminal" ? (
        <SquareTerminal className="size-3.5 opacity-70" strokeWidth={1.75} />
      ) : (
        <ExternalLink className="size-3.5 opacity-70" strokeWidth={1.75} />
      )}
    </span>
  );
}

function MenuRow(props: {
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
  active?: boolean;
  onClick?: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  muted?: boolean;
  showChevron?: boolean;
}) {
  const showChevron = props.showChevron !== false;
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-[13px] transition-colors",
        props.muted
          ? "cursor-default text-[var(--text-subtle)]"
          : "text-[var(--foreground)] hover:bg-[var(--hover-fill)]",
        props.active && "bg-[var(--accent)]",
        props.disabled && "opacity-50",
      )}
      disabled={props.disabled || props.muted}
      onClick={props.onClick}
    >
      <span className="opacity-70">{props.icon}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{props.label}</span>
      {props.trailing}
      {showChevron && !props.muted ? (
        <ChevronRight className="size-3.5 shrink-0 opacity-50" strokeWidth={2} />
      ) : null}
    </button>
  );
}

function ActionRow(props: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[12px] text-[var(--foreground)] hover:bg-[var(--hover-fill)] disabled:opacity-40"
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span className="opacity-70">{props.icon}</span>
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
    </button>
  );
}

function CommitDialog(props: {
  open: boolean;
  locale: Locale;
  busy: boolean;
  generating?: boolean;
  value: string;
  mode: CommitMode;
  cwd?: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const tr = (key: MessageKey) => t(props.locale, key);
  const locked = props.busy || Boolean(props.generating);
  useEffect(() => {
    if (!props.open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        if (!locked) props.onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props.open, props.onCancel, locked]);

  if (!props.open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/50 p-4"
      data-testid="env-commit-dialog"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !locked) props.onCancel();
      }}
    >
      <div
        className="surface-panel w-full max-w-md p-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="m-0 mb-2 text-[15px] font-semibold text-[var(--foreground)]">
          {props.mode === "commitAndPush" ? tr("env.commitAndPush") : tr("env.commit")}
        </h2>
        <textarea
          className="mb-3 min-h-[96px] w-full resize-y rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[var(--ring,#0a84ff)] disabled:opacity-60"
          placeholder={
            props.generating ? tr("env.commitMessageGenerating") : tr("env.commitMessage")
          }
          value={props.value}
          disabled={locked}
          autoFocus
          onChange={(e) => props.onChange(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="h-8 rounded-lg px-3 text-[13px] text-[var(--muted-foreground)] hover:bg-[var(--hover-fill)]"
            onClick={props.onCancel}
            disabled={locked}
          >
            {tr("common.cancel")}
          </button>
          <button
            type="button"
            className="h-8 rounded-lg bg-[#0a84ff] px-3.5 text-[13px] font-medium text-white hover:bg-[#0a84ff]/90 disabled:opacity-40"
            disabled={locked}
            data-testid="env-commit-confirm"
            onClick={() => void props.onConfirm()}
          >
            {props.generating
              ? tr("env.commitMessageGenerating")
              : props.mode === "commitAndPush"
                ? tr("env.commitAndPush")
                : tr("env.commit")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
