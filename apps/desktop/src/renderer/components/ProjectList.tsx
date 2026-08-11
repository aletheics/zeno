/**
 * Sidebar hierarchy:
 * - 置顶 / 项目 → only places that show **projects** (expand → 会话 under that project)
 * - 对话 → **conversations only** — never project sessions (even if same disk session exists)
 *
 * A thread whose cwd is a known project (pinned / recent / current) is a **session**
 * and appears only under that project. Everything else is a **conversation**.
 */
import type { SessionThreadSummary } from "@zeno/contracts";
import {
  Archive,
  ChevronRight,
  Copy,
  ExternalLink,
  Folder,
  FolderGit2,
  FolderOpen,
  Mail,
  MailOpen,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  SquarePen,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { anchorFromEvent, FloatingMenu, type AnchorRect } from "./FloatingMenu.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog.tsx";
import { RenameDialog } from "./RenameDialog.tsx";
import { SidebarOrganizeMenu } from "./SidebarOrganizeMenu.tsx";
import { loadConfirmArchive, loadConfirmDelete } from "../lib/behavior-prefs.ts";
import { t, type Locale, type MessageKey } from "../lib/i18n.ts";
import { useShellStore } from "../store/shell-store.ts";
import {
  archiveProject,
  archiveThread,
  deleteThreadLocal,
  getVisibleThreadCount,
  hasThreadMessages,
  increaseVisibleThreadCount,
  isArchivedThread,
  isDeletedThread,
  isExpandedProject,
  isPinnedProject,
  isPinnedThread,
  isUnreadThread,
  loadArchivedProjects,
  loadArchivedThreads,
  loadDeletedThreads,
  loadExpandedProjects,
  loadPinnedProjects,
  loadPinnedThreads,
  loadProjectAliases,
  loadProjectManualOrder,
  loadProjectPriorityOrder,
  loadThreadAliases,
  loadThreadManualOrder,
  loadUnreadThreads,
  loadVisibleThreadCounts,
  markThreadUnread,
  mergeThreadRows,
  moveItemInManualOrder,
  partitionProjects,
  projectDisplayName,
  savePinnedProjects,
  saveProjectManualOrder,
  saveThreadManualOrder,
  setProjectAlias,
  setThreadAlias,
  sortProjectPaths,
  sortThreadsByMode,
  syncProjectPriorityOrder,
  threadDisplayTitle,
  toggleExpandedProject,
  togglePinnedProject,
  togglePinnedThread,
  unarchiveThread,
} from "../lib/project-prefs.ts";
import {
  loadConversationSortMode,
  loadGroupMode,
  loadPinnedSectionOpen,
  loadProjectsSectionOpen,
  loadSortMode,
  loadThreadsSectionOpen,
  saveConversationSortMode,
  saveGroupMode,
  savePinnedSectionOpen,
  saveProjectsSectionOpen,
  saveSortMode,
  saveThreadsSectionOpen,
  type ConversationSortMode,
  type GroupMode,
  type SortMode,
} from "../lib/sidebar-organize.ts";
import { cn } from "../lib/utils.ts";
import {
  belongsInConversationsSection,
  isNonProjectWorkspacePath,
  normalizeWorkspaceKey,
  projectThreadIdsFromCwdMap,
  workspaceLabel,
} from "../lib/workspace.ts";
import type { SessionMarker } from "../lib/session-markers.ts";
import { sessionMarkerFromThread } from "../lib/session-markers.ts";
import { sessionRunKey } from "../store/shell-store.ts";
import type { ThreadRunState } from "../lib/timeline.ts";
import { markerLabel, ThreadRunMarker } from "./ThreadRunMarker.tsx";

export interface ProjectListProps {
  locale: Locale;
  workspacePath: string | undefined;
  selectedProjectPath: string | undefined;
  recentWorkspaces: string[];
  threads: SessionThreadSummary[];
  threadsByCwd: Record<string, SessionThreadSummary[]>;
  threadTitle: string;
  runState: ThreadRunState;
  running: boolean;
  /** Per-session run markers (sidebar glyphs, including background sessions). */
  sessionMarkers?: Record<string, SessionMarker>;
  /** @deprecated prefer sessionMarkers — kept for busy-only callers / marker fallback */
  runningSessions?: Record<string, true>;
  onOpenRecent: (path: string) => void;
  onSelectProject: (path: string | undefined) => void;
  onNewThread: (path?: string) => void;
  onSwitchThread: (path: string, projectCwd?: string) => void;
  onRemoveRecent: (path: string) => void;
  onRevealInFolder: (path: string) => void;
  onOpenWorkspace: () => void;
  onForkThread?: () => void;
}

export function ProjectList(props: ProjectListProps) {
  const tr = (key: MessageKey, vars?: Record<string, string>) => t(props.locale, key, vars);
  const [pinned, setPinned] = useState(loadPinnedProjects);
  const [manualProjectOrder, setManualProjectOrder] = useState(loadProjectManualOrder);
  const [priorityProjectOrder, setPriorityProjectOrder] = useState(loadProjectPriorityOrder);
  const [archived, setArchived] = useState(loadArchivedProjects);
  const [aliases, setAliases] = useState(loadProjectAliases);
  const [threadAliases, setThreadAliases] = useState(loadThreadAliases);
  const [archivedThreads, setArchivedThreads] = useState(loadArchivedThreads);
  const [pinnedThreads, setPinnedThreads] = useState(loadPinnedThreads);
  const [manualThreadOrder, setManualThreadOrder] = useState(loadThreadManualOrder);
  const [unreadThreads, setUnreadThreads] = useState(loadUnreadThreads);
  const [deletedThreads, setDeletedThreads] = useState(loadDeletedThreads);
  const [expanded, setExpanded] = useState(loadExpandedProjects);
  const [visibleCounts, setVisibleCounts] = useState(loadVisibleThreadCounts);
  /** `project:<path>` | `thread:<id>` — content rendered in top-layer FloatingMenu */
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  /** Which section's organize menu is open (projects vs conversations). */
  const [organizeKind, setOrganizeKind] = useState<"projects" | "threads" | null>(null);
  const [organizeAnchor, setOrganizeAnchor] = useState<AnchorRect | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>(loadGroupMode);
  const [sortMode, setSortMode] = useState<SortMode>(loadSortMode);
  const [conversationSortMode, setConversationSortMode] =
    useState<ConversationSortMode>(loadConversationSortMode);
  const [projectsOpen, setProjectsOpen] = useState(loadProjectsSectionOpen);
  const [threadsOpen, setThreadsOpen] = useState(loadThreadsSectionOpen);
  const [pinnedOpen, setPinnedOpen] = useState(loadPinnedSectionOpen);
  const [renameTarget, setRenameTarget] = useState<
    | { kind: "project"; path: string; value: string }
    | { kind: "thread"; id: string; value: string }
    | null
  >(null);
  const [confirm, setConfirm] = useState<
    | { kind: "delete-thread"; id: string; name: string }
    | { kind: "archive-thread"; id: string; name: string }
    | { kind: "archive-project"; path: string; name: string }
    | { kind: "remove-project"; path: string; name: string }
    | null
  >(null);
  const [worktreeTarget, setWorktreeTarget] = useState<string | null>(null);
  /** path key → linked git worktree (not main). */
  const [worktreeFlags, setWorktreeFlags] = useState<Record<string, boolean>>({});
  const draggedProjectRef = useRef<{
    path: string;
    scope: "pinned" | "projects";
  } | null>(null);
  const [projectDrag, setProjectDrag] = useState<{
    sourcePath: string;
    targetPath?: string;
    position?: "before" | "after";
    scope: "pinned" | "projects";
  } | null>(null);
  const draggedThreadIdRef = useRef<string | null>(null);
  const [threadDrag, setThreadDrag] = useState<{
    sourceId: string;
    targetId?: string;
    position?: "before" | "after";
  } | null>(null);
  const showAppError = useShellStore((s) => s.showAppError);

  // Keep pin/archive/alias in sync when header (or other) mutates prefs.
  useEffect(() => {
    const sync = () => {
      setPinnedThreads(loadPinnedThreads());
      setManualThreadOrder(loadThreadManualOrder());
      setArchivedThreads(loadArchivedThreads());
      setThreadAliases(loadThreadAliases());
      setUnreadThreads(loadUnreadThreads());
      setDeletedThreads(loadDeletedThreads());
    };
    window.addEventListener("zeno-thread-prefs", sync);
    return () => window.removeEventListener("zeno-thread-prefs", sync);
  }, []);

  // Settings worktree delete / external rail changes: reload pin list.
  useEffect(() => {
    const syncRail = () => {
      setPinned(loadPinnedProjects());
      setManualProjectOrder(loadProjectManualOrder());
      setPriorityProjectOrder(loadProjectPriorityOrder());
      setArchived(loadArchivedProjects());
    };
    window.addEventListener("zeno-project-rail-changed", syncRail);
    return () => window.removeEventListener("zeno-project-rail-changed", syncRail);
  }, []);

  const allPaths = useMemo(() => {
    // Include pinned paths even if they drop out of "recent" so 置顶 group stays populated.
    // Never promote conversation/scratch dirs as real projects.
    // Do NOT put the active workspace first — that rewrote「优先级」order on every open.
    // New projects only append via syncProjectPriorityOrder when first seen.
    const list: string[] = [];
    for (const p of props.recentWorkspaces) {
      if (!isNonProjectWorkspacePath(p)) list.push(p);
    }
    if (props.workspacePath && !isNonProjectWorkspacePath(props.workspacePath)) {
      list.push(props.workspacePath);
    }
    if (props.selectedProjectPath && !isNonProjectWorkspacePath(props.selectedProjectPath)) {
      list.push(props.selectedProjectPath);
    }
    for (const p of pinned) {
      if (!isNonProjectWorkspacePath(p)) list.push(p);
    }
    return list;
  }, [props.workspacePath, props.selectedProjectPath, props.recentWorkspaces, pinned]);

  const allPathsKey = useMemo(
    () =>
      allPaths
        .map((p) => normalizeWorkspaceKey(p))
        .filter(Boolean)
        .sort()
        .join("\n"),
    [allPaths],
  );

  // Detect linked git worktrees for badge (filesystem .git file — no git binary).
  useEffect(() => {
    if (!allPaths.length) return;
    let cancelled = false;
    void Promise.all(
      allPaths.map(async (path) => {
        try {
          const ctx = await window.zeno.workspace.getGitContext(path);
          return [normalizeWorkspaceKey(path), ctx.isMainWorktree === false] as const;
        } catch {
          return [normalizeWorkspaceKey(path), false] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setWorktreeFlags((prev) => {
        const next = { ...prev };
        for (const [key, isWt] of entries) {
          if (key) next[key] = isWt;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [allPathsKey, allPaths]);

  const { pinned: pinnedPaths, rest: restPathsRaw } = useMemo(
    () => partitionProjects(allPaths, pinned, archived),
    [allPaths, pinned, archived],
  );

  // Append first-seen projects to priority order; never move existing rows on open/use.
  useEffect(() => {
    setPriorityProjectOrder(syncProjectPriorityOrder(restPathsRaw));
  }, [restPathsRaw]);

  // Apply project sort mode (pinned stay in 置顶; only 项目 rest is reordered).
  const restPaths = useMemo(
    () =>
      sortProjectPaths(restPathsRaw, sortMode, {
        recentOrder: props.recentWorkspaces,
        manualOrder: manualProjectOrder,
        priorityOrder: priorityProjectOrder,
      }),
    [restPathsRaw, sortMode, props.recentWorkspaces, manualProjectOrder, priorityProjectOrder],
  );

  const closeMenus = useCallback(() => {
    setMenuKey(null);
    setMenuAnchor(null);
    setOrganizeKind(null);
    setOrganizeAnchor(null);
  }, []);

  function openItemMenu(key: string, event: ReactMouseEvent) {
    event.stopPropagation();
    setOrganizeKind(null);
    setOrganizeAnchor(null);
    if (menuKey === key) {
      setMenuKey(null);
      setMenuAnchor(null);
      return;
    }
    setMenuKey(key);
    setMenuAnchor(anchorFromEvent(event.currentTarget));
  }

  function openOrganizeMenu(kind: "projects" | "threads", event: ReactMouseEvent) {
    event.stopPropagation();
    setMenuKey(null);
    setMenuAnchor(null);
    if (organizeKind === kind) {
      setOrganizeKind(null);
      setOrganizeAnchor(null);
      return;
    }
    setOrganizeKind(kind);
    setOrganizeAnchor(anchorFromEvent(event.currentTarget));
  }

  function displayName(path: string): string {
    const label = workspaceLabel(path);
    return projectDisplayName(path, aliases, label.name);
  }

  function handleToggleExpand(path: string) {
    setExpanded((current) => toggleExpandedProject(path, current));
  }

  function ensureProjectExpanded(path: string) {
    setExpanded((current) => {
      if (isExpandedProject(path, current)) return current;
      return toggleExpandedProject(path, current);
    });
  }

  function handleTogglePin(path: string) {
    const next = togglePinnedProject(path);
    setPinned(next);
    closeMenus();
  }

  function handleRename(path: string) {
    const current = displayName(path);
    closeMenus();
    // Defer so FloatingMenu unmount doesn't swallow the dialog open.
    window.setTimeout(() => {
      setRenameTarget({ kind: "project", path, value: current });
    }, 0);
  }

  function doArchiveProject(path: string) {
    setArchived(archiveProject(path));
  }

  function handleArchive(path: string) {
    closeMenus();
    const name = displayName(path);
    if (loadConfirmArchive()) {
      setConfirm({ kind: "archive-project", path, name });
      return;
    }
    doArchiveProject(path);
  }

  function doRemoveProject(path: string) {
    const key = path.replace(/\\/g, "/").replace(/\/+$/, "");
    props.onRemoveRecent(path);
    setManualProjectOrder(
      saveProjectManualOrder(
        loadProjectManualOrder().filter((item) => normalizeWorkspaceKey(item) !== key),
      ),
    );
    setPinned((prev) => {
      const next = prev.filter((p) => p.replace(/\\/g, "/").replace(/\/+$/, "") !== key);
      try {
        localStorage.setItem("zeno.projects.pinned", JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    // Hide from 置顶/项目 immediately (also drop archived flag if present).
    setArchived((prev) => {
      const next = prev.filter((p) => p.replace(/\\/g, "/").replace(/\/+$/, "") !== key);
      try {
        localStorage.setItem("zeno.projects.archived", JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  function handleRemove(path: string) {
    closeMenus();
    const name = displayName(path);
    if (loadConfirmDelete()) {
      setConfirm({ kind: "remove-project", path, name });
      return;
    }
    doRemoveProject(path);
  }

  function handleReveal(path: string) {
    closeMenus();
    props.onRevealInFolder(path);
  }

  function handleCreateWorktree(path: string) {
    closeMenus();
    window.setTimeout(() => {
      setWorktreeTarget(path);
    }, 0);
  }

  function isWorktreeProject(path: string): boolean {
    return worktreeFlags[normalizeWorkspaceKey(path)] === true;
  }

  function markWorktreeAndExpand(path: string) {
    const key = normalizeWorkspaceKey(path);
    setWorktreeFlags((prev) => ({ ...prev, [key]: true }));
    // Ensure the new card is expanded under 项目 so it is visible immediately.
    if (groupMode === "project") ensureProjectExpanded(path);
  }

  function handleRenameThread(thread: SessionThreadSummary) {
    const current = threadDisplayTitle(thread.id, threadAliases, thread.title);
    closeMenus();
    window.setTimeout(() => {
      setRenameTarget({ kind: "thread", id: thread.id, value: current });
    }, 0);
  }

  function handleTogglePinThread(id: string) {
    setPinnedThreads(togglePinnedThread(id));
    closeMenus();
  }

  function doArchiveThread(id: string) {
    if (isArchivedThread(id, archivedThreads)) {
      setArchivedThreads(unarchiveThread(id));
      return;
    }
    const thread =
      props.threads.find((t) => t.id === id) ??
      Object.values(props.threadsByCwd)
        .flat()
        .find((t) => t.id === id);
    const meta: { title?: string; path?: string; cwd?: string } = {};
    if (thread) {
      meta.title = threadDisplayTitle(thread.id, threadAliases, thread.title);
      meta.path = thread.path;
      meta.cwd = thread.cwd;
    }
    setArchivedThreads(archiveThread(id, Object.keys(meta).length ? meta : undefined));
  }

  function handleArchiveThread(id: string) {
    closeMenus();
    if (isArchivedThread(id, archivedThreads)) {
      doArchiveThread(id);
      return;
    }
    const thread =
      props.threads.find((t) => t.id === id) ??
      Object.values(props.threadsByCwd)
        .flat()
        .find((t) => t.id === id);
    const name = thread
      ? threadDisplayTitle(thread.id, threadAliases, thread.title)
      : id.slice(0, 8);
    if (loadConfirmArchive()) {
      setConfirm({ kind: "archive-thread", id, name });
      return;
    }
    doArchiveThread(id);
  }

  function handleToggleUnread(thread: SessionThreadSummary) {
    const unread = !isUnreadThread(thread, unreadThreads);
    setUnreadThreads(markThreadUnread(thread, unread));
    closeMenus();
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
    closeMenus();
  }

  function doDeleteThread(id: string) {
    setDeletedThreads(deleteThreadLocal(id));
    setPinnedThreads(loadPinnedThreads());
    setManualThreadOrder(loadThreadManualOrder());
    setArchivedThreads(loadArchivedThreads());
    setUnreadThreads(loadUnreadThreads());
  }

  function handleDeleteThread(id: string) {
    closeMenus();
    const thread =
      props.threads.find((t) => t.id === id) ??
      Object.values(props.threadsByCwd)
        .flat()
        .find((t) => t.id === id);
    const name = thread
      ? threadDisplayTitle(thread.id, threadAliases, thread.title)
      : id.slice(0, 8);
    if (loadConfirmDelete()) {
      setConfirm({ kind: "delete-thread", id, name });
      return;
    }
    doDeleteThread(id);
  }

  function runConfirm() {
    if (!confirm) return;
    if (confirm.kind === "delete-thread") doDeleteThread(confirm.id);
    else if (confirm.kind === "archive-thread") doArchiveThread(confirm.id);
    else if (confirm.kind === "archive-project") doArchiveProject(confirm.path);
    else if (confirm.kind === "remove-project") doRemoveProject(confirm.path);
    setConfirm(null);
  }

  function openThreadContextMenu(
    thread: SessionThreadSummary,
    event: ReactMouseEvent,
    kind: "session" | "conversation" = "session",
  ) {
    event.preventDefault();
    event.stopPropagation();
    setOrganizeKind(null);
    setOrganizeAnchor(null);
    const key = `${kind}:${thread.id}`;
    setMenuKey(key);
    setMenuAnchor({
      top: event.clientY,
      left: event.clientX,
      right: event.clientX,
      bottom: event.clientY,
      width: 0,
      height: 0,
    });
  }

  function confirmRename(value: string) {
    if (!renameTarget) return;
    if (renameTarget.kind === "project") {
      setAliases(setProjectAlias(renameTarget.path, value || undefined));
    } else {
      setThreadAliases(setThreadAlias(renameTarget.id, value || undefined));
    }
    setRenameTarget(null);
  }

  function handleNewThread(path: string | undefined, event?: ReactMouseEvent) {
    event?.stopPropagation();
    props.onNewThread(path);
  }

  function handleShowMoreProject(path: string) {
    setVisibleCounts(increaseVisibleThreadCount(path, visibleCounts));
  }

  /** Apply layout / sort without closing — multi-section menu stays open for further tweaks. */
  function setGroup(mode: GroupMode) {
    setGroupMode(mode);
    saveGroupMode(mode);
    // List mode only shows 对话 — ensure that section is expanded and drop the
    // projects organize popover (projects chrome is unmounted in this layout).
    if (mode === "list") {
      setThreadsOpen(true);
      saveThreadsSectionOpen(true);
      if (organizeKind === "projects") {
        setOrganizeKind(null);
        setOrganizeAnchor(null);
      }
    }
  }

  function setSort(mode: SortMode) {
    if (mode === "manual") {
      const next = sortProjectPaths(restPaths, "manual", {
        manualOrder: manualProjectOrder,
      });
      setManualProjectOrder(saveProjectManualOrder(next));
    }
    setSortMode(mode);
    saveSortMode(mode);
  }

  function toggleProjects() {
    setProjectsOpen((v) => {
      saveProjectsSectionOpen(!v);
      return !v;
    });
  }

  function toggleThreads() {
    setThreadsOpen((v) => {
      saveThreadsSectionOpen(!v);
      return !v;
    });
  }

  function togglePinnedSection() {
    setPinnedOpen((v) => {
      savePinnedSectionOpen(!v);
      return !v;
    });
  }

  /**
   * Overlay actions (absolute) so titles can fade to the row edge by default,
   * then retract with padding on hover to stop before the buttons.
   * Named group `item` so only the hovered row shows actions.
   */
  function RowActions(props: {
    open?: boolean;
    hoverOnly?: boolean;
    testIdPrefix: string;
    children: ReactNode;
  }) {
    return (
      <div
        className={cn(
          "absolute right-1 top-1/2 z-[1] flex -translate-y-1/2 items-center justify-end gap-0.5",
          "transition-opacity",
          props.hoverOnly
            ? "pointer-events-none invisible opacity-0 group-hover/item:pointer-events-auto group-hover/item:visible group-hover/item:opacity-100"
            : props.open
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0 group-hover/item:pointer-events-auto group-hover/item:opacity-100 group-focus-within/item:pointer-events-auto group-focus-within/item:opacity-100",
        )}
        data-testid={`${props.testIdPrefix}-actions`}
      >
        {props.children}
      </div>
    );
  }

  function SectionActions(props: { open?: boolean; testIdPrefix: string; children: ReactNode }) {
    return (
      <div
        className={cn(
          // Absolute right rail — CSS `.sidebar-section-actions` matches list RowActions.
          "sidebar-section-actions transition-opacity",
          props.open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0 group-hover/section:pointer-events-auto group-hover/section:opacity-100 group-focus-within/section:pointer-events-auto group-focus-within/section:opacity-100",
        )}
        data-testid={`${props.testIdPrefix}-actions`}
      >
        {props.children}
      </div>
    );
  }

  function startProjectDrag(
    path: string,
    scope: "pinned" | "projects",
    event: ReactDragEvent<HTMLDivElement>,
  ) {
    if (sortMode !== "manual") {
      event.preventDefault();
      return;
    }
    draggedProjectRef.current = { path, scope };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-zeno-project-path", path);
    setProjectDrag({ sourcePath: path, scope });
  }

  function dragProjectOver(
    targetPath: string,
    scope: "pinned" | "projects",
    event: ReactDragEvent<HTMLDivElement>,
  ) {
    const source = draggedProjectRef.current;
    if (sortMode !== "manual" || !source || source.scope !== scope || source.path === targetPath) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setProjectDrag({ sourcePath: source.path, targetPath, position, scope });
  }

  function dropProject(
    targetPath: string,
    scope: "pinned" | "projects",
    event: ReactDragEvent<HTMLDivElement>,
  ) {
    const source = draggedProjectRef.current;
    if (sortMode === "manual" && source?.scope === scope && source.path !== targetPath) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
      const current = scope === "pinned" ? pinnedPaths : restPaths;
      const next = moveItemInManualOrder(current, source.path, targetPath, position);
      if (scope === "pinned") {
        savePinnedProjects(next);
        setPinned(next);
      } else {
        setManualProjectOrder(saveProjectManualOrder(next));
      }
    }
    draggedProjectRef.current = null;
    setProjectDrag(null);
  }

  function finishProjectDrag() {
    draggedProjectRef.current = null;
    setProjectDrag(null);
  }

  function startThreadDrag(threadId: string, event: ReactDragEvent<HTMLDivElement>) {
    if (conversationSortMode !== "manual") {
      event.preventDefault();
      return;
    }
    draggedThreadIdRef.current = threadId;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-zeno-thread-id", threadId);
    setThreadDrag({ sourceId: threadId });
  }

  function dragThreadOver(targetId: string, event: ReactDragEvent<HTMLDivElement>) {
    const sourceId = draggedThreadIdRef.current;
    if (conversationSortMode !== "manual" || !sourceId || sourceId === targetId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setThreadDrag({ sourceId, targetId, position });
  }

  function dropThread(targetId: string, event: ReactDragEvent<HTMLDivElement>) {
    const sourceId =
      draggedThreadIdRef.current || event.dataTransfer.getData("application/x-zeno-thread-id");
    if (conversationSortMode === "manual" && sourceId && sourceId !== targetId) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
      const next = moveItemInManualOrder(
        conversationList.map((thread) => thread.id),
        sourceId,
        targetId,
        position,
      );
      setManualThreadOrder(saveThreadManualOrder(next));
    }
    draggedThreadIdRef.current = null;
    setThreadDrag(null);
  }

  function finishThreadDrag() {
    draggedThreadIdRef.current = null;
    setThreadDrag(null);
  }

  /** kind=session → under 项目; kind=conversation → under 对话 */
  function renderThreadButton(
    thread: SessionThreadSummary,
    opts?: {
      indent?: boolean;
      kind?: "session" | "conversation";
      manualSort?: boolean;
    },
  ) {
    if (!hasThreadMessages(thread)) return null;
    if (isDeletedThread(thread.id, deletedThreads)) return null;
    if (isArchivedThread(thread.id, archivedThreads)) return null;
    const kind = opts?.kind ?? "session";
    // The active runtime session is not the selected rail item while a project row is selected.
    const selected = thread.active && !props.selectedProjectPath;
    const title = threadDisplayTitle(thread.id, threadAliases, thread.title);
    const menuId = `${kind}:${thread.id}`;
    const showMenu = menuKey === menuId;
    const pinnedHere = isPinnedThread(thread.id, pinnedThreads);
    const unread = isUnreadThread(thread, unreadThreads);
    const indent = opts?.indent !== false && kind === "session";
    const isFork = Boolean(thread.parentSessionPath?.trim());
    const parentFile = thread.parentSessionPath
      ? thread.parentSessionPath.split(/[/\\]/).pop() || thread.parentSessionPath
      : undefined;
    const pinLabel = kind === "session" ? tr("session.pin") : tr("thread.pin");
    const unpinLabel = kind === "session" ? tr("session.unpin") : tr("thread.unpin");
    const archiveLabel = kind === "session" ? tr("session.archive") : tr("thread.archive");
    const testPrefix = kind === "session" ? "session" : "thread";
    const manuallySortable = opts?.manualSort === true;
    const isDropTarget = manuallySortable && threadDrag?.targetId === thread.id;
    const tooltipParts = [title];
    if (isFork) {
      tooltipParts.push(
        parentFile ? tr("session.forkedFrom", { name: parentFile }) : tr("session.forked"),
      );
    }
    // Nested project sessions always show path; flat list shows project cwd so rows are distinguishable.
    if (kind !== "conversation" && (thread.cwd || thread.path)) {
      tooltipParts.push(thread.cwd || thread.path);
    } else if (kind === "conversation" && thread.cwd && !isNonProjectWorkspacePath(thread.cwd)) {
      tooltipParts.push(thread.cwd);
    }
    // Prefer per-session markers. Fall back to runningSessions / active-row runState
    // so terminal hops and applySessionOpen cannot blank a busy glyph mid-flight.
    // Never use global runState for non-active rows (that stuck spinners on every
    // row after switching away from a generating session).
    const runMarker = sessionMarkerFromThread(thread, props.sessionMarkers ?? {}, {
      keyOf: sessionRunKey,
      ...(props.runningSessions ? { runningSessions: props.runningSessions } : {}),
      ...(thread.active && props.runState && props.runState !== "idle"
        ? { foregroundState: props.runState }
        : {}),
    });
    const stateLabel = markerLabel(runMarker?.state, tr, runMarker?.reason);
    if (stateLabel) tooltipParts.push(stateLabel);

    return (
      <div
        key={`${kind}-${thread.id}`}
        className={cn(
          "relative min-w-0",
          manuallySortable && "cursor-grab select-none active:cursor-grabbing",
          manuallySortable && threadDrag?.sourceId === thread.id && "opacity-50",
        )}
        data-manual-sort={manuallySortable ? "true" : undefined}
        data-drop-position={isDropTarget ? threadDrag?.position : undefined}
        draggable={manuallySortable}
        onDragStart={(event) => startThreadDrag(thread.id, event)}
        onDragOver={(event) => dragThreadOver(thread.id, event)}
        onDrop={(event) => dropThread(thread.id, event)}
        onDragEnd={finishThreadDrag}
      >
        {isDropTarget ? (
          <span
            className={cn(
              "pointer-events-none absolute inset-x-2 z-[2] h-0.5 rounded-full bg-[var(--foreground)]",
              threadDrag?.position === "before" ? "-top-px" : "-bottom-px",
            )}
            aria-hidden
          />
        ) : null}
        <div
          className={cn("sidebar-list-row group/item", showMenu && "bg-[var(--hover-fill)]")}
          data-active={selected ? "true" : "false"}
          onContextMenu={(e) => openThreadContextMenu(thread, e, kind)}
        >
          <button
            type="button"
            className={cn(
              // gap-2 matches project row (folder icon + name) so indented session titles align.
              "flex h-full min-w-0 flex-1 items-center gap-2 text-left transition-[padding]",
              // Default: full width (fade to row end). Hover leaves room for actions.
              "pr-0 group-hover/item:pr-14",
            )}
            data-active={selected ? "true" : "false"}
            data-kind={kind}
            data-session-path={thread.path}
            data-fork={isFork ? "true" : "false"}
            data-state={runMarker?.state ?? "idle"}
            data-testid={
              thread.active && kind === "conversation"
                ? "thread-item-current"
                : thread.active && kind === "session"
                  ? "thread-item-current"
                  : `${testPrefix}-item-${thread.id}`
            }
            title={tooltipParts.join("\n")}
            onClick={() => {
              if (unread) setUnreadThreads(markThreadUnread(thread, false));
              // Selecting a session clears the explicit project-row selection.
              props.onSelectProject(undefined);
              // Always switch — re-open is needed after failed loads / cross-workspace hops.
              props.onSwitchThread(thread.path, thread.cwd);
            }}
          >
            {/* Under a project: spacer = Folder icon width so title lines up with project name. */}
            {indent ? <span className="inline-block size-4 shrink-0" aria-hidden /> : null}
            {unread ? (
              <span className="size-1.5 shrink-0 rounded-full bg-[#0a84ff]" aria-hidden />
            ) : null}
            {pinnedHere ? (
              <Pin className="size-3 shrink-0 opacity-50" strokeWidth={1.75} aria-hidden />
            ) : null}
            <span
              className={cn(
                "sidebar-title-fade min-w-0 flex-1 overflow-hidden whitespace-nowrap leading-4 text-left",
                unread && "font-medium text-[var(--foreground)]",
              )}
            >
              {title}
            </span>
            <ThreadRunMarker marker={runMarker} {...(stateLabel ? { label: stateLabel } : {})} />
          </button>
          {/* Hover: pin + archive only. Full menu via right-click. */}
          <RowActions hoverOnly testIdPrefix={`${testPrefix}-${thread.id}`}>
            <button
              type="button"
              data-testid={`${testPrefix}-pin-btn-${thread.id}`}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--hover-fill)] hover:text-[var(--sidebar-foreground)]"
              title={pinnedHere ? unpinLabel : pinLabel}
              aria-label={pinnedHere ? unpinLabel : pinLabel}
              onClick={(e) => {
                e.stopPropagation();
                handleTogglePinThread(thread.id);
              }}
            >
              {pinnedHere ? (
                <PinOff className="size-3.5" strokeWidth={1.75} />
              ) : (
                <Pin className="size-3.5" strokeWidth={1.75} />
              )}
            </button>
            <button
              type="button"
              data-testid={`${testPrefix}-archive-btn-${thread.id}`}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--hover-fill)] hover:text-[var(--sidebar-foreground)]"
              title={archiveLabel}
              aria-label={archiveLabel}
              onClick={(e) => {
                e.stopPropagation();
                handleArchiveThread(thread.id);
              }}
            >
              <Archive className="size-3.5" strokeWidth={1.75} />
            </button>
          </RowActions>
        </div>
      </div>
    );
  }

  function threadsForProjectPath(path: string, active: boolean): SessionThreadSummary[] {
    const key = path.replace(/\\/g, "/").replace(/\/+$/, "");
    // Prefer stable per-cwd cache so cross-project switches never flash an empty/wrong list.
    // Fall back to live `props.threads` only when this project is active and cache is empty.
    const cached =
      props.threadsByCwd[key] ??
      props.threadsByCwd[path] ??
      Object.entries(props.threadsByCwd).find(
        ([k]) => k.replace(/\\/g, "/").replace(/\/+$/, "") === key,
      )?.[1] ??
      [];
    // Only merge live host threads that belong to this project cwd. During global
    //「新建会话」props.threads briefly becomes conversation sessions — never append
    // those under a project card (causes a flash of wrong rows).
    const liveForProject =
      active && props.threads.length > 0
        ? props.threads.filter((t) => {
            const cwdKey = (t.cwd || "").replace(/\\/g, "/").replace(/\/+$/, "");
            return !cwdKey || cwdKey === key;
          })
        : [];

    let list: SessionThreadSummary[];
    if (cached.length > 0) {
      list = cached;
      // Merge active flags / titles from live host list when available (same project).
      if (liveForProject.length > 0) {
        const liveById = new Map(liveForProject.map((t) => [t.id, t]));
        list = cached.map((t) => {
          const live = liveById.get(t.id);
          if (!live) return { ...t, active: false };
          const freshest = mergeThreadRows([t], [live])[0] ?? live;
          return {
            ...freshest,
            active: live.active,
            title: live.title || t.title,
          };
        });
        // Prepend brand-new live threads (new session lands at top of this project only).
        const missing = liveForProject.filter((live) => !list.some((t) => t.id === live.id));
        if (missing.length > 0) list = [...missing, ...list];
      }
    } else if (liveForProject.length > 0) {
      list = liveForProject;
    } else {
      list = [];
    }
    const visible = list.filter(
      (t) =>
        hasThreadMessages(t) &&
        !isArchivedThread(t.id, archivedThreads) &&
        !isDeletedThread(t.id, deletedThreads),
    );
    // Same session sort modes as 对话: priority stays put; recent/manual may reorder.
    return sortThreadsByMode(visible, conversationSortMode, pinnedThreads, manualThreadOrder);
  }

  function renderNestedThreads(path: string, active: boolean) {
    const threadsForProject = threadsForProjectPath(path, active);
    const visibleN = getVisibleThreadCount(path, visibleCounts);
    const visibleThreads = threadsForProject.slice(0, visibleN);
    const hasMore = threadsForProject.length > visibleN;

    return (
      <div
        className="mt-0.5 mb-1 flex flex-col gap-0.5"
        data-testid={active ? "thread-list" : "session-list"}
        data-kind="session"
      >
        {threadsForProject.length === 0 ? (
          <div
            className="flex h-8 w-full min-w-0 items-center gap-2 px-2.5"
            data-testid="session-empty"
            aria-hidden={false}
          >
            {/* Spacer = Folder icon width so「无会话」lines up with the project name. */}
            <span className="inline-block size-4 shrink-0" aria-hidden />
            <span className="min-w-0 text-left text-[12px] leading-relaxed text-muted-foreground">
              {tr("session.empty")}
            </span>
          </div>
        ) : null}
        {visibleThreads.map((t) => renderThreadButton(t, { indent: true, kind: "session" }))}
        {hasMore ? (
          <button
            type="button"
            className="sidebar-list-row gap-2 !text-[var(--group-label-color)]"
            data-testid="session-show-more"
            onClick={() => handleShowMoreProject(path)}
          >
            <span className="inline-block size-4 shrink-0" aria-hidden />
            <span className="min-w-0">{tr("session.showMore")}</span>
          </button>
        ) : null}
      </div>
    );
  }

  function renderCard(
    path: string,
    options?: { manualSort?: boolean; manualScope?: "pinned" | "projects" },
  ) {
    const current =
      normalizeWorkspaceKey(path) === normalizeWorkspaceKey(props.workspacePath ?? "");
    const selected =
      normalizeWorkspaceKey(path) === normalizeWorkspaceKey(props.selectedProjectPath ?? "");
    const open = groupMode === "project" && isExpandedProject(path, expanded);
    const name = displayName(path);
    const projectMenuId = `project:${path}`;
    const showMenu = menuKey === projectMenuId;
    const worktree = isWorktreeProject(path);
    const manuallySortable = options?.manualSort === true;
    const manualScope = options?.manualScope ?? "projects";
    const isDropTarget =
      manuallySortable && projectDrag?.scope === manualScope && projectDrag?.targetPath === path;

    return (
      <div
        key={path}
        className={cn(
          "relative min-w-0",
          manuallySortable && projectDrag?.sourcePath === path && "opacity-50",
        )}
        data-testid="project-card"
        data-path={path}
        data-active={selected ? "true" : "false"}
        data-current={current ? "true" : "false"}
        data-expanded={open ? "true" : "false"}
        data-worktree={worktree ? "true" : "false"}
        data-manual-sort={manuallySortable ? "true" : undefined}
        data-drop-position={isDropTarget ? projectDrag?.position : undefined}
      >
        {isDropTarget ? (
          <span
            className={cn(
              "pointer-events-none absolute inset-x-2 z-[2] h-0.5 rounded-full bg-[var(--foreground)]",
              projectDrag?.position === "before" ? "-top-px" : "-bottom-px",
            )}
            aria-hidden
          />
        ) : null}
        {/* group/item only on project row — nested threads are siblings, not inside this group */}
        <div
          className={cn(
            "sidebar-list-row group/item",
            manuallySortable && "cursor-grab select-none active:cursor-grabbing",
            showMenu && "bg-[var(--hover-fill)]",
          )}
          data-active={selected ? "true" : "false"}
          draggable={manuallySortable}
          onDragStart={(event) => startProjectDrag(path, manualScope, event)}
          onDragOver={(event) => dragProjectOver(path, manualScope, event)}
          onDrop={(event) => dropProject(path, manualScope, event)}
          onDragEnd={finishProjectDrag}
        >
          <button
            type="button"
            className={cn(
              "flex h-full min-w-0 flex-1 items-center gap-2 text-left transition-[padding]",
              "pr-0 group-hover/item:pr-14 group-focus-within/item:pr-14",
              showMenu && "pr-14",
            )}
            data-testid={current ? "workspace-current" : "recent-workspace-item"}
            data-path={path}
            aria-pressed={selected}
            title={path}
            onClick={() => {
              props.onSelectProject(path);
              // Selection and expansion are one user action; keep them out of an effect
              // so switching projects does not reopen a card the user just collapsed.
              if (groupMode === "project") handleToggleExpand(path);
            }}
          >
            {worktree ? (
              <span
                className="inline-flex shrink-0"
                title={tr("project.worktreeBadge")}
                data-testid="project-worktree-icon"
              >
                {open ? (
                  <FolderOpen className="size-4 opacity-70" strokeWidth={1.75} aria-hidden />
                ) : (
                  <FolderGit2 className="size-4 opacity-70" strokeWidth={1.75} aria-hidden />
                )}
              </span>
            ) : open ? (
              <FolderOpen className="size-4 shrink-0 opacity-70" strokeWidth={1.75} aria-hidden />
            ) : (
              <Folder className="size-4 shrink-0 opacity-70" strokeWidth={1.75} aria-hidden />
            )}
            <span
              className="sidebar-title-fade min-w-0 flex-1 overflow-hidden whitespace-nowrap leading-4"
              data-testid={current ? "workspace-name" : undefined}
            >
              {name}
            </span>
          </button>

          {/* Hover this project row only → … + edit */}
          <RowActions open={showMenu} testIdPrefix="project">
            <button
              type="button"
              data-testid="project-menu-btn"
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--hover-fill)] hover:text-[var(--sidebar-foreground)]"
              title={tr("project.more")}
              aria-label={tr("project.more")}
              onClick={(e) => openItemMenu(projectMenuId, e)}
            >
              <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              data-testid="project-edit-btn"
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--hover-fill)] hover:text-[var(--sidebar-foreground)]"
              title={tr("project.newSession")}
              aria-label={tr("project.newSession")}
              onClick={(e) => handleNewThread(path, e)}
            >
              <SquarePen className="size-3.5" strokeWidth={1.75} />
            </button>
          </RowActions>
        </div>

        {/* 项目下展开 = 会话（不是对话） */}
        {open ? renderNestedThreads(path, current) : null}
      </div>
    );
  }

  /**
   * 对话分区内容：
   * - 按项目 (groupMode=project): 只收纯对话（conversation home / non-project cwd）。
   *   项目会话留在项目卡片下，绝不能闪进对话。
   * - 在一个列表中 (groupMode=list): 全部会话（项目 + 纯对话）扁平显示在对话分组。
   */
  const conversationList = useMemo(() => {
    const all: SessionThreadSummary[] = [];
    const projectThreadIds = projectThreadIdsFromCwdMap(props.threadsByCwd);
    const cached = Object.values(props.threadsByCwd).flat();
    // Live rows come second so equal timestamps keep their current title/active metadata;
    // newer optimistic timestamps survive a slower disk refresh.
    const sources = mergeThreadRows(cached, [...cached, ...props.threads]);
    const flatList = groupMode === "list";
    for (const t of sources) {
      if (
        !hasThreadMessages(t) ||
        isArchivedThread(t.id, archivedThreads) ||
        isDeletedThread(t.id, deletedThreads)
      ) {
        continue;
      }
      if (!flatList && !belongsInConversationsSection(t, { projectThreadIds })) continue;
      all.push(t);
    }
    return sortThreadsByMode(all, conversationSortMode, pinnedThreads, manualThreadOrder);
  }, [
    props.threadsByCwd,
    props.threads,
    archivedThreads,
    deletedThreads,
    pinnedThreads,
    manualThreadOrder,
    conversationSortMode,
    groupMode,
  ]);

  function setConversationSort(mode: ConversationSortMode) {
    if (mode === "manual") {
      const next = sortThreadsByMode(
        conversationList,
        "manual",
        pinnedThreads,
        manualThreadOrder,
      ).map((thread) => thread.id);
      setManualThreadOrder(saveThreadManualOrder(next));
    }
    setConversationSortMode(mode);
    saveConversationSortMode(mode);
  }

  return (
    // Single scroll for 置顶/项目/对话 — avoid flex-squeezing 对话 to zero height.
    <div
      className="zeno-scroll flex min-h-0 min-w-0 flex-1 flex-col gap-0.5"
      data-testid="project-list"
      data-group-mode={groupMode}
    >
      {/* ── 置顶：list / project 均显示；可折叠 ── */}
      {pinnedPaths.length > 0 ? (
        <div data-testid="pinned-projects" className="mb-0.5 min-w-0 shrink-0">
          <div
            className="sidebar-section-head group/section"
            data-expanded={pinnedOpen ? "true" : "false"}
          >
            <button
              type="button"
              className="sidebar-section-toggle group-label flex min-w-0 flex-1 items-center gap-1 text-left"
              data-testid="pinned-section-toggle"
              aria-expanded={pinnedOpen}
              onClick={togglePinnedSection}
            >
              <span className="min-w-0 truncate">{tr("section.pinned")}</span>
              <ChevronRight
                className={cn("sidebar-section-chevron size-4 shrink-0", pinnedOpen && "rotate-90")}
                strokeWidth={2.25}
                aria-hidden
              />
            </button>
          </div>
          {pinnedOpen ? (
            <div className="flex flex-col gap-0.5" data-testid="pinned-projects-list">
              {pinnedPaths.map((path) =>
                renderCard(path, {
                  manualSort: sortMode === "manual",
                  manualScope: "pinned",
                }),
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── 项目：仅「按项目」布局 ── */}
      {groupMode === "project" ? (
        <div className="relative min-w-0 shrink-0">
          <div
            className="sidebar-section-head group/section"
            data-expanded={projectsOpen ? "true" : "false"}
          >
            <button
              type="button"
              className="sidebar-section-toggle group-label flex min-w-0 flex-1 items-center gap-1 text-left"
              data-testid="projects-section-toggle"
              aria-expanded={projectsOpen}
              onClick={toggleProjects}
            >
              <span className="min-w-0 truncate">{tr("section.projects")}</span>
              <ChevronRight
                className={cn(
                  "sidebar-section-chevron size-4 shrink-0",
                  projectsOpen && "rotate-90",
                )}
                strokeWidth={2.25}
                aria-hidden
              />
            </button>
            <SectionActions open={organizeKind === "projects"} testIdPrefix="projects-section">
              <button
                type="button"
                data-testid="projects-organize-btn"
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--hover-fill)] hover:text-[var(--sidebar-foreground)]"
                title={tr("organize.title")}
                aria-label={tr("organize.title")}
                aria-haspopup="menu"
                aria-expanded={organizeKind === "projects"}
                onClick={(e) => openOrganizeMenu("projects", e)}
              >
                <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                data-testid="workspace-open"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--hover-fill)] hover:text-[var(--sidebar-foreground)] cursor-pointer"
                title={tr("workspace.open")}
                aria-label={tr("workspace.open")}
                onClick={props.onOpenWorkspace}
              >
                <Plus className="size-3.5" strokeWidth={1.75} />
              </button>
            </SectionActions>
          </div>

          {projectsOpen ? (
            <div
              className="flex min-w-0 flex-col gap-0.5 overflow-x-hidden"
              data-testid="recent-workspaces"
            >
              {restPaths.length === 0 && pinnedPaths.length === 0 ? (
                // Keep list empty when no real project — never show auto date folders or stubs.
                props.workspacePath && !isNonProjectWorkspacePath(props.workspacePath) ? (
                  <div className="sidebar-list-row" data-testid="workspace-current">
                    <span data-testid="workspace-name">{displayName(props.workspacePath)}</span>
                  </div>
                ) : null
              ) : (
                restPaths.map((path) =>
                  renderCard(path, {
                    manualSort: sortMode === "manual",
                    manualScope: "projects",
                  }),
                )
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── 对话：list 模式含全部会话；project 模式仅纯对话。list 模式无「+」。 ── */}
      <div className="mt-0.5 min-w-0 shrink-0">
        <div
          className="sidebar-section-head group/section"
          data-expanded={threadsOpen ? "true" : "false"}
        >
          <button
            type="button"
            className="sidebar-section-toggle group-label flex min-w-0 flex-1 items-center gap-1 text-left"
            data-testid="threads-section-toggle"
            aria-expanded={threadsOpen}
            onClick={toggleThreads}
          >
            <span className="min-w-0 truncate">{tr("section.threads")}</span>
            <ChevronRight
              className={cn("sidebar-section-chevron size-4 shrink-0", threadsOpen && "rotate-90")}
              strokeWidth={2.25}
              aria-hidden
            />
          </button>
          <SectionActions open={organizeKind === "threads"} testIdPrefix="threads-section">
            <button
              type="button"
              data-testid="threads-organize-btn"
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--hover-fill)] hover:text-[var(--sidebar-foreground)]"
              title={tr("organize.title")}
              aria-label={tr("organize.title")}
              aria-haspopup="menu"
              aria-expanded={organizeKind === "threads"}
              onClick={(e) => openOrganizeMenu("threads", e)}
            >
              <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              data-testid="threads-new-btn"
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--hover-fill)] hover:text-[var(--sidebar-foreground)]"
              title={tr("nav.newThread")}
              aria-label={tr("nav.newThread")}
              onClick={() => handleNewThread(undefined)}
            >
              <SquarePen className="size-3.5" strokeWidth={1.75} />
            </button>
          </SectionActions>
        </div>

        {threadsOpen ? (
          <div
            className="flex min-w-0 flex-col gap-0.5 px-0"
            data-testid="conversations-list"
            data-kind="conversation"
          >
            {conversationList.length === 0
              ? null
              : conversationList.map((t) =>
                  renderThreadButton(t, {
                    indent: false,
                    kind: "conversation",
                    manualSort: conversationSortMode === "manual",
                  }),
                )}
          </div>
        ) : null}
      </div>

      {/* Top-layer popups (portal) — not clipped by sidebar overflow */}
      <FloatingMenu
        open={Boolean(menuKey?.startsWith("project:") && menuAnchor)}
        anchor={menuAnchor}
        onClose={closeMenus}
        testId="project-context-menu"
        minWidth={200}
      >
        {menuKey?.startsWith("project:")
          ? (() => {
              const path = menuKey.slice("project:".length);
              const pinnedHere = isPinnedProject(path, pinned);
              return (
                <>
                  <MenuItem
                    icon={
                      pinnedHere ? (
                        <PinOff className="size-3.5" strokeWidth={1.75} />
                      ) : (
                        <Pin className="size-3.5" strokeWidth={1.75} />
                      )
                    }
                    label={pinnedHere ? tr("project.unpin") : tr("project.pin")}
                    onClick={() => handleTogglePin(path)}
                    testId="project-menu-pin"
                  />
                  <MenuItem
                    icon={<ExternalLink className="size-3.5" strokeWidth={1.75} />}
                    label={tr("project.reveal")}
                    onClick={() => handleReveal(path)}
                    testId="project-menu-reveal"
                  />
                  <MenuItem
                    icon={<FolderGit2 className="size-3.5" strokeWidth={1.75} />}
                    label={tr("project.createWorktree")}
                    onClick={() => handleCreateWorktree(path)}
                    testId="project-menu-create-worktree"
                  />
                  <MenuItem
                    icon={<Pencil className="size-3.5" strokeWidth={1.75} />}
                    label={tr("project.rename")}
                    onClick={() => handleRename(path)}
                    testId="project-menu-rename"
                  />
                  <MenuItem
                    icon={<Archive className="size-3.5" strokeWidth={1.75} />}
                    label={tr("project.archive")}
                    onClick={() => handleArchive(path)}
                    testId="project-menu-archive"
                  />
                  <MenuItem
                    icon={<Trash2 className="size-3.5" strokeWidth={1.75} />}
                    label={tr("project.remove")}
                    onClick={() => handleRemove(path)}
                    danger
                    testId="project-menu-remove"
                  />
                </>
              );
            })()
          : null}
      </FloatingMenu>

      <FloatingMenu
        open={Boolean(
          menuKey &&
          (menuKey.startsWith("session:") || menuKey.startsWith("conversation:")) &&
          menuAnchor,
        )}
        anchor={menuAnchor}
        onClose={closeMenus}
        testId={menuKey?.startsWith("session:") ? "session-context-menu" : "thread-context-menu"}
        minWidth={200}
      >
        {menuKey && (menuKey.startsWith("session:") || menuKey.startsWith("conversation:"))
          ? (() => {
              const isSession = menuKey.startsWith("session:");
              const id = menuKey.slice(isSession ? "session:".length : "conversation:".length);
              const thread =
                props.threads.find((t) => t.id === id) ??
                Object.values(props.threadsByCwd)
                  .flat()
                  .find((t) => t.id === id);
              if (!thread) return null;
              const pinnedHere = isPinnedThread(thread.id, pinnedThreads);
              const unread = isUnreadThread(thread, unreadThreads);
              const L = isSession
                ? {
                    pin: tr("session.pin"),
                    unpin: tr("session.unpin"),
                    rename: tr("session.rename"),
                    archive: tr("session.archive"),
                    unread: tr("session.markUnread"),
                    read: tr("session.markRead"),
                    copyPath: tr("session.copyPath"),
                    copyId: tr("session.copyId"),
                    del: tr("session.delete"),
                  }
                : {
                    pin: tr("thread.pin"),
                    unpin: tr("thread.unpin"),
                    rename: tr("thread.rename"),
                    archive: tr("thread.archive"),
                    unread: tr("thread.markUnread"),
                    read: tr("thread.markRead"),
                    copyPath: tr("thread.copyPath"),
                    copyId: tr("thread.copyId"),
                    del: tr("thread.delete"),
                  };
              return (
                <>
                  <MenuItem
                    icon={
                      pinnedHere ? (
                        <PinOff className="size-3.5" strokeWidth={1.75} />
                      ) : (
                        <Pin className="size-3.5" strokeWidth={1.75} />
                      )
                    }
                    label={pinnedHere ? L.unpin : L.pin}
                    onClick={() => handleTogglePinThread(thread.id)}
                    testId="thread-menu-pin"
                  />
                  <MenuItem
                    icon={<Pencil className="size-3.5" strokeWidth={1.75} />}
                    label={L.rename}
                    onClick={() => handleRenameThread(thread)}
                    testId="thread-menu-rename"
                  />
                  <MenuItem
                    icon={<Archive className="size-3.5" strokeWidth={1.75} />}
                    label={L.archive}
                    onClick={() => handleArchiveThread(thread.id)}
                    testId="thread-menu-archive"
                  />
                  <MenuItem
                    icon={
                      unread ? (
                        <MailOpen className="size-3.5" strokeWidth={1.75} />
                      ) : (
                        <Mail className="size-3.5" strokeWidth={1.75} />
                      )
                    }
                    label={unread ? L.read : L.unread}
                    onClick={() => handleToggleUnread(thread)}
                    testId="thread-menu-unread"
                  />
                  <MenuItem
                    icon={<Copy className="size-3.5" strokeWidth={1.75} />}
                    label={L.copyPath}
                    onClick={() => void copyText(thread.path)}
                    testId="thread-menu-copy-path"
                  />
                  <MenuItem
                    icon={<Copy className="size-3.5" strokeWidth={1.75} />}
                    label={L.copyId}
                    onClick={() => void copyText(thread.id)}
                    testId="thread-menu-copy-id"
                  />
                  <MenuItem
                    icon={<Trash2 className="size-3.5" strokeWidth={1.75} />}
                    label={L.del}
                    onClick={() => handleDeleteThread(thread.id)}
                    danger
                    testId="thread-menu-delete"
                  />
                </>
              );
            })()
          : null}
      </FloatingMenu>

      {organizeKind === "projects" ? (
        <SidebarOrganizeMenu
          kind="projects"
          open
          anchor={organizeAnchor}
          locale={props.locale}
          groupMode={groupMode}
          sortMode={sortMode}
          onClose={closeMenus}
          onGroupMode={setGroup}
          onSort={setSort}
        />
      ) : organizeKind === "threads" ? (
        <SidebarOrganizeMenu
          kind="threads"
          open
          anchor={organizeAnchor}
          locale={props.locale}
          groupMode={groupMode}
          sortMode={conversationSortMode}
          onClose={closeMenus}
          onGroupMode={setGroup}
          onSort={setConversationSort}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.kind === "delete-thread" || confirm?.kind === "remove-project"
            ? tr("confirm.deleteTitle")
            : tr("confirm.archiveTitle")
        }
        message={
          confirm
            ? confirm.kind === "delete-thread" || confirm.kind === "remove-project"
              ? tr("confirm.deleteMessage", { name: confirm.name })
              : tr("confirm.archiveMessage", { name: confirm.name })
            : ""
        }
        confirmLabel={
          confirm?.kind === "delete-thread" || confirm?.kind === "remove-project"
            ? tr("confirm.delete")
            : tr("confirm.archive")
        }
        cancelLabel={tr("common.cancel")}
        danger={confirm?.kind === "delete-thread" || confirm?.kind === "remove-project"}
        testId="project-list-confirm"
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />

      <RenameDialog
        open={Boolean(renameTarget)}
        title={
          renameTarget?.kind === "thread" ? tr("thread.renameTitle") : tr("project.renameTitle")
        }
        label={
          renameTarget?.kind === "thread" ? tr("thread.renamePrompt") : tr("project.renamePrompt")
        }
        initialValue={renameTarget?.value ?? ""}
        confirmLabel={tr("common.confirm")}
        cancelLabel={tr("common.cancel")}
        testId="rename-dialog"
        onConfirm={confirmRename}
        onCancel={() => setRenameTarget(null)}
      />

      <CreateWorktreeDialog
        open={Boolean(worktreeTarget)}
        locale={props.locale}
        projectPath={worktreeTarget ?? ""}
        onCancel={() => setWorktreeTarget(null)}
        onError={(message) => showAppError(message)}
        onConfirm={({ path }) => {
          setWorktreeTarget(null);
          markWorktreeAndExpand(path);
          props.onOpenRecent(path);
        }}
      />
    </div>
  );
}

function MenuItem(props: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={props.testId}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors",
        props.danger
          ? "text-red-400 hover:bg-red-500/10"
          : "text-[var(--popover-foreground)] hover:bg-[var(--hover-fill)]",
      )}
      onClick={props.onClick}
    >
      <span className="opacity-70">{props.icon}</span>
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
    </button>
  );
}
