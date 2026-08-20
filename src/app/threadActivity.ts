import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

/**
 * BB's trailing-indicator model, vendored from `thread-activity.ts` in
 * `@bb/client-core` — the module every one of the host's thread-list surfaces
 * resolves its single status glyph through.
 *
 * The host publishes each thread's already-resolved `indicator`, so a leaf row
 * could simply read it. A collapsed parent cannot: it has to fold its hidden
 * children's states into one glyph, and folding is only correct if it uses the
 * same precedence the host does. Copying the resolver is what makes the two
 * agree — and it is the resolver that owns the surprising parts (attention
 * outranks the spinner; plan and goal outrank it too; a draft only becomes a
 * "working draft" when something is actually running).
 *
 * `stateForThread` is the seam: it reconstructs the resolver's input from what
 * the plugin API exposes, so `resolveThreadListIndicator(stateForThread(t))`
 * returns `t.indicator` again for a leaf.
 */
export interface ThreadListIndicatorState {
  hasPendingInteraction: boolean;
  hasUnsubmittedDraft: boolean;
  hasUnreadError: boolean;
  hasUnreadSuccess: boolean;
  isBackgroundAgentActive: boolean;
  isBackgroundCommandActive: boolean;
  isGoalActive: boolean;
  isPlanModeActive: boolean;
  isRuntimeActive: boolean;
  isWorkflowActive: boolean;
}

export type ThreadListIndicatorKind =
  | "unread-error"
  | "waiting-for-input"
  | "working-draft"
  | "workflow"
  | "background-agent"
  | "background-command"
  | "plan-mode"
  | "goal"
  | "runtime"
  | "draft"
  | "unread-success"
  | "none";

const THREAD_LIST_INDICATOR_LABELS: Record<
  Exclude<ThreadListIndicatorKind, "none">,
  string
> = {
  "unread-error": "Unread thread failed",
  "waiting-for-input": "Thread needs user input",
  "working-draft": "Thread working with unsubmitted draft",
  workflow: "Workflow running",
  "background-agent": "Background agent running",
  "background-command": "Background command running",
  "plan-mode": "Plan mode active",
  goal: "Goal active",
  runtime: "Thread working",
  draft: "Thread has unsubmitted draft",
  "unread-success": "Unread thread succeeded",
};

export function getThreadListIndicatorLabel(
  kind: ThreadListIndicatorKind,
): string | null {
  return kind === "none" ? null : THREAD_LIST_INDICATOR_LABELS[kind];
}

/**
 * Whether a thread-list row has active work, independent of which status wins
 * the single trailing indicator slot. Attention states such as unread errors
 * and pending input can outrank background work visually without making that
 * work stop; split membership uses this predicate to retain its shimmer.
 */
export function hasThreadListWorkingActivity(
  state: ThreadListIndicatorState,
): boolean {
  return (
    state.isRuntimeActive ||
    state.isWorkflowActive ||
    state.isBackgroundAgentActive ||
    state.isBackgroundCommandActive ||
    state.isPlanModeActive ||
    state.isGoalActive
  );
}

/**
 * Resolves the one trailing indicator slot from independent, unsuppressed
 * thread state. Keep all precedence here so every thread-list surface makes
 * the same choice when activities overlap.
 */
export function resolveThreadListIndicator(
  state: ThreadListIndicatorState,
): ThreadListIndicatorKind {
  // Attention states come first: the runtime stays active for the whole time a
  // question or approval is open, so ranking "runtime" above them would hide the
  // one state the user can act on behind a spinner that never resolves on its
  // own. Plan and goal outrank the spinner too — they describe how the current
  // turn is running, and their glyphs shimmer, so they already read as working.
  // Only ambient work the row can't otherwise explain sits below the spinner.
  if (state.hasUnreadError) return "unread-error";
  if (state.hasPendingInteraction) return "waiting-for-input";

  const hasActiveWork = hasThreadListWorkingActivity(state);
  if (state.hasUnsubmittedDraft && hasActiveWork) return "working-draft";
  if (state.isPlanModeActive) return "plan-mode";
  if (state.isGoalActive) return "goal";
  if (state.isRuntimeActive) return "runtime";
  if (state.isWorkflowActive) return "workflow";
  if (state.isBackgroundAgentActive) return "background-agent";
  if (state.isBackgroundCommandActive) return "background-command";
  if (state.hasUnsubmittedDraft) return "draft";
  if (state.hasUnreadSuccess) return "unread-success";
  return "none";
}

/**
 * The resolver's input, rebuilt for one thread from the plugin API.
 *
 * Live work comes from the activity counts, which the host publishes raw. The
 * three states it does not publish as fields — the runtime turn, the composer
 * draft, and which way an unread thread finished — are read back out of the
 * indicator the host already resolved, so a leaf row round-trips exactly.
 *
 * The one thing that cannot round-trip is a runtime turn under an open
 * question: the host suppressed "runtime" in favour of "waiting-for-input"
 * before the plugin ever saw it. That only matters to a collapsed parent, and
 * only to pick between two glyphs that both mean "busy" — while the child that
 * is actually waiting still wins the fold, because attention outranks work.
 */
export function stateForThread(
  thread: PluginSidebarThread,
): ThreadListIndicatorState {
  const { activity, indicator } = thread;
  return {
    hasPendingInteraction: thread.hasPendingInteraction,
    hasUnsubmittedDraft: indicator === "draft" || indicator === "working-draft",
    hasUnreadError: indicator === "unread-error",
    hasUnreadSuccess: indicator === "unread-success",
    isBackgroundAgentActive: activity.backgroundAgents > 0,
    isBackgroundCommandActive: activity.backgroundCommands > 0,
    isGoalActive: activity.goals > 0,
    isPlanModeActive: activity.planMode > 0,
    isRuntimeActive: indicator === "runtime",
    isWorkflowActive: activity.workflows > 0,
  };
}

/**
 * The signals a collapsed parent row surfaces on behalf of its hidden children.
 * A collapsed row renders these through its single trailing status glyph, using
 * the same priority as a leaf row through `resolveThreadListIndicator`.
 * Expanded rows show their own status, since the children are then visible with
 * their own glyphs. Background agent, command, and workflow work are tracked
 * separately from runtime work so the sidebar can use task-specific signals
 * instead of collapsing them into a generic spinner.
 */
export interface CollapsedChildActivity {
  /** At least one child is blocked on the user (needs input). */
  pending: boolean;
  /** At least one child is actively working, including workflow work. */
  working: boolean;
  /** At least one child has an unsubmitted composer draft. */
  hasUnsubmittedDraft: boolean;
  /** At least one child is actively running a foreground/runtime turn. */
  runtimeWorking: boolean;
  /** At least one idle child has a provider workflow still running. */
  workflow: boolean;
  /** At least one child has a background agent or subagent still running. */
  backgroundAgent: boolean;
  /** At least one child has a background shell command still running. */
  backgroundCommand: boolean;
  /** At least one child is showing the plan-mode banner above the composer. */
  planMode: boolean;
  /** At least one child is showing the active-goal banner above the composer. */
  goal: boolean;
  /** At least one successfully finished child is unread. */
  unread: boolean;
  /** At least one unread child has reached the terminal error state. */
  unreadError: boolean;
}

export const NO_COLLAPSED_CHILD_ACTIVITY: CollapsedChildActivity = {
  pending: false,
  working: false,
  hasUnsubmittedDraft: false,
  runtimeWorking: false,
  workflow: false,
  backgroundAgent: false,
  backgroundCommand: false,
  planMode: false,
  goal: false,
  unread: false,
  unreadError: false,
};

/** Rolls a child thread list up to the set of activity signals present in it. */
export function getCollapsedChildActivity(
  threads: readonly PluginSidebarThread[],
): CollapsedChildActivity {
  let pending = false;
  let working = false;
  let hasUnsubmittedDraft = false;
  let runtimeWorking = false;
  let workflow = false;
  let backgroundAgent = false;
  let backgroundCommand = false;
  let planMode = false;
  let goal = false;
  let unread = false;
  let unreadError = false;
  for (const thread of threads) {
    const state = stateForThread(thread);
    if (state.hasUnsubmittedDraft) {
      hasUnsubmittedDraft = true;
    }
    if (state.hasUnreadError) {
      unreadError = true;
    } else if (state.hasUnreadSuccess) {
      unread = true;
    }

    if (state.hasPendingInteraction) {
      pending = true;
    }
    if (state.isRuntimeActive) {
      runtimeWorking = true;
      working = true;
    }
    if (state.isWorkflowActive) {
      workflow = true;
      working = true;
    }
    if (state.isBackgroundAgentActive) {
      backgroundAgent = true;
      working = true;
    }
    if (state.isBackgroundCommandActive) {
      backgroundCommand = true;
      working = true;
    }
    if (state.isPlanModeActive) {
      planMode = true;
      working = true;
    }
    if (state.isGoalActive) {
      goal = true;
      working = true;
    }
  }
  return {
    pending,
    working,
    hasUnsubmittedDraft,
    runtimeWorking,
    workflow,
    backgroundAgent,
    backgroundCommand,
    planMode,
    goal,
    unread,
    unreadError,
  };
}
