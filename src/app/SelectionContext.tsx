/**
 * The selection every row reads and writes.
 *
 * A context rather than props: the rows are drawn by a recursive `Branch`, and
 * threading four callbacks through every level of nesting would put selection
 * plumbing in a component that has nothing to do with it.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import {
  EMPTY_SELECTION,
  extendSelection,
  pruneSelection,
  selectOnly,
  toggleSelection,
} from "./selection";

interface SelectionApi {
  /** How many rows are picked. 0 or 1 means the list behaves as it always did. */
  count: number;
  isSelected: (threadId: string) => boolean;
  /** The picked threads, in the order they are drawn. */
  selectedThreads: () => PluginSidebarThread[];
  /** Shift-click: everything from the anchor to here. */
  extend: (threadId: string) => void;
  /** Alt-click: add or remove this one row. */
  toggle: (threadId: string) => void;
  /** Plain click: back to no selection at all. */
  clear: () => void;
  /** Right-click outside the selection: this row alone becomes it. */
  selectOne: (threadId: string) => void;
}

const NOOP: SelectionApi = {
  count: 0,
  isSelected: () => false,
  selectedThreads: () => [],
  extend: () => {},
  toggle: () => {},
  clear: () => {},
  selectOne: () => {},
};

const SelectionContext = createContext<SelectionApi>(NOOP);

export function useThreadSelection(): SelectionApi {
  return useContext(SelectionContext);
}

export function ThreadSelectionProvider({
  /** The ids on screen, top to bottom — what a range is measured against. */
  order,
  threads,
  children,
}: {
  order: readonly string[];
  threads: readonly PluginSidebarThread[];
  children: ReactNode;
}) {
  const [selection, setSelection] = useState(EMPTY_SELECTION);

  // A selection may not outlive what it points at: archiving a picked thread,
  // collapsing its project, or typing a search all shrink the list under it.
  useEffect(() => {
    setSelection((current) => pruneSelection(current, order));
  }, [order]);

  // Escape is the way out of a selection everywhere else; the rows themselves
  // are anchors, so there is no single focused element to hang it off.
  useEffect(() => {
    if (selection.ids.size === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelection(EMPTY_SELECTION);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection.ids.size]);

  const api = useMemo<SelectionApi>(() => {
    const byId = new Map(threads.map((thread) => [thread.id, thread]));
    return {
      count: selection.ids.size,
      isSelected: (threadId) => selection.ids.has(threadId),
      selectedThreads: () =>
        order
          .filter((id) => selection.ids.has(id))
          .map((id) => byId.get(id))
          .filter(
            (thread): thread is PluginSidebarThread => thread !== undefined,
          ),
      extend: (threadId) =>
        setSelection((current) => extendSelection(current, order, threadId)),
      toggle: (threadId) =>
        setSelection((current) => toggleSelection(current, threadId)),
      clear: () => setSelection(EMPTY_SELECTION),
      selectOne: (threadId) => setSelection(selectOnly(threadId)),
    };
  }, [selection, order, threads]);

  return (
    <SelectionContext.Provider value={api}>
      {children}
    </SelectionContext.Provider>
  );
}
