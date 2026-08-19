import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import {
  CONTROL_HOVER_TRANSITION,
  LIST_HOVER_TRANSITION,
} from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import {
  PROJECT_SORT_LABELS,
  PROJECT_SORT_MODES,
  type ProjectSort,
} from "../preferences";

/**
 * The sidebar's own sort control, sitting above the list where the ordering it
 * changes is visible. A ghost trigger: it reads as a label until you hover it,
 * so it does not compete with BB's New-thread button and search field.
 */
export function SortMenu({
  value,
  onChange,
}: {
  value: ProjectSort;
  onChange: (next: ProjectSort) => Promise<void>;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          "flex h-7 min-w-0 items-center gap-1 rounded-md px-1.5 text-2xs font-medium",
          "max-md:pointer-coarse:h-9",
          "text-muted-foreground outline-none",
          CONTROL_HOVER_TRANSITION,
          "hover:bg-sidebar-accent hover:text-foreground",
          "focus-visible:ring-1 focus-visible:ring-ring",
          "data-[state=open]:bg-sidebar-accent data-[state=open]:text-foreground",
        )}
        aria-label={`Sort projects: ${PROJECT_SORT_LABELS[value]}`}
      >
        <Icon name="Sort" className="size-3.5 shrink-0" />
        <span className="truncate">{PROJECT_SORT_LABELS[value]}</span>
        <Icon name="ChevronDown" className="size-3 shrink-0" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 min-w-48 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <DropdownMenu.RadioGroup
            value={value}
            onValueChange={(next) => {
              void onChange(next as ProjectSort).catch(() =>
                toast.error("Could not change the sort order."),
              );
            }}
          >
            {PROJECT_SORT_MODES.map((mode) => (
              <DropdownMenu.RadioItem
                key={mode}
                value={mode}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none",
                  // A menu item is a control, and a coarse pointer needs a
                  // bigger one.
                  "min-h-6 max-md:pointer-coarse:min-h-9",
                  LIST_HOVER_TRANSITION,
                  "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                )}
              >
                <span className="flex size-3.5 items-center justify-center">
                  <DropdownMenu.ItemIndicator>
                    <Icon name="Check" className="size-3.5" />
                  </DropdownMenu.ItemIndicator>
                </span>
                {PROJECT_SORT_LABELS[mode]}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
