import type { ReactNode } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { LIST_HOVER_TRANSITION } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import { threadSubtitle, threadTitle, type ThreadNode } from "./grouping";
import { PullRequestBadge } from "./PullRequestBadge";
import { RowContextMenu } from "./RowContextMenu";
import { useThreadSelection } from "./SelectionContext";
import { StatusGlyph } from "./StatusGlyph";

/** Indent per nesting level, matched to the 16px icon column above it. */
const INDENT_PX = 14;

/**
 * The row's own height floor, not just its padding.
 *
 * `py-1` around 12px text lands at 24px, which is the WCAG 2.5.8 minimum with
 * nothing to spare, and it ignores the host's coarse-pointer step entirely — on
 * a touch device every other BB row grows and these stayed thumbnail-sized.
 * The host publishes the exact heights its own rows use, so this borrows them
 * rather than inventing a third density.
 */
const ROW_HEIGHT =
  "min-h-[var(--bb-sidebar-row-height,1.5rem)] max-md:pointer-coarse:min-h-[var(--bb-sidebar-row-height-coarse,2.25rem)]";

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
 * One thread as a single line. `children` is the nested list of its child
 * threads, rendered inside this row's own `<li>` so the markup stays a valid
 * nested list.
 */
export function ThreadRow({
  node,
  depth,
  isActive,
  showBranch,
  showPullRequests,
  onNavigate,
  children,
}: {
  node: ThreadNode;
  depth: number;
  isActive: boolean;
  showBranch: boolean;
  showPullRequests: boolean;
  onNavigate: () => void;
  children?: ReactNode;
}) {
  const actions = useSidebarThreadActions();
  const selection = useThreadSelection();
  const isSelected = selection.isSelected(node.thread.id);
  const { splitProps, layout } = useSidebarThreadSplit(node.thread.id);
  const title = threadTitle(node.thread);
  const subtitle = showBranch ? threadSubtitle(node.thread) : null;

  return (
    <RowContextMenu thread={node.thread}>
      <li className="list-none">
        <div
          className={cn(
            "relative rounded-md",
            LIST_HOVER_TRANSITION,
            isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
            // A thread open in another pane reads as present but not focused.
            !isActive && layout !== null && "bg-sidebar-accent/30",
            // Picked rows carry an inset ring rather than a third background
            // tint: the active row already owns the strongest tint, and a
            // fourth shade of the same colour would be unreadable next to it.
            isSelected &&
              "bg-sidebar-accent/50 ring-1 ring-inset ring-timeline-accent/60",
            // A range-click on text otherwise paints a browser text selection
            // across half the list.
            selection.count > 0 && "select-none",
          )}
          style={{ marginLeft: depth * INDENT_PX }}
        >
          {/*
            The rail that makes the nesting readable. Each row draws its own
            segment through the 1px list gap below it, so a run of siblings
            reads as one continuous line without the indent moving into the
            markup, where the parent row's own hit box would have to grow to
            hold it.
          */}
          {depth > 0 ? (
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-px -left-[7px] top-0 w-px bg-border/70"
            />
          ) : null}
          {/*
            A full-bleed anchor under the content, the way BB's own row does it:
            a button nested inside an anchor is invalid interactive content and
            breaks keyboard behavior.
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
            // that must show focus — matched to the ring the sort and add
            // controls above the list already use.
            className="absolute inset-0 cursor-pointer rounded-md outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div
            className={cn(
              "pointer-events-none relative flex items-center gap-1.5 px-2 py-1",
              ROW_HEIGHT,
            )}
          >
            {/*
              The active row is not left to a background tint alone: a tint one
              step from the hover tint is the kind of difference you only see
              with both on screen at once.
            */}
            {isActive ? (
              <span
                aria-hidden
                className="absolute inset-y-1 -left-px w-0.5 rounded-full bg-timeline-accent"
              />
            ) : null}
            {node.stackPosition === null ? null : (
              // The stack's own order, not a count of anything: a plain
              // number reads as the position it is, the way a stacked PR
              // is referred to by where it sits in the stack.
              <span
                aria-hidden
                className="w-3 shrink-0 text-right text-2xs tabular-nums text-muted-foreground"
              >
                {node.stackPosition}
              </span>
            )}
            {node.thread.originKind === "fork" ? (
              <Icon
                name="Fork"
                className="size-3 shrink-0 text-muted-foreground"
              />
            ) : null}
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-xs",
                node.thread.isUnread || isActive
                  ? "font-medium text-foreground"
                  : "text-foreground",
                // An ancestor kept only to hold a search match is context, not
                // a result: it stays legible but recedes.
                node.isSearchAncestor && "font-normal text-muted-foreground",
              )}
            >
              {title}
            </span>
            {subtitle === null ? null : (
              <span className="max-w-[40%] shrink-0 truncate text-2xs text-muted-foreground">
                {subtitle}
              </span>
            )}
            {showPullRequests ? (
              <PullRequestBadge threadId={node.thread.id} />
            ) : null}
            <span className="flex size-3.5 shrink-0 items-center justify-center">
              <StatusGlyph
                indicator={node.thread.indicator}
                label={node.thread.indicatorLabel}
              />
            </span>
          </div>
        </div>
        {children}
      </li>
    </RowContextMenu>
  );
}
