import type { ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon, type IconName } from "@/components/ui/icon";
import { COARSE_POINTER_ICON_SIZE_CLASS } from "@/components/ui/coarse-pointer-sizing";
import { cn } from "@/lib/utils";
import {
  MENU_CONTENT_CLASS,
  MENU_ICON_CLASS,
  MENU_ICON_DESTRUCTIVE_CLASS,
  MENU_LABEL_CLASS,
  MENU_SEPARATOR_CLASS,
  menuItemClass,
} from "./menu-surface";
import {
  SIDEBAR_MORE_ACTION_TRIGGER_CLASS,
  SIDEBAR_ROW_GLYPH_SLOT_CLASS,
} from "./sidebarRowClasses";
import { useThreadSelection } from "./SelectionContext";

/**
 * This sidebar's thread actions, as data.
 *
 * They used to be written straight into Radix's context-menu items, which made
 * the right-click the only way to reach them. BB's own row offers the same set
 * from a trigger on the row as well, so the actions had to become the shared
 * thing and each primitive render them — exactly the shape `ProjectMenu`
 * already uses for a project's actions.
 *
 * Every item is one call on the host's action hook, and deletion goes through
 * `requestDelete` so BB shows the confirmation that counts child threads
 * instead of a plugin removing a subtree silently.
 */
interface ThreadMenuAction {
  id: string;
  label: string;
  /** Decorative: the label already names the action. */
  icon: IconName;
  destructive?: boolean;
  onSelect: () => void;
}

/** A separator is a group boundary, so the groups themselves are the model. */
type ThreadMenuGroup = readonly ThreadMenuAction[];

/**
 * Reads the selection and the host's action hook, and returns both the item
 * model and the accessible name the surface showing it should carry.
 *
 * Right-clicking inside a multi-row selection acts on all of it; anywhere else
 * the selection is dropped, so the menu can never act on rows the user has
 * stopped looking at.
 */
function useThreadMenu(
  thread: PluginSidebarThread,
  onRename?: () => void,
): { groups: ThreadMenuGroup[]; label: string; isBulk: boolean } {
  const actions = useSidebarThreadActions();
  const selection = useThreadSelection();
  const selected = selection.selectedThreads();
  const isBulk = selected.length > 1 && selection.isSelected(thread.id);

  if (isBulk) {
    const count = selected.length;
    const anyUnread = selected.some((entry) => entry.isUnread);
    const anyUnpinned = selected.some((entry) => !entry.isPinned);
    const each = (run: (entry: PluginSidebarThread) => unknown) => {
      for (const entry of selected) void run(entry);
      selection.clear();
    };

    // Each item states the direction it will move the whole set rather than
    // mirroring one row's state: with a mixed selection, "Mark 5 read" is a
    // promise about the outcome, where a toggle label would be a coin flip.
    //
    // Deletion is deliberately absent. The host owns that confirmation, one
    // dialog per thread, and firing five of them at a selection is not a
    // confirmation — it is a queue the user has to fight.
    return {
      isBulk,
      label: "Actions for selected threads",
      groups: [
        [
          {
            id: "read",
            label: anyUnread ? `Mark ${count} read` : `Mark ${count} unread`,
            icon: anyUnread ? "MailOpen" : "Mail",
            onSelect: () =>
              each((entry) => actions.setRead(entry.id, anyUnread)),
          },
          {
            id: "pin",
            label: anyUnpinned ? `Pin ${count}` : `Unpin ${count}`,
            icon: anyUnpinned ? "Pin" : "PinOff",
            onSelect: () =>
              each((entry) => actions.setPinned(entry.id, anyUnpinned)),
          },
        ],
        [
          {
            id: "archive",
            label: `Archive ${count} threads`,
            icon: "Archive",
            onSelect: () => each((entry) => actions.archive(entry.id)),
          },
        ],
        [
          {
            id: "clear",
            label: "Clear selection",
            icon: "X",
            onSelect: selection.clear,
          },
        ],
      ],
    };
  }

  const rename: ThreadMenuAction[] =
    onRename === undefined
      ? []
      : [
          // Renaming edits the row in place rather than opening a dialog: the
          // title is already on screen, and the list is where the user is
          // judging whether the new name reads right.
          { id: "rename", label: "Rename", icon: "Edit", onSelect: onRename },
        ];

  return {
    isBulk,
    label: "Thread actions",
    groups: [
      [
        {
          id: "split",
          label: "Open in split",
          icon: "Columns2",
          onSelect: () => actions.open(thread.id, { split: true }),
        },
      ],
      [
        {
          id: "read",
          label: thread.isUnread ? "Mark read" : "Mark unread",
          icon: thread.isUnread ? "MailOpen" : "Mail",
          onSelect: () => void actions.setRead(thread.id, thread.isUnread),
        },
        {
          id: "pin",
          label: thread.isPinned ? "Unpin" : "Pin",
          icon: thread.isPinned ? "PinOff" : "Pin",
          onSelect: () => void actions.setPinned(thread.id, !thread.isPinned),
        },
        ...rename,
      ],
      [
        {
          id: "archive",
          label: "Archive",
          icon: "Archive",
          onSelect: () => actions.archive(thread.id),
        },
        {
          id: "delete",
          label: "Delete",
          icon: "Trash2",
          destructive: true,
          onSelect: () => actions.requestDelete(thread.id),
        },
      ],
    ],
  };
}

/** The caption above a bulk menu, which the single-thread menu has no use for. */
function BulkCaption({ count }: { count: number }) {
  return <div className={MENU_LABEL_CLASS}>{count} threads selected</div>;
}

function ActionGlyph({ action }: { action: ThreadMenuAction }) {
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

/** Right-clicking anywhere on a thread row. */
export function RowContextMenu({
  thread,
  onRename,
  children,
}: {
  thread: PluginSidebarThread;
  /** Puts the row itself into edit mode; absent when the row cannot rename. */
  onRename?: () => void;
  children: ReactNode;
}) {
  const selection = useThreadSelection();
  const { groups, label, isBulk } = useThreadMenu(thread, onRename);

  return (
    <ContextMenu.Root
      onOpenChange={(open) => {
        if (open && !selection.isSelected(thread.id)) selection.clear();
      }}
    >
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content aria-label={label} className={MENU_CONTENT_CLASS}>
          {isBulk ? (
            <>
              <BulkCaption count={selection.count} />
              <ContextMenu.Separator className={MENU_SEPARATOR_CLASS} />
            </>
          ) : null}
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
 * The same actions behind the row's trailing trigger.
 *
 * BB's own thread row keeps a control there that appears on hover or keyboard
 * focus and takes the slot the status glyph rests in; a right-click menu alone
 * is invisible, and unreachable on a touch device. Nothing new is offered here
 * — it is the identical `useThreadMenu` model the right-click renders.
 */
export function ThreadActionsButton({
  thread,
  onRename,
  onOpenChange,
}: {
  thread: PluginSidebarThread;
  onRename?: () => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const { groups, label, isBulk } = useThreadMenu(thread, onRename);
  const selection = useThreadSelection();

  return (
    <DropdownMenu.Root onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger
        aria-label={label}
        // The row is a link; opening its menu must not navigate.
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className={cn(
          SIDEBAR_ROW_GLYPH_SLOT_CLASS,
          SIDEBAR_MORE_ACTION_TRIGGER_CLASS,
          "rounded-md p-0 outline-none ring-sidebar-ring hover:bg-transparent hover:text-foreground focus-visible:ring-2",
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
          aria-label={label}
          className={MENU_CONTENT_CLASS}
        >
          {isBulk ? (
            <>
              <BulkCaption count={selection.count} />
              <DropdownMenu.Separator className={MENU_SEPARATOR_CLASS} />
            </>
          ) : null}
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
