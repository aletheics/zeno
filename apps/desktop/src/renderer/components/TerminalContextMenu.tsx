/**
 * Right-click menu for the embedded terminal: copy the selection, paste, select all.
 *
 * ghostty-web parses the VT itself; it is not xterm.js, and several things that look like
 * terminal options do not exist here — there is no `rightClickSelectsWord` and no
 * `macOptionIsMeta` in `ITerminalOptions`, so right-click is ours to define. What it does have
 * is everything this menu needs on the `Terminal` instance: `getSelection`, `hasSelection`,
 * `selectAll` and `paste`.
 *
 * Pasting goes through `term.paste(text)` rather than writing to `onData`. That is the whole
 * point of the call: it applies bracketed paste mode when the running program has asked for it,
 * so a pasted multi-line command is delivered as one paste instead of being executed line by
 * line.
 *
 * This does not conflict with the `copyOnSelect` preference. That one copies when a selection
 * *appears*; this copies when the user asks. With copy-on-select on, the item is often
 * redundant — but it is the only route when the preference is off, and it costs nothing.
 *
 * There is no "copy selection" item when nothing is selected: there would be nothing to copy.
 */
import { ClipboardPaste, Copy, TextSelect } from "lucide-react";
import { FloatingMenu } from "./FloatingMenu.tsx";
import { MenuItem } from "./ui/menu-item.tsx";
import { t, type Locale } from "../lib/i18n.ts";
import { editCombo } from "../lib/context-menu.ts";
import type { ContextMenu } from "../hooks/useContextMenu.ts";

const ICON = { className: "size-3.5", strokeWidth: 1.75 } as const;

/** The slice of ghostty's `Terminal` this menu uses. */
export interface TerminalLike {
  getSelection(): string;
  paste(data: string): void;
  selectAll(): void;
}

export interface TerminalContextMenuProps {
  menu: ContextMenu;
  locale: Locale;
  /**
   * Selection captured when the menu opened, not read at render time. Opening the menu puts
   * ghostty into its own context-menu mode, and the selection is not something to re-query
   * after that.
   */
  selection: string;
  /** Read at action time: the terminal is recreated per session. */
  getTerminal: () => TerminalLike | null;
}

export function TerminalContextMenu(props: TerminalContextMenuProps) {
  const tr = (key: Parameters<typeof t>[1]) => t(props.locale, key);
  const { menu, selection } = props;

  /** Every action runs against the live terminal, guarded for the mid-teardown window. */
  function withTerminal(run: (term: TerminalLike) => void) {
    try {
      const term = props.getTerminal();
      if (term) run(term);
    } catch {
      // Terminal disposed between opening the menu and choosing an item.
    }
    menu.close();
  }

  return (
    <FloatingMenu
      open={menu.isOpen}
      anchor={menu.anchor}
      onClose={menu.close}
      testId="terminal-context-menu"
      minWidth={200}
      keyboardNav
    >
      {selection.trim() ? (
        <MenuItem
          icon={<Copy {...ICON} />}
          label={tr("terminal.context.copy")}
          shortcut={editCombo("copy")}
          onClick={() =>
            withTerminal(() => {
              void navigator.clipboard.writeText(selection).catch(() => undefined);
            })
          }
          testId="terminal-menu-copy"
        />
      ) : null}
      <MenuItem
        icon={<ClipboardPaste {...ICON} />}
        label={tr("terminal.context.paste")}
        shortcut={editCombo("paste")}
        onClick={() =>
          withTerminal((term) => {
            void navigator.clipboard
              .readText()
              .then((text) => {
                if (text) term.paste(text);
              })
              .catch(() => undefined);
          })
        }
        testId="terminal-menu-paste"
      />
      <MenuItem
        icon={<TextSelect {...ICON} />}
        label={tr("terminal.context.selectAll")}
        shortcut={editCombo("selectAll")}
        onClick={() => withTerminal((term) => term.selectAll())}
        testId="terminal-menu-select-all"
      />
    </FloatingMenu>
  );
}
