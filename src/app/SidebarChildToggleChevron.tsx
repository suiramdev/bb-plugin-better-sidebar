import { Icon } from "@/components/ui/icon";
import { LIST_HOVER_TRANSITION } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import {
    SIDEBAR_HOVER_ACTIONS_CLASS,
    SIDEBAR_HOVER_ACTIONS_MOBILE_ALWAYS_VALUE,
} from "./sidebarHoverActions";

/**
 * BB's disclosure caret, vendored from
 * `apps/app/src/components/sidebar/SidebarChildToggleChevron.tsx`.
 *
 * A right-pointing chevron that rotates a quarter turn when open — not a
 * down-chevron that rotates back — because that is the direction BB's own
 * sidebar reads in, and a list that disagreed with the rows above it would look
 * like a different product wedged into the same panel.
 *
 * It carries its own focus ring and hover fill, so it is a real control rather
 * than a decoration on top of the row's hit target.
 */
export function SidebarChildToggleChevron({
    isCollapsed,
    expandLabel,
    collapseLabel,
    onToggle,
    revealOnHover = false,
    className,
}: {
    isCollapsed: boolean;
    expandLabel: string;
    collapseLabel: string;
    onToggle: () => void;
    /** Hidden until the row is hovered or focused, the way a child caret is. */
    revealOnHover?: boolean;
    className?: string;
}) {
    return (
        <button
            type="button"
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? expandLabel : collapseLabel}
            data-sidebar-hover-actions-mobile={
                revealOnHover
                    ? SIDEBAR_HOVER_ACTIONS_MOBILE_ALWAYS_VALUE
                    : undefined
            }
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggle();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className={cn(
                revealOnHover
                    ? SIDEBAR_HOVER_ACTIONS_CLASS
                    : "pointer-events-auto",
                "relative z-10 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2",
                LIST_HOVER_TRANSITION,
                className,
            )}
        >
            <Icon
                name="ChevronRight"
                className={cn(
                    "size-3 motion-safe:transition-transform motion-safe:duration-150",
                    !isCollapsed && "rotate-90",
                )}
                aria-hidden
            />
        </button>
    );
}
