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
import { SortMenu } from "./SortMenu";
import { AddProjectButton } from "./AddProjectButton";
import { ThreadRow } from "./ThreadRow";
import { stepMoveTarget } from "./manual-move";
import { useSidebarData, useStackBranches } from "./useSidebarData";
import { applyStacks, environmentIdsFor } from "./stacking";
import { orderedThreadIds } from "./selection";
import { ThreadSelectionProvider } from "./SelectionContext";

const COLLAPSED_STORAGE_KEY = "better-sidebar.collapsed-projects";

/**
 * The quiet group collapses like a project does, so it rides in the same
 * persisted set. No BB project id can collide with this: they are `proj_`-
 * prefixed, and an `@` is not a character one can contain.
 */
const QUIET_SECTION_KEY = "@quiet-projects";

/**
 * The height floor shared by every header-sized control in this list, borrowed
 * from the host so a coarse pointer grows these rows exactly as far as it grows
 * BB's own. A 10px uppercase label inside `py-1` is 22px, under the 24px WCAG
 * 2.5.8 target, and no amount of padding tuning would have tracked the host.
 */
const HEADER_HEIGHT =
  "min-h-[var(--bb-sidebar-row-height,1.5rem)] max-md:pointer-coarse:min-h-[var(--bb-sidebar-row-height-coarse,2.25rem)]";

/** The ring the sort and add controls above the list already use. */
const FOCUS_RING = "outline-none focus-visible:ring-1 focus-visible:ring-ring";

function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return new Set(
      Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function writeCollapsed(collapsed: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...collapsed]));
  } catch {
    // Private mode or a full quota: collapse state is a nicety, not state we
    // are willing to fail a render over.
  }
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
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const toggle = useCallback((projectId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      writeCollapsed(next);
      return next;
    });
  }, []);

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

  // Quiet projects stay reachable, but they are not what the list is about:
  // they sink below the ones with threads instead of scattering empty rows
  // through it. Inside each half the chosen sort still decides the order.
  const active = groups.filter((group) => group.threadCount > 0);
  const quiet = groups.filter((group) => group.threadCount === 0);
  // A search shows what it found, whatever the user collapsed.
  const isQuietCollapsed = !isSearching && collapsed.has(QUIET_SECTION_KEY);

  // The rows actually on screen, top to bottom: what a shift-click range is
  // measured against, so it can never sweep up a row inside a closed project.
  const visibleThreadIds = useMemo(
    () =>
      orderedThreadIds(
        [...active, ...(isQuietCollapsed ? [] : quiet)],
        (projectId) => !(!isSearching && collapsed.has(projectId)),
      ),
    [active, quiet, isQuietCollapsed, isSearching, collapsed],
  );

  const renderSection = (group: ProjectGroup, isQuiet: boolean) => (
    <ProjectSection
      key={group.projectId}
      group={group}
      icon={icons[group.projectId]}
      showIcon={features.projectIcons}
      isQuiet={isQuiet}
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
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {status === "loading" ? null : status === "error" ? (
            <div role="status" className="px-4 py-6 text-center">
              <p className="text-xs font-medium text-foreground">
                Unable to load threads
              </p>
              <p className="mt-1 text-pretty text-xs text-muted-foreground">
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
              <p className="mt-1 text-pretty text-xs text-muted-foreground">
                {isSearching
                  ? "Clear the search to see every project."
                  : "Start one with the New thread button above and it will appear under its project."}
              </p>
            </div>
          ) : (
            <>
              {active.map((group) => renderSection(group, false))}
              {quiet.length > 0 ? (
                <button
                  type="button"
                  onClick={() => toggle(QUIET_SECTION_KEY)}
                  aria-expanded={!isQuietCollapsed}
                  className={cn(
                    "group/quiet mt-4 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left",
                    HEADER_HEIGHT,
                    FOCUS_RING,
                    LIST_HOVER_TRANSITION,
                    // One muted step, not a muted token diluted again by an
                    // alpha: a section heading still has to be readable.
                    "text-2xs font-semibold uppercase tracking-wide text-muted-foreground",
                    "hover:bg-sidebar-accent/60 hover:text-foreground",
                  )}
                >
                  {/* A heading, not a bare rule: it names what follows for a
                    screen reader, where dimmed rows say nothing at all. */}
                  <span
                    role="heading"
                    aria-level={2}
                    className="min-w-0 flex-1 truncate"
                  >
                    No threads yet
                  </span>
                  <span className="shrink-0 tabular-nums">{quiet.length}</span>
                  <Icon
                    name="ChevronDown"
                    className={cn(
                      "size-3 shrink-0 motion-safe:transition-transform",
                      isQuietCollapsed && "-rotate-90",
                    )}
                  />
                </button>
              ) : null}
              {isQuietCollapsed
                ? null
                : quiet.map((group) => renderSection(group, true))}
            </>
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
  isQuiet,
  isCollapsed,
  onToggle,
  onEditIcon,
  onDelete,
  activeThreadId,
  showBranch,
  showPullRequests,
  onNavigate,
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
  /** A project with no threads: present, but dimmed and closed. */
  isQuiet: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  onEditIcon: () => void;
  /** Null for the personal project, which BB does not let anyone delete. */
  onDelete: (() => void) | null;
  activeThreadId: string | null;
  showBranch: boolean;
  showPullRequests: boolean;
  onNavigate: () => void;
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
    // A project is a group, and groups are separated by space rather than a
    // rule: one step inside the group, two steps between them.
    <section aria-label={group.projectName} className="pt-3 first:pt-1">
      <ProjectContextMenu groups={menu}>
        <div
          className={cn(
            "group/header relative flex w-full items-center gap-1.5 rounded-md pr-1",
            LIST_HOVER_TRANSITION,
            "hover:bg-sidebar-accent/60",
            isDragging && "opacity-50",
          )}
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
                "pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-timeline-accent",
                dropEdge === "before" ? "-top-px" : "-bottom-px",
              )}
            />
          )}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!isCollapsed}
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
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 pl-2 text-left",
              HEADER_HEIGHT,
              FOCUS_RING,
              isDraggable && "cursor-grab active:cursor-grabbing",
            )}
          >
            {isManual ? (
              <Icon
                name="DragDropVertical"
                className={cn(
                  "size-3 shrink-0 text-muted-foreground",
                  // Present but quiet until the header is hovered, so the
                  // handle does not compete with the project name.
                  "opacity-40 group-hover/header:opacity-100",
                  LIST_HOVER_TRANSITION,
                  !isDraggable && "opacity-0 group-hover/header:opacity-0",
                )}
              />
            ) : null}
            {showIcon ? (
              <ProjectIcon
                name={group.projectName}
                icon={icon}
                // Reachable, but plainly not where the work is. The dimming
                // lands on the icon alone: applied to the header it also dimmed
                // the name and count, which are already the palette's quietest
                // text and cannot afford a second reduction.
                className={cn(isQuiet && "opacity-50")}
              />
            ) : null}
            <span className="min-w-0 flex-1 truncate text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.projectName}
            </span>
            <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
              {group.threadCount > 0 ? group.threadCount : null}
            </span>
            {/* Nothing to expand under a project with no threads. */}
            {isQuiet ? null : (
              <Icon
                name="ChevronDown"
                className={cn(
                  "size-3 shrink-0 text-muted-foreground motion-safe:transition-transform",
                  isCollapsed && "-rotate-90",
                )}
              />
            )}
          </button>
          <ProjectActionsButton projectName={group.projectName} groups={menu} />
        </div>
      </ProjectContextMenu>

      {isCollapsed ? null : group.threadCount === 0 ? (
        // The group heading above the quiet projects already says this; only a
        // project that is empty *inside* the list of active ones repeats it.
        isQuiet ? null : (
          <p className="px-2 py-1.5 text-2xs text-muted-foreground">
            No threads yet
          </p>
        )
      ) : (
        <>
          {group.pinned.length > 0 ? (
            <Branch
              nodes={group.pinned}
              activeThreadId={activeThreadId}
              showBranch={showBranch}
              showPullRequests={showPullRequests}
              onNavigate={onNavigate}
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
          />
        </>
      )}
    </section>
  );
}

/** One list of rows and, recursively, their children. */
function Branch({
  nodes,
  activeThreadId,
  showBranch,
  showPullRequests,
  onNavigate,
  label,
  depth = 0,
  className,
}: {
  nodes: readonly ThreadNode[];
  activeThreadId: string | null;
  showBranch: boolean;
  showPullRequests: boolean;
  onNavigate: () => void;
  label?: string;
  depth?: number;
  className?: string;
}) {
  if (nodes.length === 0) return null;
  return (
    <ul
      {...(label === undefined ? {} : { "aria-label": label })}
      className={cn("flex flex-col gap-px", className)}
    >
      {nodes.map((node) => (
        <ThreadRow
          key={node.thread.id}
          node={node}
          depth={depth}
          isActive={node.thread.id === activeThreadId}
          showBranch={showBranch}
          showPullRequests={showPullRequests}
          onNavigate={onNavigate}
        >
          <Branch
            nodes={node.children}
            activeThreadId={activeThreadId}
            showBranch={showBranch}
            showPullRequests={showPullRequests}
            onNavigate={onNavigate}
            depth={depth + 1}
          />
        </ThreadRow>
      ))}
    </ul>
  );
}
