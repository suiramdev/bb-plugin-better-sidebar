import type { PublicIcon } from "../contract";
import { cn } from "@/lib/utils";

/** The letter shown while a project has no icon: its first character. */
export function projectMonogram(name: string): string {
  const first = [...name.trim()][0];
  return first === undefined ? "?" : first.toUpperCase();
}

/**
 * A project's icon, or a monogram tile when it has none.
 *
 * The tile is deliberately monochrome: it is drawn from theme tokens, so it
 * reads correctly in every BB palette instead of picking its own colors.
 */
export function ProjectIcon({
  name,
  icon,
  className,
}: {
  name: string;
  icon: PublicIcon | undefined;
  className?: string;
}) {
  const shared = cn("size-4 shrink-0 rounded-[4px]", className);
  if (icon?.dataUrl != null) {
    return (
      <img
        src={icon.dataUrl}
        alt=""
        aria-hidden
        className={cn(shared, "object-cover")}
        draggable={false}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        shared,
        "flex items-center justify-center bg-sidebar-accent text-2xs font-semibold text-muted-foreground",
      )}
    >
      {projectMonogram(name)}
    </span>
  );
}
