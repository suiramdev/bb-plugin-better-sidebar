import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  COARSE_POINTER_COMPACT_ROW_HEIGHT_CLASS,
  COARSE_POINTER_GLYPH_BOX_CLASS,
  COARSE_POINTER_ICON_SIZE_CLASS,
  COARSE_POINTER_ROW_ACTION_SIZE_CLASS,
} from "@/components/ui/coarse-pointer-sizing";
import { cn } from "@/lib/utils";
import {
  SIDEBAR_HOVER_ACTIONS_CLASS,
  SIDEBAR_HOVER_ACTIONS_FADE_CLASS,
  SIDEBAR_HOVER_ACTIONS_ROW_CLASS,
} from "./sidebarHoverActions";
import {
  SIDEBAR_MORE_ACTION_TRIGGER_CLASS,
  SIDEBAR_ROW_BASE_CLASS,
  getSidebarThreadRowPaddingLeft,
} from "./sidebarRowClasses";
import { SidebarChildToggleChevron } from "./SidebarChildToggleChevron";
import { CollapsedThreadStatusGlyph } from "./ThreadRow";
import {
  ThreadTreeGroupLine,
  ThreadTreeLineContinuation,
} from "./ThreadTreeLines";
import {
  getCollapsedChildActivity,
  type CollapsedChildActivity,
} from "./threadActivity";
import type { WorktreeGroup } from "./worktrees";

/**
 * The header over a set of threads sharing one worktree, vendored from
 * `EnvironmentThreadGroupHeader` and `EnvironmentThreadGroupHeaderActions` in
 * `apps/app/src/components/sidebar/ProjectRow.tsx`.
 *
 * It used to be this plugin's own approximation of that header, and it differed
 * in the ways that show: it painted a hover fill and a transition the host's
 * header does not have, laid a full-bleed toggle button under the whole row,
 * hung its own class vocabulary off raw Radix for the menu, and offered a
 * single action where BB offers three.
 *
 * Now it is the host's header. The row is inert except for its caret and its
 * actions — upstream marks the glyph and label `pointer-events-none` and gives
 * the row no click target of its own, so the only way to fold a worktree is the
 * caret, exactly as in BB. The trailing slot holds the rolled-up status glyph
 * for a collapsed group and hands it to the actions on hover.
 *
 * Two additions are this plugin's and are kept: the stack position, because a
 * stack level *is* a worktree and the number belongs on the header rather than
 * on every row under it; and the continuation rail, because this list nests
 * worktree groups under parent threads where BB nests them under sections.
 */
interface WorktreeRowProps {
  group: WorktreeGroup;
  depth: number;
  isCollapsed: boolean;
  onToggle: () => void;
  /** The rows inside the group; not rendered while it is collapsed. */
  children?: ReactNode;
  /**
   * Depth of the parent row whose hairline runs past this header, when the
   * group is nested inside one. Null at the top of a project.
   */
  parentLineDepth?: number | null;
  onCreateNewThread?: () => void;
  onRenameWorktree?: () => void;
  onArchiveThreads?: () => void;
  archiveThreadsPending?: boolean;
}

export function WorktreeRow({
  group,
  depth,
  isCollapsed,
  onToggle,
  children,
  parentLineDepth = null,
  onCreateNewThread,
  onRenameWorktree,
  onArchiveThreads,
  archiveThreadsPending = false,
}: WorktreeRowProps) {
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const childActivity: CollapsedChildActivity = getCollapsedChildActivity(
    group.nodes.map((node) => node.thread),
  );
  // Collapsed: the header speaks for its hidden children through one status
  // glyph. Expanded: the children show their own glyphs, and the synthetic
  // header has no status of its own.
  const showRollupGlyph =
    isCollapsed &&
    (childActivity.pending ||
      childActivity.working ||
      childActivity.hasUnsubmittedDraft ||
      childActivity.unread ||
      childActivity.unreadError);

  return (
    // `space-y-0.5`: the host's own step between a header and the block of
    // rows it opens.
    <li className="list-none space-y-0.5">
      <div
        className={cn(
          SIDEBAR_HOVER_ACTIONS_ROW_CLASS,
          "relative",
          SIDEBAR_ROW_BASE_CLASS,
          COARSE_POINTER_COMPACT_ROW_HEIGHT_CLASS,
        )}
        style={{ paddingLeft: getSidebarThreadRowPaddingLeft(depth) }}
      >
        {parentLineDepth === null ? null : (
          // An outer group's hairline would otherwise break where this header
          // interrupts it, so the header carries the segment through.
          <ThreadTreeLineContinuation parentRowDepth={parentLineDepth} />
        )}
        {group.stackPosition === null ? null : (
          // The level's place in the stack, in the same slot and the same
          // treatment a lone stacked row uses — so a stack reads as one column
          // of numbers whether a level holds one thread or five. Decorative:
          // the ordinal is spoken by the list this header opens.
          <span
            aria-hidden
            className="relative z-10 w-3 shrink-0 text-right text-2xs tabular-nums text-subtle-foreground"
          >
            {group.stackPosition}
          </span>
        )}
        <span
          className={cn(
            "pointer-events-none relative z-10 inline-flex shrink-0 items-center justify-center text-subtle-foreground",
            COARSE_POINTER_GLYPH_BOX_CLASS,
          )}
          aria-hidden="true"
        >
          <Icon
            name="FolderGit"
            className={COARSE_POINTER_ICON_SIZE_CLASS}
            aria-hidden="true"
          />
        </span>
        <span className="pointer-events-none relative z-10 flex min-w-0 flex-1 items-center gap-1.5 text-left text-subtle-foreground/80">
          <span className="min-w-0 truncate" title={group.name}>
            <span>{group.name}</span>
          </span>
          <SidebarChildToggleChevron
            isCollapsed={isCollapsed}
            expandLabel={`Expand ${group.name} threads`}
            collapseLabel={`Collapse ${group.name} threads`}
            onToggle={onToggle}
            revealOnHover
          />
        </span>
        <span
          className={cn(
            "relative z-10 shrink-0",
            COARSE_POINTER_ROW_ACTION_SIZE_CLASS,
          )}
        >
          {showRollupGlyph ? (
            <span
              data-sidebar-hover-actions-open={
                isActionsOpen ? "true" : undefined
              }
              className={cn(
                SIDEBAR_HOVER_ACTIONS_FADE_CLASS,
                "pointer-events-none absolute inset-0 flex items-center justify-end text-subtle-foreground",
              )}
            >
              <CollapsedThreadStatusGlyph activity={childActivity} />
            </span>
          ) : null}
          <div
            data-sidebar-hover-actions-open={isActionsOpen ? "true" : undefined}
            className={cn(
              SIDEBAR_HOVER_ACTIONS_CLASS,
              "absolute inset-0 flex items-center justify-end",
            )}
          >
            <WorktreeActions
              archiveThreadsPending={archiveThreadsPending}
              onArchiveThreads={onArchiveThreads}
              onCreateNewThread={onCreateNewThread}
              onRenameWorktree={onRenameWorktree}
              onOpenChange={setIsActionsOpen}
            />
          </div>
        </span>
      </div>
      {isCollapsed ? null : (
        // The hairline that ties the group's rows to the header above them,
        // dropped from the centre of its glyph column.
        <div className="relative">
          <ThreadTreeGroupLine parentRowDepth={depth} />
          {children}
        </div>
      )}
    </li>
  );
}

/**
 * The worktree's own actions: BB's three, in BB's order.
 *
 * Every one of them reaches the host. New thread opens the composer on the
 * group's project, rename writes the environment's name, and archive settles
 * the whole environment in one host call rather than a loop of thread archives
 * — which is what lets the toast name the count the host actually took.
 */
function WorktreeActions({
  archiveThreadsPending,
  onArchiveThreads,
  onCreateNewThread,
  onRenameWorktree,
  onOpenChange,
}: {
  archiveThreadsPending: boolean;
  onArchiveThreads?: () => void;
  onCreateNewThread?: () => void;
  onRenameWorktree?: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  if (!onCreateNewThread && !onArchiveThreads && !onRenameWorktree) {
    return null;
  }

  return (
    <span className="inline-flex shrink-0 items-center">
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Worktree actions"
            className={cn(
              "rounded-md p-0 text-muted-foreground",
              "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-foreground",
              SIDEBAR_MORE_ACTION_TRIGGER_CLASS,
            )}
          >
            <Icon
              name="MoreHorizontal"
              className={COARSE_POINTER_ICON_SIZE_CLASS}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" aria-label="Worktree actions">
          {onCreateNewThread ? (
            <DropdownMenuItem onSelect={onCreateNewThread}>
              <Icon name="MessageSquarePlus" aria-hidden="true" />
              New thread
            </DropdownMenuItem>
          ) : null}
          {onRenameWorktree ? (
            <DropdownMenuItem
              onSelect={() => {
                onRenameWorktree();
              }}
            >
              <Icon name="Edit" aria-hidden="true" />
              Rename
            </DropdownMenuItem>
          ) : null}
          {onArchiveThreads ? (
            <DropdownMenuItem
              disabled={archiveThreadsPending}
              onSelect={(event) => {
                if (archiveThreadsPending) {
                  event.preventDefault();
                  return;
                }
                onArchiveThreads();
              }}
            >
              <Icon name="Archive" aria-hidden="true" />
              Archive worktree
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
