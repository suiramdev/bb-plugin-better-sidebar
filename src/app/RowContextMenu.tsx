import type { ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";

/**
 * This sidebar's right-click menu. Every item is one call on the host's action
 * hook, and deletion goes through `requestDelete` so BB shows the confirmation
 * that counts child threads instead of a plugin removing a subtree silently.
 */
export function RowContextMenu({
  thread,
  children,
}: {
  thread: PluginSidebarThread;
  children: ReactNode;
}) {
  const actions = useSidebarThreadActions();
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          aria-label="Thread actions"
          className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <MenuItem onSelect={() => actions.open(thread.id, { split: true })}>
            Open in split
          </MenuItem>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <MenuItem onSelect={() => void actions.setRead(thread.id, thread.isUnread)}>
            {thread.isUnread ? "Mark read" : "Mark unread"}
          </MenuItem>
          <MenuItem onSelect={() => void actions.setPinned(thread.id, !thread.isPinned)}>
            {thread.isPinned ? "Unpin" : "Pin"}
          </MenuItem>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <MenuItem onSelect={() => actions.archive(thread.id)}>Archive</MenuItem>
          <MenuItem destructive onSelect={() => actions.requestDelete(thread.id)}>
            Delete
          </MenuItem>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export function MenuItem({
  children,
  destructive = false,
  onSelect,
}: {
  children: ReactNode;
  destructive?: boolean;
  onSelect: () => void;
}) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className={cn(
        "cursor-pointer rounded-md px-2 py-1.5 text-sm outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        destructive && "text-destructive",
      )}
    >
      {children}
    </ContextMenu.Item>
  );
}
