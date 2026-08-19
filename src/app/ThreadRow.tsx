import type { ReactNode } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { threadSubtitle, threadTitle, type ThreadNode } from "./grouping";
import { PullRequestBadge } from "./PullRequestBadge";
import { RowContextMenu } from "./RowContextMenu";
import { StatusGlyph } from "./StatusGlyph";

/** Indent per nesting level, matched to the 16px icon column above it. */
const INDENT_PX = 14;

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
  const { splitProps, layout } = useSidebarThreadSplit(node.thread.id);
  const title = threadTitle(node.thread);
  const subtitle = showBranch ? threadSubtitle(node.thread) : null;

  return (
    <RowContextMenu thread={node.thread}>
      <li className="list-none">
        <div
          className={cn(
            "relative rounded-md transition-colors",
            isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
            // A thread open in another pane reads as present but not focused.
            !isActive && layout !== null && "bg-sidebar-accent/30",
          )}
          style={{ marginLeft: depth * INDENT_PX }}
        >
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
            onClick={(event) => {
              event.preventDefault();
              actions.open(node.thread.id, {
                split: event.metaKey || event.ctrlKey,
              });
              onNavigate();
            }}
            className="absolute inset-0 cursor-pointer rounded-md"
          />
          <div className="pointer-events-none relative flex items-center gap-1.5 px-2 py-1">
            {node.stackPosition !== null ? (
              // The stack's own order, not a count of anything: a plain
              // number reads as the position it is, the way a stacked PR
              // is referred to by where it sits in the stack.
              <span
                aria-hidden
                className="w-3 shrink-0 text-right text-2xs tabular-nums text-muted-foreground/70"
              >
                {node.stackPosition}
              </span>
            ) : null}
            {node.thread.originKind === "fork" ? (
              <Icon name="Fork" className="size-3 shrink-0 text-muted-foreground/60" />
            ) : null}
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-xs",
                node.thread.isUnread ? "font-medium text-foreground" : "text-foreground/85",
                // An ancestor kept only to hold a search match is context, not
                // a result: it stays legible but recedes.
                node.isSearchAncestor && "text-muted-foreground",
              )}
            >
              {title}
            </span>
            {subtitle !== null ? (
              <span className="max-w-[40%] shrink-0 truncate text-2xs text-muted-foreground/80">
                {subtitle}
              </span>
            ) : null}
            {showPullRequests ? <PullRequestBadge threadId={node.thread.id} /> : null}
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
