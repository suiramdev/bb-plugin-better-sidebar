import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import type { ThreadActionsMenuGroup } from "./ThreadActionsMenu";
import { useThreadSelection } from "./SelectionContext";

export interface SelectionMenu {
  /** Accessible name for whichever surface shows these actions. */
  label: string;
  /** Only a bulk menu captions itself; a single-thread menu has no use for one. */
  caption?: string;
  /**
   * The entries that replace the host's own, or undefined to leave BB's menu
   * exactly as it is — which is the case for every row until something is
   * picked.
   */
  groups?: readonly ThreadActionsMenuGroup[];
}

/**
 * The actions for a picked set of rows, layered on top of the host's menu.
 *
 * This is the plugin's, not BB's: the host's sidebar has no multi-row
 * selection, so there is nothing upstream to copy here. It plugs into the
 * vendored menu through the one seam that file exposes, so the bulk items are
 * rendered by the same `ThreadActionMenuItem` on the same two surfaces and can
 * never drift into a second menu style.
 *
 * Right-clicking inside a selection acts on all of it; anywhere else the
 * selection is dropped by the row, so a menu can never act on rows the user has
 * stopped looking at.
 */
export function useSelectionMenu(thread: PluginSidebarThread): SelectionMenu {
  const actions = useSidebarThreadActions();
  const selection = useThreadSelection();
  const selected = selection.selectedThreads();
  const isBulk = selected.length > 1 && selection.isSelected(thread.id);

  if (!isBulk) {
    return { label: "Thread actions" };
  }

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
    label: "Actions for selected threads",
    caption: `${count} threads selected`,
    groups: [
      {
        id: "status",
        items: [
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
      },
      {
        id: "archive",
        items: [
          {
            id: "archive",
            label: `Archive ${count} threads`,
            icon: "Archive",
            onSelect: () => each((entry) => actions.archive(entry.id)),
          },
        ],
      },
      {
        id: "selection",
        items: [
          {
            id: "clear",
            label: "Clear selection",
            icon: "X",
            onSelect: selection.clear,
          },
        ],
      },
    ],
  };
}
