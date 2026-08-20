import type { PluginSidebarThreadIndicator } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { COARSE_POINTER_ICON_SIZE_CLASS } from "@/components/ui/coarse-pointer-sizing";
import { cn } from "@/lib/utils";
import {
  SIDEBAR_SUCCESS_STATUS_DOT_CLASS,
  SIDEBAR_WORKING_STATUS_COLOR_CLASS,
} from "./sidebarRowClasses";

/**
 * BB paints a live thread with `animate-shine-icon`: a bright band sweeping
 * across the glyph as a mask, on a 2.6s cycle. It is a host class, not a
 * utility this bundle compiles, and where the host is not present the glyph
 * simply sits still — the icon and its label were always the signal, the sweep
 * only emphasis.
 *
 * The host's own rule pauses the sweep inside `[inert]` and `aria-hidden`
 * subtrees, so a closed drawer full of working threads stops repainting. That
 * comes free with the class and could not be reproduced from here.
 */
const SHINE = "animate-shine-icon";

/**
 * The status glyph for one row, in BB's own vocabulary and at BB's own weights:
 * the red circle-x for a failure, a question mark for a raised hand, a spinner
 * for the runtime, a shining glyph naming whichever kind of work is running,
 * and a small neutral dot for a finished thread nobody has read.
 *
 * The working states are deliberately quiet — `text-muted-foreground/50` under
 * a moving highlight — because in BB's sidebar motion is what says "running",
 * not colour. Only a failure is allowed to be loud.
 *
 * An unrecognized indicator draws nothing on purpose: BB adds kinds over time,
 * and a sidebar built today must degrade rather than throw.
 */
export function StatusGlyph({
  indicator,
  label,
}: {
  indicator: PluginSidebarThreadIndicator;
  label: string | null;
}) {
  const aria = label ?? undefined;

  switch (indicator) {
    case "unread-error":
      return (
        <Icon
          name="CircleX"
          aria-label={aria}
          className={cn("text-destructive", COARSE_POINTER_ICON_SIZE_CLASS)}
        />
      );
    case "waiting-for-input":
      return (
        <Icon
          name="CircleQuestion"
          aria-label={aria}
          className={cn(
            "text-muted-foreground/75",
            COARSE_POINTER_ICON_SIZE_CLASS,
          )}
        />
      );
    case "runtime":
      return (
        <Icon
          name="Loading"
          aria-label={aria}
          className={cn(
            "motion-safe:animate-spin",
            SIDEBAR_WORKING_STATUS_COLOR_CLASS,
            COARSE_POINTER_ICON_SIZE_CLASS,
          )}
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
    case "working-draft":
      // A draft the agent is still working on: the same pencil, shining.
      return (
        <Icon
          name="Edit"
          aria-label={aria}
          className={cn(
            "pointer-events-none shrink-0",
            COARSE_POINTER_ICON_SIZE_CLASS,
            SHINE,
            SIDEBAR_WORKING_STATUS_COLOR_CLASS,
          )}
        />
      );
    case "draft":
      return (
        <Icon
          name="Edit"
          aria-label={aria}
          className={cn(
            "pointer-events-none shrink-0 text-muted-foreground",
            COARSE_POINTER_ICON_SIZE_CLASS,
          )}
        />
      );
    case "unread-success":
      // A dot, not a coloured one: BB marks "done and unread" with a neutral
      // mark and lets the unread title weight carry the emphasis.
      return (
        <span aria-label={aria} className={SIDEBAR_SUCCESS_STATUS_DOT_CLASS} />
      );
    default:
      return null;
  }
}

/** One of the several kinds of running work, all drawn the same way. */
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
      className={cn(
        SHINE,
        SIDEBAR_WORKING_STATUS_COLOR_CLASS,
        COARSE_POINTER_ICON_SIZE_CLASS,
      )}
    />
  );
}
