import type { ReactNode } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon, type IconName } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { COARSE_POINTER_ICON_SIZE_CLASS } from "@/components/ui/coarse-pointer-sizing";
import { useIsCompactViewport } from "@/components/ui/hooks/use-compact-viewport";
import { cn } from "@/lib/utils";
import { CompactLongPressMenu } from "@/components/ui/compact-long-press-menu";

/**
 * BB's thread row actions, vendored from
 * `apps/app/src/components/thread/ThreadActionsMenu.tsx` in get-bb/bb.
 *
 * This is the host's file, not a lookalike: the same item set in the same
 * order, the same two surfaces built from one `ThreadActionsMenuItems` (a
 * right-click `ContextMenu` on desktop, a long-press drawer on compact
 * viewports), the same paired archive quick action, and the host's own
 * `Button`/`DropdownMenu`/`ContextMenu` primitives rather than raw Radix with a
 * private class vocabulary.
 *
 * Four seams, all forced by the plugin boundary and nothing else:
 *
 * - the entity is `PluginSidebarThread`, so the host's `isThreadRead(thread)`,
 *   `thread.pinnedAt !== null`, and `thread.archivedAt != null` read as the
 *   published `isUnread` / `isPinned` / `isArchived` booleans;
 * - actions come from `useSidebarThreadActions()` instead of the app's
 *   `ThreadActionsProvider`, which a plugin cannot reach;
 * - Rename is a prop rather than a call. Upstream `requestRename` opens the
 *   app's rename dialog; the SDK's `rename` is deliberately silent so a plugin
 *   can edit in place, so the row passes down the callback that starts its own
 *   inline editor — the same gesture, without a dialog the SDK does not own;
 * - Unarchive is absent. The SDK publishes `archive` and no inverse, and the
 *   host's list does not hand archived threads to a plugin, so the entry would
 *   be an item that cannot fire on a row that cannot appear.
 */
interface ThreadActionsMenuBaseProps {
  thread: PluginSidebarThread;
  /**
   * Pass `false` to hide the Delete entry (e.g. sidebar rows that intentionally
   * route users to the thread detail page for destructive actions). Defaults
   * to true.
   */
  canDelete?: boolean;
  /**
   * When provided, adds a leading "Open in split" entry (the split feature's
   * second entry point, alongside cmd-click). Omitted where splits don't apply
   * (e.g. compact viewports), so the item only appears when meaningful.
   */
  onOpenInSplit?: () => void;
  /** Puts the row itself into edit mode; absent when the row cannot rename. */
  onRename?: () => void;
  /**
   * Replaces the host's item set outright, for a menu acting on a selection.
   *
   * A group model rather than rendered nodes, because the two surfaces are not
   * interchangeable: a context menu must be built from `ContextMenuItem` and a
   * dropdown from `DropdownMenuItem`, and only this component knows which one
   * it is rendering. Passing nodes would force the caller to guess.
   */
  replaceGroups?: readonly ThreadActionsMenuGroup[];
  /** A caption above the items, which a single-thread menu has no use for. */
  caption?: string;
}

export interface ThreadActionsMenuResponsiveAction {
  icon: IconName;
  label: string;
  onSelect: () => void | Promise<void>;
}

/** One separator-delimited block of entries. */
export interface ThreadActionsMenuGroup {
  id: string;
  items: readonly {
    id: string;
    icon: IconName;
    label: string;
    variant?: "default" | "destructive";
    onSelect: () => void;
  }[];
}

interface ThreadActionsMenuProps extends ThreadActionsMenuBaseProps {
  onOpenChange?: (open: boolean) => void;
  triggerClassName?: string;
  align?: "start" | "center" | "end";
  /** Accessible name for the trigger and its surface. */
  label?: string;
  /**
   * Contextual toolbar actions that move into this menu when a split header is
   * too narrow to show them inline.
   */
  responsiveActions?: readonly ThreadActionsMenuResponsiveAction[];
}

interface ThreadActionsContextMenuProps extends ThreadActionsMenuBaseProps {
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
  label?: string;
}

type ThreadActionsMenuSurface = "context" | "dropdown";

interface ThreadActionsMenuItemsProps extends ThreadActionsMenuBaseProps {
  responsiveActions?: readonly ThreadActionsMenuResponsiveAction[];
  surface: ThreadActionsMenuSurface;
}

interface ThreadActionMenuItemProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "destructive";
  icon: IconName;
  onSelect?: (event: Event) => void;
  surface: ThreadActionsMenuSurface;
}

function ThreadActionMenuItem({
  children,
  className,
  variant,
  icon,
  onSelect,
  surface,
}: ThreadActionMenuItemProps) {
  const content = (
    <>
      <Icon name={icon} aria-hidden="true" />
      {children}
    </>
  );

  if (surface === "context") {
    return (
      <ContextMenuItem
        className={cn(
          className,
          variant === "destructive" &&
            "text-destructive focus:bg-destructive/15 focus:text-destructive data-[last-hovered]:bg-destructive/15 data-[last-hovered]:text-destructive",
        )}
        onSelect={onSelect}
      >
        {content}
      </ContextMenuItem>
    );
  }

  return (
    <DropdownMenuItem
      className={className}
      variant={variant}
      onSelect={onSelect}
    >
      {content}
    </DropdownMenuItem>
  );
}

function ThreadActionMenuSeparator({
  surface,
}: {
  surface: ThreadActionsMenuSurface;
}) {
  return surface === "context" ? (
    <ContextMenuSeparator />
  ) : (
    <DropdownMenuSeparator />
  );
}

function ThreadActionMenuGroups({
  groups,
  showSeparators,
  surface,
}: {
  groups: readonly ThreadActionsMenuGroup[];
  showSeparators: boolean;
  surface: ThreadActionsMenuSurface;
}) {
  return (
    <>
      {groups.map((group, index) => (
        <div key={group.id}>
          {index > 0 && showSeparators ? (
            <ThreadActionMenuSeparator surface={surface} />
          ) : null}
          {group.items.map((item) => (
            <ThreadActionMenuItem
              key={item.id}
              surface={surface}
              icon={item.icon}
              variant={item.variant}
              onSelect={() => {
                item.onSelect();
              }}
            >
              {item.label}
            </ThreadActionMenuItem>
          ))}
        </div>
      ))}
    </>
  );
}

function ThreadActionsMenuItems({
  thread,
  canDelete = true,
  onOpenInSplit,
  onRename,
  replaceGroups,
  caption,
  responsiveActions = [],
  surface,
}: ThreadActionsMenuItemsProps) {
  const { archive, requestDelete, setPinned, setRead } =
    useSidebarThreadActions();
  const isCompactViewport = useIsCompactViewport();
  const isDrawer = surface === "dropdown" && isCompactViewport;
  const showSeparators = !isDrawer;
  const isRead = !thread.isUnread;
  const isArchived = thread.isArchived;
  const isPinned = thread.isPinned;

  const captionNode =
    caption === undefined ? null : surface === "context" ? (
      <ContextMenuLabel>{caption}</ContextMenuLabel>
    ) : (
      <DropdownMenuLabel>{caption}</DropdownMenuLabel>
    );

  // A menu acting on a picked set of rows says nothing about this one thread's
  // read state or title, so it replaces the items outright rather than opening
  // with five bulk entries and then offering to rename the row underneath.
  if (replaceGroups !== undefined) {
    return (
      <>
        {captionNode}
        <ThreadActionMenuGroups
          groups={replaceGroups}
          showSeparators={showSeparators}
          surface={surface}
        />
      </>
    );
  }

  return (
    <>
      {captionNode}
      {responsiveActions.length > 0 ? (
        <>
          {responsiveActions.map((action) => (
            <ThreadActionMenuItem
              key={action.label}
              surface={surface}
              icon={action.icon}
              onSelect={() => {
                void action.onSelect();
              }}
            >
              {action.label}
            </ThreadActionMenuItem>
          ))}
          {showSeparators ? (
            <ThreadActionMenuSeparator surface={surface} />
          ) : null}
        </>
      ) : null}
      {onOpenInSplit ? (
        <>
          <ThreadActionMenuItem
            surface={surface}
            icon="Columns2"
            onSelect={() => {
              onOpenInSplit();
            }}
          >
            Open in split
          </ThreadActionMenuItem>
          {showSeparators ? (
            <ThreadActionMenuSeparator surface={surface} />
          ) : null}
        </>
      ) : null}
      {/* Quick status toggles. */}
      <ThreadActionMenuItem
        surface={surface}
        icon={isRead ? "Mail" : "MailOpen"}
        onSelect={() => {
          void setRead(thread.id, !isRead);
        }}
      >
        {isRead ? "Mark unread" : "Mark read"}
      </ThreadActionMenuItem>
      <ThreadActionMenuItem
        surface={surface}
        icon={isPinned ? "PinOff" : "Pin"}
        onSelect={() => {
          void setPinned(thread.id, !isPinned);
        }}
      >
        {isPinned ? "Unpin" : "Pin"}
      </ThreadActionMenuItem>
      {onRename === undefined ? null : (
        <ThreadActionMenuItem
          surface={surface}
          icon="Edit"
          onSelect={() => {
            // The menu is still closing, and the field it opens must not race
            // the focus handover back to the row it was opened from.
            window.setTimeout(() => {
              onRename();
            }, 0);
          }}
        >
          Rename
        </ThreadActionMenuItem>
      )}
      {showSeparators ? <ThreadActionMenuSeparator surface={surface} /> : null}
      {isArchived ? null : (
        <ThreadActionMenuItem
          surface={surface}
          icon="Archive"
          onSelect={() => {
            archive(thread.id);
          }}
        >
          Archive
        </ThreadActionMenuItem>
      )}
      {canDelete ? (
        <ThreadActionMenuItem
          surface={surface}
          icon="Trash2"
          variant="destructive"
          onSelect={() => {
            window.setTimeout(() => {
              requestDelete(thread.id);
            }, 0);
          }}
        >
          Delete
        </ThreadActionMenuItem>
      ) : null}
    </>
  );
}

/**
 * One-click archive button for hover-revealed row actions. It runs the same
 * lifecycle as the menu's Archive entry, so undo, navigation, and child cascade
 * behave identically.
 */
export function ThreadArchiveQuickAction({
  thread,
  className,
}: {
  thread: PluginSidebarThread;
  className?: string;
}) {
  const { archive } = useSidebarThreadActions();
  const label = "Archive";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("rounded-md p-0", className)}
          aria-label={`${label} thread`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            archive(thread.id);
          }}
        >
          <Icon name="Archive" className={COARSE_POINTER_ICON_SIZE_CLASS} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ThreadActionsMenu({
  thread,
  canDelete = true,
  onOpenInSplit,
  onRename,
  replaceGroups,
  caption,
  responsiveActions,
  onOpenChange,
  triggerClassName,
  align = "end",
  label = "Thread actions",
}: ThreadActionsMenuProps) {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "rounded-md p-0",
            triggerClassName,
            "data-[state=open]:bg-state-active data-[state=open]:text-foreground",
          )}
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <Icon
            name="MoreHorizontal"
            className={COARSE_POINTER_ICON_SIZE_CLASS}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} aria-label={label}>
        <ThreadActionsMenuItems
          thread={thread}
          canDelete={canDelete}
          onOpenInSplit={onOpenInSplit}
          onRename={onRename}
          replaceGroups={replaceGroups}
          caption={caption}
          responsiveActions={responsiveActions}
          surface="dropdown"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Row-level actions menu: a right-click context menu on wide viewports, and on
 * compact viewports a touch long-press (or right-click) that opens the same
 * items in the persistent responsive drawer. The compact path deliberately
 * avoids the modal Radix `ContextMenu` (aria-hidden on the app root, scroll
 * lock, document-wide pointer-events flip) on phones.
 */
export function ThreadActionsContextMenu(props: ThreadActionsContextMenuProps) {
  const isCompactViewport = useIsCompactViewport();
  if (isCompactViewport) {
    return <ThreadActionsCompactLongPressMenu {...props} />;
  }
  return <ThreadActionsDesktopContextMenu {...props} />;
}

function ThreadActionsCompactLongPressMenu({
  children,
  onOpenChange,
  label = "Thread actions",
  ...itemProps
}: ThreadActionsContextMenuProps) {
  return (
    <CompactLongPressMenu
      label={label}
      onOpenChange={onOpenChange}
      items={<ThreadActionsMenuItems {...itemProps} surface="dropdown" />}
    >
      {children}
    </CompactLongPressMenu>
  );
}

function ThreadActionsDesktopContextMenu({
  children,
  onOpenChange,
  label = "Thread actions",
  ...itemProps
}: ThreadActionsContextMenuProps) {
  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent aria-label={label}>
        <ThreadActionsMenuItems {...itemProps} surface="context" />
      </ContextMenuContent>
    </ContextMenu>
  );
}
