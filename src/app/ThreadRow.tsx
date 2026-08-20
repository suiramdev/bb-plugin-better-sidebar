import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import {
  COARSE_POINTER_COMPACT_ROW_HEIGHT_CLASS,
  COARSE_POINTER_GLYPH_BOX_CLASS,
  COARSE_POINTER_ROW_ACTION_SIZE_CLASS,
} from "@/components/ui/coarse-pointer-sizing";
import { LIST_HOVER_TRANSITION } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import { threadSubtitle, threadTitle, type ThreadNode } from "./grouping";
import { PullRequestBadge } from "./PullRequestBadge";
import { RowContextMenu, ThreadActionsButton } from "./RowContextMenu";
import { useThreadSelection } from "./SelectionContext";
import {
  SIDEBAR_HOVER_ACTIONS_CLASS,
  SIDEBAR_HOVER_ACTIONS_FADE_CLASS,
  SIDEBAR_HOVER_ACTIONS_ROW_CLASS,
} from "./sidebarHoverActions";
import {
  SIDEBAR_ROW_BASE_CLASS,
  SIDEBAR_ROW_GLYPH_SLOT_CLASS,
  SIDEBAR_ROW_HEIGHT_CLASS,
  SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
  SIDEBAR_ROW_OPEN_IN_SPLIT_STATE_CLASS,
  SIDEBAR_ROW_SELECTED_STATE_CLASS,
  SIDEBAR_THREAD_GROUP_LINE_CLASS,
  getSidebarThreadGroupLineLeft,
  getSidebarThreadRowPaddingLeft,
} from "./sidebarRowClasses";
import { StatusGlyph } from "./StatusGlyph";

/** "2nd", "3rd" — for the screen-reader label, where "2" alone says nothing. */
const ORDINAL_SUFFIXES: Record<Intl.LDMLPluralRule, string> = {
  one: "st",
  two: "nd",
  few: "rd",
  other: "th",
  zero: "th",
  many: "th",
};
const ORDINAL_RULES = new Intl.PluralRules("en", { type: "ordinal" });

function ordinal(position: number): string {
  return `${position}${ORDINAL_SUFFIXES[ORDINAL_RULES.select(position)]}`;
}

/**
 * One thread as a single line, built to BB's own row contract.
 *
 * The geometry is the host's, not an approximation of it: depth is a 24px step
 * applied as `padding-left` on the row itself (so a nested row's hover fill and
 * focus ring still reach the sidebar's edge, where an indenting margin used to
 * cut them short), the row stands at the host's published row height, and the
 * hover/active/selected tints are the shared `sidebar-accent` and `state-active`
 * tokens rather than a private ladder of alpha steps.
 *
 * The nesting rail is gone from here on purpose. BB draws one hairline per
 * expanded project, running under the centre of its chevron, and `ThreadList`
 * now draws that — a per-row segment stitched through the list gap was this
 * plugin solving a problem the host solves once, one level up.
 *
 * `children` is the nested list of its child threads, rendered inside this
 * row's own `<li>` so the markup stays a valid nested list.
 */
export function ThreadRow({
  node,
  depth,
  isActive,
  showBranch,
  inWorktreeGroup = false,
  showPullRequests,
  onNavigate,
  children,
}: {
  node: ThreadNode;
  depth: number;
  isActive: boolean;
  showBranch: boolean;
  /** True when a worktree header above already names this row's branch. */
  inWorktreeGroup?: boolean;
  showPullRequests: boolean;
  onNavigate: () => void;
  children?: ReactNode;
}) {
  const actions = useSidebarThreadActions();
  const selection = useThreadSelection();
  const isSelected = selection.isSelected(node.thread.id);
  const { splitProps, layout } = useSidebarThreadSplit(node.thread.id);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const title = threadTitle(node.thread);
  const subtitle = showBranch
    ? threadSubtitle(node.thread, { omitBranch: inWorktreeGroup })
    : null;

  return (
    <RowContextMenu thread={node.thread} onRename={() => setIsRenaming(true)}>
      <li className="list-none">
        <div
          className={cn(
            SIDEBAR_HOVER_ACTIONS_ROW_CLASS,
            "group/thread-row relative",
            SIDEBAR_ROW_BASE_CLASS,
            SIDEBAR_ROW_HEIGHT_CLASS,
            LIST_HOVER_TRANSITION,
            isActive
              ? SIDEBAR_ROW_SELECTED_STATE_CLASS
              : SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
            // A thread open in another pane reads as present but not focused.
            // The host resolves this tint against the sidebar itself, so it
            // stays opaque instead of stacking with whatever is behind it.
            !isActive &&
              layout !== null &&
              SIDEBAR_ROW_OPEN_IN_SPLIT_STATE_CLASS,
            // An open menu holds the row lit, so the row you are acting on is
            // still obvious once the pointer has left it for the menu.
            !isActive && "has-[[data-state=open]]:bg-sidebar-accent",
            // Picked rows carry an inset ring rather than another background
            // tint: the active row already owns the strongest surface, and a
            // second shade of it would be unreadable alongside.
            isSelected && "ring-1 ring-inset ring-sidebar-ring/70",
            // A range-click on text otherwise paints a browser text selection
            // across half the list.
            selection.count > 0 && "select-none",
          )}
          style={{ paddingLeft: getSidebarThreadRowPaddingLeft(depth) }}
        >
          {/*
            A full-bleed anchor under the content, the way BB's own row does it:
            a button nested inside an anchor is invalid interactive content and
            breaks keyboard behavior. It is the only positioned sibling at this
            level, so it takes every click the content does not claim — content
            that must be clickable raises itself with `relative z-10`.
          */}
          <a
            // Both attributes, or BB's numbered thread shortcuts and
            // thread.next/thread.previous stop finding this row.
            data-sidebar-thread-shortcut-target=""
            data-sidebar-thread-id={node.thread.id}
            href="#"
            // The badge is decorative, so the position is spoken here instead:
            // a bare "2" before a title would read as part of it.
            aria-label={
              node.stackPosition === null
                ? title
                : `${title}, ${ordinal(node.stackPosition)} in stack`
            }
            aria-current={isActive ? "page" : undefined}
            {...splitProps}
            data-selected={isSelected ? "" : undefined}
            // Shift-clicking an anchor otherwise starts a text selection
            // before the click handler ever runs.
            onMouseDown={(event) => {
              if (event.shiftKey) event.preventDefault();
            }}
            onClick={(event) => {
              event.preventDefault();
              // Shift picks a range, Alt picks one row — neither navigates,
              // because the point of picking rows is to act on them together.
              // Meta/Ctrl stays with the split, which it already meant here.
              if (event.shiftKey) {
                selection.extend(node.thread.id);
                return;
              }
              if (event.altKey) {
                selection.toggle(node.thread.id);
                return;
              }
              selection.clear();
              actions.open(node.thread.id, {
                split: event.metaKey || event.ctrlKey,
              });
              onNavigate();
            }}
            // The anchor is the row's whole hit target, so it is also the thing
            // that must show focus — the host's sidebar ring, at the host's
            // width, so a focused plugin row and a focused BB row are one ring.
            className="absolute inset-0 rounded-md outline-none ring-sidebar-ring focus-visible:ring-2"
          />
          {/*
            No `bb-sidebar-hover-actions-inset` here. The host reserves an
            extra action width because its overlay holds two buttons and grows
            leftward past the slot the indicator rests in. This row's overlay
            is a single trigger that lands exactly on that slot, so reserving
            more would shove the title 24px on every hover for no reason.
          */}
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            {node.stackPosition === null ? null : (
              // The stack's own order, not a count of anything: a plain
              // number reads as the position it is, the way a stacked PR
              // is referred to by where it sits in the stack.
              <span
                aria-hidden
                className="w-3 shrink-0 text-right text-2xs tabular-nums text-subtle-foreground"
              >
                {node.stackPosition}
              </span>
            )}
            {node.thread.originKind === "fork" ? (
              <span className={cn(SIDEBAR_ROW_GLYPH_SLOT_CLASS, "size-3.5")}>
                <Icon name="Fork" className="size-3.5" aria-hidden />
              </span>
            ) : null}
            {isRenaming ? (
              <span className="relative z-10 min-w-0 flex-1 overflow-visible">
                <RenameInput
                  title={title}
                  onDone={() => setIsRenaming(false)}
                  onCommit={(next) => {
                    void actions.rename(node.thread.id, next);
                  }}
                />
              </span>
            ) : (
              <span
                className={cn(
                  "min-w-0 truncate",
                  // An ancestor kept only to hold a search match is context,
                  // not a result: it stays legible but recedes.
                  node.isSearchAncestor && "text-muted-foreground",
                )}
                title={title}
              >
                {title}
              </span>
            )}
            {subtitle === null || isRenaming ? null : (
              <span className="max-w-[40%] shrink-0 truncate text-2xs text-subtle-foreground">
                {subtitle}
              </span>
            )}
            {showPullRequests && !isRenaming ? (
              <PullRequestBadge threadId={node.thread.id} />
            ) : null}
          </span>
          <span className="flex shrink-0 items-center gap-0.5">
            <span
              className={cn(
                "flex shrink-0 items-center justify-end",
                COARSE_POINTER_COMPACT_ROW_HEIGHT_CLASS,
              )}
            >
              {/*
                One slot, two occupants. The status glyph rests in it and the
                actions trigger takes its place on hover or keyboard focus, so
                the row never changes width and the trigger never needs space
                of its own. Both are absolutely placed inside a slot sized to
                the host's row-action box.
              */}
              <span
                className={cn(
                  "relative shrink-0",
                  COARSE_POINTER_ROW_ACTION_SIZE_CLASS,
                )}
              >
                <span
                  data-sidebar-hover-actions-open={
                    isMenuOpen ? "true" : undefined
                  }
                  className={cn(
                    SIDEBAR_HOVER_ACTIONS_FADE_CLASS,
                    "absolute inset-0 flex items-center justify-center",
                  )}
                >
                  <span
                    data-sidebar-thread-trailing-indicator=""
                    className={cn(
                      SIDEBAR_ROW_GLYPH_SLOT_CLASS,
                      COARSE_POINTER_GLYPH_BOX_CLASS,
                    )}
                  >
                    <StatusGlyph
                      indicator={node.thread.indicator}
                      label={node.thread.indicatorLabel}
                    />
                  </span>
                </span>
                <span
                  data-sidebar-hover-actions-open={
                    isMenuOpen ? "true" : undefined
                  }
                  className={cn(
                    SIDEBAR_HOVER_ACTIONS_CLASS,
                    "absolute inset-y-0 right-0 z-10 flex items-center justify-end max-md:pointer-coarse:hidden",
                  )}
                >
                  <ThreadActionsButton
                    thread={node.thread}
                    onRename={() => setIsRenaming(true)}
                    onOpenChange={setIsMenuOpen}
                  />
                </span>
              </span>
            </span>
          </span>
        </div>
        {node.children.length === 0 ? (
          children
        ) : (
          // A parent thread owns the rail down its children, dropped from the
          // centre of its own glyph column. This is BB's `ThreadTreeGroupLine`:
          // one line per parent, rather than the segment-per-row rail this list
          // used to stitch through the gaps between sibling rows.
          <div className="relative">
            <span
              aria-hidden
              className={SIDEBAR_THREAD_GROUP_LINE_CLASS}
              style={{ left: getSidebarThreadGroupLineLeft(depth) }}
            />
            {children}
          </div>
        )}
      </li>
    </RowContextMenu>
  );
}

/**
 * The row's title, in place, while it is being renamed.
 *
 * It sits above the row's full-bleed anchor, commits on Enter or blur, and
 * abandons on Escape. An empty or unchanged name commits nothing: a rename that
 * clears the title is a mis-key, not an instruction.
 */
function RenameInput({
  title,
  onCommit,
  onDone,
}: {
  title: string;
  onCommit: (title: string) => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState(title);
  const input = useRef<HTMLInputElement | null>(null);
  // Closing the menu that opened this field hands focus back to the row it was
  // opened from. Taking focus before that handover is over just starts a fight
  // with it, so the field waits for the menu to finish leaving and only then
  // treats a blur as "done".
  const isSettled = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      isSettled.current = true;
      input.current?.focus();
      input.current?.select();
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const commit = () => {
    const next = value.trim();
    if (next.length > 0 && next !== title) onCommit(next);
    onDone();
  };

  return (
    <input
      ref={input}
      // The row is a link; typing in it must not navigate or start a drag.
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      aria-label={`Rename ${title}`}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (isSettled.current) commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onDone();
        }
      }}
      className={cn(
        "w-full min-w-0 rounded-sm bg-background px-1 py-0 text-sm",
        "text-foreground outline-none ring-1 ring-sidebar-ring",
      )}
    />
  );
}
