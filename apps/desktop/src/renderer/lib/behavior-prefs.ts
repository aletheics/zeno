/** Desktop behavior prefs (confirm dialogs, etc.). */

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

/** Confirm before deleting a conversation/session (default on). */
export function loadConfirmDelete(): boolean {
  return loadBool("pix.behavior.confirmDelete", true);
}

export function saveConfirmDelete(value: boolean): void {
  saveBool("pix.behavior.confirmDelete", value);
}

/** Confirm before archiving a conversation/session/project (default on). */
export function loadConfirmArchive(): boolean {
  return loadBool("pix.behavior.confirmArchive", true);
}

export function saveConfirmArchive(value: boolean): void {
  saveBool("pix.behavior.confirmArchive", value);
}
