/**
 * One list of project actions, drawn twice: as the header's right-click menu and
 * as the small trigger button sitting on every project row. Radix has no shared
 * item type between its context and dropdown menus, so the *actions* are the
 * shared thing and each primitive renders them.
 */
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { LIST_HOVER_TRANSITION } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

export interface ProjectMenuAction {
  id: string;
  label: string;
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
      onSelect: () => onStep("up"),
    });
  }
  if (canStepDown) {
    move.push({
      id: "down",
      label: "Move project down",
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
            destructive: true,
            onSelect: onDelete,
          },
        ];

  return [
    [{ id: "new-thread", label: "New thread here", onSelect: onNewThread }],
    [{ id: "icon", label: "Set project icon…", onSelect: onEditIcon }],
    move,
    remove,
  ].filter((group) => group.length > 0);
}

const CONTENT_CLASS =
  "z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md";

const ITEM_CLASS = [
  "flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm outline-none",
  // The pointer is already on the item; a fade would only lag behind it.
  LIST_HOVER_TRANSITION,
  // A menu item is a control, and a coarse pointer needs a bigger one.
  "min-h-6 max-md:pointer-coarse:min-h-9",
  "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
].join(" ");

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
          className={CONTENT_CLASS}
        >
          {groups.map((group, index) => (
            <div key={group[0]?.id ?? index}>
              {index > 0 ? (
                <ContextMenu.Separator className="my-1 h-px bg-border" />
              ) : null}
              {group.map((action) => (
                <ContextMenu.Item
                  key={action.id}
                  onSelect={action.onSelect}
                  className={cn(
                    ITEM_CLASS,
                    action.destructive && "text-destructive",
                  )}
                >
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
        className={cn(
          // 20px was under the 24px minimum target, and this button is the
          // only way to reach these actions without a right-click.
          "flex size-6 shrink-0 items-center justify-center rounded-md outline-none",
          "max-md:pointer-coarse:size-9",
          // Muted, not muted-and-then-faded twice: `text-muted-foreground/40`
          // under `opacity-70` left the glyph at roughly a quarter of the
          // palette's quietest token, which is not a legible control.
          "text-muted-foreground opacity-60",
          LIST_HOVER_TRANSITION,
          "hover:bg-sidebar-accent hover:text-foreground",
          "focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring",
          "group-hover/header:opacity-100 data-[state=open]:bg-sidebar-accent data-[state=open]:opacity-100",
        )}
      >
        <Icon name="MoreHorizontal" className="size-3.5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className={CONTENT_CLASS}
          aria-label={`Actions for ${projectName}`}
        >
          {groups.map((group, index) => (
            <div key={group[0]?.id ?? index}>
              {index > 0 ? (
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
              ) : null}
              {group.map((action) => (
                <DropdownMenu.Item
                  key={action.id}
                  onSelect={action.onSelect}
                  className={cn(
                    ITEM_CLASS,
                    action.destructive && "text-destructive",
                  )}
                >
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
