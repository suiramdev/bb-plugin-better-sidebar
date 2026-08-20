import type { PublicIcon } from "../contract";
import { cn } from "@/lib/utils";

/** The letter shown while a project has no icon: its first character. */
export function projectMonogram(name: string): string {
 const first = [...name.trim()][0];
 return first === undefined ? "?" : first.toUpperCase();
}

/**
 * An inset hairline on every fetched avatar, so a white GitHub avatar does not
 * bleed into a light sidebar and a dark one does not dissolve into a dark one.
 *
 * It is drawn from the project's `border` token rather than a per-appearance
 * black/white pair: this bundle's `dark:` variant compiles to
 * `prefers-color-scheme`, which does not follow BB's own theme toggle, so a
 * hard-coded pair would be wrong in exactly the case it exists for.
 */
const IMAGE_HAIRLINE = "ring-1 ring-inset ring-border/60";
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
 // A 14px tile in a 16px slot: BB's leading-glyph column is `w-4`, and an
 // icon that filled it edge to edge would sit heavier than the caret and the
 // row glyphs it lines up with.
 const shared = cn("size-3.5 shrink-0 rounded-[3px]", className);
 if (icon?.dataUrl != null) {
  return (
   <img
    src={icon.dataUrl}
    alt=""
    aria-hidden
    className={cn(shared, "object-cover", IMAGE_HAIRLINE)}
    draggable={false}
   />
  );
 }
 return (
  <span
   aria-hidden
   className={cn(
    shared,
    // The monogram is chrome, so it is drawn in the chrome foreground the
    // project name beside it uses, one step up in weight to stay legible
    // at this size.
    "flex items-center justify-center bg-sidebar-accent text-[9px] font-semibold uppercase text-subtle-foreground",
   )}
  >
   {projectMonogram(name)}
  </span>
 );
}
