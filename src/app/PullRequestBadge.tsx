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
        "shrink-0 rounded-sm px-1 text-2xs font-medium tabular-nums",
        toneFor(pullRequest),
      )}
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
      return "bg-sidebar-accent text-timeline-accent";
    default:
      return "bg-sidebar-accent text-muted-foreground";
  }
}
