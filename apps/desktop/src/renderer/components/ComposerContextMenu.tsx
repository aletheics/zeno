/**
 * Right-click menu for the composer's textarea: cut / copy / paste / select all / clear.
 *
 * Why this is not just "let the OS handle it": the app renders its own menus everywhere else
 * (`AGENTS.md`: 不要用系统默认控件做产品交互), and the editing keys here are worth teaching —
 * each item prints its platform binding, which is how a user who does not know `⌘V` finds out.
 *
 * Paste is the one that needs real work. `handleComposerPaste` in `Composer.tsx` only
 * intercepts *images*; text paste is inserted by Chromium itself and never reaches app code.
 * A menu-driven paste cannot synthesise a `ClipboardEvent`, so it re-implements the same
 * precedence explicitly — image first (through the existing IPC the `onPaste` path uses, so
 * clipboard-image attachments behave identically), then text.
 *
 * Items that do not apply are omitted rather than greyed out: the app's menu convention is
 * that a disabled row has to explain itself (`MenuItem`'s `disabledReason`), and there is
 * nothing useful to say about a "Copy" with no selection.
 */
import { useCallback } from "react";
import { ClipboardPaste, Copy, Eraser, Scissors, TextSelect } from "lucide-react";
import { FloatingMenu } from "./FloatingMenu.tsx";
import { MenuItem } from "./ui/menu-item.tsx";
import { t, type Locale } from "../lib/i18n.ts";
import { editCombo, insertAtSelection } from "../lib/context-menu.ts";
import type { ContextMenu } from "../hooks/useContextMenu.ts";

export interface ComposerContextMenuProps {
  menu: ContextMenu;
  locale: Locale;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  prompt: string;
  onPromptChange: (value: string) => void;
  /** Add paths from `@` suggestions or a pasted clipboard image. */
  onAddAttachments?: ((paths: string[]) => void) | undefined;
}

export function ComposerContextMenu(props: ComposerContextMenuProps) {
  const tr = (key: Parameters<typeof t>[1]) => t(props.locale, key);
  const { menu, composerRef } = props;

  /**
   * Focus the textarea and put the caret back. Every action that changes the text has to do
   * this in the next frame, because the value it is based on is applied by React on this one —
   * the same `requestAnimationFrame` restore `selectCommand` and `completePathWithTab` use.
   */
  const restoreCaret = useCallback(
    (caret: number) => {
      window.requestAnimationFrame(() => {
        const el = composerRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    },
    [composerRef],
  );

  /** Replace the selection with `text`, leaving the caret after it. */
  const applyInsert = useCallback(
    (text: string) => {
      const el = composerRef.current;
      const start = el?.selectionStart ?? props.prompt.length;
      const end = el?.selectionEnd ?? props.prompt.length;
      const next = insertAtSelection(props.prompt, start, end, text);
      props.onPromptChange(next.value);
      restoreCaret(next.caret);
    },
    [composerRef, props, restoreCaret],
  );

  // Read live off the DOM rather than mirroring selection into state: the textarea keeps its
  // selectionStart/End while blurred (focus moves into this menu), so this stays correct.
  const selectionStart = composerRef.current?.selectionStart ?? 0;
  const selectionEnd = composerRef.current?.selectionEnd ?? 0;
  const hasSelection = selectionEnd > selectionStart;
  const hasText = props.prompt.length > 0;

  async function cut() {
    menu.close();
    const text = props.prompt.slice(selectionStart, selectionEnd);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard refused; still remove the text the user asked to cut.
    }
    const next = insertAtSelection(props.prompt, selectionStart, selectionEnd, "");
    props.onPromptChange(next.value);
    restoreCaret(next.caret);
  }

  async function copy() {
    menu.close();
    try {
      await navigator.clipboard.writeText(props.prompt.slice(selectionStart, selectionEnd));
    } catch {
      // Nothing useful to report — the selection is still on screen for the user to retry.
    }
  }

  async function paste() {
    menu.close();
    // Same order as `handleComposerPaste`: a clipboard image becomes an attachment, and only
    // otherwise does the clipboard's text get inserted. `saveClipboardImage` returns undefined
    // and writes nothing when the clipboard holds no image, so probing with it is free.
    try {
      const saved = await window.zeno.workspace.saveClipboardImage();
      if (saved) {
        props.onAddAttachments?.([saved]);
        return;
      }
    } catch {
      // Fall through to text: an image that cannot be saved should not block a text paste.
    }
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      // No clipboard read permission, or an empty/unreadable clipboard.
    }
    if (text) applyInsert(text);
  }

  function selectAll() {
    menu.close();
    window.requestAnimationFrame(() => composerRef.current?.select());
  }

  return (
    <FloatingMenu
      open={menu.isOpen}
      anchor={menu.anchor}
      onClose={menu.close}
      testId="composer-context-menu"
      minWidth={200}
      keyboardNav
    >
      {hasSelection ? (
        <>
          <MenuItem
            icon={<Scissors className="size-3.5" strokeWidth={1.75} />}
            label={tr("composer.edit.cut")}
            shortcut={editCombo("cut")}
            onClick={() => void cut()}
            testId="composer-menu-cut"
          />
          <MenuItem
            icon={<Copy className="size-3.5" strokeWidth={1.75} />}
            label={tr("composer.edit.copy")}
            shortcut={editCombo("copy")}
            onClick={() => void copy()}
            testId="composer-menu-copy"
          />
        </>
      ) : null}
      <MenuItem
        icon={<ClipboardPaste className="size-3.5" strokeWidth={1.75} />}
        label={tr("composer.edit.paste")}
        shortcut={editCombo("paste")}
        onClick={() => void paste()}
        testId="composer-menu-paste"
      />
      {hasText ? (
        <>
          <MenuItem
            icon={<TextSelect className="size-3.5" strokeWidth={1.75} />}
            label={tr("composer.edit.selectAll")}
            shortcut={editCombo("selectAll")}
            onClick={selectAll}
            testId="composer-menu-select-all"
          />
          <MenuItem
            icon={<Eraser className="size-3.5" strokeWidth={1.75} />}
            label={tr("composer.edit.clear")}
            onClick={() => {
              menu.close();
              props.onPromptChange("");
              restoreCaret(0);
            }}
            testId="composer-menu-clear"
          />
        </>
      ) : null}
    </FloatingMenu>
  );
}
