import { useCallback, useMemo, useState } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreads as useSidebarThreads,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LIST_HOVER_TRANSITION } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { buildGroups, type ProjectGroup, type ThreadNode } from "./grouping";
import { DeleteProjectDialog } from "./DeleteProjectDialog";
import { IconEditor } from "./IconEditor";
import {
  buildProjectMenu,
  ProjectActionsButton,
  ProjectContextMenu,
} from "./ProjectMenu";
import { ProjectIcon } from "./ProjectIcon";
import { SidebarChildToggleChevron } from "./SidebarChildToggleChevron";
import { SortMenu } from "./SortMenu";
import { AddProjectButton } from "./AddProjectButton";
import { ThreadRow } from "./ThreadRow";
import { WorktreeRow } from "./WorktreeRow";
import { groupWorktrees } from "./worktrees";
import { ordinal } from "./ordinal";
import { stepMoveTarget } from "./manual-move";
import { useSidebarData, useStackBranches } from "./useSidebarData";
import { applyStacks, environmentIdsFor } from "./stacking";
import { orderedThreadIds } from "./selection";
import { ThreadSelectionProvider } from "./SelectionContext";
import {
  CHROME_SECTION_LABEL_CLASS,
  SIDEBAR_HOVER_ACTIONS_CLASS,
  SIDEBAR_HOVER_ACTIONS_GAP_CLASS,
  SIDEBAR_HOVER_ACTIONS_ROW_CLASS,
} from "./sidebarHoverActions";
import {
  SIDEBAR_LEADING_GLYPH_SLOT_CLASS,
  SIDEBAR_STANDARD_ROW_PADDING_CLASS,
} from "./sidebarRowClasses";

const COLLAPSED_STORAGE_KEY = "better-sidebar.collapsed-projects";
const COLLAPSED_WORKTREES_KEY = "better-sidebar.collapsed-worktrees";

/**
 * Everything the rows need to know about worktree grouping, as one value.
 *
 * `Branch` recurses, so each prop added to it is a prop written twice per
 * level; bundling the concern keeps that recursion readable.
 */
interface WorktreeView {
  enabled: boolean;
  isCollapsed: (environmentId: string) => boolean;
  toggle: (environmentId: string) => void;
}

/**
 * BB's own first-level group header, reproduced from `TopLevelSidebarSection`
 * and the label tier of `SidebarStickyTier` it renders into.
 *
 * The parts that matter, and why each is here rather than something simpler:
 * `bg-sidebar` keeps a header opaque so rows scrolling under a pinned one never
 * show through; the ring pair is the host's focus treatment; the `[&>svg]`
 * rules give any glyph dropped in the row a uniform box; and
 * `CHROME_SECTION_LABEL_CLASS` is what makes a project name read as chrome —
 * 12px, normal weight, subtle foreground diluted once more — instead of the
 * 10px bold uppercase this list used to shout it in, which matched nothing else
 * in the sidebar.
 */
const SECTION_HEADER_CLASS = cn(
  SIDEBAR_HOVER_ACTIONS_ROW_CLASS,
  "relative flex min-h-6 w-full shrink-0 items-center rounded-md bg-sidebar",
  "outline-none ring-sidebar-ring focus-visible:ring-2",
  "[&>svg]:size-4 [&>svg]:shrink-0",
  CHROME_SECTION_LABEL_CLASS,
  SIDEBAR_STANDARD_ROW_PADDING_CLASS,
  "pr-0 transition-colors",
);

/** The label + caret cluster that owns the left half of a group header. */
const SECTION_HEADER_LABEL_CLASS =
  "relative z-10 flex min-w-0 flex-1 items-center gap-1 text-left";

/**
 * Collapse state, per concern.
 *
 * Projects and worktrees are collapsed independently and live under separate
 * keys: a worktree id is only meaningful inside its project, and folding the
 * two into one set would let a stale environment id from a deleted worktree sit
 * in the projects' storage forever.
 */
function readCollapsed(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return new Set(
      Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function writeCollapsed(storageKey: string, collapsed: Set<string>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...collapsed]));
  } catch {
    // Private mode or a full quota: collapse state is a nicety, not state we
    // are willing to fail a render over.
  }
}

/** One collapsible set, persisted under its own key. */
function useCollapsed(storageKey: string): [Set<string>, (id: string) => void] {
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    readCollapsed(storageKey),
  );
  const toggle = useCallback(
    (id: string) => {
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        writeCollapsed(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );
  return [collapsed, toggle];
}

/**
 * The sidebar's scrolling list, grouped by project.
 *
 * The host keeps the New-thread button, the search field, the plugin nav rows,
 * and the footer — so this ships none of them and filters by the `searchQuery`
 * prop instead of adding a second search box.
 */
export function ThreadList({
  activeThreadId,
  activeProjectId,
  onNavigate,
  searchQuery,
}: PluginThreadListProps) {
  const { status, threads, projects } = useSidebarThreads();
  const projectIds = useMemo(
    () => projects.map((project) => project.id),
    [projects],
  );
  const {
    features,
    preferences,
    projects: projectOrder,
    icons,
    refresh,
    setProjectSort,
    moveProject,
    addProject,
    deleteProject,
  } = useSidebarData(projectIds);
  const [collapsed, toggle] = useCollapsed(COLLAPSED_STORAGE_KEY);
  const [collapsedWorktrees, toggleWorktree] = useCollapsed(
    COLLAPSED_WORKTREES_KEY,
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const baseGroups = useMemo(
    () =>
      buildGroups({
        threads,
        projects,
        projectOrder,
        sort: preferences.projectSort,
        searchQuery,
        activeProjectId,
      }),
    [
      threads,
      projects,
      projectOrder,
      preferences.projectSort,
      searchQuery,
      activeProjectId,
    ],
  );

  // Empty while the feature is off, which is what stops the hook from asking
  // the host about a single environment.
  const environmentIds = useMemo(
    () => (features.stackedThreads ? environmentIdsFor(baseGroups) : []),
    [features.stackedThreads, baseGroups],
  );
  const stackBranches = useStackBranches(environmentIds);
  const groups = useMemo(
    () =>
      features.stackedThreads
        ? applyStacks(baseGroups, stackBranches)
        : baseGroups,
    [features.stackedThreads, baseGroups, stackBranches],
  );

  // BB's order, personal project excluded: what a manual move can address.
  const orderedProjectIds = useMemo(
    () =>
      projectOrder
        .filter((entry) => entry.position !== null)
        .map((entry) => entry.id),
    [projectOrder],
  );

  const move = useCallback(
    (projectId: string, beforeProjectId: string | null) => {
      // Dropping a project onto its own boundary changes nothing; the server
      // refuses it too, but there is no reason to ask.
      if (projectId === beforeProjectId) return;
      void moveProject(projectId, beforeProjectId).catch(() =>
        toast.error("Could not reorder the projects."),
      );
    },
    [moveProject],
  );

  const step = useCallback(
    (projectId: string, direction: "up" | "down") => {
      const target = stepMoveTarget({
        orderedProjectIds,
        projectId,
        direction,
      });
      if (target === null) return;
      move(projectId, target.beforeProjectId);
    },
    [move, orderedProjectIds],
  );

  const editingProject =
    projects.find((project) => project.id === editing) ?? null;
  // The group, not the project: the confirmation counts the threads that go
  // with it.
  const deletingGroup =
    groups.find((group) => group.projectId === deleting) ?? null;
  const isSearching = searchQuery.trim() !== "";
  const total = groups.reduce((sum, group) => sum + group.threadCount, 0);
  // Dragging is only meaningful while the list follows the order it writes.
  const isManual = preferences.projectSort === "manual" && !isSearching;

  // Every project is a row, in the order the chosen sort put it. Empty ones
  // used to sink into a collapsible "No threads yet" section below the rest,
  // which hid them the moment it was folded — and it persisted that fold, so a
  // project could stay out of sight for good. A project you cannot see is one
  // you cannot reach, and reaching them is what the sidebar is for.

  // One object rather than three props drilled through a recursive component.
  // A search is the one thing that overrides a collapse: it answers a question,
  // and a folded worktree would hide the answer.
  const worktrees: WorktreeView = useMemo(
    () => ({
      enabled: features.worktreeGroups,
      isCollapsed: (environmentId: string) =>
        !isSearching && collapsedWorktrees.has(environmentId),
      toggle: toggleWorktree,
    }),
    [features.worktreeGroups, isSearching, collapsedWorktrees, toggleWorktree],
  );

  // The rows actually on screen, top to bottom: what a shift-click range is
  // measured against, so it can never sweep up a row inside a closed project
  // or a folded worktree.
  const visibleThreadIds = useMemo(
    () =>
      orderedThreadIds(
        groups,
        (projectId) => !(!isSearching && collapsed.has(projectId)),
        (environmentId) =>
          !worktrees.enabled || !worktrees.isCollapsed(environmentId),
      ),
    [groups, isSearching, collapsed, worktrees],
  );

  const renderSection = (group: ProjectGroup) => (
    <ProjectSection
      key={group.projectId}
      group={group}
      icon={icons[group.projectId]}
      showIcon={features.projectIcons}
      // A search shows what it found, whatever the user collapsed.
      isCollapsed={!isSearching && collapsed.has(group.projectId)}
      onToggle={() => toggle(group.projectId)}
      onEditIcon={() => setEditing(group.projectId)}
      // BB's personal project is not the user's to delete, so it is not offered.
      onDelete={group.isPersonal ? null : () => setDeleting(group.projectId)}
      activeThreadId={activeThreadId}
      showBranch={features.showBranch}
      showPullRequests={features.showPullRequests}
      onNavigate={onNavigate}
      worktrees={worktrees}
      isManual={isManual}
      isDragging={dragging === group.projectId}
      canStepUp={isManual && orderedProjectIds.indexOf(group.projectId) > 0}
      canStepDown={
        isManual &&
        group.position !== null &&
        orderedProjectIds.indexOf(group.projectId) <
          orderedProjectIds.length - 1
      }
      nextInOrderId={
        orderedProjectIds[orderedProjectIds.indexOf(group.projectId) + 1] ??
        null
      }
      onDragStateChange={setDragging}
      onDrop={(beforeProjectId) => {
        const moved = dragging;
        setDragging(null);
        if (moved !== null) move(moved, beforeProjectId);
      }}
      onStep={(direction) => step(group.projectId, direction)}
    />
  );

  return (
    <ThreadSelectionProvider order={visibleThreadIds} threads={threads}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between px-2 pb-1">
          <SortMenu value={preferences.projectSort} onChange={setProjectSort} />
          <AddProjectButton onAdd={addProject} />
        </div>
        {/*
          No horizontal padding, because BB's list has none: `ProjectListShell`
          is a bare `SidebarGroupContent` and the panel itself carries only
          safe-area insets. Every row's own `pl-2` is the whole left offset,
          which is what puts a title 8px from the panel edge — and what lets a
          row's hover fill run edge to edge instead of floating in a gutter.
        */}
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {status === "loading" ? null : status === "error" ? (
            <div role="status" className="px-4 py-6 text-center">
              <p className="text-xs font-medium text-foreground">
                Unable to load threads
              </p>
              <p className="mt-1 text-pretty text-xs text-subtle-foreground/75">
                Check that BB is still running, then reopen the sidebar.
              </p>
            </div>
          ) : total === 0 && groups.length === 0 ? (
            // An empty state that only shrugs leaves the reader where they
            // started. Each of these says what the space holds and what to do
            // next, and the search one names the query it failed on.
            <div role="status" className="px-4 py-6 text-center">
              <p className="text-xs font-medium text-foreground">
                {isSearching
                  ? `No threads match \u201C${searchQuery.trim()}\u201D`
                  : "No threads yet"}
              </p>
              <p className="mt-1 text-pretty text-xs text-subtle-foreground/75">
                {isSearching
                  ? "Clear the search to see every project."
                  : "Start one with the New thread button above and it will appear under its project."}
              </p>
            </div>
          ) : (
            // One group per project, separated by the host's own 4px step
            // rather than a per-section top padding. BB's project list is a
            // `SidebarMenu` with `gap-1`; this is that list.
            <div className="flex w-full min-w-0 flex-col gap-1">
              {groups.map(renderSection)}
            </div>
          )}
        </div>

        <Dialog
          open={editing !== null}
          onOpenChange={(open) => !open && setEditing(null)}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Project icon</DialogTitle>
            </DialogHeader>
            {editingProject === null ? null : (
              <IconEditor
                projectId={editingProject.id}
                projectName={editingProject.name}
                // The sidebar's project payload has no remote; the editor only
                // uses it for an explanatory line, and refetching resolves it.
                gitRemoteUrl={null}
                icon={icons[editingProject.id]}
                onChanged={refresh}
              />
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={deleting !== null}
          onOpenChange={(open) => !open && setDeleting(null)}
        >
          <DialogContent className="sm:max-w-md">
            {deletingGroup === null ? null : (
              <DeleteProjectDialog
                // A fresh dialog per project: the confirmation must never open
                // already half-answered from the last time.
                key={deletingGroup.projectId}
                projectName={deletingGroup.projectName}
                threadCount={deletingGroup.threadCount}
                onCancel={() => setDeleting(null)}
                onConfirm={async () => {
                  await deleteProject(deletingGroup.projectId);
                  setDeleting(null);
                  toast.success(`Deleted ${deletingGroup.projectName}.`);
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </ThreadSelectionProvider>
  );
}

function ProjectSection({
  group,
  icon,
  showIcon,
  isCollapsed,
  onToggle,
  onEditIcon,
  onDelete,
  activeThreadId,
  showBranch,
  showPullRequests,
  onNavigate,
  worktrees,
  isManual,
  isDragging,
  canStepUp,
  canStepDown,
  nextInOrderId,
  onDragStateChange,
  onDrop,
  onStep,
}: {
  group: ProjectGroup;
  icon: Parameters<typeof ProjectIcon>[0]["icon"];
  showIcon: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  onEditIcon: () => void;
  /** Null for the personal project, which BB does not let anyone delete. */
  onDelete: (() => void) | null;
  activeThreadId: string | null;
  showBranch: boolean;
  showPullRequests: boolean;
  onNavigate: () => void;
  worktrees: WorktreeView;
  /** True while the list follows BB's manual project order. */
  isManual: boolean;
  isDragging: boolean;
  canStepUp: boolean;
  canStepDown: boolean;
  /** The project after this one in BB's order; null when it is last. */
  nextInOrderId: string | null;
  onDragStateChange: (projectId: string | null) => void;
  /** Null drops the dragged project at the end of the order. */
  onDrop: (beforeProjectId: string | null) => void;
  onStep: (direction: "up" | "down") => void;
}) {
  const actions = useSidebarThreadActions();
  // "before" | "after" while a project hovers this header, so the user can see
  // where it will land before letting go.
  const [dropEdge, setDropEdge] = useState<"before" | "after" | null>(null);
  // The personal project sits outside BB's project order, so it cannot be
  // dragged and nothing can be dropped onto it.
  const isDraggable = isManual && group.position !== null;
  // Nothing to expand, and nothing to say about it: the header alone is the
  // whole of an empty project.
  const isEmpty = group.threadCount === 0;

  const edgeFor = (event: React.DragEvent<HTMLElement>): "before" | "after" => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  };

  const menu = buildProjectMenu({
    onNewThread: () => actions.openNewThread({ projectId: group.projectId }),
    onEditIcon,
    canStepUp,
    canStepDown,
    onStep,
    onDelete,
  });

  return (
    <section
      aria-label={group.projectName}
      className={cn(
        "group/sidebar-section min-w-0 rounded-md transition-colors",
        isDragging && "opacity-50",
      )}
    >
      <ProjectContextMenu groups={menu}>
        <div
          className={cn(SECTION_HEADER_CLASS, SIDEBAR_HOVER_ACTIONS_GAP_CLASS)}
          draggable={isDraggable}
          onDragStart={(event) => {
            // The id travels in dataTransfer too, so a drop outside this list
            // sees plain text rather than nothing.
            event.dataTransfer.setData("text/plain", group.projectId);
            event.dataTransfer.effectAllowed = "move";
            onDragStateChange(group.projectId);
          }}
          onDragEnd={() => {
            onDragStateChange(null);
            setDropEdge(null);
          }}
          onDragOver={(event) => {
            if (!isDraggable) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropEdge(edgeFor(event));
          }}
          onDragLeave={() => setDropEdge(null)}
          onDrop={(event) => {
            if (!isDraggable) return;
            event.preventDefault();
            const edge = edgeFor(event);
            setDropEdge(null);
            // Dropping below a header means "after it", which is the same move
            // as "before whatever follows it" — resolved on the server, where
            // the authoritative order lives, by sending the neighbour id.
            onDrop(edge === "before" ? group.projectId : nextInOrderId);
          }}
        >
          {/*
            The drop line is painted, not bordered. A border added on hover
            grows the header by a pixel and shoves the whole list down on every
            `dragover`, which reads as the list flinching away from the cursor.
          */}
          {dropEdge === null ? null : (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-0 z-30 h-0.5 rounded-full bg-sidebar-ring",
                dropEdge === "before" ? "-top-px" : "-bottom-px",
              )}
            />
          )}
          {/*
            A full-bleed toggle target for pointer users; the caret owns
            keyboard focus. This is how BB's own section header splits the two,
            so a click anywhere on the row collapses it without the row itself
            becoming a second tab stop next to its caret.
          */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={onToggle}
            className={cn(
              "absolute inset-0 rounded-md",
              isDraggable && "cursor-grab active:cursor-grabbing",
            )}
          />
          <span className={SECTION_HEADER_LABEL_CLASS}>
            {isManual ? (
              <span
                aria-hidden
                className={cn(
                  SIDEBAR_LEADING_GLYPH_SLOT_CLASS,
                  "-ml-1 w-3",
                  // Present but quiet until the header is hovered, so the
                  // handle does not compete with the project name.
                  "opacity-40 group-hover/sidebar-section:opacity-100",
                  LIST_HOVER_TRANSITION,
                  !isDraggable &&
                    "opacity-0 group-hover/sidebar-section:opacity-0",
                )}
              >
                <Icon name="DragDropVertical" className="size-3" />
              </span>
            ) : null}
            {showIcon ? (
              <ProjectIcon
                name={group.projectName}
                icon={icon}
                // A project with nothing in it is reachable, but plainly not
                // where the work is. The dimming lands on the icon alone:
                // applied to the header it also dimmed the name, which is
                // already the palette's quietest text and cannot afford a
                // second reduction.
                className={cn(isEmpty && "opacity-50")}
              />
            ) : null}
            <span className="min-w-0 truncate" title={group.projectName}>
              {group.projectName}
            </span>
            {/* Nothing to expand under a project with no threads. */}
            {isEmpty ? null : (
              <SidebarChildToggleChevron
                isCollapsed={isCollapsed}
                expandLabel={`Expand ${group.projectName} section`}
                collapseLabel={`Collapse ${group.projectName} section`}
                onToggle={onToggle}
                // Open groups hide their caret until the row is hovered — the
                // list is mostly open, and a column of carets is noise. A
                // closed one keeps it, because it is the only thing saying
                // there is something folded away.
                revealOnHover={!isCollapsed}
                className="size-6"
              />
            )}
          </span>
          <span className="relative z-20 inline-flex h-6 shrink-0 items-center">
            <span
              className={cn(
                SIDEBAR_HOVER_ACTIONS_CLASS,
                "inline-flex shrink-0 items-center",
                SIDEBAR_HOVER_ACTIONS_GAP_CLASS,
              )}
            >
              <ProjectActionsButton
                projectName={group.projectName}
                groups={menu}
              />
            </span>
          </span>
        </div>
      </ProjectContextMenu>

      {isCollapsed || isEmpty ? null : (
        // No hairline down the project's threads. BB reserves that for its
        // `project` tree variant, which also pushes its root rows one depth
        // step in to clear the line; the variant a project actually renders
        // (`section`) starts its threads flush at depth 0 with no line, and a
        // line at the host's offset would run straight through these rows.
        // The nesting rail lives per parent thread instead — see `ThreadRow`.
        <div className="mt-1">
          {group.pinned.length > 0 ? (
            <Branch
              nodes={group.pinned}
              activeThreadId={activeThreadId}
              showBranch={showBranch}
              showPullRequests={showPullRequests}
              onNavigate={onNavigate}
              worktrees={worktrees}
              label="Pinned"
              // Pinned threads are their own group inside the project, so the
              // gap under them is the one that says where they stop.
              className="pb-1.5"
            />
          ) : null}
          <Branch
            nodes={group.roots}
            activeThreadId={activeThreadId}
            showBranch={showBranch}
            showPullRequests={showPullRequests}
            onNavigate={onNavigate}
            worktrees={worktrees}
          />
        </div>
      )}
    </section>
  );
}

/**
 * One list of rows and, recursively, their children.
 *
 * Grouping is applied here rather than baked into the tree, so it happens at
 * every sibling level for free: each `Branch` groups the list it was handed,
 * and the nested `Branch` inside a row groups that row's children.
 */
function Branch({
  nodes,
  activeThreadId,
  showBranch,
  showPullRequests,
  onNavigate,
  worktrees,
  label,
  depth = 0,
  className,
}: {
  nodes: readonly ThreadNode[];
  activeThreadId: string | null;
  showBranch: boolean;
  showPullRequests: boolean;
  onNavigate: () => void;
  worktrees: WorktreeView;
  label?: string;
  depth?: number;
  className?: string;
}) {
  if (nodes.length === 0) return null;
  const items = worktrees.enabled
    ? groupWorktrees(nodes)
    : nodes.map((node) => ({ kind: "thread" as const, node }));

  const renderNode = (
    node: ThreadNode,
    rowDepth: number,
    inWorktreeGroup = false,
  ) => (
    <ThreadRow
      key={node.thread.id}
      node={node}
      depth={rowDepth}
      isActive={node.thread.id === activeThreadId}
      showBranch={showBranch}
      inWorktreeGroup={inWorktreeGroup}
      showPullRequests={showPullRequests}
      onNavigate={onNavigate}
    >
      <Branch
        nodes={node.children}
        activeThreadId={activeThreadId}
        showBranch={showBranch}
        showPullRequests={showPullRequests}
        onNavigate={onNavigate}
        worktrees={worktrees}
        depth={rowDepth + 1}
      />
    </ThreadRow>
  );

  return (
    <ul
      {...(label === undefined ? {} : { "aria-label": label })}
      // `space-y-0.5`, the host's own row rhythm: dense, but not so dense that
      // two hover fills touch.
      className={cn("space-y-0.5", className)}
    >
      {items.map((item) =>
        item.kind === "thread" ? (
          renderNode(item.node, depth)
        ) : (
          <WorktreeRow
            key={item.group.environmentId}
            group={item.group}
            depth={depth}
            isCollapsed={worktrees.isCollapsed(item.group.environmentId)}
            onToggle={() => worktrees.toggle(item.group.environmentId)}
          >
            {/* The worktree header owns a level, so its threads sit one step
              in — the same step a child thread takes under its parent.

              The list carries the accessible name because the number on the
              header is decorative: a bare "2" read out before a worktree name
              would sound like part of it, exactly as it would on a row. */}
            <ul
              aria-label={
                item.group.stackPosition === null
                  ? item.group.name
                  : `${item.group.name}, ${ordinal(item.group.stackPosition)} in stack`
              }
              className="space-y-0.5"
            >
              {item.group.nodes.map((node) =>
                renderNode(node, depth + 1, true),
              )}
            </ul>
          </WorktreeRow>
        ),
      )}
    </ul>
  );
}
