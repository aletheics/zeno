/**
 * When to show the view-mode project trust dialog.
 * Terminal mode leaves prompting to embedded pi TUI.
 */

import { isAutoDefaultWorkspacePath, isConversationWorkspacePath } from "./workspace.ts";

export type ProjectTrustPromptInput = {
  contentMode: "chat" | "terminal";
  cwd: string | undefined;
  /** From HostSnapshot.trust */
  trust:
    | {
        required: boolean;
        trusted: boolean;
        savedDecision: boolean | null;
        fallback: "ask" | "always" | "never";
      }
    | undefined;
  projectTrusted: boolean | undefined;
  /** Normalized cwd keys the user dismissed with "Later" this session. */
  dismissedKeys: ReadonlySet<string>;
};

/** Stable key for dismiss map / de-dupe (slash + case). */
export function projectTrustPromptKey(cwd: string): string {
  return cwd.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * View mode only: required gated resources, no trust.json decision, default=ask,
 * currently untrusted, and not dismissed for this cwd in-session.
 *
 * Note: do not use isEphemeralWorkspacePath here — e2e/temp project paths still need
 * the prompt when they contain .pi config.
 */
export function shouldPromptProjectTrust(input: ProjectTrustPromptInput): boolean {
  if (input.contentMode !== "chat") return false;
  const cwd = input.cwd?.trim();
  if (!cwd) return false;
  // Skip pure conversation / date scratch homes only (not all temp paths).
  if (isConversationWorkspacePath(cwd) || isAutoDefaultWorkspacePath(cwd)) return false;
  const trust = input.trust;
  if (!trust) return false;
  if (!trust.required) return false;
  // Only skip when trust.json already has an explicit true/false (null/undefined = undecided).
  if (typeof trust.savedDecision === "boolean") return false;
  if (trust.fallback !== "ask") return false;
  if (input.projectTrusted === true || trust.trusted === true) return false;
  if (input.dismissedKeys.has(projectTrustPromptKey(cwd))) return false;
  return true;
}
