/**
 * The class vocabulary BB's own sidebar rows are built from, vendored so this
 * plugin's list is the same object rather than a lookalike.
 *
 * Source: `apps/app/src/components/sidebar/sidebarRowClasses.ts` in get-bb/bb.
 * Two deliberate divergences, both forced by the plugin boundary:
 *
 * - the host's `CONTEXT_SELECTION_SURFACE_CLASS` re-export is inlined to the
 *   `bg-state-active` it resolves to, since a plugin cannot import from the
 *   app's module graph;
 * - the row-height variables carry the host's own values as fallbacks
 *   (`1.75rem` / `2.5rem`), so a row is still row-sized if this ever renders
 *   somewhere the host has not published them.
 *
 * The `bb-*` names below are not compiled by this bundle: they are host CSS
 * (theme.css, `@layer components`) and resolve at runtime by name.
 */

export const SIDEBAR_ROW_BASE_CLASS =
  "flex w-full items-center gap-2 rounded-md pr-0 text-sm transition-colors";

/**
 * Leading-glyph slot shared by sidebar rows: centers the glyph and paints it in
 * the subtle foreground used for non-status row affordances. Call sites add the
 * glyph box sizing and any positioning they need.
 */
export const SIDEBAR_ROW_GLYPH_SLOT_CLASS =
  "inline-flex shrink-0 items-center justify-center text-subtle-foreground";

export const SIDEBAR_WORKING_STATUS_COLOR_CLASS = "text-muted-foreground/50";

export const SIDEBAR_SUCCESS_STATUS_DOT_CLASS =
  "size-[5px] rounded-full bg-muted-foreground/60 max-md:pointer-coarse:size-1.5";

/** Identity-glyph slot: the section / project icon box on a disclosure header. */
export const SIDEBAR_LEADING_GLYPH_SLOT_CLASS =
  "inline-flex w-4 shrink-0 items-center justify-center";

const SIDEBAR_THREAD_ROW_BASE_PADDING_PX = 8;
const SIDEBAR_THREAD_ROW_DEPTH_STEP_PX = 24;
const SIDEBAR_THREAD_ROW_GLYPH_CENTER_OFFSET_PX = 8;

export const SIDEBAR_STANDARD_ROW_PADDING_CLASS = "pl-2";

export function getSidebarThreadRowPaddingLeft(depth: number): number {
  return (
    SIDEBAR_THREAD_ROW_BASE_PADDING_PX +
    depth * SIDEBAR_THREAD_ROW_DEPTH_STEP_PX
  );
}

/**
 * Where a parent thread's nesting rail sits: the centre of its own leading
 * glyph column, so the line drops out of the row that owns it and runs past
 * its children.
 */
export function getSidebarThreadGroupLineLeft(depth: number): number {
  return (
    getSidebarThreadRowPaddingLeft(depth) +
    SIDEBAR_THREAD_ROW_GLYPH_CENTER_OFFSET_PX
  );
}

export const SIDEBAR_ROW_INTERACTIVE_STATE_CLASS =
  "cursor-pointer text-sidebar-foreground/85 dark:text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

/**
 * The host composes this from `CONTEXT_SELECTION_SURFACE_CLASS`
 * (`bg-state-active`) plus the sticky-row shim class. The shim only matters
 * inside a sticky tier stack, which this list does not build, but it is kept so
 * a row picked up by the host's own sticky CSS still paints opaquely.
 */
export const SIDEBAR_ROW_SELECTED_STATE_CLASS =
  "bg-state-active bb-sidebar-selected-row text-sidebar-foreground";

/**
 * A quieter marker for a thread that is open in an unfocused split pane.
 * theme.css resolves this tint against the sidebar.
 */
export const SIDEBAR_ROW_OPEN_IN_SPLIT_STATE_CLASS =
  "bb-sidebar-open-in-split-row";

export const SIDEBAR_MORE_ACTION_TRIGGER_CLASS =
  "relative m-1 h-5 w-5 after:absolute after:left-1/2 after:top-1/2 after:h-7 after:w-7 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] max-md:pointer-coarse:m-0 max-md:pointer-coarse:h-9 max-md:pointer-coarse:w-9 max-md:pointer-coarse:after:hidden";

/**
 * The hairline down a group of child rows, from the host's
 * `ThreadTreeGroupLine`. It spans the children block exactly (`top-0`,
 * `bottom-0`) and sits at `z-30`, above the rows' hover fills so it stays
 * unbroken as the pointer runs down them.
 *
 * Pair it with `getSidebarThreadGroupLineLeft(parentDepth)`, which puts it
 * under the centre of the parent row's glyph column.
 */
export const SIDEBAR_THREAD_GROUP_LINE_CLASS =
  "pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-border-hairline opacity-70";

/**
 * The host's `ThreadTreeLineContinuation`: the same hairline, carried *through*
 * a header row so an outer group's line is not broken by a nested group's
 * header. Sits under the rows (`z-[1]`) and overshoots the gap below it.
 */
export const SIDEBAR_THREAD_LINE_CONTINUATION_CLASS =
  "pointer-events-none absolute -bottom-0.5 top-0 z-[1] w-px bg-border-hairline opacity-70";

/**
 * The host's sidebar row height, expressed with its own values as fallbacks.
 * The host publishes `--bb-sidebar-row-height` on the document root; a fallback
 * only matters in a context that has not loaded the app theme.
 */
export const SIDEBAR_ROW_HEIGHT_CLASS =
  "h-[var(--bb-sidebar-row-height,1.75rem)] max-md:pointer-coarse:h-[var(--bb-sidebar-row-height-coarse,2.5rem)]";
