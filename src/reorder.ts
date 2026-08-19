/**
 * Turning a drop onto a project row into the neighbor pair
 * `bb.sdk.projects.reorder` expects.
 *
 * Derived on the server from BB's current order rather than from whatever the
 * client last rendered: the sidebar shows only projects that have threads, and
 * another window may have reordered things since. Projects the sidebar is not
 * showing keep their relative places because the neighbors come from the full
 * list.
 */

export interface ProjectMove {
  previousProjectId: string | null;
  nextProjectId: string | null;
}

/**
 * Places `projectId` immediately before `beforeProjectId`, or last when that is
 * null. Returns null when the move is a no-op or cannot apply — an unknown id,
 * or a drop onto the position the project already holds.
 */
export function resolveProjectMove({
  orderedProjectIds,
  projectId,
  beforeProjectId,
}: {
  /** BB's current order, standard projects only. */
  orderedProjectIds: readonly string[];
  projectId: string;
  beforeProjectId: string | null;
}): ProjectMove | null {
  if (projectId === beforeProjectId) return null;
  const currentIndex = orderedProjectIds.indexOf(projectId);
  if (currentIndex === -1) return null;

  const withoutMoved = orderedProjectIds.filter((id) => id !== projectId);
  const targetIndex =
    beforeProjectId === null
      ? withoutMoved.length
      : withoutMoved.indexOf(beforeProjectId);
  if (targetIndex === -1) return null;

  const previousProjectId = withoutMoved[targetIndex - 1] ?? null;
  const nextProjectId = withoutMoved[targetIndex] ?? null;
  // Already between those two neighbors: nothing to write.
  if (
    (orderedProjectIds[currentIndex - 1] ?? null) === previousProjectId &&
    (orderedProjectIds[currentIndex + 1] ?? null) === nextProjectId
  ) {
    return null;
  }
  return { previousProjectId, nextProjectId };
}
