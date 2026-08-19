/**
 * Keyboard reordering for manual mode.
 *
 * Drag and drop cannot be the only way to reorder a list, so the project menu
 * offers Move up / Move down. Both are expressed as the same "place this
 * project before that one" move the drop handler sends, so the server has one
 * code path.
 */

/**
 * The drop target that moves `projectId` one step in `direction`, or null when
 * it is already at that end. `orderedProjectIds` is BB's order with the
 * personal project excluded, since it has no place in that order.
 */
export function stepMoveTarget({
  orderedProjectIds,
  projectId,
  direction,
}: {
  orderedProjectIds: readonly string[];
  projectId: string;
  direction: "up" | "down";
}): { beforeProjectId: string | null } | null {
  const index = orderedProjectIds.indexOf(projectId);
  if (index === -1) return null;
  if (direction === "up") {
    if (index === 0) return null;
    return { beforeProjectId: orderedProjectIds[index - 1]! };
  }
  if (index === orderedProjectIds.length - 1) return null;
  // Past the next project: the one after it, or the end of the list.
  return { beforeProjectId: orderedProjectIds[index + 2] ?? null };
}
