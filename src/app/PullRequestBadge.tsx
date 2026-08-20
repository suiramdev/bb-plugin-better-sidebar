import {
  experimental_useSidebarThreadPullRequest as useSidebarThreadPullRequest,
  type PluginSidebarPullRequest,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";

/**
 * The `#412` badge. Mounted only when the feature is on, because each row costs
 * a git-host lookup — that is why the SDK keeps it off the thread payload.
 */
export function PullRequestBadge({ threadId }: { threadId: string }) {
  const { pullRequest } = useSidebarThreadPullRequest(threadId);
  if (pullRequest === null) return null;
  return (
    <span
      className={cn(
        "shrink-0 whitespace-nowrap rounded-sm px-1 text-2xs font-medium tabular-nums",
        toneFor(pullRequest),
      )}
      // The row's own link owns the accessible name, so the state has to reach
      // a screen reader from here or not at all: `title` alone is a pointer
      // affordance on a non-focusable element.
      aria-label={`Pull request ${pullRequest.number}, ${pullRequest.state}`}
      title={`${pullRequest.title} (${pullRequest.state})`}
    >
      #{pullRequest.number}
    </span>
  );
}

/** BB already rolled "does this need you" up into `attention`; follow it. */
function toneFor(pullRequest: PluginSidebarPullRequest): string {
  switch (pullRequest.attention) {
    case "checks_failed":
    case "conflicts":
    case "changes_requested":
      return "bg-destructive/10 text-destructive";
    case "review_requested":
    case "checks_pending":
    case "blocked":
      return "bg-sidebar-accent text-foreground";
    case "ready_to_merge":
      // The host's own "this succeeded" foreground, so a mergeable PR here and
      // a finished run in BB's rows speak with one colour.
      return "bg-sidebar-accent text-success-foreground";
    default:
      return "bg-sidebar-accent text-subtle-foreground";
  }
}
