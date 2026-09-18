import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  deleteSessionFile,
  resolveSessionFileForDelete,
  sessionsRootDir,
  SessionFileError,
} from "./session-files.ts";

/* Real directories and real symlinks, not a mocked fs: the entire job of this module is to
 * reason about what a path actually resolves to, so faking the filesystem would test the
 * fake. Its failure mode is deleting a file the user did not mean to delete, which is why
 * every rejection case below is asserted individually. */

let root = "";
let sessions = "";

/**
 * The two symlink cases below are the reason this module resolves paths at all, so they
 * must not be quietly dropped. Creating a symlink needs Developer Mode or elevation on
 * Windows — where it is unavailable they are skipped with that stated reason, and they
 * still run on CI's Linux, which is where the guarantee is actually enforced.
 */
const symlinksAvailable = (() => {
  const probe = mkdtempSync(join(tmpdir(), "zeno-symlink-probe-"));
  try {
    symlinkSync(join(probe, "target"), join(probe, "link"));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
})();

const itWithSymlinks = symlinksAvailable ? it : it.skip;
if (!symlinksAvailable) {
  // Say so out loud: a silently skipped security test reads the same as a passing one.
  console.warn(
    "[session-files.test] symlinks unavailable here — the two escape cases are skipped " +
      "(Windows needs Developer Mode or elevation). They run on CI's Linux.",
  );
}

/** The real layout: sessions/<cwd-slug>/<timestamp>_<uuid>.jsonl */
function makeSession(name = "sess.jsonl", slug = "--C--work-proj--"): string {
  const dir = join(sessions, slug);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, "{}\n");
  return file;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "zeno-session-files-"));
  sessions = join(root, "agent", "sessions");
  mkdirSync(sessions, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("sessionsRootDir", () => {
  it("is the sessions directory under the agent dir", () => {
    expect(sessionsRootDir("/agent")).toBe(join("/agent", "sessions"));
  });
});

describe("resolveSessionFileForDelete", () => {
  it("accepts a session file inside the root", () => {
    const file = makeSession();
    expect(resolveSessionFileForDelete(file, sessions)).toBe(file);
  });

  it("accepts a path that is not yet normalised", () => {
    const file = makeSession();
    const roundabout = join(
      sessions,
      ".",
      "--C--work-proj--",
      "..",
      "--C--work-proj--",
      "sess.jsonl",
    );
    expect(resolveSessionFileForDelete(roundabout, sessions)).toBe(file);
  });

  it("rejects an empty or non-string path", () => {
    expect(() => resolveSessionFileForDelete("", sessions)).toThrow(SessionFileError);
    expect(() => resolveSessionFileForDelete("   ", sessions)).toThrow(SessionFileError);
    // @ts-expect-error — guarding against a renderer sending something unexpected.
    expect(() => resolveSessionFileForDelete(undefined, sessions)).toThrow(SessionFileError);
  });

  it("rejects a file outside the root, however it is expressed", () => {
    const outside = join(root, "secret.jsonl");
    writeFileSync(outside, "secret\n");

    for (const candidate of [
      outside, // absolute escape
      join(sessions, "..", "secret.jsonl"), // traversal
      join(sessions, "..", "..", "secret.jsonl"), // deeper traversal
    ]) {
      expect(() => resolveSessionFileForDelete(candidate, sessions), candidate).toThrow(
        SessionFileError,
      );
    }
    // Untouched, which is the guarantee that matters.
    expect(existsSync(outside)).toBe(true);
  });

  itWithSymlinks("rejects a symlink inside the root that points outside it", () => {
    // The attack a name-only check would miss: this entry IS inside sessions/ by name.
    const secret = join(root, "id_rsa");
    writeFileSync(secret, "PRIVATE\n");
    const link = join(sessions, "innocent.jsonl");
    symlinkSync(secret, link);

    expect(() => resolveSessionFileForDelete(link, sessions)).toThrow(SessionFileError);
    expect(() => deleteSessionFile(link, sessions)).toThrow(SessionFileError);
    expect(existsSync(secret)).toBe(true);
  });

  itWithSymlinks("rejects a symlinked root rather than trusting the prefix", () => {
    // Reaching the real sessions dir through a link is legitimate to *read*, but the file
    // must still land inside the resolved root after realpath — here it does, so this
    // asserts the resolution is what decides, not the spelling.
    const file = makeSession();
    const linkRoot = join(root, "sessions-link");
    symlinkSync(sessions, linkRoot);
    expect(resolveSessionFileForDelete(file, linkRoot)).toBe(file);
  });

  it("rejects a path that is not a .jsonl session file", () => {
    const dir = join(sessions, "--C--work-proj--");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "notes.txt"), "hi\n");
    writeFileSync(join(dir, "no-extension"), "hi\n");

    expect(() => resolveSessionFileForDelete(join(dir, "notes.txt"), sessions)).toThrow(
      SessionFileError,
    );
    expect(() => resolveSessionFileForDelete(join(dir, "no-extension"), sessions)).toThrow(
      SessionFileError,
    );
  });

  it("rejects a directory, even one named like a session", () => {
    const dirAsFile = join(sessions, "sneaky.jsonl");
    mkdirSync(dirAsFile, { recursive: true });
    expect(() => resolveSessionFileForDelete(dirAsFile, sessions)).toThrow(SessionFileError);
  });

  it("rejects a missing file and a missing root", () => {
    expect(() => resolveSessionFileForDelete(join(sessions, "nope.jsonl"), sessions)).toThrow(
      SessionFileError,
    );
    expect(() =>
      resolveSessionFileForDelete("/anything.jsonl", join(root, "no-such-root")),
    ).toThrow(SessionFileError);
  });
});

describe("deleteSessionFile", () => {
  it("removes the session file and leaves its siblings", () => {
    const file = makeSession("one.jsonl");
    const sibling = makeSession("two.jsonl");

    deleteSessionFile(file, sessions);

    expect(existsSync(file)).toBe(false);
    expect(existsSync(sibling)).toBe(true);
  });

  it("does not remove the containing directory", () => {
    // The slug directory holds other sessions; only the requested file may go.
    const file = makeSession("one.jsonl");
    const dir = join(sessions, "--C--work-proj--");
    deleteSessionFile(file, sessions);
    expect(existsSync(dir)).toBe(true);
  });
});
