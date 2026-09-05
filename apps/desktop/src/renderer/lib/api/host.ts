/**
 * Host bridge — Electron edition.
 *
 * zeno-update used Tauri `invoke`/`listen`; pix exposes the same surface through
 * the preload `window.zeno` bridge (contextBridge). The pet code only reaches for
 * `isDesktopHost` and `listen`, so this module keeps those two seams verbatim in
 * spirit while pointing them at `window.zeno`.
 */

/** True when the Electron preload bridge is reachable. */
export function isDesktopHost(): boolean {
  return typeof window !== "undefined" && typeof window.zeno !== "undefined";
}

/**
 * Subscribe to a pet event channel. Maps the zeno-update `pet://*` names onto the
 * preload subscription helpers. Unknown channels (notably the Tauri-only global
 * cursor feed `pet://cursor`) become no-ops — the mark falls back to local pointer
 * tracking, which is the only signal Electron offers here.
 */
export async function listen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  if (!isDesktopHost()) return () => {};
  switch (event) {
    case "pet://focus":
      return window.zeno.pet.onFocus((focus) => handler(focus as unknown as T));
    case "pet://tasks":
      return window.zeno.pet.onTasks((tasks) => handler(tasks as unknown as T));
    case "pet://prefs":
      return window.zeno.pet.onPrefs((prefs) => handler(prefs as unknown as T));
    default:
      return () => {};
  }
}

/**
 * Window-move notification. Electron has no DOM move event for the host window;
 * the overlay refreshes its frame on pointer move and during manual drag instead,
 * so this is a no-op that keeps the ported call sites intact.
 */
export async function onWindowMoved(_cb: () => void): Promise<() => void> {
  return () => {};
}
