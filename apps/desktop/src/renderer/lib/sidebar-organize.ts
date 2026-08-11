/** Desktop-only organize / sort prefs for the projects & conversations rail. */

export type GroupMode = "project" | "list";
export type SortMode = "priority" | "recent" | "manual";
export type ConversationSortMode = SortMode;

/** Canonical sort modes — keep UI option lists in sync with parsers below. */
export const SORT_MODES: readonly SortMode[] = ["priority", "recent", "manual"] as const;
export const GROUP_MODES: readonly GroupMode[] = ["project", "list"] as const;

const GROUP_KEY = "pix.sidebar.groupMode";
const SORT_KEY = "pix.sidebar.sortMode";
/** Sort prefs for the 对话 (conversations) section — independent of projects. */
const CONVERSATION_SORT_KEY = "pix.sidebar.conversationSortMode";
const PROJECTS_OPEN_KEY = "pix.sidebar.projectsOpen";
const THREADS_OPEN_KEY = "pix.sidebar.threadsOpen";
const PINNED_OPEN_KEY = "pix.sidebar.pinnedOpen";

function loadString(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    // ignore
  }
  return fallback;
}

function saveBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // ignore
  }
}

function parseGroupMode(raw: string): GroupMode {
  return raw === "list" ? "list" : "project";
}

function parseSortMode(raw: string): SortMode {
  if (raw === "manual" || raw === "recent") return raw;
  return "priority";
}

export function loadGroupMode(): GroupMode {
  return parseGroupMode(loadString(GROUP_KEY, "project"));
}

export function saveGroupMode(mode: GroupMode): void {
  saveString(GROUP_KEY, mode);
  try {
    window.dispatchEvent(new Event("pix-sidebar-group-mode"));
  } catch {
    // ignore (non-browser)
  }
}

export function loadSortMode(): SortMode {
  return parseSortMode(loadString(SORT_KEY, "priority"));
}

export function saveSortMode(mode: SortMode): void {
  saveString(SORT_KEY, mode);
}

export function loadConversationSortMode(): ConversationSortMode {
  return parseSortMode(loadString(CONVERSATION_SORT_KEY, "priority"));
}

export function saveConversationSortMode(mode: ConversationSortMode): void {
  saveString(CONVERSATION_SORT_KEY, mode);
}

export function loadProjectsSectionOpen(): boolean {
  return loadBool(PROJECTS_OPEN_KEY, true);
}

export function saveProjectsSectionOpen(open: boolean): void {
  saveBool(PROJECTS_OPEN_KEY, open);
}

export function loadThreadsSectionOpen(): boolean {
  return loadBool(THREADS_OPEN_KEY, true);
}

export function saveThreadsSectionOpen(open: boolean): void {
  saveBool(THREADS_OPEN_KEY, open);
}

export function loadPinnedSectionOpen(): boolean {
  return loadBool(PINNED_OPEN_KEY, true);
}

export function savePinnedSectionOpen(open: boolean): void {
  saveBool(PINNED_OPEN_KEY, open);
}
