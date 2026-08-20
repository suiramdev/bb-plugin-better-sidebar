import { getSidebarThreadGroupLineLeft } from "./sidebarRowClasses";

/**
 * BB's nesting rails, vendored from the two components `ProjectRow` declares
 * for them (`ThreadTreeGroupLine` and `ThreadTreeLineContinuation`).
 *
 * They used to live here as two class constants bolted onto the plugin's copy
 * of `sidebarRowClasses`, which is not where the host keeps them: upstream they
 * are components with their classes written inline, and the offset comes from
 * `getSidebarThreadGroupLineLeft` — the one thing that is shared. Keeping the
 * same split means a change to either rail lands in one obvious place here too.
 */
interface ThreadTreeGroupLineProps {
 parentRowDepth: number;
}

/** One hairline down the children of an expanded parent row. */
export function ThreadTreeGroupLine({
 parentRowDepth,
}: ThreadTreeGroupLineProps) {
 return (
  <span
   className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-border-hairline opacity-70"
   style={{ left: getSidebarThreadGroupLineLeft(parentRowDepth) }}
   aria-hidden="true"
  />
 );
}

interface ThreadTreeLineContinuationProps {
 parentRowDepth: number;
}

/**
 * The same hairline carried through a row that sits inside a parent's rail but
 * is not itself the parent — a worktree header, upstream a section header.
 */
export function ThreadTreeLineContinuation({
 parentRowDepth,
}: ThreadTreeLineContinuationProps) {
 return (
  <span
   className="pointer-events-none absolute -bottom-0.5 top-0 z-[1] w-px bg-border-hairline opacity-70"
   style={{ left: getSidebarThreadGroupLineLeft(parentRowDepth) }}
   aria-hidden="true"
  />
 );
}
