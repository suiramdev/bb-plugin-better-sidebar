import type { ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon, type IconName } from "@/components/ui/icon";
import { LIST_HOVER_TRANSITION } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import { useThreadSelection } from "./SelectionContext";

/**
 * This sidebar's right-click menu. Every item is one call on the host's action
 * hook, and deletion goes through `requestDelete` so BB shows the confirmation
 * that counts child threads instead of a plugin removing a subtree silently.
 */
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
  const actions = useSidebarThreadActions();
  const selection = useThreadSelection();
  const selected = selection.selectedThreads();
  // Right-clicking inside a multi-row selection acts on all of it; anywhere
  // else the selection is dropped, so the menu can never act on rows the user
  // has stopped looking at.
  const isBulk = selected.length > 1 && selection.isSelected(thread.id);

  return (
    <ContextMenu.Root
      onOpenChange={(open) => {
        if (open && !selection.isSelected(thread.id)) selection.clear();
      }}
    >
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          aria-label={
            isBulk ? "Actions for selected threads" : "Thread actions"
          }
          className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {isBulk ? (
            <BulkItems threads={selected} onDone={selection.clear} />
          ) : (
            <SingleItems thread={thread} onRename={onRename} />
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function SingleItems({
  thread,
  onRename,
}: {
  thread: PluginSidebarThread;
  onRename?: () => void;
}) {
  const actions = useSidebarThreadActions();
  return (
    <>
      <MenuItem
        icon="Columns2"
        onSelect={() => actions.open(thread.id, { split: true })}
      >
        Open in split
      </MenuItem>
      <ContextMenu.Separator className="my-1 h-px bg-border" />
      <MenuItem
        icon={thread.isUnread ? "MailOpen" : "Mail"}
        onSelect={() => void actions.setRead(thread.id, thread.isUnread)}
      >
        {thread.isUnread ? "Mark read" : "Mark unread"}
      </MenuItem>
      <MenuItem
        icon={thread.isPinned ? "PinOff" : "Pin"}
        onSelect={() => void actions.setPinned(thread.id, !thread.isPinned)}
      >
        {thread.isPinned ? "Unpin" : "Pin"}
      </MenuItem>
      {onRename === undefined ? null : (
        // Renaming edits the row in place rather than opening a dialog:
        // the title is already on screen, and the list is where the
        // user is judging whether the new name reads right.
        <MenuItem icon="Edit" onSelect={onRename}>
          Rename
        </MenuItem>
      )}
      <ContextMenu.Separator className="my-1 h-px bg-border" />
      <MenuItem icon="Archive" onSelect={() => actions.archive(thread.id)}>
        Archive
      </MenuItem>
      <MenuItem
        icon="Trash2"
        destructive
        onSelect={() => actions.requestDelete(thread.id)}
      >
        Delete
      </MenuItem>
    </>
  );
}

/**
 * The same actions, applied to every picked thread.
 *
 * Each item states the direction it will move the whole set rather than
 * mirroring one row's state: with a mixed selection, "Mark 5 read" is a
 * promise about the outcome, where a toggle label would be a coin flip.
 *
 * Deletion is deliberately absent. The host owns that confirmation, one
 * dialog per thread, and firing five of them at a selection is not a
 * confirmation — it is a queue the user has to fight.
 */
function BulkItems({
  threads,
  onDone,
}: {
  threads: readonly PluginSidebarThread[];
  onDone: () => void;
}) {
  const actions = useSidebarThreadActions();
  const count = threads.length;
  const anyUnread = threads.some((thread) => thread.isUnread);
  const anyUnpinned = threads.some((thread) => !thread.isPinned);

  const each = (run: (thread: PluginSidebarThread) => unknown) => {
    for (const thread of threads) void run(thread);
    onDone();
  };

  return (
    <>
      <div className="px-2 py-1 text-2xs font-medium text-muted-foreground">
        {count} threads selected
      </div>
      <ContextMenu.Separator className="my-1 h-px bg-border" />
      <MenuItem
        icon={anyUnread ? "MailOpen" : "Mail"}
        onSelect={() => each((thread) => actions.setRead(thread.id, anyUnread))}
      >
        {anyUnread ? `Mark ${count} read` : `Mark ${count} unread`}
      </MenuItem>
      <MenuItem
        icon={anyUnpinned ? "Pin" : "PinOff"}
        onSelect={() =>
          each((thread) => actions.setPinned(thread.id, anyUnpinned))
        }
      >
        {anyUnpinned ? `Pin ${count}` : `Unpin ${count}`}
      </MenuItem>
      <ContextMenu.Separator className="my-1 h-px bg-border" />
      <MenuItem
        icon="Archive"
        onSelect={() => each((thread) => actions.archive(thread.id))}
      >
        Archive {count} threads
      </MenuItem>
      <ContextMenu.Separator className="my-1 h-px bg-border" />
      <MenuItem icon="X" onSelect={onDone}>
        Clear selection
      </MenuItem>
    </>
  );
}

function MenuItem({
  children,
  icon,
  destructive = false,
  onSelect,
}: {
  children: ReactNode;
  /** Decorative: the label already names the action. */
  icon: IconName;
  destructive?: boolean;
  onSelect: () => void;
}) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none",
        // A menu item is a control, and a coarse pointer needs a bigger one.
        "min-h-6 max-md:pointer-coarse:min-h-9",
        // The pointer is already on the item; a fade would only lag behind it.
        LIST_HOVER_TRANSITION,
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        destructive && "text-destructive",
      )}
    >
      <Icon
        name={icon}
        aria-hidden
        className={cn(
          "size-4 shrink-0",
          destructive ? "text-destructive" : "text-muted-foreground",
        )}
      />
      {children}
    </ContextMenu.Item>
  );
}
