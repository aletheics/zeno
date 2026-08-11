/** Desktop-only project chrome prefs (pin / archive / rename / expand). */

const PINNED_KEY = "zeno.projects.pinned";
const PROJECT_MANUAL_ORDER_KEY = "zeno.projects.manualOrder";
/** First-seen / import order for「优先级」— append-only; never reordered by open/use. */
const PROJECT_PRIORITY_ORDER_KEY = "zeno.projects.priorityOrder";
const ARCHIVED_KEY = "zeno.projects.archived";
const ALIASES_KEY = "zeno.projects.aliases";
const EXPANDED_KEY = "zeno.projects.expanded";

export const PROJECT_THREADS_PAGE = 5;

const THREAD_ALIASES_KEY = "zeno.threads.aliases";
const THREAD_ARCHIVED_KEY = "zeno.threads.archived";
const THREAD_PINNED_KEY = "zeno.threads.pinned";
const THREAD_MANUAL_ORDER_KEY = "zeno.threads.manualOrder";
const THREAD_UNREAD_KEY = "zeno.threads.unread";
const THREAD_DELETED_KEY = "zeno.threads.deleted";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function loadPinnedProjects(): string[] {
  const list = readJson<string[]>(PINNED_KEY, []);
  return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
}

export function savePinnedProjects(paths: string[]): void {
  writeJson(PINNED_KEY, paths.map(normalizePath));
}

export function loadProjectManualOrder(): string[] {
  const list = readJson<string[]>(PROJECT_MANUAL_ORDER_KEY, []);
  if (!Array.isArray(list)) return [];
  return [
    ...new Set(list.filter((path) => typeof path === "string" && path.trim()).map(normalizePath)),
  ];
}

export function saveProjectManualOrder(paths: readonly string[]): string[] {
  const next = [
    ...new Set(paths.filter((path) => typeof path === "string" && path.trim()).map(normalizePath)),
  ];
  writeJson(PROJECT_MANUAL_ORDER_KEY, next);
  return next;
}

export function loadProjectPriorityOrder(): string[] {
  const list = readJson<string[]>(PROJECT_PRIORITY_ORDER_KEY, []);
  if (!Array.isArray(list)) return [];
  return [
    ...new Set(list.filter((path) => typeof path === "string" && path.trim()).map(normalizePath)),
  ];
}

export function saveProjectPriorityOrder(paths: readonly string[]): string[] {
  const next = [
    ...new Set(paths.filter((path) => typeof path === "string" && path.trim()).map(normalizePath)),
  ];
  writeJson(PROJECT_PRIORITY_ORDER_KEY, next);
  return next;
}

/**
 * Pure merge for「优先级」order: keep existing positions, append first-seen only.
 * Opening / using a project must not move it — only new imports land at the end.
 */
export function mergeProjectPriorityOrder(
  current: readonly string[],
  knownPaths: readonly string[],
): string[] {
  const known = new Map<string, string>();
  for (const raw of knownPaths) {
    if (!raw?.trim()) continue;
    const key = normalizePath(raw);
    if (!known.has(key)) known.set(key, raw);
  }

  const next: string[] = [];
  const seen = new Set<string>();
  for (const path of current) {
    const key = normalizePath(path);
    const raw = known.get(key);
    if (!raw || seen.has(key)) continue;
    seen.add(key);
    next.push(raw);
  }
  for (const [, raw] of known) {
    const key = normalizePath(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(raw);
  }
  return next;
}

/** Persist priority order after merge (append-only for newcomers). */
export function syncProjectPriorityOrder(knownPaths: readonly string[]): string[] {
  return saveProjectPriorityOrder(
    mergeProjectPriorityOrder(loadProjectPriorityOrder(), knownPaths),
  );
}

export function togglePinnedProject(path: string): string[] {
  const key = normalizePath(path);
  const current = loadPinnedProjects();
  const next = current.some((p) => normalizePath(p) === key)
    ? current.filter((p) => normalizePath(p) !== key)
    : [path, ...current.filter((p) => normalizePath(p) !== key)];
  savePinnedProjects(next);
  return next;
}

export function isPinnedProject(path: string, pinned: readonly string[]): boolean {
  const key = normalizePath(path);
  return pinned.some((p) => normalizePath(p) === key);
}

export function loadArchivedProjects(): string[] {
  const list = readJson<string[]>(ARCHIVED_KEY, []);
  return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
}

export function saveArchivedProjects(paths: string[]): void {
  writeJson(ARCHIVED_KEY, paths.map(normalizePath));
}

export function archiveProject(path: string): string[] {
  const key = normalizePath(path);
  const next = [path, ...loadArchivedProjects().filter((p) => normalizePath(p) !== key)];
  saveArchivedProjects(next);
  // Unpin when archived
  savePinnedProjects(loadPinnedProjects().filter((p) => normalizePath(p) !== key));
  return next;
}

export function isArchivedProject(path: string, archived: readonly string[]): boolean {
  const key = normalizePath(path);
  return archived.some((p) => normalizePath(p) === key);
}

export function loadProjectAliases(): Record<string, string> {
  const map = readJson<Record<string, string>>(ALIASES_KEY, {});
  return map && typeof map === "object" ? map : {};
}

export function setProjectAlias(path: string, alias: string | undefined): Record<string, string> {
  const key = normalizePath(path);
  const map = { ...loadProjectAliases() };
  if (!alias?.trim()) delete map[key];
  else map[key] = alias.trim();
  writeJson(ALIASES_KEY, map);
  return map;
}

export function projectDisplayName(
  path: string,
  aliases: Record<string, string>,
  fallback: string,
): string {
  const key = normalizePath(path);
  return aliases[key]?.trim() || fallback;
}

export function loadExpandedProjects(): string[] {
  const list = readJson<string[]>(EXPANDED_KEY, []);
  return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
}

export function saveExpandedProjects(paths: string[]): void {
  writeJson(EXPANDED_KEY, paths.map(normalizePath));
}

export function toggleExpandedProject(path: string, expanded = loadExpandedProjects()): string[] {
  const key = normalizePath(path);
  const next = expanded.some((p) => normalizePath(p) === key)
    ? expanded.filter((p) => normalizePath(p) !== key)
    : [...expanded, path];
  saveExpandedProjects(next);
  return next;
}

export function isExpandedProject(path: string, expanded: readonly string[]): boolean {
  const key = normalizePath(path);
  return expanded.some((p) => normalizePath(p) === key);
}

/**
 * In-session only — do not persist "show more" depth across app restarts.
 * Restart always returns to the default page size so "展开显示" appears again.
 */
export function loadVisibleThreadCounts(): Record<string, number> {
  return {};
}

export function getVisibleThreadCount(path: string, counts: Record<string, number>): number {
  const key = normalizePath(path);
  const n = counts[key];
  return typeof n === "number" && n >= PROJECT_THREADS_PAGE ? n : PROJECT_THREADS_PAGE;
}

export function increaseVisibleThreadCount(
  path: string,
  counts: Record<string, number>,
): Record<string, number> {
  const key = normalizePath(path);
  return {
    ...counts,
    [key]: getVisibleThreadCount(path, counts) + PROJECT_THREADS_PAGE,
  };
}

/** Build ordered project paths: pinned first, then others; drop archived. */
export function partitionProjects(
  paths: readonly string[],
  pinned: readonly string[],
  archived: readonly string[],
): { pinned: string[]; rest: string[] } {
  const byKey = new Map<string, string>();
  for (const raw of paths) {
    if (!raw?.trim()) continue;
    const key = normalizePath(raw);
    if (isArchivedProject(raw, archived)) continue;
    if (!byKey.has(key)) byKey.set(key, raw);
  }
  // Pinned keys that are not in paths still show (caller should also pass pinned into paths).
  for (const p of pinned) {
    if (!p?.trim()) continue;
    const key = normalizePath(p);
    if (isArchivedProject(p, archived)) continue;
    if (!byKey.has(key)) byKey.set(key, p);
  }

  const pinnedKeys = pinned.map(normalizePath).filter((k) => byKey.has(k));
  // de-dupe pin order
  const pinSeen = new Set<string>();
  const orderedPinned: string[] = [];
  for (const key of pinnedKeys) {
    if (pinSeen.has(key)) continue;
    pinSeen.add(key);
    orderedPinned.push(byKey.get(key)!);
  }
  const pinnedSet = new Set(pinSeen);
  const rest: string[] = [];
  for (const [key, raw] of byKey) {
    if (pinnedSet.has(key)) continue;
    rest.push(raw);
  }
  return { pinned: orderedPinned, rest };
}

export type ProjectSortMode = "priority" | "recent" | "manual";

/**
 * Order projects in the 项目 section (pinned live in 置顶 and are not passed here).
 * - priority: first-seen / import order (priorityOrder); open/use never moves rows
 * - recent: follow recentOrder (most recent first); unknowns last
 * - manual: saved paths first, then new/unknown paths in input order
 */
export function sortProjectPaths(
  paths: readonly string[],
  mode: ProjectSortMode,
  options?: {
    recentOrder?: readonly string[];
    manualOrder?: readonly string[];
    priorityOrder?: readonly string[];
  },
): string[] {
  const list = [...paths];
  if (list.length <= 1) return list;

  if (mode === "recent") {
    const recentIndex = new Map((options?.recentOrder ?? []).map((p, i) => [normalizePath(p), i]));
    return list.sort((a, b) => {
      const ai = recentIndex.has(normalizePath(a))
        ? (recentIndex.get(normalizePath(a)) ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;
      const bi = recentIndex.has(normalizePath(b))
        ? (recentIndex.get(normalizePath(b)) ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return normalizePath(a).localeCompare(normalizePath(b));
    });
  }

  // priority + manual: both use an explicit order list; only how that list is
  // maintained differs (append-on-import vs drag). Open/use must not rewrite it.
  if (mode === "priority" || mode === "manual") {
    const order =
      mode === "priority" ? (options?.priorityOrder ?? []) : (options?.manualOrder ?? []);
    const orderIndex = new Map(order.map((path, i) => [normalizePath(path), i]));
    return list.sort((a, b) => {
      const ai = orderIndex.get(normalizePath(a));
      const bi = orderIndex.get(normalizePath(b));
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return 0;
    });
  }

  return list;
}

/** Thread display aliases (desktop-only; does not rewrite session files). */
export function loadThreadAliases(): Record<string, string> {
  const map = readJson<Record<string, string>>(THREAD_ALIASES_KEY, {});
  return map && typeof map === "object" ? map : {};
}

export function setThreadAlias(id: string, alias: string | undefined): Record<string, string> {
  const map = { ...loadThreadAliases() };
  if (!alias?.trim()) delete map[id];
  else map[id] = alias.trim();
  writeJson(THREAD_ALIASES_KEY, map);
  return map;
}

export function threadDisplayTitle(
  id: string,
  aliases: Record<string, string>,
  fallback: string,
): string {
  return aliases[id]?.trim() || fallback;
}

export function loadArchivedThreads(): string[] {
  const list = readJson<string[]>(THREAD_ARCHIVED_KEY, []);
  return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
}

export function saveArchivedThreads(ids: string[]): void {
  writeJson(THREAD_ARCHIVED_KEY, ids);
}

export function archiveThread(
  id: string,
  meta?: { title?: string; path?: string; cwd?: string; archivedAt?: string },
): string[] {
  const next = [id, ...loadArchivedThreads().filter((p) => p !== id)];
  // unpin when archived
  savePinnedThreads(loadPinnedThreads().filter((p) => p !== id));
  writeJson(THREAD_ARCHIVED_KEY, next);
  if (meta?.title?.trim()) {
    setThreadAlias(id, meta.title.trim());
  }
  const map = loadArchivedThreadMeta();
  map[id] = {
    ...map[id],
    ...(meta?.path ? { path: meta.path } : {}),
    ...(meta?.cwd ? { cwd: meta.cwd } : {}),
    ...(meta?.title ? { title: meta.title } : {}),
    archivedAt: meta?.archivedAt ?? new Date().toISOString(),
  };
  saveArchivedThreadMeta(map);
  return next;
}

export type ArchivedThreadMeta = {
  title?: string;
  path?: string;
  cwd?: string;
  archivedAt?: string;
};

const THREAD_ARCHIVED_META_KEY = "zeno.threads.archivedMeta";

export function loadArchivedThreadMeta(): Record<string, ArchivedThreadMeta> {
  const map = readJson<Record<string, ArchivedThreadMeta>>(THREAD_ARCHIVED_META_KEY, {});
  return map && typeof map === "object" ? map : {};
}

export function saveArchivedThreadMeta(map: Record<string, ArchivedThreadMeta>): void {
  writeJson(THREAD_ARCHIVED_META_KEY, map);
}

export function unarchiveThread(id: string): string[] {
  const next = loadArchivedThreads().filter((p) => p !== id);
  writeJson(THREAD_ARCHIVED_KEY, next);
  return next;
}

export function isArchivedThread(id: string, archived: readonly string[]): boolean {
  return archived.includes(id);
}

export function loadPinnedThreads(): string[] {
  const list = readJson<string[]>(THREAD_PINNED_KEY, []);
  return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
}

export function savePinnedThreads(ids: string[]): void {
  writeJson(THREAD_PINNED_KEY, ids);
}

export function togglePinnedThread(id: string): string[] {
  const current = loadPinnedThreads();
  const next = current.includes(id)
    ? current.filter((p) => p !== id)
    : [id, ...current.filter((p) => p !== id)];
  savePinnedThreads(next);
  return next;
}

export function isPinnedThread(id: string, pinned: readonly string[]): boolean {
  return pinned.includes(id);
}

export function loadThreadManualOrder(): string[] {
  const list = readJson<string[]>(THREAD_MANUAL_ORDER_KEY, []);
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((id) => typeof id === "string" && id.trim()))];
}

export function saveThreadManualOrder(ids: readonly string[]): string[] {
  const next = [...new Set(ids.filter((id) => typeof id === "string" && id.trim()))];
  writeJson(THREAD_MANUAL_ORDER_KEY, next);
  return next;
}

export function loadUnreadThreads(): string[] {
  const list = readJson<string[]>(THREAD_UNREAD_KEY, []);
  return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
}

/** Normalize session id / path so unread matches either form. */
export function normalizeThreadKey(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** Unread identity keys for a thread (id + session file path). */
export function threadUnreadKeys(thread: { id: string; path?: string }): string[] {
  const keys = [normalizeThreadKey(thread.id), normalizeThreadKey(thread.path)].filter(Boolean);
  return [...new Set(keys)];
}

/** Sidebar lists listen for this after pin/archive/unread mutations. */
export function notifyThreadPrefsChanged(): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  try {
    window.dispatchEvent(new Event("zeno-thread-prefs"));
  } catch {
    // ignore (SSR / tests)
  }
}

/**
 * Mark or clear unread. Accepts a thread id, session path, or `{ id, path }` so
 * auto-unread (path from runtime) and manual toggle (id) share one set.
 */
export function markThreadUnread(
  idOrThread: string | { id: string; path?: string },
  unread: boolean,
): string[] {
  const keys =
    typeof idOrThread === "string"
      ? [normalizeThreadKey(idOrThread)].filter(Boolean)
      : threadUnreadKeys(idOrThread);
  if (keys.length === 0) return loadUnreadThreads();

  const current = loadUnreadThreads();
  const currentKeys = current.map((item) => normalizeThreadKey(item));
  let next: string[];
  if (unread) {
    // Prefer the first key (usually session path for auto-unread, id for manual).
    const primary =
      typeof idOrThread === "string" ? idOrThread : (idOrThread.path ?? idOrThread.id);
    next = [primary, ...current.filter((_, index) => !keys.includes(currentKeys[index] ?? ""))];
  } else {
    next = current.filter((_, index) => !keys.includes(currentKeys[index] ?? ""));
  }
  writeJson(THREAD_UNREAD_KEY, next);
  notifyThreadPrefsChanged();
  return next;
}

export function isUnreadThread(
  idOrThread: string | { id: string; path?: string },
  unread: readonly string[],
): boolean {
  const keys =
    typeof idOrThread === "string"
      ? [normalizeThreadKey(idOrThread)].filter(Boolean)
      : threadUnreadKeys(idOrThread);
  if (keys.length === 0) return false;
  const set = new Set(unread.map((item) => normalizeThreadKey(item)));
  return keys.some((key) => set.has(key));
}

/**
 * After an agent turn settles: mark the session unread unless the user is
 * already viewing that thread in the main pane.
 *
 * @returns true when unread was set
 */
export function markUnreadOnAgentSettle(
  sessionKey: string,
  options: {
    /** Foreground session key (sessionFile / sessionId, already normalized or raw). */
    activeSessionKey?: string;
    /** Shell view — only "thread" counts as actively reading the transcript. */
    view?: string;
  } = {},
): boolean {
  const key = normalizeThreadKey(sessionKey);
  if (!key) return false;
  const active = normalizeThreadKey(options.activeSessionKey);
  if (options.view === "thread" && active && key === active) return false;
  markThreadUnread(sessionKey, true);
  return true;
}

export function loadDeletedThreads(): string[] {
  const list = readJson<string[]>(THREAD_DELETED_KEY, []);
  return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
}

export function deleteThreadLocal(id: string): string[] {
  const next = [id, ...loadDeletedThreads().filter((p) => p !== id)];
  writeJson(THREAD_DELETED_KEY, next);
  // clean related prefs
  savePinnedThreads(loadPinnedThreads().filter((p) => p !== id));
  saveArchivedThreads(loadArchivedThreads().filter((p) => p !== id));
  saveThreadManualOrder(loadThreadManualOrder().filter((p) => p !== id));
  markThreadUnread(id, false);
  const aliases = { ...loadThreadAliases() };
  delete aliases[id];
  writeJson(THREAD_ALIASES_KEY, aliases);
  return next;
}

export function isDeletedThread(id: string, deleted: readonly string[]): boolean {
  return deleted.includes(id);
}

/** Compare activity timestamps, then stable identity so equal timestamps cannot reshuffle rows. */
function compareThreadRecency<T extends { id: string; modifiedAt: string; createdAt?: string }>(
  left: T,
  right: T,
): number {
  const modified = right.modifiedAt.localeCompare(left.modifiedAt);
  if (modified !== 0) return modified;
  const created = (right.createdAt ?? right.modifiedAt).localeCompare(
    left.createdAt ?? left.modifiedAt,
  );
  return created !== 0 ? created : left.id.localeCompare(right.id);
}

/** A sidebar row exists only after its session has real conversation content. */
export function hasThreadMessages(thread: { messageCount: number; title?: string }): boolean {
  return thread.messageCount > 0 && thread.title?.trim().toLowerCase() !== "(no messages)";
}

/**
 * Merge refreshes monotonically so a visible live row cannot disappear or become empty.
 * Existing rows keep their positions; brand-new session ids are prepended (top of list).
 * Project order is unrelated — only session order within a list is affected.
 */
export function mergeThreadRows<
  T extends { id: string; modifiedAt: string; createdAt?: string; messageCount?: number },
>(current: readonly T[], incoming: readonly T[]): T[] {
  const previousById = new Map(current.map((row) => [row.id, row]));
  const updatedById = new Map<string, T>();
  const brandNewById = new Map<string, T>();

  for (const row of incoming) {
    const previous = previousById.get(row.id);
    if (!previous) {
      const pending = brandNewById.get(row.id);
      if (!pending) {
        brandNewById.set(row.id, row);
        continue;
      }
      // Same new id twice in one refresh — keep the fresher row.
      brandNewById.set(row.id, compareThreadRecency(row, pending) >= 0 ? pending : row);
      continue;
    }
    const wouldLoseMessages = (previous.messageCount ?? 0) > 0 && (row.messageCount ?? 0) === 0;
    const freshest = wouldLoseMessages || compareThreadRecency(row, previous) >= 0 ? previous : row;
    updatedById.set(row.id, freshest);
  }

  // Keep established order for rows that were already visible.
  const kept = current.map((row) => updatedById.get(row.id) ?? row);
  // Brand-new sessions land at the top of this session list only.
  return [...brandNewById.values(), ...kept];
}

/**
 * Default session order under a project card: preserve list order (priority).
 * Pin is a badge/action only — it does not reorder under「优先级」.
 */
export function sortThreadsWithPins<
  T extends { id: string; modifiedAt: string; createdAt?: string },
>(threads: T[], pinned: readonly string[]): T[] {
  return sortThreadsByMode(threads, "priority", pinned);
}

export type ThreadSortMode = "priority" | "recent" | "manual";
export type ManualDropPosition = "before" | "after";

/** Move one visible item relative to another without mutating the current order. */
export function moveItemInManualOrder(
  currentIds: readonly string[],
  draggedId: string,
  targetId: string,
  position: ManualDropPosition,
): string[] {
  const unique = [...new Set(currentIds)];
  if (draggedId === targetId || !unique.includes(draggedId) || !unique.includes(targetId)) {
    return unique;
  }

  const next = unique.filter((id) => id !== draggedId);
  const targetIndex = next.indexOf(targetId);
  next.splice(targetIndex + (position === "after" ? 1 : 0), 0, draggedId);
  return next;
}

/**
 * Sort sidebar threads/conversations.
 * - priority: stable positions for existing rows; new sessions are prepended at the top
 * - recent: modifiedAt desc only
 * - manual: saved ids first, then new/unknown ids in input order
 *
 * Pin is independent of sort mode (badge + 置顶 section for projects).
 * Never reorders the parent project list — only sessions within a list.
 */
export function sortThreadsByMode<T extends { id: string; modifiedAt: string; createdAt?: string }>(
  threads: T[],
  mode: ThreadSortMode,
  _pinned: readonly string[] = [],
  manualOrder: readonly string[] = [],
): T[] {
  const compare = (left: T, right: T) => compareThreadRecency(left, right);
  if (mode === "recent") return [...threads].sort(compare);

  if (mode === "manual") {
    const manualIndex = new Map(manualOrder.map((id, i) => [id, i]));
    return [...threads].sort((a, b) => {
      const ai = manualIndex.get(a.id);
      const bi = manualIndex.get(b.id);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return 0;
    });
  }

  // priority: stable default order — do not reorder by pin or recency.
  return [...threads];
}
