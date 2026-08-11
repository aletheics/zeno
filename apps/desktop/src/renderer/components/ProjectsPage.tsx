/**
 * Full-page project manager (list layout → sidebar「项目」nav).
 *
 * Row: folder · name [chevron] · updated · … / pin / new-session
 * … menu: 归档 · 移除
 * Expand shows project sessions under the card (hover highlight on project row).
 */
import type { SessionThreadSummary } from "@zeno/contracts";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Folder,
  MoreHorizontal,
  Pin,
  PinOff,
  Search,
  SquarePen,
} from "lucide-react";
import { useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { t, type Locale, type MessageKey } from "../lib/i18n.ts";
import {
  archiveProject,
  hasThreadMessages,
  isArchivedThread,
  isDeletedThread,
  isPinnedProject,
  loadArchivedProjects,
  loadArchivedThreads,
  loadDeletedThreads,
  loadPinnedProjects,
  loadProjectAliases,
  projectDisplayName,
  threadDisplayTitle,
  togglePinnedProject,
} from "../lib/project-prefs.ts";
import { cn } from "../lib/utils.ts";
import {
  isNonProjectWorkspacePath,
  normalizeWorkspaceKey,
  workspaceLabel,
} from "../lib/workspace.ts";
import { anchorFromEvent, FloatingMenu, type AnchorRect } from "./FloatingMenu.tsx";

export type ProjectsPageProps = {
  locale: Locale;
  workspacePath: string | undefined;
  recentWorkspaces: string[];
  threadsByCwd: Record<string, SessionThreadSummary[]>;
  onOpenProject: (path: string) => void;
  onCreateProject: () => void;
  onNewSession: (path: string) => void;
  onOpenSession: (sessionPath: string, projectCwd: string) => void;
  onRemoveProject: (path: string) => void;
};

type SortKey = "name" | "updated";
type SortDir = "asc" | "desc";

type ProjectRow = {
  path: string;
  name: string;
  updatedAt: string | undefined;
  pinned: boolean;
  sessions: SessionThreadSummary[];
};

function threadsForProject(
  path: string,
  threadsByCwd: Record<string, SessionThreadSummary[]>,
  archivedThreads: readonly string[],
  deletedThreads: readonly string[],
): SessionThreadSummary[] {
  const key = normalizeWorkspaceKey(path);
  const list =
    threadsByCwd[key] ??
    threadsByCwd[path] ??
    Object.entries(threadsByCwd).find(([k]) => normalizeWorkspaceKey(k) === key)?.[1] ??
    [];
  return list
    .filter(
      (t) =>
        hasThreadMessages(t) &&
        !isArchivedThread(t.id, archivedThreads) &&
        !isDeletedThread(t.id, deletedThreads),
    )
    .sort((a, b) => (b.modifiedAt || "").localeCompare(a.modifiedAt || ""));
}

function latestThreadTime(sessions: SessionThreadSummary[]): string | undefined {
  let best: string | undefined;
  for (const thread of sessions) {
    const at = thread.modifiedAt?.trim();
    if (!at) continue;
    if (!best || at > best) best = at;
  }
  return best;
}

function formatRelativeUpdated(
  iso: string | undefined,
  tr: (key: MessageKey, vars?: Record<string, string>) => string,
): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "—";
  const ms = Date.now() - then;
  if (ms < 0) return "—";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return tr("projectsPage.justNow");
  if (min < 60) return tr("projectsPage.minutes", { n: String(min) });
  const hr = Math.floor(min / 60);
  if (hr < 24) return tr("projectsPage.hours", { n: String(hr) });
  const day = Math.floor(hr / 24);
  if (day < 7) return tr("projectsPage.days", { n: String(day) });
  const week = Math.floor(day / 7);
  if (week < 5) return tr("projectsPage.weeks", { n: String(week) });
  const month = Math.floor(day / 30);
  if (month < 12) return tr("projectsPage.months", { n: String(month) });
  const year = Math.floor(day / 365);
  return tr("projectsPage.years", { n: String(Math.max(1, year)) });
}

export function ProjectsPage(props: ProjectsPageProps) {
  const tr = (key: MessageKey, vars?: Record<string, string>) => t(props.locale, key, vars);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pinned, setPinned] = useState(loadPinnedProjects);
  const [archived, setArchived] = useState(loadArchivedProjects);
  const [aliases] = useState(loadProjectAliases);
  const [archivedThreads] = useState(loadArchivedThreads);
  const [deletedThreads] = useState(loadDeletedThreads);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);

  const rows = useMemo(() => {
    const seen = new Set<string>();
    const paths: string[] = [];
    const archivedKeys = new Set(archived.map((p) => normalizeWorkspaceKey(p)));
    const push = (raw: string | undefined) => {
      if (!raw || isNonProjectWorkspacePath(raw)) return;
      const key = normalizeWorkspaceKey(raw);
      if (!key || seen.has(key) || archivedKeys.has(key)) return;
      seen.add(key);
      paths.push(raw);
    };
    push(props.workspacePath);
    for (const p of props.recentWorkspaces) push(p);
    for (const p of pinned) push(p);

    const q = query.trim().toLowerCase();
    const mapped: ProjectRow[] = paths.map((path) => {
      const label = workspaceLabel(path);
      const name = projectDisplayName(path, aliases, label.name);
      const sessions = threadsForProject(path, props.threadsByCwd, archivedThreads, deletedThreads);
      return {
        path,
        name,
        updatedAt: latestThreadTime(sessions),
        pinned: isPinnedProject(path, pinned),
        sessions,
      };
    });

    const filtered = q
      ? mapped.filter(
          (row) =>
            row.name.toLowerCase().includes(q) ||
            row.path.toLowerCase().includes(q) ||
            row.sessions.some((s) => (s.title || "").toLowerCase().includes(q)),
        )
      : mapped;

    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "name") {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) * dir;
      }
      const at = a.updatedAt ?? "";
      const bt = b.updatedAt ?? "";
      if (at && bt) return at.localeCompare(bt) * dir;
      if (at) return -1 * dir;
      if (bt) return 1 * dir;
      return a.name.localeCompare(b.name) * dir;
    });
  }, [
    props.workspacePath,
    props.recentWorkspaces,
    props.threadsByCwd,
    pinned,
    archived,
    aliases,
    archivedThreads,
    deletedThreads,
    query,
    sortKey,
    sortDir,
  ]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "name" ? "asc" : "desc");
  }

  function toggleExpand(path: string) {
    const key = normalizeWorkspaceKey(path);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function openMenu(path: string, event: ReactMouseEvent) {
    event.stopPropagation();
    if (menuPath === path) {
      setMenuPath(null);
      setMenuAnchor(null);
      return;
    }
    setMenuPath(path);
    setMenuAnchor(anchorFromEvent(event.currentTarget));
  }

  function closeMenu() {
    setMenuPath(null);
    setMenuAnchor(null);
  }

  function notifyRail() {
    try {
      window.dispatchEvent(new Event("pix-project-rail-changed"));
    } catch {
      // ignore
    }
  }

  function handlePin(path: string, event?: ReactMouseEvent) {
    event?.stopPropagation();
    setPinned(togglePinnedProject(path));
    notifyRail();
  }

  function handleArchive(path: string) {
    setArchived(archiveProject(path));
    notifyRail();
    closeMenu();
  }

  function handleRemove(path: string) {
    closeMenu();
    props.onRemoveProject(path);
  }

  return (
    <section className="page projects-page" data-testid="projects-page">
      <header className="page-header projects-page-header">
        <h1>{tr("projectsPage.title")}</h1>
        <div className="page-header-actions">
          <button
            type="button"
            className="projects-page-create cursor-pointer"
            data-testid="projects-page-create"
            onClick={props.onCreateProject}
          >
            {tr("projectsPage.create")}
          </button>
        </div>
      </header>

      <div className="page-body projects-page-body">
        <div className="projects-page-inner">
          <div className="projects-page-search" data-testid="projects-page-search">
            <Search className="size-4 shrink-0 opacity-55" strokeWidth={1.75} aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("projectsPage.search")}
              data-testid="projects-page-search-input"
              className="projects-page-search-input"
            />
          </div>

          <div className="projects-page-table" role="table" aria-label={tr("projectsPage.title")}>
            <div className="projects-page-table-head" role="row">
              <button
                type="button"
                role="columnheader"
                className="projects-page-col-name projects-page-sort"
                data-testid="projects-page-sort-name"
                onClick={() => toggleSort("name")}
              >
                <span>{tr("projectsPage.colName")}</span>
                {sortKey === "name" ? (
                  sortDir === "asc" ? (
                    <ArrowUp className="size-3.5 opacity-70" strokeWidth={2} aria-hidden />
                  ) : (
                    <ArrowDown className="size-3.5 opacity-70" strokeWidth={2} aria-hidden />
                  )
                ) : null}
              </button>
              <button
                type="button"
                role="columnheader"
                className="projects-page-col-updated projects-page-sort"
                data-testid="projects-page-sort-updated"
                onClick={() => toggleSort("updated")}
              >
                <span>{tr("projectsPage.colUpdated")}</span>
                {sortKey === "updated" ? (
                  sortDir === "asc" ? (
                    <ArrowUp className="size-3.5 opacity-70" strokeWidth={2} aria-hidden />
                  ) : (
                    <ArrowDown className="size-3.5 opacity-70" strokeWidth={2} aria-hidden />
                  )
                ) : null}
              </button>
              <span className="projects-page-col-actions" aria-hidden />
            </div>

            {rows.length === 0 ? (
              <p className="projects-page-empty" data-testid="projects-page-empty">
                {query.trim() ? tr("projectsPage.emptySearch") : tr("projectsPage.empty")}
              </p>
            ) : (
              rows.map((row) => {
                const key = normalizeWorkspaceKey(row.path);
                const active = key === normalizeWorkspaceKey(props.workspacePath ?? "");
                const isOpen = Boolean(expanded[key]);
                const hasSessions = row.sessions.length > 0;

                return (
                  <div
                    key={key}
                    className={cn("projects-page-card", isOpen && "is-expanded")}
                    data-testid="projects-page-row"
                    data-path={row.path}
                    data-active={active ? "true" : "false"}
                    data-expanded={isOpen ? "true" : "false"}
                  >
                    <div
                      role="row"
                      className={cn(
                        "projects-page-row",
                        active && "is-active",
                        isOpen && "is-expanded",
                      )}
                    >
                      <button
                        type="button"
                        className="projects-page-row-main"
                        title={row.path}
                        onClick={() => {
                          if (hasSessions) toggleExpand(row.path);
                          else props.onOpenProject(row.path);
                        }}
                      >
                        <Folder
                          className="size-4 shrink-0 opacity-70"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        <span className="projects-page-row-name">{row.name}</span>
                        {hasSessions ? (
                          isOpen ? (
                            <ChevronDown
                              className="size-3.5 shrink-0 opacity-55"
                              strokeWidth={2}
                              aria-hidden
                            />
                          ) : (
                            <ChevronRight
                              className="size-3.5 shrink-0 opacity-55"
                              strokeWidth={2}
                              aria-hidden
                            />
                          )
                        ) : null}
                      </button>
                      <span className="projects-page-row-updated">
                        {formatRelativeUpdated(row.updatedAt, tr)}
                      </span>
                      <div className="projects-page-row-actions">
                        <button
                          type="button"
                          className="projects-page-icon-btn"
                          data-testid="projects-page-row-more"
                          title={tr("project.more")}
                          aria-label={tr("project.more")}
                          onClick={(e) => openMenu(row.path, e)}
                        >
                          <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          className="projects-page-icon-btn"
                          data-testid="projects-page-row-pin"
                          title={row.pinned ? tr("project.unpin") : tr("project.pin")}
                          aria-label={row.pinned ? tr("project.unpin") : tr("project.pin")}
                          onClick={(e) => handlePin(row.path, e)}
                        >
                          {row.pinned ? (
                            <PinOff className="size-3.5" strokeWidth={1.75} />
                          ) : (
                            <Pin className="size-3.5" strokeWidth={1.75} />
                          )}
                        </button>
                        <button
                          type="button"
                          className="projects-page-icon-btn"
                          data-testid="projects-page-row-new"
                          title={tr("project.newSession")}
                          aria-label={tr("project.newSession")}
                          onClick={(e) => {
                            e.stopPropagation();
                            props.onNewSession(row.path);
                          }}
                        >
                          <SquarePen className="size-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>

                    {isOpen && hasSessions ? (
                      <div className="projects-page-sessions" data-testid="projects-page-sessions">
                        {row.sessions.map((session) => (
                          <button
                            key={session.id}
                            type="button"
                            className="projects-page-session-row"
                            data-testid="projects-page-session"
                            title={session.path}
                            onClick={() => props.onOpenSession(session.path, row.path)}
                          >
                            <span className="projects-page-session-name">
                              {threadDisplayTitle(session.id, {}, session.title)}
                            </span>
                            <span className="projects-page-session-updated">
                              {formatRelativeUpdated(session.modifiedAt, tr)}
                            </span>
                            <span className="projects-page-col-actions" aria-hidden />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <FloatingMenu
        open={Boolean(menuPath && menuAnchor)}
        anchor={menuAnchor}
        onClose={closeMenu}
        testId="projects-page-row-menu"
        minWidth={160}
      >
        {menuPath ? (
          <>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-[var(--popover-foreground)] hover:bg-[var(--hover-fill)]"
              data-testid="projects-page-menu-archive"
              onClick={() => handleArchive(menuPath)}
            >
              {tr("project.archive")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-red-500 hover:bg-red-500/10"
              data-testid="projects-page-menu-remove"
              onClick={() => handleRemove(menuPath)}
            >
              {tr("project.remove")}
            </button>
          </>
        ) : null}
      </FloatingMenu>
    </section>
  );
}
