/**
 * Sidebar organize popovers for 项目 / 对话 sections.
 *
 * Projects: layout (按项目 | 在一个列表中) + project sort.
 * Conversations: layout (so list mode can switch back) + session sort.
 *
 * 「在一个列表中」hides 置顶/项目 and flattens every session into 对话.
 *
 * Options stay open after selection so multi-setting menus can be adjusted
 * without reopening (close via outside click / Escape).
 */
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { FloatingMenu, type AnchorRect } from "./FloatingMenu.tsx";
import { t, type Locale, type MessageKey } from "../lib/i18n.ts";
import type { ConversationSortMode, GroupMode, SortMode } from "../lib/sidebar-organize.ts";
import { cn } from "../lib/utils.ts";

type SortOption = {
  mode: SortMode;
  labelKey: MessageKey;
};

const SORT_OPTIONS: SortOption[] = [
  { mode: "priority", labelKey: "organize.sortPriority" },
  { mode: "recent", labelKey: "organize.sortRecent" },
  { mode: "manual", labelKey: "organize.sortManual" },
];

const LAYOUT_OPTIONS: { mode: GroupMode; labelKey: MessageKey; testId: string }[] = [
  { mode: "project", labelKey: "organize.byProject", testId: "organize-by-project" },
  { mode: "list", labelKey: "organize.inOneList", testId: "organize-in-list" },
];

function sortTestId(scope: "projects" | "threads", mode: SortMode): string {
  if (scope === "projects") return `organize-sort-${mode}`;
  return `threads-organize-sort-${mode}`;
}

function MenuSection(props: { label: string; testId?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={props.label} data-testid={props.testId}>
      {/* Same size as option rows (按项目 / 置顶优先…); muted color keeps section hierarchy. */}
      <p
        className={cn(
          "px-3 pt-1.5 pb-1 font-medium text-[length:var(--ui-font-size,14px)]",
          "text-[var(--group-label-color)]",
        )}
      >
        {props.label}
      </p>
      {props.children}
    </div>
  );
}

function MenuDivider() {
  return <div className="mx-3 my-1.5 h-px bg-[var(--border)]" aria-hidden />;
}

function RadioItem(props: {
  label: string;
  checked: boolean;
  onSelect: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={props.checked}
      data-testid={props.testId}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors",
        "text-[length:var(--ui-font-size,14px)] text-[var(--popover-foreground)]",
        "hover:bg-[var(--hover-fill)]",
        props.checked && "font-medium",
      )}
      onClick={props.onSelect}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
        {props.checked ? (
          <Check className="size-3.5 text-[var(--foreground)]" strokeWidth={2} />
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
    </button>
  );
}

function SortSection(props: {
  label: string;
  testId: string;
  scope: "projects" | "threads";
  value: SortMode;
  onChange: (mode: SortMode) => void;
  tr: (key: MessageKey) => string;
}) {
  return (
    <MenuSection label={props.label} testId={props.testId}>
      {SORT_OPTIONS.map((opt) => (
        <RadioItem
          key={opt.mode}
          label={props.tr(opt.labelKey)}
          checked={props.value === opt.mode}
          onSelect={() => {
            if (props.value !== opt.mode) props.onChange(opt.mode);
          }}
          testId={sortTestId(props.scope, opt.mode)}
        />
      ))}
    </MenuSection>
  );
}

type CommonProps = {
  open: boolean;
  anchor: AnchorRect | null;
  locale: Locale;
  onClose: () => void;
};

export type ProjectsOrganizeMenuProps = CommonProps & {
  kind: "projects";
  groupMode: GroupMode;
  sortMode: SortMode;
  onGroupMode: (mode: GroupMode) => void;
  onSort: (mode: SortMode) => void;
};

export type ThreadsOrganizeMenuProps = CommonProps & {
  kind: "threads";
  groupMode: GroupMode;
  sortMode: ConversationSortMode;
  onGroupMode: (mode: GroupMode) => void;
  onSort: (mode: ConversationSortMode) => void;
};

export type SidebarOrganizeMenuProps = ProjectsOrganizeMenuProps | ThreadsOrganizeMenuProps;

function LayoutSection(props: {
  groupMode: GroupMode;
  onGroupMode: (mode: GroupMode) => void;
  tr: (key: MessageKey) => string;
}) {
  return (
    <MenuSection label={props.tr("organize.layoutSection")} testId="organize-layout-group">
      {LAYOUT_OPTIONS.map((opt) => (
        <RadioItem
          key={opt.mode}
          label={props.tr(opt.labelKey)}
          checked={props.groupMode === opt.mode}
          onSelect={() => {
            if (props.groupMode !== opt.mode) props.onGroupMode(opt.mode);
          }}
          testId={opt.testId}
        />
      ))}
    </MenuSection>
  );
}

export function SidebarOrganizeMenu(props: SidebarOrganizeMenuProps) {
  const tr = (key: MessageKey, vars?: Record<string, string>) => t(props.locale, key, vars);
  const open = props.open && Boolean(props.anchor);

  if (props.kind === "projects") {
    return (
      <FloatingMenu
        open={open}
        anchor={props.anchor}
        onClose={props.onClose}
        testId="projects-organize-menu"
        minWidth={220}
      >
        <LayoutSection groupMode={props.groupMode} onGroupMode={props.onGroupMode} tr={tr} />

        <MenuDivider />

        <SortSection
          label={tr("organize.projectSort")}
          testId="organize-project-sort-group"
          scope="projects"
          value={props.sortMode}
          onChange={props.onSort}
          tr={tr}
        />
      </FloatingMenu>
    );
  }

  return (
    <FloatingMenu
      open={open}
      anchor={props.anchor}
      onClose={props.onClose}
      testId="threads-organize-menu"
      minWidth={220}
    >
      <LayoutSection groupMode={props.groupMode} onGroupMode={props.onGroupMode} tr={tr} />

      <MenuDivider />

      <SortSection
        label={tr("organize.sessionSort")}
        testId="organize-session-sort-group"
        scope="threads"
        value={props.sortMode}
        onChange={props.onSort}
        tr={tr}
      />
    </FloatingMenu>
  );
}
