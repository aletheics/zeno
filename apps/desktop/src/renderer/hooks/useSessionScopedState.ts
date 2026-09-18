import { useEffect, useRef } from "react";
import {
  loadComposerDraftForSession,
  saveComposerDraftForSession,
} from "@/lib/composer-draft-prefs";
import {
  loadAccessModeForSession,
  resolveAccessMode,
  saveAccessModeForSession,
  type AccessMode,
  type AccessVisibility,
} from "@/lib/settings-prefs";

/* The composer text and permission mode that belong to a session, rather than to the app.
 *
 * Both used to be single global values, so one session's choice leaked into every other —
 * the composer text followed you across, and a permission mode set anywhere applied
 * everywhere. They travel together here because switching one without the other would
 * reintroduce exactly that.
 *
 * The shell supplies the state it owns; this owns the remembering. Reading `prompt` through
 * a getter rather than a value matters: these run inside async handlers, where a captured
 * value can be a render behind.
 */

export function useSessionScopedState(options: {
  /** The session the composer is currently bound to. */
  sessionFile: string | undefined;
  /** Read fresh — see the note above. */
  getPrompt: () => string;
  attachments: string[];
  accessMode: AccessMode;
  accessVisibility: AccessVisibility;
  setPrompt: (value: string) => void;
  setAttachments: (value: string[]) => void;
  setAccessMode: (value: AccessMode) => void;
}) {
  const {
    sessionFile,
    getPrompt,
    attachments,
    accessMode,
    accessVisibility,
    setPrompt,
    setAttachments,
    setAccessMode,
  } = options;

  /** Remember the outgoing session's composer text and permission mode. */
  function persist() {
    if (!sessionFile) return;
    saveComposerDraftForSession(sessionFile, { prompt: getPrompt(), attachments });
    saveAccessModeForSession(sessionFile, accessMode);
  }

  /**
   * Forget the composer draft, for a composer that was just consumed — sent, run as a slash
   * command, or handed to the shell. The opposite of persisting: leaving a session keeps
   * what you typed, sending it does not, and keeping the sent text would offer it back next
   * time you opened that session. The permission mode is untouched; sending a message is
   * not a reason to forget how the session was allowed to work.
   */
  function discard() {
    if (!sessionFile) return;
    saveComposerDraftForSession(sessionFile, { prompt: "", attachments: [] });
  }

  /**
   * Bring in the incoming session's composer text and permission mode.
   *
   * Called once per switch, before any of its branches, so every path out of the switch is
   * covered — including the early returns, where the target *is* the current session and
   * saving then loading the same key is a no-op.
   */
  function adopt(nextSessionFile: string | undefined) {
    persist();
    const draft = loadComposerDraftForSession(nextSessionFile);
    setPrompt(draft.prompt);
    setAttachments(draft.attachments);
    // A restored mode must still be one the current visibility policy offers.
    setAccessMode(resolveAccessMode(loadAccessModeForSession(nextSessionFile), accessVisibility));
  }

  /**
   * Adopt the resumed session's own permission mode on cold start.
   *
   * Without this the session is shown with the *global* last-used value until the user
   * switches away and back, which looks like the stored value was ignored.
   */
  const adoptedRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!sessionFile || adoptedRef.current !== undefined) return;
    adoptedRef.current = sessionFile;
    setAccessMode(resolveAccessMode(loadAccessModeForSession(sessionFile), accessVisibility));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on the first bind
  }, [sessionFile]);

  return { persist, discard, adopt };
}
