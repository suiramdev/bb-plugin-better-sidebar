import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { CONTROL_HOVER_TRANSITION } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import {
  PROJECT_SORT_LABELS,
  PROJECT_SORT_MODES,
  type ProjectSort,
} from "../preferences";
import { MENU_CONTENT_CLASS, menuItemClass } from "./menu-surface";

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
          // The same chrome voice as a section label, so the control above the
          // list and the project headers under it read as one register.
          "flex h-7 min-w-0 items-center gap-1 rounded-md px-1.5 text-xs",
          "max-md:pointer-coarse:h-9",
          "text-subtle-foreground/75 outline-none ring-sidebar-ring",
          CONTROL_HOVER_TRANSITION,
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          "focus-visible:ring-2",
          "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
        )}
        aria-label={`Sort projects: ${PROJECT_SORT_LABELS[value]}`}
      >
        <Icon name="Sort" className="size-3.5 shrink-0" />
        <span className="truncate">{PROJECT_SORT_LABELS[value]}</span>
        <Icon name="ChevronDown" className="size-3 shrink-0" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className={cn(MENU_CONTENT_CLASS, "min-w-48")}
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
                className={cn(menuItemClass(), "cursor-pointer")}
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
