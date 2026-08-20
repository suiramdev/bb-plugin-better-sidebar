import type { PluginSidebarThreadSplit } from "@get-bb/plugin-sdk/app";

/**
 * The split-membership state a row draws its trailing mini-map from, vendored
 * from `paneContentSplitIndicator.ts` in get-bb/bb.
 *
 * The host's version subscribes to the split-layout atom and walks the pane
 * tree itself. A plugin cannot reach that atom, but it does not need to: the
 * SDK hands each row the same layout already flattened to a pane list, with
 * "which pane is me" and "which pane is focused" resolved. So only the shape
 * conversion lives here — the drawing rules stay in `SplitPaneMiniMap`, which
 * is the host's file unchanged.
 */
export interface PaneRect {
 x: number;
 y: number;
 w: number;
 h: number;
}

export interface MiniMapSlot {
 paneId: string;
 rect: PaneRect;
 /** The pane represented by the sidebar item. */
 isMe: boolean;
 /** The focused pane (drawn in the accent token). */
 isFocused: boolean;
}

export interface PaneContentSplitIndicator {
 /** This content is open in a pane while the layout is split (>1 pane). */
 isOpenInSplit: boolean;
 /** Mini-map slots for the sidebar glyph, or null when there is nothing to show. */
 miniMap: MiniMapSlot[] | null;
}

const NO_INDICATOR: PaneContentSplitIndicator = {
 isOpenInSplit: false,
 miniMap: null,
};

/**
 * Turns one row's split layout into its indicator.
 *
 * A single-pane layout is not a split, and the host already withholds `layout`
 * for a thread that is not open at all, so both cases land on the same "nothing
 * to draw" answer rather than a mini-map of one full-bleed rectangle.
 */
export function getPaneContentSplitIndicator(
 layout: PluginSidebarThreadSplit["layout"],
): PaneContentSplitIndicator {
 if (layout === null || layout.panes.length < 2) {
  return NO_INDICATOR;
 }
 return {
  isOpenInSplit: true,
  miniMap: layout.panes.map((pane) => ({
   paneId: pane.paneId,
   rect: {
    x: pane.rect.x,
    y: pane.rect.y,
    w: pane.rect.width,
    h: pane.rect.height,
   },
   isMe: pane.isMe,
   isFocused: pane.isFocused,
  })),
 };
}
