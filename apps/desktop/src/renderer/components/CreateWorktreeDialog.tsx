/**
 * Create a linked git worktree from a base ref (HEAD / main / master / …)
 * with optional custom folder+branch name (empty = auto `<project>-N`).
 *
 * HEAD ≠ master/main: HEAD is whatever is currently checked out; master/main are
 * fixed branch tips. Default base is HEAD so you fork from the current tip.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { GitBranchInfo } from "@zeno/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { t, type Locale, type MessageKey } from "../lib/i18n.ts";

function projectFolderName(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return (parts.at(-1) || "repo").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "repo";
}

/** Next free `name-1`, `name-2`, … given existing worktree folder basenames. */
function nextSequencedName(projectName: string, existingBasenames: string[]): string {
  const base = projectName || "repo";
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`, "i");
  let max = 0;
  for (const raw of existingBasenames) {
    const m = re.exec(raw);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return `${base}-${max + 1}`;
}

type BaseOption = { value: string; label: string };

function buildBaseOptions(branches: GitBranchInfo[], locale: Locale): BaseOption[] {
  const tr = (key: MessageKey, vars?: Record<string, string>) => t(locale, key, vars);
  const local = branches.filter((b) => !b.remote);
  const remote = branches.filter((b) => b.remote);
  const current = local.find((b) => b.current)?.name;
  const options: BaseOption[] = [
    {
      value: "HEAD",
      label: current
        ? tr("project.createWorktreeBaseHeadCurrent", { branch: current })
        : tr("project.createWorktreeBaseHead"),
    },
  ];
  const seen = new Set<string>(["HEAD"]);
  // Prefer common trunk names near the top, then other locals, then remotes.
  for (const preferred of ["main", "master"]) {
    if (local.some((b) => b.name === preferred) && !seen.has(preferred)) {
      options.push({ value: preferred, label: preferred });
      seen.add(preferred);
    }
  }
  for (const b of local) {
    if (seen.has(b.name)) continue;
    options.push({
      value: b.name,
      label: b.current ? tr("project.createWorktreeBaseCurrent", { branch: b.name }) : b.name,
    });
    seen.add(b.name);
  }
  for (const b of remote) {
    if (seen.has(b.name)) continue;
    options.push({ value: b.name, label: b.name });
    seen.add(b.name);
  }
  return options;
}

export function CreateWorktreeDialog(props: {
  open: boolean;
  locale: Locale;
  /** Source repo path (main or existing worktree). */
  projectPath: string;
  onConfirm: (result: { path: string }) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const tr = (key: MessageKey, vars?: Record<string, string>) => t(props.locale, key, vars);
  const [base, setBase] = useState("HEAD");
  const [name, setName] = useState("");
  const [baseOptions, setBaseOptions] = useState<BaseOption[]>([
    { value: "HEAD", label: tr("project.createWorktreeBaseHead") },
  ]);
  const [autoName, setAutoName] = useState("repo-1");
  const [loadingBases, setLoadingBases] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const settledRef = useRef(false);

  const projectName = useMemo(() => projectFolderName(props.projectPath), [props.projectPath]);

  useEffect(() => {
    if (!props.open) return;
    settledRef.current = false;
    setName("");
    setBusy(false);
    setLoadingBases(true);
    setBase("HEAD");
    let cancelled = false;

    void (async () => {
      try {
        const [branches, worktrees, gitCtx] = await Promise.all([
          window.zeno.workspace.listGitBranches(props.projectPath),
          window.zeno.workspace.listGitWorktrees(props.projectPath).catch(() => []),
          window.zeno.workspace.getGitContext(props.projectPath).catch(() => ({})),
        ]);
        if (cancelled) return;

        // Prefer main repo folder name when cwd is already a linked worktree.
        const mainPath =
          "mainWorktreePath" in gitCtx && typeof gitCtx.mainWorktreePath === "string"
            ? gitCtx.mainWorktreePath
            : props.projectPath;
        const stem = projectFolderName(mainPath || props.projectPath);
        const basenames = worktrees.map((w) => projectFolderName(w.path));
        setAutoName(nextSequencedName(stem, basenames));

        const options = buildBaseOptions(branches, props.locale);
        setBaseOptions(options.length > 0 ? options : [{ value: "HEAD", label: "HEAD" }]);
        // Default: current tip (HEAD), not master — HEAD and master are only equal when
        // the repo is currently checked out on master.
        setBase("HEAD");
      } catch {
        if (cancelled) return;
        setBaseOptions([
          { value: "HEAD", label: tr("project.createWorktreeBaseHead") },
          { value: "main", label: "main" },
          { value: "master", label: "master" },
        ]);
        setBase("HEAD");
        setAutoName(nextSequencedName(projectName, []));
      } finally {
        if (!cancelled) setLoadingBases(false);
      }
    })();

    const id = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [props.open, props.projectPath, props.locale, projectName]);

  async function submit() {
    if (busy) return;
    const folderName = name.trim() || autoName;
    const newBranch = name.trim() || autoName;
    setBusy(true);
    try {
      const result = await window.zeno.workspace.createGitWorktree({
        cwd: props.projectPath,
        name: folderName,
        newBranch,
        branch: base,
      });
      settledRef.current = true;
      props.onConfirm({ path: result.path });
    } catch (error) {
      props.onError(error instanceof Error ? error.message : tr("project.createWorktreeFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (open) {
          settledRef.current = false;
          return;
        }
        if (!settledRef.current && !busy) props.onCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-sm gap-3 p-4"
        data-testid="create-worktree-dialog"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">
            {tr("project.createWorktreeTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-[12px] text-muted-foreground">
              {tr("project.createWorktreeBase")}
            </label>
            <p className="mt-0.5 text-[11px] text-[var(--text-subtle)]">
              {tr("project.createWorktreeBaseHint")}
            </p>
            <Select value={base} onValueChange={setBase} disabled={busy || loadingBases}>
              <SelectTrigger
                className="mt-1.5 h-9 w-full text-[13px]"
                data-testid="create-worktree-base"
              >
                <SelectValue
                  placeholder={
                    loadingBases
                      ? tr("project.createWorktreeLoadingBases")
                      : tr("project.createWorktreeBase")
                  }
                />
              </SelectTrigger>
              <SelectContent
                position="popper"
                sideOffset={4}
                className="z-[12000] max-h-60 w-[var(--radix-select-trigger-width)]"
              >
                {baseOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-[13px]">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-[12px] text-muted-foreground">
              {tr("project.createWorktreeName")}
            </label>
            <p className="mt-0.5 text-[11px] text-[var(--text-subtle)]">
              {tr("project.createWorktreeNameHint")}
            </p>
            <Input
              ref={inputRef}
              data-testid="create-worktree-name"
              value={name}
              placeholder={autoName || tr("project.createWorktreeNamePlaceholder")}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void submit();
                }
              }}
              className="mt-1.5 h-9 text-[13px]"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="create-worktree-cancel"
            disabled={busy}
            onClick={() => {
              settledRef.current = true;
              props.onCancel();
            }}
          >
            {tr("common.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            data-testid="create-worktree-confirm"
            disabled={busy || loadingBases}
            onClick={() => void submit()}
          >
            {busy ? tr("project.createWorktreeCreating") : tr("project.createWorktreeCreate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
