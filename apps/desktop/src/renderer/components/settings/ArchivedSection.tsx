import { useEffect, useMemo, useRef, useState } from "react";
import { Folder, MoreHorizontal, Trash2 } from "lucide-react";
import { type Locale, type MessageKey } from "../../lib/i18n.ts";
import { loadConfirmDelete } from "../../lib/behavior-prefs.ts";
import { isConversationWorkspacePath, workspaceLabel } from "../../lib/workspace.ts";
import {
  deleteThreadLocal,
  loadArchivedThreadMeta,
  loadArchivedThreads,
  loadProjectAliases,
  loadRestorableThreads,
  loadThreadAliases,
  projectDisplayName,
  restoreThread,
  saveArchivedThreadMeta,
  threadDisplayTitle,
  unarchiveThread,
  type ArchivedThreadMeta,
} from "../../lib/project-prefs.ts";
import { ConfirmDialog } from "../ConfirmDialog.tsx";
import {
  SettingsButton,
  SettingsIconButton,
  SettingsPageShell,
  SettingsSearchField,
  SettingsSelect,
} from "./SettingsPrimitives.tsx";

/* Settings -> the archived list, plus the deleted-but-recoverable group.
 *
 * Split out of SettingsPage.tsx, which held every settings section and every helper only
 * one of them used.
 */

function formatArchivedDate(iso: string | undefined, locale: Locale): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return iso;
  }
}

function normalizeCwdKey(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

type ArchivedSessionRow = {
  id: string;
  title: string;
  cwd: string;
  projectName: string;
  /** Pure conversation home (Zeno/conversations) — not a project group. */
  isConversation: boolean;
  archivedAt?: string;
};

type PendingDelete =
  | { kind: "session"; id: string; name: string }
  | { kind: "project"; cwdKey: string; name: string }
  | { kind: "all" };

export function ArchivedSection(props: {
  locale: Locale;
  tr: (key: MessageKey, vars?: Record<string, string>) => string;
}) {
  const { tr, locale } = props;
  const [sessionIds, setSessionIds] = useState(loadArchivedThreads);
  /** Tombstoned but still on disk — the recoverable half of "delete". */
  const [restorable, setRestorable] = useState(loadRestorableThreads);
  const [meta, setMeta] = useState(loadArchivedThreadMeta);
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [openGroupMenu, setOpenGroupMenu] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const projectAliases = loadProjectAliases();
  const threadAliases = loadThreadAliases();

  function refresh() {
    setSessionIds(loadArchivedThreads());
    setMeta(loadArchivedThreadMeta());
    setRestorable(loadRestorableThreads());
  }

  function restoreSession(id: string) {
    restoreThread(id);
    refresh();
  }

  useEffect(() => {
    if (!openGroupMenu) return;
    const onDoc = (ev: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) {
        setOpenGroupMenu(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openGroupMenu]);

  const rows: ArchivedSessionRow[] = useMemo(() => {
    return sessionIds.map((id) => {
      const m: ArchivedThreadMeta | undefined = meta[id];
      const cwd = m?.cwd || m?.path || "";
      const isConversation = Boolean(cwd && isConversationWorkspacePath(cwd));
      // Collapse all pure-conversation homes into one logical bucket (not a project).
      const cwdKey = isConversation ? "__conversations__" : cwd ? normalizeCwdKey(cwd) : "__none__";
      const projectName = isConversation
        ? tr("settings.archived.noProject")
        : cwd
          ? projectDisplayName(cwd, projectAliases, workspaceLabel(cwd).name)
          : tr("settings.archived.unknownProject");
      const title = threadDisplayTitle(id, threadAliases, m?.title ?? `Session ${id.slice(0, 8)}`);
      const row: ArchivedSessionRow = {
        id,
        title,
        cwd: cwdKey,
        projectName,
        isConversation,
      };
      if (m?.archivedAt) row.archivedAt = m.archivedAt;
      return row;
    });
  }, [sessionIds, meta, projectAliases, threadAliases, tr]);

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (!map.has(row.cwd)) map.set(row.cwd, row.projectName);
    }
    return [...map.entries()];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (projectFilter !== "all" && row.cwd !== projectFilter) return false;
      if (!q) return true;
      return (
        row.title.toLowerCase().includes(q) ||
        row.projectName.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q)
      );
    });
  }, [rows, query, projectFilter]);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { name: string; items: ArchivedSessionRow[]; isConversation: boolean }
    >();
    for (const row of filtered) {
      const g = map.get(row.cwd) ?? {
        name: row.projectName,
        items: [],
        isConversation: row.isConversation,
      };
      g.items.push(row);
      g.isConversation = g.isConversation || row.isConversation;
      map.set(row.cwd, g);
    }
    // sort items by archivedAt desc within group
    for (const g of map.values()) {
      g.items.sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
    }
    return [...map.entries()];
  }, [filtered]);

  function unarchiveSession(id: string) {
    unarchiveThread(id);
    const m = { ...loadArchivedThreadMeta() };
    delete m[id];
    saveArchivedThreadMeta(m);
    refresh();
  }

  function performDelete(pending: PendingDelete) {
    if (pending.kind === "session") {
      deleteThreadLocal(pending.id);
      unarchiveThread(pending.id);
      const m = { ...loadArchivedThreadMeta() };
      delete m[pending.id];
      saveArchivedThreadMeta(m);
    } else if (pending.kind === "project") {
      const ids = rows.filter((r) => r.cwd === pending.cwdKey).map((r) => r.id);
      for (const id of ids) {
        deleteThreadLocal(id);
        unarchiveThread(id);
      }
      const m = { ...loadArchivedThreadMeta() };
      for (const id of ids) delete m[id];
      saveArchivedThreadMeta(m);
      setOpenGroupMenu(null);
    } else {
      for (const id of sessionIds) {
        deleteThreadLocal(id);
        unarchiveThread(id);
      }
      saveArchivedThreadMeta({});
    }
    refresh();
  }

  function deleteSession(id: string) {
    const name = rows.find((r) => r.id === id)?.title ?? id.slice(0, 8);
    if (loadConfirmDelete()) {
      setPendingDelete({ kind: "session", id, name });
      return;
    }
    performDelete({ kind: "session", id, name });
  }

  function deleteAllInProject(cwdKey: string) {
    // Conversation buckets are not projects — bulk "delete all in project" is not offered.
    if (cwdKey === "__conversations__" || rows.some((r) => r.cwd === cwdKey && r.isConversation)) {
      setOpenGroupMenu(null);
      return;
    }
    const name = rows.find((r) => r.cwd === cwdKey)?.projectName ?? cwdKey;
    if (loadConfirmDelete()) {
      setPendingDelete({ kind: "project", cwdKey, name });
      return;
    }
    performDelete({ kind: "project", cwdKey, name });
  }

  function deleteAll() {
    if (loadConfirmDelete()) {
      setPendingDelete({ kind: "all" });
      return;
    }
    performDelete({ kind: "all" });
  }

  return (
    <SettingsPageShell
      title={tr("section.archived")}
      testId="settings-archived"
      titleAction={
        sessionIds.length > 0 ? (
          <SettingsButton size="sm" danger testId="archived-delete-all" onClick={deleteAll}>
            <Trash2 className="size-3.5" strokeWidth={1.75} />
            {tr("settings.archived.deleteAll")}
          </SettingsButton>
        ) : null
      }
    >
      {/* Same pattern as models toolbar: search flex-1, trailing controls shrink-0. */}
      <div className="archived-toolbar mb-3 flex items-center gap-2" data-testid="archived-toolbar">
        <SettingsSearchField
          testId="archived-search"
          value={query}
          onChange={setQuery}
          placeholder={tr("settings.archived.search")}
          className="min-w-0 flex-1"
        />
        <div className="archived-toolbar-filters">
          <SettingsSelect
            className="w-auto shrink-0"
            size="md"
            testId="archived-filter-sessions"
            value="all"
            onChange={() => {
              /* reserved: all sessions only for now */
            }}
            options={[{ value: "all", label: tr("settings.archived.filterAll") }]}
          />
          <SettingsSelect
            className="w-auto shrink-0"
            size="md"
            testId="archived-filter-projects"
            value={projectFilter}
            onChange={setProjectFilter}
            options={[
              { value: "all", label: tr("settings.archived.filterAllProjects") },
              ...projectOptions.map(([key, name]) => ({ value: key, label: name })),
            ]}
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <p
          className="m-0 px-1 text-[13px] text-[var(--muted-foreground)]"
          data-testid="archived-empty"
        >
          {tr("settings.archived.empty")}
        </p>
      ) : (
        groups.map(([cwdKey, group]) => (
          <section
            key={cwdKey}
            className="archived-group"
            data-testid="archived-project-group"
            data-conversation={group.isConversation ? "true" : "false"}
          >
            <div className="archived-group-header">
              <div className="archived-group-name">
                <Folder className="size-4 shrink-0 opacity-70" strokeWidth={1.75} />
                <span className="truncate">{group.name}</span>
              </div>
              <div className="archived-group-meta">
                <span>{tr("settings.archived.count", { n: String(group.items.length) })}</span>
                {/* Bulk "delete all in project" only applies to real projects, not 对话. */}
                {!group.isConversation ? (
                  <div
                    className="archived-group-menu"
                    ref={openGroupMenu === cwdKey ? menuRef : null}
                  >
                    <SettingsIconButton
                      testId="archived-project-menu"
                      aria-label="More"
                      size="icon-sm"
                      onClick={() => setOpenGroupMenu((v) => (v === cwdKey ? null : cwdKey))}
                    >
                      <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
                    </SettingsIconButton>
                    {openGroupMenu === cwdKey ? (
                      <div className="archived-group-menu-panel" role="menu">
                        <SettingsButton
                          size="sm"
                          danger
                          testId="archived-project-delete-all"
                          className="h-auto w-full justify-start rounded-none px-3 py-2"
                          onClick={() => deleteAllInProject(cwdKey)}
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.75} />
                          {tr("settings.archived.deleteProjectAll")}
                        </SettingsButton>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="archived-card">
              {group.items.map((item) => (
                <div
                  key={item.id}
                  className="archived-item"
                  data-testid={`archived-session-${item.id}`}
                >
                  <div className="archived-item-copy">
                    <div className="archived-item-title">{item.title}</div>
                    <div className="archived-item-date">
                      {formatArchivedDate(item.archivedAt, locale)}
                    </div>
                  </div>
                  <div className="archived-item-actions">
                    <SettingsIconButton
                      size="icon-sm"
                      danger
                      testId={`archived-session-delete-${item.id}`}
                      title={tr("settings.archived.delete")}
                      aria-label={tr("settings.archived.delete")}
                      onClick={() => deleteSession(item.id)}
                    >
                      <Trash2 className="size-3.5" strokeWidth={1.75} />
                    </SettingsIconButton>
                    <SettingsButton
                      variant="secondary"
                      size="sm"
                      testId={`archived-session-unarchive-${item.id}`}
                      onClick={() => unarchiveSession(item.id)}
                    >
                      {tr("settings.archived.unarchive")}
                    </SettingsButton>
                  </div>
                </div>
              ))}
            </div>
            {restorable.length > 0 ? (
              <div className="archived-card" data-testid="archived-deleted-group">
                <div className="archived-item">
                  <div className="archived-item-copy">
                    <div className="archived-item-title">
                      {tr("settings.archived.deletedGroup")}
                    </div>
                    <div className="archived-item-date">{tr("settings.archived.restoreHint")}</div>
                  </div>
                </div>
                {restorable.map((id) => (
                  <div key={id} className="archived-item" data-testid={`deleted-session-${id}`}>
                    {/* No stored title: tombstoning drops the alias, so only the id remains.
                        Restoring puts the row back and the sidebar re-reads the title from
                        the session file. */}
                    <div className="archived-item-copy">
                      <div className="archived-item-title">{id.slice(0, 8)}</div>
                    </div>
                    <div className="archived-item-actions">
                      <SettingsButton
                        variant="secondary"
                        size="sm"
                        testId={`deleted-session-restore-${id}`}
                        onClick={() => restoreSession(id)}
                      >
                        {tr("settings.archived.restore")}
                      </SettingsButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ))
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={tr("confirm.deleteTitle")}
        message={
          pendingDelete
            ? tr("confirm.deleteMessage", {
                name:
                  pendingDelete.kind === "all"
                    ? tr("settings.archived.deleteAll")
                    : pendingDelete.name,
              })
            : ""
        }
        confirmLabel={tr("confirm.delete")}
        cancelLabel={tr("common.cancel")}
        danger
        onConfirm={() => {
          const pending = pendingDelete;
          if (!pending) return;
          setPendingDelete(null);
          performDelete(pending);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </SettingsPageShell>
  );
}
