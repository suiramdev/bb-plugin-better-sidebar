/**
 * Names of the host's hover-actions CSS contract, vendored from
 * `apps/app/src/components/ui/sidebar-hover-actions.ts` in get-bb/bb.
 *
 * These are not Tailwind utilities and this bundle compiles none of them. They
 * are plain classes the host defines in `theme.css` (`@layer components`), and
 * the rules are written against the class names alone — no host-only ancestor
 * selector — so a plugin row that opts in behaves exactly like a host row:
 * trailing actions fade in on hover or keyboard focus, the resting indicator
 * fades out under them, and the title reserves room so it truncates instead of
 * running beneath a button.
 *
 * Because the host owns them, a BB build that changes the treatment changes
 * this list too, which is the point: re-implementing the fade here would be a
 * copy that drifts.
 */

/** Marks the row whose hover/focus reveals the actions inside it. */
export const SIDEBAR_HOVER_ACTIONS_ROW_CLASS = "bb-sidebar-hover-actions-row";

/** The overlay itself: invisible and inert until its row is hovered/focused. */
export const SIDEBAR_HOVER_ACTIONS_CLASS = "bb-sidebar-hover-actions";

export const SIDEBAR_HOVER_ACTIONS_GAP_CLASS = "gap-0.5";

/*
 * The host's `bb-sidebar-hover-actions-inset` is deliberately not vendored.
 * It reserves one extra action width on hover, which a row needs only when its
 * overlay holds more buttons than the slot the resting indicator occupies.
 * This list's rows hold exactly one, so adopting it would shove every title
 * sideways on hover for nothing.
 */
/** The resting indicator, which fades out as the overlay fades in. */
export const SIDEBAR_HOVER_ACTIONS_FADE_CLASS = "bb-sidebar-hover-actions-fade";

export const SIDEBAR_HOVER_ACTIONS_MOBILE_ALWAYS_VALUE = "always";

/**
 * Low-emphasis chrome label, vendored from `chrome-style-tokens.ts`. It is what
 * keeps a project header from reading as content: one size down, normal weight,
 * and a subtle foreground diluted once more.
 */
export const CHROME_SECTION_LABEL_CLASS =
  "text-xs font-normal leading-5 text-subtle-foreground/75";
