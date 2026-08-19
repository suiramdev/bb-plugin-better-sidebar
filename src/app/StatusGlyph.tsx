import type { PluginSidebarThreadIndicator } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * The status glyph for one row, in BB's own vocabulary: the red circle-x for a
 * failure, the question mark for a raised hand, a spinner for live work, and a
 * dot for a finished thread nobody has read.
 *
 * An unrecognized indicator draws nothing on purpose — BB adds kinds over time,
 * and a sidebar built today must degrade rather than throw.
 */
export function StatusGlyph({
  indicator,
  label,
}: {
  indicator: PluginSidebarThreadIndicator;
  label: string | null;
}) {
  const shared = "size-3.5 shrink-0";
  const aria = label ?? undefined;

  switch (indicator) {
    case "unread-error":
      return (
        <Icon name="CircleX" aria-label={aria} className={cn(shared, "text-destructive")} />
      );
    case "waiting-for-input":
      return (
        <Icon
          name="CircleQuestion"
          aria-label={aria}
          className={cn(shared, "text-muted-foreground")}
        />
      );
    case "runtime":
      return (
        <Icon
          name="Loading"
          aria-label={aria}
          className={cn(shared, "animate-spin text-muted-foreground/60")}
        />
      );
    case "workflow":
      return <Working name="Workflow" label={aria} />;
    case "background-agent":
      return <Working name="UserRoundPlus" label={aria} />;
    case "background-command":
      return <Working name="Terminal" label={aria} />;
    case "plan-mode":
      return <Working name="ListTodo" label={aria} />;
    case "goal":
      return <Working name="Target" label={aria} />;
    case "draft":
    case "working-draft":
      return (
        <Icon name="Edit" aria-label={aria} className={cn(shared, "text-muted-foreground/70")} />
      );
    case "unread-success":
      return (
        <span aria-label={aria} className={cn("flex items-center justify-center", shared)}>
          <span className="size-[5px] rounded-full bg-timeline-accent" />
        </span>
      );
    default:
      return null;
  }
}

function Working({
  name,
  label,
}: {
  name: "Workflow" | "UserRoundPlus" | "Terminal" | "ListTodo" | "Target";
  label: string | undefined;
}) {
  return (
    <Icon
      name={name}
      aria-label={label}
      className="size-3.5 shrink-0 animate-pulse text-muted-foreground/60"
    />
  );
}
