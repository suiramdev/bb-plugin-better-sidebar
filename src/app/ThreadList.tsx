import { useCallback, useMemo, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { buildGroups, type ProjectGroup, type ThreadNode } from "./grouping";
import { IconEditor } from "./IconEditor";
import { MenuItem } from "./RowContextMenu";
import { ProjectIcon } from "./ProjectIcon";
import { SortMenu } from "./SortMenu";
import { ThreadRow } from "./ThreadRow";
import { stepMoveTarget } from "./manual-move";
import { useSidebarData } from "./useSidebarData";

const COLLAPSED_STORAGE_KEY = "better-sidebar.collapsed-projects";

function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : []);
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
  } = useSidebarData(projectIds);
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);
  const [editing, setEditing] = useState<string | null>(null);
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

  const groups = useMemo(
    () =>
      buildGroups({
        threads,
        projects,
        projectOrder,
        sort: preferences.projectSort,
        searchQuery,
        activeProjectId,
      }),
    [threads, projects, projectOrder, preferences.projectSort, searchQuery, activeProjectId],
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
      const target = stepMoveTarget({ orderedProjectIds, projectId, direction });
      if (target === null) return;
      move(projectId, target.beforeProjectId);
    },
    [move, orderedProjectIds],
  );

  const editingProject = projects.find((project) => project.id === editing) ?? null;
  const isSearching = searchQuery.trim() !== "";
  const total = groups.reduce((sum, group) => sum + group.threadCount, 0);
  // Dragging is only meaningful while the list follows the order it writes.
  const isManual = preferences.projectSort === "manual" && !isSearching;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center px-2 pb-1">
        <SortMenu value={preferences.projectSort} onChange={setProjectSort} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
      {status === "loading" ? null : status === "error" ? (
        <p role="status" className="px-2 py-6 text-center text-xs text-muted-foreground">
          Could not load threads.
        </p>
      ) : total === 0 && groups.length === 0 ? (
        <p role="status" className="px-2 py-6 text-center text-xs text-muted-foreground">
          {isSearching ? "No threads found" : "No threads yet"}
        </p>
      ) : (
        groups.map((group) => (
          <ProjectSection
            key={group.projectId}
            group={group}
            icon={icons[group.projectId]}
            showIcon={features.projectIcons}
            // A search shows what it found, whatever the user collapsed.
            isCollapsed={!isSearching && collapsed.has(group.projectId)}
            onToggle={() => toggle(group.projectId)}
            onEditIcon={() => setEditing(group.projectId)}
            activeThreadId={activeThreadId}
            showBranch={features.showBranch}
            showPullRequests={features.showPullRequests}
            onNavigate={onNavigate}
            isManual={isManual}
            isDragging={dragging === group.projectId}
            canStepUp={
              isManual && orderedProjectIds.indexOf(group.projectId) > 0
            }
            canStepDown={
              isManual &&
              group.position !== null &&
              orderedProjectIds.indexOf(group.projectId) <
                orderedProjectIds.length - 1
            }
            nextInOrderId={
              orderedProjectIds[orderedProjectIds.indexOf(group.projectId) + 1] ?? null
            }
            onDragStateChange={setDragging}
            onDrop={(beforeProjectId) => {
              const moved = dragging;
              setDragging(null);
              if (moved !== null) move(moved, beforeProjectId);
            }}
            onStep={(direction) => step(group.projectId, direction)}
          />
        ))
      )}

      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
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
    </div>
  );
}

function ProjectSection({
  group,
  icon,
  showIcon,
  isCollapsed,
  onToggle,
  onEditIcon,
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
  isCollapsed: boolean;
  onToggle: () => void;
  onEditIcon: () => void;
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

  return (
    <section aria-label={group.projectName} className="pt-2 first:pt-1">
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
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
              "group/header flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-sidebar-accent/60",
              isDraggable && "cursor-grab active:cursor-grabbing",
              isDragging && "opacity-50",
              dropEdge === "before" && "border-t border-t-timeline-accent",
              dropEdge === "after" && "border-b border-b-timeline-accent",
            )}
          >
            {isManual ? (
              <Icon
                name="DragDropVertical"
                className={cn(
                  "size-3 shrink-0 text-muted-foreground/40",
                  !isDraggable && "opacity-0",
                )}
              />
            ) : null}
            {showIcon ? <ProjectIcon name={group.projectName} icon={icon} /> : null}
            <span className="min-w-0 flex-1 truncate text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.projectName}
            </span>
            <span className="shrink-0 text-2xs tabular-nums text-muted-foreground/60">
              {group.threadCount > 0 ? group.threadCount : null}
            </span>
            <Icon
              name="ChevronDown"
              className={cn(
                "size-3 shrink-0 text-muted-foreground/60 transition-transform",
                isCollapsed && "-rotate-90",
              )}
            />
          </button>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            aria-label="Project actions"
            className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
          >
            <MenuItem onSelect={() => actions.openNewThread({ projectId: group.projectId })}>
              New thread here
            </MenuItem>
            <ContextMenu.Separator className="my-1 h-px bg-border" />
            <MenuItem onSelect={onEditIcon}>Set project icon…</MenuItem>
            {/* Reordering must not be drag-only: the same move, from the keyboard. */}
            {canStepUp || canStepDown ? (
              <>
                <ContextMenu.Separator className="my-1 h-px bg-border" />
                {canStepUp ? (
                  <MenuItem onSelect={() => onStep("up")}>Move project up</MenuItem>
                ) : null}
                {canStepDown ? (
                  <MenuItem onSelect={() => onStep("down")}>Move project down</MenuItem>
                ) : null}
              </>
            ) : null}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {isCollapsed ? null : group.threadCount === 0 ? (
        <p className="px-2 py-1.5 text-2xs text-muted-foreground/70">No threads yet</p>
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
}: {
  nodes: readonly ThreadNode[];
  activeThreadId: string | null;
  showBranch: boolean;
  showPullRequests: boolean;
  onNavigate: () => void;
  label?: string;
  depth?: number;
}) {
  if (nodes.length === 0) return null;
  return (
    <ul {...(label === undefined ? {} : { "aria-label": label })} className="flex flex-col gap-px">
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
