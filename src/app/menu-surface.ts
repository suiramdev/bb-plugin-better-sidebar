import { LIST_HOVER_TRANSITION } from "@/components/ui/motion";

/**
 * The popup surface BB's own menus use, vendored from `shared-ui`'s
 * `dropdown-menu.tsx`.
 *
 * These were previously this plugin's own approximations — `rounded-lg`,
 * `min-w-44`, `text-sm` items on `py-1.5`, highlighted with `bg-accent`. Every
 * one of those is a step away from the host: BB's menus are `rounded-md`,
 * narrow until their content widens them, and their items are `text-xs` on a
 * 5px vertical rhythm highlighted with the shared `state-hover` token, which is
 * the same tint its rows and tabs use. A plugin menu opening next to a host
 * menu had to look like the same menu.
 */
export const MENU_CONTENT_CLASS =
  "z-50 min-w-28 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md";

/**
 * `focus:` and `data-[highlighted]:` both: Radix moves real DOM focus onto the
 * highlighted item, and the host styles the focus state, but keyboard-only
 * highlight passes through the data attribute on some primitives. Naming both
 * costs nothing and cannot leave an item unhighlighted.
 */
const MENU_ITEM_NEUTRAL_STATE_CLASS =
  "focus:bg-state-hover focus:text-foreground data-[highlighted]:bg-state-hover data-[highlighted]:text-foreground";

const MENU_ITEM_DESTRUCTIVE_STATE_CLASS =
  "text-destructive focus:bg-destructive/15 focus:text-destructive data-[highlighted]:bg-destructive/15 data-[highlighted]:text-destructive";

const MENU_ITEM_BASE_CLASS = [
  "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-[0.3125rem] text-xs outline-none",
  "[&>svg]:size-4 [&>svg]:shrink-0",
  // A menu item is a control, and a coarse pointer needs a bigger one. The
  // host reaches the same target size through its own touch branch; a floor
  // gets a plugin there without shipping a second component.
  "max-md:pointer-coarse:min-h-9",
  // The pointer is already on the item; a fade would only lag behind it.
  LIST_HOVER_TRANSITION,
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
].join(" ");

export function menuItemClass(destructive = false): string {
  return `${MENU_ITEM_BASE_CLASS} ${
    destructive
      ? MENU_ITEM_DESTRUCTIVE_STATE_CLASS
      : MENU_ITEM_NEUTRAL_STATE_CLASS
  }`;
}

/** Full-bleed by a padding step, so the rule spans the menu, not the text. */
export const MENU_SEPARATOR_CLASS = "-mx-1 my-1 h-px bg-muted";

/** A non-interactive caption above a group, e.g. "5 threads selected". */
export const MENU_LABEL_CLASS =
  "px-2 py-1.5 text-xs font-medium text-muted-foreground";

/** Decorative glyphs beside a label: present, but never louder than it. */
export const MENU_ICON_CLASS = "size-4 shrink-0 text-subtle-foreground";

export const MENU_ICON_DESTRUCTIVE_CLASS = "size-4 shrink-0 text-destructive";
