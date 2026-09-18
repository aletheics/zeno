/**
 * Removing a session's file from disk.
 *
 * This is the only place in the app that deletes user data, so it does not trust its
 * caller: the renderer sends a path, and a path is only deletable when it really resolves
 * to a session file inside the agent's sessions directory. `resolveSessionFileForDelete`
 * is the whole rule; the delete itself is one line after it.
 */
import { existsSync, realpathSync, statSync, unlinkSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";

/** Rejected input. Callers surface the message; nothing here is user-facing prose. */
export class SessionFileError extends Error {}

/**
 * `<agentDir>/sessions` — pi keeps one `.jsonl` per session, filed under a per-cwd slug
 * directory, e.g. `sessions/--C--Users-me-proj--/2026-09-17T13-47-27-823Z_<uuid>.jsonl`.
 */
export function sessionsRootDir(agentDir: string): string {
  return join(agentDir, "sessions");
}

/**
 * Resolve `candidate` to the session file it names, or throw.
 *
 * Both sides are realpath'd *before* containment is checked. That is the point of this
 * function: a symlink placed inside the sessions directory passes any check done on names
 * alone — `sessions/notes.jsonl -> ~/.ssh/id_rsa` is inside the directory by name and
 * outside it by target. Comparing resolved paths is what turns that into a rejection.
 */
export function resolveSessionFileForDelete(candidate: string, sessionsRoot: string): string {
  if (typeof candidate !== "string" || !candidate.trim()) {
    throw new SessionFileError("Empty session path");
  }
  if (!existsSync(sessionsRoot)) {
    throw new SessionFileError("Sessions directory not found");
  }

  let realRoot: string;
  let realFile: string;
  try {
    realRoot = realpathSync(sessionsRoot);
    realFile = realpathSync(candidate);
  } catch {
    // Covers a missing file and a broken symlink alike.
    throw new SessionFileError("Session file not found");
  }

  // Containment via relative(), so ".." and an absolute result both mean "outside".
  // A prefix test would accept `<root>/../secrets/key.jsonl`.
  const withinRoot = relative(realRoot, realFile);
  if (
    !withinRoot ||
    withinRoot === ".." ||
    withinRoot.startsWith(`..${sep}`) ||
    isAbsolute(withinRoot)
  ) {
    throw new SessionFileError("Session file is outside the sessions directory");
  }

  if (!realFile.endsWith(".jsonl")) {
    throw new SessionFileError("Not a session file");
  }
  if (!statSync(realFile).isFile()) {
    throw new SessionFileError("Not a regular file");
  }
  return realFile;
}

/** Validate, then remove. */
export function deleteSessionFile(candidate: string, sessionsRoot: string): void {
  unlinkSync(resolveSessionFileForDelete(candidate, sessionsRoot));
}
