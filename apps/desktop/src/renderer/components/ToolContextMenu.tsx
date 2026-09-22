/**
 * Right-click menus for tool rows: one for a path, one for a command.
 *
 * A tool row shows the file it touched and the command it ran, and both were dead ends for a
 * mouse: the path opened on click, but there was no way to copy it, and the command was not
 * actionable at all. The command in particular is the one string in a run row a user wants to
 * take away, and it was select-and-hope.
 *
 * The path actions reuse what already exists — `workspace.openFile` is what the path link's own
 * click calls, and `workspace.revealInFolder` is `shell.showItemInFolder`, which selects a file
 * in its parent folder just as well as it opens one. Neither needs a new IPC channel, and
 * neither main-process handler changes.
 *
 * Opening deliberately does not report failures, matching the path link's existing click. The
 * one thing it does differently is catch: the IPC rejects when the OS cannot open the path, and
 * an unhandled rejection in a menu click would surface as a console error and nothing else.
 */
import { Copy, FolderOpen, SquarePen } from "lucide-react";
import { FloatingMenu } from "./FloatingMenu.tsx";
import { MenuItem } from "./ui/menu-item.tsx";
import { t, type Locale } from "../lib/i18n.ts";
import { editCombo } from "../lib/context-menu.ts";
import type { ContextMenu } from "../hooks/useContextMenu.ts";

const ICON = { className: "size-3.5", strokeWidth: 1.75 } as const;

export interface PathContextMenuProps {
  menu: ContextMenu;
  locale: Locale;
  /** The absolute path the row points at (`ProcessPathLink`'s `title`, not its shortened label). */
  path: string;
}

export function PathContextMenu(props: PathContextMenuProps) {
  const tr = (key: Parameters<typeof t>[1]) => t(props.locale, key);
  const { menu, path } = props;

  return (
    <FloatingMenu
      open={menu.isOpen}
      anchor={menu.anchor}
      onClose={menu.close}
      testId="tool-path-context-menu"
      minWidth={200}
      keyboardNav
    >
      <MenuItem
        icon={<Copy {...ICON} />}
        label={tr("timeline.context.copyPath")}
        shortcut={editCombo("copy")}
        onClick={() => {
          void navigator.clipboard.writeText(path).catch(() => undefined);
          menu.close();
        }}
        testId="tool-path-menu-copy"
      />
      <MenuItem
        icon={<SquarePen {...ICON} />}
        label={tr("timeline.context.openInEditor")}
        onClick={() => {
          void window.zeno.workspace.openFile(path).catch(() => undefined);
          menu.close();
        }}
        testId="tool-path-menu-open"
      />
      <MenuItem
        icon={<FolderOpen {...ICON} />}
        label={tr("timeline.context.reveal")}
        onClick={() => {
          void window.zeno.workspace.revealInFolder(path).catch(() => undefined);
          menu.close();
        }}
        testId="tool-path-menu-reveal"
      />
    </FloatingMenu>
  );
}

export interface CommandContextMenuProps {
  menu: ContextMenu;
  locale: Locale;
  /** The command as the row shows it — `detailFromView` does not truncate. */
  command: string;
}

export function CommandContextMenu(props: CommandContextMenuProps) {
  const tr = (key: Parameters<typeof t>[1]) => t(props.locale, key);
  const { menu, command } = props;

  return (
    <FloatingMenu
      open={menu.isOpen}
      anchor={menu.anchor}
      onClose={menu.close}
      testId="tool-command-context-menu"
      minWidth={200}
      keyboardNav
    >
      <MenuItem
        icon={<Copy {...ICON} />}
        label={tr("timeline.context.copyCommand")}
        shortcut={editCombo("copy")}
        onClick={() => {
          void navigator.clipboard.writeText(command).catch(() => undefined);
          menu.close();
        }}
        testId="tool-command-menu-copy"
      />
    </FloatingMenu>
  );
}
