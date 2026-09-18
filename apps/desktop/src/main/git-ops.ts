/**
 * Reading a git working tree.
 *
 * Split out of `index.ts`. `runGit` is exported because the operations that stayed there
 * still shell out to git; `gitStatus` is the parser the IPC handlers call.
 */
import type { GitChangeItem, GitStatusSummary } from "@zeno/contracts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  const err = String(stderr ?? "").trim();
  // git writes some progress to stderr; only treat as failure when exit would have thrown.
  void err;
  return String(stdout ?? "");
}

export async function gitStatus(cwd: string): Promise<GitStatusSummary> {
  const branchOut = (
    await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "")
  ).trim();
  const porcelain = await runGit(cwd, ["status", "--porcelain", "-b"]).catch(() => "");
  const lines = porcelain.split("\n").filter(Boolean);
  let upstream: string | undefined;
  let ahead = 0;
  let behind = 0;
  const changes: GitChangeItem[] = [];
  for (const line of lines) {
    if (line.startsWith("## ")) {
      // ## main...origin/main [ahead 1, behind 2]
      const head = line.slice(3);
      const dots = head.indexOf("...");
      const branchPart = dots >= 0 ? head.slice(0, dots) : head.split(" ")[0];
      void branchPart;
      if (dots >= 0) {
        const rest = head.slice(dots + 3);
        const up = rest.split(/[\s[]/)[0]?.trim();
        if (up) upstream = up;
      }
      const aheadM = /ahead (\d+)/.exec(head);
      const behindM = /behind (\d+)/.exec(head);
      if (aheadM) ahead = Number(aheadM[1]);
      if (behindM) behind = Number(behindM[1]);
      continue;
    }
    // XY path  or XY orig -> path
    const code = line.slice(0, 2);
    let path = line.slice(3).trim();
    const arrow = path.indexOf(" -> ");
    if (arrow >= 0) path = path.slice(arrow + 4);
    const staged = code[0] !== " " && code[0] !== "?";
    const status =
      code.trim() === "??"
        ? "??"
        : code[0] !== " " && code[0] !== "?"
          ? code[0]
          : code[1] || code[0];
    changes.push({ path, status: status || "M", staged });
  }
  let insertions = 0;
  let deletions = 0;
  try {
    const numstat = await runGit(cwd, ["diff", "--numstat", "HEAD"]);
    for (const line of numstat.split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) continue;
      const a = parts[0] === "-" ? 0 : Number(parts[0]);
      const d = parts[1] === "-" ? 0 : Number(parts[1]);
      if (Number.isFinite(a)) insertions += a;
      if (Number.isFinite(d)) deletions += d;
    }
    // Untracked files not in HEAD diff — count roughly as additions via status ??
    const untracked = changes.filter((c) => c.status === "??").length;
    if (untracked > 0 && insertions === 0 && deletions === 0) {
      // leave zeros; file list still shows under expanded changes
    }
  } catch {
    // no commits yet or not a repo
  }

  const summary: GitStatusSummary = {
    ahead,
    behind,
    changes,
    clean: changes.length === 0,
    insertions,
    deletions,
  };
  if (branchOut && branchOut !== "HEAD") summary.branch = branchOut;
  if (upstream) summary.upstream = upstream;
  return summary;
}
