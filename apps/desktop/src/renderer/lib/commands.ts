import type { ShellView } from "../store/shell-store.ts";
import { t, type Locale, type MessageKey } from "./i18n.ts";
import {
  formatComboDisplay,
  getEffectiveCombo,
  loadShortcutOverrides,
  type ShortcutId,
} from "./shortcuts.ts";

export interface ShellCommand {
  id: string;
  label: string;
  shortcut?: string;
  run: () => void | Promise<void>;
}

export interface CommandHandlers {
  newThread: () => void | Promise<void>;
  openPackages: () => void | Promise<void>;
  openResources: () => void | Promise<void>;
  openSettings: () => void | Promise<void>;
  focusComposer: () => void;
  openThread: () => void;
  toggleTheme: () => void;
  forkThread: () => void | Promise<void>;
  toggleReview: () => void;
  toggleEnvPanel?: () => void;
  toggleContentMode?: () => void;
}

function withShortcut(id: ShortcutId, base: Omit<ShellCommand, "shortcut">): ShellCommand {
  const c = getEffectiveCombo(id, loadShortcutOverrides());
  if (!c) return base;
  return { ...base, shortcut: formatComboDisplay(c) };
}

function cmd(
  locale: Locale,
  id: string,
  labelKey: MessageKey,
  run: () => void | Promise<void>,
  shortcutId?: ShortcutId,
): ShellCommand {
  const base = { id, label: t(locale, labelKey), run };
  return shortcutId ? withShortcut(shortcutId, base) : base;
}

export function buildShellCommands(
  handlers: CommandHandlers,
  locale: Locale = "en",
): ShellCommand[] {
  const list: ShellCommand[] = [
    cmd(locale, "new-thread", "shortcuts.newThread", handlers.newThread, "new-thread"),
    cmd(locale, "packages", "shortcuts.packages", handlers.openPackages, "packages"),
    cmd(locale, "resources", "shortcuts.resources", handlers.openResources, "resources"),
    cmd(locale, "settings", "shortcuts.settings", handlers.openSettings, "settings"),
    cmd(locale, "thread", "shortcuts.thread", handlers.openThread, "thread"),
    cmd(
      locale,
      "focus-composer",
      "shortcuts.focusComposer",
      handlers.focusComposer,
      "focus-composer",
    ),
    cmd(locale, "fork-thread", "shortcuts.forkThread", handlers.forkThread, "fork-thread"),
    cmd(locale, "toggle-theme", "shortcuts.toggleTheme", handlers.toggleTheme, "toggle-theme"),
    cmd(locale, "toggle-review", "command.toggleReview", handlers.toggleReview),
  ];
  if (handlers.toggleEnvPanel) {
    list.push(
      cmd(
        locale,
        "toggle-env-panel",
        "shortcuts.toggleEnvPanel",
        handlers.toggleEnvPanel,
        "toggle-env-panel",
      ),
    );
  }
  if (handlers.toggleContentMode) {
    list.push(
      cmd(
        locale,
        "toggle-content-mode",
        "shortcuts.toggleContentMode",
        handlers.toggleContentMode,
        "toggle-content-mode",
      ),
    );
  }
  return list;
}

export function viewFromCommandId(id: string): ShellView | undefined {
  if (id === "packages") return "packages";
  if (id === "resources") return "resources";
  if (id === "settings") return "settings";
  if (id === "thread" || id === "new-thread" || id === "focus-composer") return "thread";
  return undefined;
}
