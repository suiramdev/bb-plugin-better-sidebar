import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { CONTROL_HOVER_TRANSITION } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

/**
* Adds a project from a folder the user picks. It sits opposite the sort
* control, at the far right of the same row: the two things you can do to the
* project list live on the line above it.
*
* The picker is the host's native dialog, so this button owns no form — it
* only reports what came back.
*/
export function AddProjectButton({
  onAdd,
}: {
  /** Resolves to the new project's id, or null when the user cancelled. */
  onAdd: () => Promise<string | null>;
}) {
  const [isAdding, setIsAdding] = useState(false);

  return (
    <button
      type="button"
      // A second dialog while one is open would be ignored by the host and
      // confusing here.
      disabled={isAdding}
      onClick={() => {
        setIsAdding(true);
        void onAdd()
          .catch(() => {
            toast.error("Could not add the project.");
            return null;
          })
          .finally(() => setIsAdding(false));
      }}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md",
        "max-md:pointer-coarse:size-9",
        "text-muted-foreground outline-none",
        CONTROL_HOVER_TRANSITION,
        "hover:bg-sidebar-accent hover:text-foreground",
        "focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
      )}
      aria-label="Add a project"
      title="Add a project"
    >
      <Icon
        name={isAdding ? "Loading" : "FolderPlus"}
        // The disabled state is already a static cue; the spin is only there to
        // say the folder picker is the host's, not a frozen button.
        className={cn(
          "size-3.5 shrink-0",
          isAdding && "motion-safe:animate-spin",
        )}
      />
    </button>
  );
}
