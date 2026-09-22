/**
 * Right-click menu for a timeline message row.
 *
 * This exists because the row's three actions were reachable only through icons that appear on
 * hover — copy, edit & resend, continue in a new session. Someone who uses a mouse and does not
 * know the row has a hover state (or that `mod+shift+f` forks) had no way to find them.
 *
 * The actions themselves are not reimplemented: the row already owns `handleCopy`, `setEditing`
 * and `props.onForkAssistant`, and hands them straight in here. That keeps the two entry points
 * — hover icon and menu item — from drifting apart.
 *
 * "Copy as plain text" only appears when it would differ from "Copy". For an assistant turn the
 * copied text is the raw markdown source, so the second item is genuinely different output; for
 * a plain sentence it would be the same string twice, which is noise rather than a choice.
 */
import { ClipboardCopy, Copy, GitFork, SquarePen } from "lucide-react";
import { FloatingMenu } from "./FloatingMenu.tsx";
import { MenuItem } from "./ui/menu-item.tsx";
import { t, type Locale } from "../lib/i18n.ts";
import { editCombo, markdownToPlainText } from "../lib/context-menu.ts";
import { shortcutHint } from "../lib/commands.ts";
import type { ContextMenu } from "../hooks/useContextMenu.ts";

export interface MessageContextMenuProps {
  menu: ContextMenu;
  locale: Locale;
  /** The row's text: markdown source for an assistant turn, the draft for a user turn. */
  text: string;
  /** Copy the text verbatim — the row's existing copy handler. */
  onCopy: () => void;
  /** Edit & resend. User turns only. */
  onEdit?: (() => void) | undefined;
  /** Continue in a new session. Assistant turns only. */
  onFork?: (() => void) | undefined;
}

export function MessageContextMenu(props: MessageContextMenuProps) {
  const tr = (key: Parameters<typeof t>[1]) => t(props.locale, key);
  const { menu } = props;
  const plain = markdownToPlainText(props.text);
  const forkHint = props.onFork ? shortcutHint("fork-thread") : undefined;

  return (
    <FloatingMenu
      open={menu.isOpen}
      anchor={menu.anchor}
      onClose={menu.close}
      testId="timeline-context-menu"
      minWidth={200}
      keyboardNav
    >
      <MenuItem
        icon={<Copy className="size-3.5" strokeWidth={1.75} />}
        label={tr("timeline.copy")}
        shortcut={editCombo("copy")}
        onClick={() => {
          props.onCopy();
          menu.close();
        }}
        testId="timeline-menu-copy"
      />
      {plain && plain !== props.text ? (
        <MenuItem
          icon={<ClipboardCopy className="size-3.5" strokeWidth={1.75} />}
          label={tr("timeline.copyPlain")}
          onClick={() => {
            // Fire and forget: the clipboard API reports nothing useful to the user here, and
            // the row's own copy handler is what shows "copied" feedback.
            void navigator.clipboard.writeText(plain).catch(() => undefined);
            menu.close();
          }}
          testId="timeline-menu-copy-plain"
        />
      ) : null}
      {props.onEdit ? (
        <MenuItem
          icon={<SquarePen className="size-3.5" strokeWidth={1.75} />}
          label={tr("timeline.edit")}
          onClick={() => {
            props.onEdit?.();
            menu.close();
          }}
          testId="timeline-menu-edit"
        />
      ) : null}
      {props.onFork ? (
        <MenuItem
          icon={<GitFork className="size-3.5" strokeWidth={1.75} />}
          label={tr("timeline.fork")}
          {...(forkHint ? { shortcut: forkHint } : {})}
          onClick={() => {
            props.onFork?.();
            menu.close();
          }}
          testId="timeline-menu-fork"
        />
      ) : null}
    </FloatingMenu>
  );
}
