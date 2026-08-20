/**
 * One list of project actions, drawn twice: as the header's right-click menu and
 * as the small trigger button sitting on every project row. Radix has no shared
 * item type between its context and dropdown menus, so the *actions* are the
 * shared thing and each primitive renders them.
 */
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { COARSE_POINTER_ICON_SIZE_CLASS } from "@/components/ui/coarse-pointer-sizing";
import { cn } from "@/lib/utils";
import {
  MENU_CONTENT_CLASS,
  MENU_ICON_CLASS,
  MENU_ICON_DESTRUCTIVE_CLASS,
  MENU_SEPARATOR_CLASS,
  menuItemClass,
} from "./menu-surface";
import {
  SIDEBAR_MORE_ACTION_TRIGGER_CLASS,
  SIDEBAR_ROW_GLYPH_SLOT_CLASS,
} from "./sidebarRowClasses";

export interface ProjectMenuAction {
  id: string;
  label: string;
  /** Decorative: the label already names the action. */
  icon: IconName;
  destructive?: boolean;
  onSelect: () => void;
}

/** A separator is a group boundary, so the groups themselves are the model. */
export type ProjectMenuGroup = readonly ProjectMenuAction[];

export interface ProjectMenuArgs {
  onNewThread: () => void;
  onEditIcon: () => void;
  canStepUp: boolean;
  canStepDown: boolean;
  onStep: (direction: "up" | "down") => void;
  /** Null for the personal project, which BB does not let anyone delete. */
  onDelete: (() => void) | null;
}

export function buildProjectMenu({
  onNewThread,
  onEditIcon,
  canStepUp,
  canStepDown,
  onStep,
  onDelete,
}: ProjectMenuArgs): ProjectMenuGroup[] {
  // Reordering must not be drag-only: the same move, from the keyboard.
  const move: ProjectMenuAction[] = [];
  if (canStepUp) {
    move.push({
      id: "up",
      label: "Move project up",
      icon: "ArrowUp",
      onSelect: () => onStep("up"),
    });
  }
  if (canStepDown) {
    move.push({
      id: "down",
      label: "Move project down",
      icon: "ArrowDown",
      onSelect: () => onStep("down"),
    });
  }

  // The ellipsis is a promise that nothing happens yet: deleting a project
  // opens a confirmation, it does not delete on the click.
  const remove: ProjectMenuAction[] =
    onDelete === null
      ? []
      : [
          {
            id: "delete",
            label: "Delete project…",
            icon: "Trash2",
            destructive: true,
            onSelect: onDelete,
          },
        ];

  const groups: ProjectMenuAction[][] = [
    [
      {
        id: "new-thread",
        label: "New thread here",
        icon: "MessageSquarePlus",
        onSelect: onNewThread,
      },
    ],
    [
      {
        id: "icon",
        label: "Set project icon…",
        icon: "Palette",
        onSelect: onEditIcon,
      },
    ],
    move,
    remove,
  ];
  return groups.filter((group) => group.length > 0);
}

function ActionGlyph({ action }: { action: ProjectMenuAction }) {
  return (
    <Icon
      name={action.icon}
      aria-hidden
      className={
        action.destructive ? MENU_ICON_DESTRUCTIVE_CLASS : MENU_ICON_CLASS
      }
    />
  );
}

/** Right-clicking anywhere on the project header. */
export function ProjectContextMenu({
  groups,
  children,
}: {
  groups: readonly ProjectMenuGroup[];
  children: ReactNode;
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          aria-label="Project actions"
          className={MENU_CONTENT_CLASS}
        >
          {groups.map((group, index) => (
            <div key={group[0]?.id ?? index}>
              {index > 0 ? (
                <ContextMenu.Separator className={MENU_SEPARATOR_CLASS} />
              ) : null}
              {group.map((action) => (
                <ContextMenu.Item
                  key={action.id}
                  onSelect={action.onSelect}
                  className={menuItemClass(action.destructive)}
                >
                  <ActionGlyph action={action} />
                  {action.label}
                </ContextMenu.Item>
              ))}
            </div>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/**
 * The same actions behind a small trigger, because a right-click is invisible
 * and unreachable on a touchpad-only or touch device.
 *
 * It is BB's own row-action trigger: a 20px glyph box with a 28px invisible hit
 * target centred on it, so the control clears the pointer-target minimum
 * without a 28px hole punched in the header's layout. On a coarse pointer the
 * box itself grows to 36px and the pseudo-target is dropped, because there the
 * glyph has the room to simply be that size.
 */
export function ProjectActionsButton({
  projectName,
  groups,
}: {
  projectName: string;
  groups: readonly ProjectMenuGroup[];
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`Actions for ${projectName}`}
        // Stops the header's collapse toggle from firing underneath it.
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        className={cn(
          SIDEBAR_ROW_GLYPH_SLOT_CLASS,
          SIDEBAR_MORE_ACTION_TRIGGER_CLASS,
          "rounded-md p-0 outline-none ring-sidebar-ring",
          "hover:bg-transparent hover:text-foreground focus-visible:ring-2",
          "data-[state=open]:text-foreground",
        )}
      >
        <Icon
          name="MoreHorizontal"
          className={COARSE_POINTER_ICON_SIZE_CLASS}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className={MENU_CONTENT_CLASS}
          aria-label={`Actions for ${projectName}`}
        >
          {groups.map((group, index) => (
            <div key={group[0]?.id ?? index}>
              {index > 0 ? (
                <DropdownMenu.Separator className={MENU_SEPARATOR_CLASS} />
              ) : null}
              {group.map((action) => (
                <DropdownMenu.Item
                  key={action.id}
                  onSelect={action.onSelect}
                  className={menuItemClass(action.destructive)}
                >
                  <ActionGlyph action={action} />
                  {action.label}
                </DropdownMenu.Item>
              ))}
            </div>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
