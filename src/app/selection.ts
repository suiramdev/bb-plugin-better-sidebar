/**
 * Multi-row selection: which threads a range-click covers, and what a click
 * does to the set that is already there.
 *
 * Pure on purpose. A range depends entirely on the order the list is *drawn*
 * in — pinned before roots, children under their parent, collapsed projects
 * contributing nothing — and that is worth testing without a DOM.
 */
import type { ProjectGroup, ThreadNode } from "./grouping";

export interface Selection {
  /** Where the next shift-click measures from; null when nothing is picked. */
  anchorId: string | null;
  ids: ReadonlySet<string>;
}

export const EMPTY_SELECTION: Selection = {
  anchorId: null,
  ids: new Set<string>(),
};

function collect(nodes: readonly ThreadNode[], out: string[]): void {
  for (const node of nodes) {
    out.push(node.thread.id);
    collect(node.children, out);
  }
}

/**
 * The ids of the rows on screen, top to bottom.
 *
 * `isExpanded` is asked per project so a collapsed group drops out entirely:
 * a shift-click must not sweep up rows the user cannot see.
 */
export function orderedThreadIds(
  groups: readonly ProjectGroup[],
  isExpanded: (projectId: string) => boolean,
): string[] {
  const ids: string[] = [];
  for (const group of groups) {
    if (!isExpanded(group.projectId)) continue;
    collect(group.pinned, ids);
    collect(group.roots, ids);
  }
  return ids;
}

/** Every id between the two, inclusive, in list order. Empty if either is gone. */
export function rangeBetween(
  order: readonly string[],
  anchorId: string,
  targetId: string,
): string[] {
  const from = order.indexOf(anchorId);
  const to = order.indexOf(targetId);
  if (from === -1 || to === -1) return [];
  return order.slice(Math.min(from, to), Math.max(from, to) + 1);
}

/**
 * Shift-click. The anchor stays put, so dragging the range back and forth
 * grows and shrinks it instead of ratcheting outward.
 *
 * With no anchor — the first click of the session, or one after a clear — the
 * clicked row becomes the anchor and the only selection.
 */
export function extendSelection(
  current: Selection,
  order: readonly string[],
  targetId: string,
): Selection {
  const anchorId = current.anchorId;
  if (anchorId === null) return selectOnly(targetId);
  const range = rangeBetween(order, anchorId, targetId);
  if (range.length === 0) return selectOnly(targetId);
  return { anchorId, ids: new Set(range) };
}

/** Alt-click. Adds or removes one row, and re-anchors on the row touched. */
export function toggleSelection(
  current: Selection,
  targetId: string,
): Selection {
  const ids = new Set(current.ids);
  if (ids.has(targetId)) {
    ids.delete(targetId);
    // Deselecting the anchor leaves the range with nothing to measure from,
    // so the next shift-click starts over rather than reviving a dead row.
    return {
      anchorId: current.anchorId === targetId ? null : current.anchorId,
      ids,
    };
  }
  ids.add(targetId);
  return { anchorId: targetId, ids };
}

export function selectOnly(targetId: string): Selection {
  return { anchorId: targetId, ids: new Set([targetId]) };
}

/**
 * Drop anything that is no longer on screen — a thread archived out from
 * under the selection, or a project the user just collapsed.
 */
export function pruneSelection(
  current: Selection,
  order: readonly string[],
): Selection {
  const visible = new Set(order);
  const ids = new Set([...current.ids].filter((id) => visible.has(id)));
  if (ids.size === current.ids.size) return current;
  const anchorId =
    current.anchorId !== null && visible.has(current.anchorId)
      ? current.anchorId
      : null;
  return { anchorId, ids };
}
