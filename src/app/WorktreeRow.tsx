import { useState } from "react";
import { experimental_useSidebarThreadActions as useSidebarThreadActions } from "@get-bb/plugin-sdk/app";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icon } from "@/components/ui/icon";
import {
  COARSE_POINTER_COMPACT_ROW_HEIGHT_CLASS,
  COARSE_POINTER_GLYPH_BOX_CLASS,
  COARSE_POINTER_ICON_SIZE_CLASS,
  COARSE_POINTER_ROW_ACTION_SIZE_CLASS,
} from "@/components/ui/coarse-pointer-sizing";
import { LIST_HOVER_TRANSITION } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import {
  MENU_CONTENT_CLASS,
  MENU_ICON_CLASS,
  menuItemClass,
} from "./menu-surface";
import { SidebarChildToggleChevron } from "./SidebarChildToggleChevron";
import {
  SIDEBAR_HOVER_ACTIONS_CLASS,
  SIDEBAR_HOVER_ACTIONS_FADE_CLASS,
  SIDEBAR_HOVER_ACTIONS_ROW_CLASS,
} from "./sidebarHoverActions";
import {
  SIDEBAR_MORE_ACTION_TRIGGER_CLASS,
  SIDEBAR_ROW_BASE_CLASS,
  SIDEBAR_ROW_GLYPH_SLOT_CLASS,
  getSidebarThreadRowPaddingLeft,
} from "./sidebarRowClasses";
import type { WorktreeGroup } from "./worktrees";

/**
 * The header over a set of threads sharing one worktree.
 *
 * It is BB's `EnvironmentThreadGroupHeader`, part for part: the `FolderGit`
 * glyph in the leading box, the worktree's name in `subtle-foreground/80`, the
 * hover-revealed caret, and a trailing slot where a rolled-up thread count
 * rests until the actions take its place.
 *
 * Deliberately not a link. There is no "the worktree" to navigate to — it is a
 * synthetic row standing for a set of threads — so the whole row toggles and
 * nothing about it invites a click that would go nowhere.
 */
export function WorktreeRow({
  group,
  depth,
  isCollapsed,
  onToggle,
  children,
}: {
  group: WorktreeGroup;
  depth: number;
  isCollapsed: boolean;
  onToggle: () => void;
  /** The rows inside the group; not rendered while it is collapsed. */
  children?: React.ReactNode;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <li className="list-none">
      <div
        className={cn(
          SIDEBAR_HOVER_ACTIONS_ROW_CLASS,
          "group/worktree-row relative",
          SIDEBAR_ROW_BASE_CLASS,
          COARSE_POINTER_COMPACT_ROW_HEIGHT_CLASS,
          LIST_HOVER_TRANSITION,
        )}
        style={{ paddingLeft: getSidebarThreadRowPaddingLeft(depth) }}
      >
        {/*
          A full-bleed toggle for pointer users; the caret owns keyboard focus.
          The same split a project header uses, so the two disclosure rows in
          this list behave identically.
        */}
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={onToggle}
          className="absolute inset-0 rounded-md"
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none relative z-10",
            SIDEBAR_ROW_GLYPH_SLOT_CLASS,
            COARSE_POINTER_GLYPH_BOX_CLASS,
          )}
        >
          <Icon name="FolderGit" className={COARSE_POINTER_ICON_SIZE_CLASS} />
        </span>
        <span className="pointer-events-none relative z-10 flex min-w-0 flex-1 items-center gap-1.5 text-left text-subtle-foreground/80">
          <span className="min-w-0 truncate" title={group.name}>
            {group.name}
          </span>
          <SidebarChildToggleChevron
            isCollapsed={isCollapsed}
            expandLabel={`Expand ${group.name} threads`}
            collapseLabel={`Collapse ${group.name} threads`}
            onToggle={onToggle}
            // BB reveals this caret on hover unconditionally, but its
            // collapsed header still shows a rolled-up status glyph. Here a
            // folded worktree would be a row with nothing saying it folds, and
            // the project header directly above it keeps its caret when closed
            // for exactly that reason. Matching that beats matching BB on a
            // detail the two rows would then disagree on.
            revealOnHover={!isCollapsed}
          />
        </span>
        <span
          className={cn("relative z-10 shrink-0", COARSE_POINTER_ROW_ACTION_SIZE_CLASS)}
        >
          {/*
            What the header stands for, at rest: how many threads are in the
            worktree. It yields the slot the moment the row is hovered, the way
            BB's collapsed status roll-up does.
          */}
          <span
            aria-hidden
            data-sidebar-hover-actions-open={isMenuOpen ? "true" : undefined}
            className={cn(
              SIDEBAR_HOVER_ACTIONS_FADE_CLASS,
              "pointer-events-none absolute inset-0 flex items-center justify-center text-2xs tabular-nums text-subtle-foreground",
            )}
          >
            {group.threadCount}
          </span>
          <div
            data-sidebar-hover-actions-open={isMenuOpen ? "true" : undefined}
            className={cn(
              SIDEBAR_HOVER_ACTIONS_CLASS,
              "absolute inset-0 flex items-center justify-end max-md:pointer-coarse:hidden",
            )}
          >
            <WorktreeActionsButton
              group={group}
              onOpenChange={setIsMenuOpen}
            />
          </div>
        </span>
      </div>
      {isCollapsed ? null : children}
    </li>
  );
}

/**
 * The worktree's own actions.
 *
 * BB offers three here — new thread, archive the group, rename the worktree.
 * Only archiving survives the plugin boundary, and that is the honest set:
 * the SDK exposes no environment write, so renaming would be a dead item, and
 * `openNewThread` can only target a *project* — a "New thread here" sitting
 * under a worktree header would promise a placement it cannot deliver.
 *
 * Archiving is spelled with its count, because it moves a set rather than a
 * row and the number is the part worth reading before the click.
 */
function WorktreeActionsButton({
  group,
  onOpenChange,
}: {
  group: WorktreeGroup;
  onOpenChange: (open: boolean) => void;
}) {
  const actions = useSidebarThreadActions();
  const label = `Actions for ${group.name}`;

  return (
    <DropdownMenu.Root onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger
        aria-label={label}
        // The row toggles on click; opening its menu must not collapse it.
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        className={cn(
          SIDEBAR_ROW_GLYPH_SLOT_CLASS,
          SIDEBAR_MORE_ACTION_TRIGGER_CLASS,
          "rounded-md p-0 outline-none ring-sidebar-ring",
          "hover:bg-transparent hover:text-foreground focus-visible:ring-2",
        )}
      >
        <Icon name="MoreHorizontal" className={COARSE_POINTER_ICON_SIZE_CLASS} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          aria-label={label}
          className={MENU_CONTENT_CLASS}
        >
          <DropdownMenu.Item
            onSelect={() => {
              // `archive` takes a thread and its children with it, so the
              // group's own roots are the whole set.
              for (const node of group.nodes) actions.archive(node.thread.id);
            }}
            className={menuItemClass()}
          >
            <Icon name="Archive" aria-hidden className={MENU_ICON_CLASS} />
            {group.nodes.length === 1
              ? "Archive 1 thread"
              : `Archive ${group.nodes.length} threads`}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
