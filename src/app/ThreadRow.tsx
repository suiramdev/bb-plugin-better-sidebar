import { memo, useCallback, useState, type ReactNode } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  COARSE_POINTER_COMPACT_ROW_HEIGHT_CLASS,
  COARSE_POINTER_GLYPH_BOX_CLASS,
  COARSE_POINTER_ICON_SIZE_CLASS,
  COARSE_POINTER_ROW_ACTION_SIZE_CLASS,
  COARSE_POINTER_ROW_HEIGHT_CLASS,
} from "@/components/ui/coarse-pointer-sizing";
import { LIST_HOVER_TRANSITION } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import {
  SIDEBAR_HOVER_ACTIONS_CLASS,
  SIDEBAR_HOVER_ACTIONS_FADE_CLASS,
  SIDEBAR_HOVER_ACTIONS_INSET_CLASS,
  SIDEBAR_HOVER_ACTIONS_ROW_CLASS,
} from "./sidebarHoverActions";
import {
  SIDEBAR_MORE_ACTION_TRIGGER_CLASS,
  SIDEBAR_PAIRED_ACTION_LEADING_TARGET_CLASS,
  SIDEBAR_PAIRED_ACTION_TRAILING_TARGET_CLASS,
  SIDEBAR_ROW_BASE_CLASS,
  SIDEBAR_ROW_GLYPH_SLOT_CLASS,
  SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
  SIDEBAR_ROW_OPEN_IN_SPLIT_STATE_CLASS,
  SIDEBAR_ROW_SELECTED_STATE_CLASS,
  SIDEBAR_SUCCESS_STATUS_DOT_CLASS,
  SIDEBAR_WORKING_STATUS_COLOR_CLASS,
  getSidebarThreadRowPaddingLeft,
} from "./sidebarRowClasses";
import {
  ThreadActionsContextMenu,
  ThreadActionsMenu,
  ThreadArchiveQuickAction,
} from "./ThreadActionsMenu";
import { SidebarChildToggleChevron } from "./SidebarChildToggleChevron";
import { SplitPaneMiniMap } from "./SplitPaneMiniMap";
import { getPaneContentSplitIndicator } from "./paneContentSplitIndicator";
import { ThreadTreeGroupLine } from "./ThreadTreeLines";
import { useInlineThreadTitle } from "./InlineThreadTitle";
import {
  NO_COLLAPSED_CHILD_ACTIVITY,
  getThreadListIndicatorLabel,
  hasThreadListWorkingActivity,
  resolveThreadListIndicator,
  stateForThread,
  type CollapsedChildActivity,
  type ThreadListIndicatorState,
} from "./threadActivity";
import { threadSubtitle, threadTitle, type ThreadNode } from "./grouping";
import { PullRequestBadge } from "./PullRequestBadge";
import { useThreadSelection } from "./SelectionContext";
import { useSelectionMenu } from "./selectionMenu";
import { ordinal } from "./ordinal";

/**
 * BB's own sidebar thread row, vendored from
 * `apps/app/src/components/sidebar/ThreadRow.tsx` in get-bb/bb.
 *
 * The point of this file is that it is the host's row rather than a row that
 * resembles it: the same geometry (a 24px depth step applied as `padding-left`
 * on the row itself, so a nested row's hover fill still reaches the panel
 * edge), the same row heights, the same state tints, the same full-bleed anchor
 * under the content, and — the part a lookalike always drops — the same
 * trailing cluster, where one slot holds the status glyph at rest and hands it
 * to a *pair* of controls on hover: archive, then the actions menu.
 *
 * Everything the plugin boundary makes unreachable is named where it is
 * replaced, and nothing is approximated silently:
 *
 * - the host's `resolveThreadListIndicator` over raw thread state becomes the
 *   published `thread.indicator` for a leaf, and the vendored resolver over
 *   `threadActivity.ts` for a collapsed parent, which is the only place a
 *   rollup has to make the same choice the host would;
 * - `NavLink` to a route path becomes `actions.open`, since a plugin has no
 *   router. The anchor keeps `data-sidebar-thread-shortcut-target` and
 *   `data-sidebar-thread-id`, or BB's numbered thread shortcuts and
 *   `thread.next` / `thread.previous` stop finding these rows;
 * - the split mini-map keeps the host's component and drawing rules, fed from
 *   the SDK's already-flattened pane list;
 * - `SidebarStickyTier`, dnd bindings, plugin row status, and the shortcut pill
 *   are host-only surfaces with no SDK equivalent, so the row does not pretend
 *   to have them.
 *
 * The plugin's own additions ride on top and are marked as such: the stack
 * position badge, the pull-request badge, the branch subtitle, and multi-row
 * selection.
 */
const SIDEBAR_TITLE_DOUBLE_CLICK_MS = 400;

let lastSidebarTitleClick: { at: number; threadId: string } | null = null;

function consumeSidebarTitleDoubleClick(threadId: string): boolean {
  const now = Date.now();
  const previous = lastSidebarTitleClick;
  lastSidebarTitleClick = { at: now, threadId };
  return (
    previous !== null &&
    previous.threadId === threadId &&
    now - previous.at < SIDEBAR_TITLE_DOUBLE_CLICK_MS
  );
}

export function resetSidebarTitleDoubleClickForTest(): void {
  lastSidebarTitleClick = null;
}

interface ThreadRowBaseOptions {
  depth: number;
  isCompact: boolean;
}

export type ThreadRowOptions =
  | (ThreadRowBaseOptions & {
      kind: "default";
    })
  | (ThreadRowBaseOptions & {
      kind: "parent";
      isCollapsed: boolean;
      childCount: number;
      childActivity: CollapsedChildActivity;
      onToggleCollapsed: (threadId: string) => void;
    });

function ThreadDraftIndicator({
  hideIdleLabel = false,
  isWorking,
}: {
  hideIdleLabel?: boolean;
  isWorking: boolean;
}) {
  const label = getThreadListIndicatorLabel(
    isWorking ? "working-draft" : "draft",
  );
  return (
    <Icon
      name="Edit"
      className={cn(
        "pointer-events-none shrink-0",
        COARSE_POINTER_ICON_SIZE_CLASS,
        isWorking
          ? ["animate-shine-icon", SIDEBAR_WORKING_STATUS_COLOR_CLASS]
          : "text-muted-foreground",
      )}
      {...(!isWorking && hideIdleLabel
        ? { "aria-hidden": true }
        : { "aria-label": label ?? undefined })}
    />
  );
}

interface ThreadStatusGlyphProps extends ThreadListIndicatorState {
  hideIdleDraftLabel?: boolean;
}

export function ThreadStatusGlyph({
  hasPendingInteraction,
  hasUnsubmittedDraft,
  hasUnreadError,
  hasUnreadSuccess,
  hideIdleDraftLabel = false,
  isBackgroundAgentActive,
  isBackgroundCommandActive,
  isGoalActive,
  isPlanModeActive,
  isRuntimeActive,
  isWorkflowActive,
}: ThreadStatusGlyphProps) {
  const kind = resolveThreadListIndicator({
    hasPendingInteraction,
    hasUnsubmittedDraft,
    hasUnreadError,
    hasUnreadSuccess,
    isBackgroundAgentActive,
    isBackgroundCommandActive,
    isGoalActive,
    isPlanModeActive,
    isRuntimeActive,
    isWorkflowActive,
  });

  switch (kind) {
    case "unread-error":
      return (
        <Icon
          name="CircleX"
          className={cn("text-destructive", COARSE_POINTER_ICON_SIZE_CLASS)}
          aria-label={getThreadListIndicatorLabel(kind) ?? undefined}
        />
      );
    case "waiting-for-input":
      return (
        <Icon
          name="CircleQuestion"
          className={cn(
            "text-muted-foreground/75",
            COARSE_POINTER_ICON_SIZE_CLASS,
          )}
          aria-label={getThreadListIndicatorLabel(kind) ?? undefined}
        />
      );
    case "working-draft":
      return <ThreadDraftIndicator isWorking />;
    case "workflow":
      return (
        <Icon
          name="Workflow"
          className={cn(
            "animate-shine-icon",
            SIDEBAR_WORKING_STATUS_COLOR_CLASS,
            COARSE_POINTER_ICON_SIZE_CLASS,
          )}
          aria-label={getThreadListIndicatorLabel(kind) ?? undefined}
        />
      );
    case "background-agent":
      return (
        <Icon
          name="UserRoundPlus"
          className={cn(
            "animate-shine-icon",
            SIDEBAR_WORKING_STATUS_COLOR_CLASS,
            COARSE_POINTER_ICON_SIZE_CLASS,
          )}
          aria-label={getThreadListIndicatorLabel(kind) ?? undefined}
        />
      );
    case "background-command":
      return (
        <Icon
          name="Terminal"
          className={cn(
            "animate-shine-icon",
            SIDEBAR_WORKING_STATUS_COLOR_CLASS,
            COARSE_POINTER_ICON_SIZE_CLASS,
          )}
          aria-label={getThreadListIndicatorLabel(kind) ?? undefined}
        />
      );
    case "plan-mode":
      return (
        <Icon
          name="ListTodo"
          className={cn(
            "animate-shine-icon",
            SIDEBAR_WORKING_STATUS_COLOR_CLASS,
            COARSE_POINTER_ICON_SIZE_CLASS,
          )}
          aria-label={getThreadListIndicatorLabel(kind) ?? undefined}
        />
      );
    case "goal":
      return (
        <Icon
          name="Target"
          className={cn(
            "animate-shine-icon",
            SIDEBAR_WORKING_STATUS_COLOR_CLASS,
            COARSE_POINTER_ICON_SIZE_CLASS,
          )}
          aria-label={getThreadListIndicatorLabel(kind) ?? undefined}
        />
      );
    case "runtime":
      return (
        <Icon
          name="Loading"
          className={cn(
            "animate-spin",
            SIDEBAR_WORKING_STATUS_COLOR_CLASS,
            COARSE_POINTER_ICON_SIZE_CLASS,
          )}
          aria-label={getThreadListIndicatorLabel(kind) ?? undefined}
        />
      );
    case "draft":
      return (
        <ThreadDraftIndicator
          hideIdleLabel={hideIdleDraftLabel}
          isWorking={false}
        />
      );
    case "unread-success":
      return (
        <span
          className={SIDEBAR_SUCCESS_STATUS_DOT_CLASS}
          aria-label={getThreadListIndicatorLabel(kind) ?? undefined}
        />
      );
    case "none":
      return null;
  }
}

export function CollapsedThreadStatusGlyph({
  activity,
}: {
  activity: CollapsedChildActivity;
}) {
  return (
    <ThreadStatusGlyph
      hasPendingInteraction={activity.pending}
      hasUnsubmittedDraft={activity.hasUnsubmittedDraft}
      hasUnreadError={activity.unreadError}
      hasUnreadSuccess={activity.unread}
      isBackgroundAgentActive={activity.backgroundAgent}
      isBackgroundCommandActive={activity.backgroundCommand}
      isGoalActive={activity.goal}
      isPlanModeActive={activity.planMode}
      isRuntimeActive={activity.runtimeWorking}
      isWorkflowActive={activity.workflow}
    />
  );
}

function ThreadTrailingIndicator(props: ThreadStatusGlyphProps) {
  const indicatorKind = resolveThreadListIndicator(props);
  if (indicatorKind === "none") {
    return null;
  }

  return (
    <span
      data-sidebar-thread-trailing-indicator=""
      className={cn(
        SIDEBAR_ROW_GLYPH_SLOT_CLASS,
        COARSE_POINTER_GLYPH_BOX_CLASS,
      )}
    >
      <ThreadStatusGlyph {...props} />
    </span>
  );
}

interface ThreadRowProps {
  node: ThreadNode;
  isActive: boolean;
  options: ThreadRowOptions;
  onNavigate: () => void;
  /** The plugin's own additions, all optional and all off by default. */
  showBranch?: boolean;
  /** True when a worktree header above already names this row's branch. */
  inWorktreeGroup?: boolean;
  showPullRequests?: boolean;
  /** The nested list of this row's children, inside its own `<li>`. */
  children?: ReactNode;
}

function ThreadRowComponent({
  node,
  isActive,
  options,
  onNavigate,
  showBranch = false,
  inWorktreeGroup = false,
  showPullRequests = false,
  children,
}: ThreadRowProps) {
  const thread: PluginSidebarThread = node.thread;
  const actions = useSidebarThreadActions();
  const [isDropdownActionsOpen, setIsDropdownActionsOpen] = useState(false);
  const [isContextActionsOpen, setIsContextActionsOpen] = useState(false);
  const {
    splitProps,
    isAvailable: splitAvailable,
    layout,
  } = useSidebarThreadSplit(thread.id);
  const splitIndicator = getPaneContentSplitIndicator(layout);
  const selection = useThreadSelection();
  const isSelected = selection.isSelected(thread.id);

  const title = threadTitle(thread);
  const subtitle = showBranch
    ? threadSubtitle(thread, { omitBranch: inWorktreeGroup })
    : null;

  const handleRename = useCallback(
    (nextTitle: string) => {
      void actions.rename(thread.id, nextTitle);
    },
    [actions, thread.id],
  );
  const { editor, isEditing, startEditing } = useInlineThreadTitle({
    onCommit: handleRename,
    resetKey: thread.id,
    title,
  });
  const startTitleEditing = useCallback(
    (event: { preventDefault: () => void; stopPropagation: () => void }) => {
      event.preventDefault();
      event.stopPropagation();
      startEditing();
    },
    [startEditing],
  );

  const openInSplit = useCallback(() => {
    actions.open(thread.id, { split: true });
    onNavigate();
  }, [actions, onNavigate, thread.id]);

  const parentOptions = options.kind === "parent" ? options : null;
  const isParentRow = parentOptions !== null;
  const isParentCollapsed = parentOptions?.isCollapsed ?? false;
  const childCount = parentOptions?.childCount ?? 0;
  const childActivity =
    parentOptions?.childActivity ?? NO_COLLAPSED_CHILD_ACTIVITY;
  const hasChildren = childCount > 0;
  // A collapsed parent hides its descendants behind one glyph, so it must
  // surface its own status combined with the rolled-up child activity. Expanded
  // parents and leaves show only their own status.
  const hasHiddenChildren = isParentRow && isParentCollapsed && hasChildren;
  const ownState = stateForThread(thread);
  const trailingIndicatorState: ThreadListIndicatorState = hasHiddenChildren
    ? {
        hasPendingInteraction:
          ownState.hasPendingInteraction || childActivity.pending,
        hasUnsubmittedDraft:
          ownState.hasUnsubmittedDraft || childActivity.hasUnsubmittedDraft,
        hasUnreadError: ownState.hasUnreadError || childActivity.unreadError,
        hasUnreadSuccess: ownState.hasUnreadSuccess || childActivity.unread,
        isBackgroundAgentActive:
          ownState.isBackgroundAgentActive || childActivity.backgroundAgent,
        isBackgroundCommandActive:
          ownState.isBackgroundCommandActive || childActivity.backgroundCommand,
        isGoalActive: ownState.isGoalActive || childActivity.goal,
        isPlanModeActive: ownState.isPlanModeActive || childActivity.planMode,
        isRuntimeActive:
          ownState.isRuntimeActive || childActivity.runtimeWorking,
        isWorkflowActive: ownState.isWorkflowActive || childActivity.workflow,
      }
    : ownState;
  const trailingIndicatorKind = resolveThreadListIndicator(
    trailingIndicatorState,
  );
  const splitIndicatorIsWorking = hasThreadListWorkingActivity(
    trailingIndicatorState,
  );
  const indicatorLabel = getThreadListIndicatorLabel(trailingIndicatorKind);
  const splitIndicatorLabel = indicatorLabel
    ? `${title} — open in split; ${indicatorLabel}`
    : `${title} — open in split`;

  // The selection is the plugin's, so the menus it feeds are too: with rows
  // picked, both surfaces act on the set instead of on the row underneath.
  const selectionMenu = useSelectionMenu(thread);

  const isActionsOpen = isDropdownActionsOpen || isContextActionsOpen;
  const rowClassName = cn(
    SIDEBAR_HOVER_ACTIONS_ROW_CLASS,
    "group/thread-row relative",
    SIDEBAR_ROW_BASE_CLASS,
    LIST_HOVER_TRANSITION,
    options.isCompact
      ? COARSE_POINTER_COMPACT_ROW_HEIGHT_CLASS
      : COARSE_POINTER_ROW_HEIGHT_CLASS,
    isActive
      ? SIDEBAR_ROW_SELECTED_STATE_CLASS
      : SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
    // Subtle open-in-split tint, weaker than the active-row treatment. The
    // focused pane's thread is already the active row, so this only marks the
    // other open panes; hover still wins over it.
    !isActive &&
      splitIndicator.isOpenInSplit &&
      SIDEBAR_ROW_OPEN_IN_SPLIT_STATE_CLASS,
    !isActive && "has-[[data-state=open]]:bg-sidebar-accent",
    // Picked rows carry an inset ring rather than another background tint: the
    // active row already owns the strongest surface, and a second shade of it
    // would be unreadable alongside.
    isSelected && "ring-1 ring-inset ring-sidebar-ring/70",
    // A range-click on text otherwise paints a browser text selection across
    // half the list.
    selection.count > 0 && "select-none",
  );

  const row = (
    <div
      className={rowClassName}
      style={{ paddingLeft: getSidebarThreadRowPaddingLeft(options.depth) }}
    >
      {/*
        A full-bleed anchor under the content, the way BB's own row does it: a
        button nested inside an anchor is invalid interactive content and breaks
        keyboard behavior. It is the only positioned sibling at this level, so
        it takes every click the content does not claim — content that must be
        clickable raises itself with `relative z-10`.
      */}
      <a
        // Both attributes, or BB's numbered thread shortcuts and
        // thread.next/thread.previous stop finding this row.
        data-sidebar-thread-shortcut-target=""
        data-sidebar-thread-id={thread.id}
        href="#"
        // The badge is decorative, so the position is spoken here instead: a
        // bare "2" before a title would read as part of it.
        aria-label={
          node.stackPosition === null
            ? title
            : `${title}, ${ordinal(node.stackPosition)} in stack`
        }
        aria-current={isActive ? "page" : undefined}
        {...splitProps}
        data-selected={isSelected ? "" : undefined}
        // Shift-clicking an anchor otherwise starts a text selection before the
        // click handler ever runs.
        onMouseDown={(event) => {
          if (event.shiftKey) event.preventDefault();
        }}
        onClick={(event) => {
          event.preventDefault();
          if (isEditing) {
            event.stopPropagation();
            return;
          }
          // Shift picks a range, Alt picks one row — neither navigates, because
          // the point of picking rows is to act on them together. Meta/Ctrl
          // stays with the split, which it already meant here.
          if (event.shiftKey) {
            selection.extend(thread.id);
            return;
          }
          if (event.altKey) {
            selection.toggle(thread.id);
            return;
          }
          if (splitAvailable && (event.metaKey || event.ctrlKey)) {
            openInSplit();
            return;
          }
          // A first click may navigate and remount this row. Remember that
          // click so the second click of a double-click can still open the
          // editor after the remount.
          if (consumeSidebarTitleDoubleClick(thread.id)) {
            event.stopPropagation();
            startEditing();
            return;
          }
          selection.clear();
          actions.open(thread.id);
          onNavigate();
        }}
        onDoubleClick={isEditing ? undefined : startTitleEditing}
        // The anchor is the row's whole hit target, so it is also the thing
        // that must show focus — the host's sidebar ring, at the host's width,
        // so a focused plugin row and a focused BB row are one ring.
        className="absolute inset-0 rounded-md outline-none ring-sidebar-ring focus-visible:ring-2"
      />
      <span
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5",
          // The hover actions overlay grows leftward past the trailing slot;
          // this reserves room so the title never runs under the extra button.
          SIDEBAR_HOVER_ACTIONS_INSET_CLASS,
        )}
      >
        {node.stackPosition === null ? null : (
          // The stack's own order, not a count of anything: a plain number
          // reads as the position it is, the way a stacked PR is referred to by
          // where it sits in the stack.
          <span
            aria-hidden
            className="w-3 shrink-0 text-right text-2xs tabular-nums text-subtle-foreground"
          >
            {node.stackPosition}
          </span>
        )}
        {thread.originKind === "fork" ? (
          <span className={cn(SIDEBAR_ROW_GLYPH_SLOT_CLASS, "size-3.5")}>
            <Icon name="Fork" className="size-3.5" aria-hidden />
          </span>
        ) : null}
        {isEditing ? (
          <span className="relative z-10 min-w-0 flex-1 overflow-visible">
            {editor}
          </span>
        ) : (
          <span
            className={cn(
              "min-w-0 truncate",
              // An ancestor kept only to hold a search match is context, not a
              // result: it stays legible but recedes.
              node.isSearchAncestor && "text-muted-foreground",
            )}
            title={title}
            onDoubleClick={startTitleEditing}
          >
            {title}
          </span>
        )}
        {subtitle === null || isEditing ? null : (
          <span className="max-w-[40%] shrink-0 truncate text-2xs text-subtle-foreground">
            {subtitle}
          </span>
        )}
        {showPullRequests && !isEditing ? (
          <PullRequestBadge threadId={thread.id} />
        ) : null}
        {parentOptions && hasChildren ? (
          <SidebarChildToggleChevron
            isCollapsed={isParentCollapsed}
            expandLabel={`Expand ${title} threads`}
            collapseLabel={`Collapse ${title} threads`}
            onToggle={() => parentOptions.onToggleCollapsed(thread.id)}
            revealOnHover
          />
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        <span
          className={cn(
            "flex shrink-0 items-center justify-end max-md:pointer-coarse:pointer-events-none",
            COARSE_POINTER_COMPACT_ROW_HEIGHT_CLASS,
          )}
        >
          {/*
            One slot, two occupants. The status glyph rests in it and the
            actions take its place on hover or keyboard focus, so the row never
            changes width and the controls never need space of their own.
          */}
          <span
            className={cn(
              "relative shrink-0",
              COARSE_POINTER_ROW_ACTION_SIZE_CLASS,
            )}
          >
            <span
              data-sidebar-hover-actions-open={
                isActionsOpen ? "true" : undefined
              }
              className={cn(
                SIDEBAR_HOVER_ACTIONS_FADE_CLASS,
                "absolute inset-0 flex items-center justify-center",
              )}
            >
              {splitIndicator.miniMap ? (
                <span
                  data-sidebar-thread-trailing-indicator=""
                  className={cn(
                    SIDEBAR_ROW_GLYPH_SLOT_CLASS,
                    COARSE_POINTER_GLYPH_BOX_CLASS,
                  )}
                >
                  <SplitPaneMiniMap
                    slots={splitIndicator.miniMap}
                    label={splitIndicatorLabel}
                    isWorking={splitIndicatorIsWorking}
                  />
                </span>
              ) : (
                <ThreadTrailingIndicator
                  {...trailingIndicatorState}
                  hideIdleDraftLabel={
                    !hasHiddenChildren && trailingIndicatorKind === "draft"
                  }
                />
              )}
            </span>
            <div
              data-sidebar-hover-actions-open={
                isActionsOpen ? "true" : undefined
              }
              className={cn(
                SIDEBAR_HOVER_ACTIONS_CLASS,
                // Anchored to the right edge only, so a second action can sit
                // left of the menu without widening the rest slot.
                "absolute inset-y-0 right-0 z-10 flex items-center justify-end max-md:pointer-coarse:hidden",
              )}
            >
              <ThreadArchiveQuickAction
                thread={thread}
                className={cn(
                  "text-subtle-foreground hover:bg-transparent hover:text-foreground",
                  SIDEBAR_MORE_ACTION_TRIGGER_CLASS,
                  // Tighter than two full margins: a half step between the two
                  // glyphs reads as one control group.
                  "-mr-0.5",
                  SIDEBAR_PAIRED_ACTION_LEADING_TARGET_CLASS,
                )}
              />
              <ThreadActionsMenu
                thread={thread}
                triggerClassName={cn(
                  "text-subtle-foreground hover:bg-transparent hover:text-foreground",
                  SIDEBAR_MORE_ACTION_TRIGGER_CLASS,
                  SIDEBAR_PAIRED_ACTION_TRAILING_TARGET_CLASS,
                )}
                onOpenInSplit={splitAvailable ? openInSplit : undefined}
                onRename={() => startEditing()}
                onOpenChange={setIsDropdownActionsOpen}
                label={selectionMenu.label}
                caption={selectionMenu.caption}
                replaceGroups={selectionMenu.groups}
              />
            </div>
          </span>
        </span>
      </span>
    </div>
  );

  return (
    <ThreadActionsContextMenu
      thread={thread}
      onOpenInSplit={splitAvailable ? openInSplit : undefined}
      onRename={() => startEditing()}
      onOpenChange={(open) => {
        setIsContextActionsOpen(open);
        if (open && !selection.isSelected(thread.id)) selection.clear();
      }}
      label={selectionMenu.label}
      caption={selectionMenu.caption}
      replaceGroups={selectionMenu.groups}
    >
      {/* `space-y-0.5`: the host's own step between a row and the block of
        children it opens. */}
      <li className="list-none space-y-0.5">
        {row}
        {node.children.length === 0 ? (
          children
        ) : (
          // A parent thread owns the rail down its children, dropped from the
          // centre of its own glyph column — BB's `ThreadTreeGroupLine`.
          <div className="relative">
            <ThreadTreeGroupLine parentRowDepth={options.depth} />
            {children}
          </div>
        )}
      </li>
    </ThreadActionsContextMenu>
  );
}

export const ThreadRow = memo(ThreadRowComponent);
