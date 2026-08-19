/**
 * The browser tab favicon, driven by the project in view.
 *
 * BB owns two `<link rel="icon">` elements (`#favicon-32`, `#favicon-16`) and
 * rewrites their `href` whenever its own tint or unread badge changes. This
 * controller therefore does two things: it writes the project icon into those
 * links, and it watches them so a later BB write does not silently win. When a
 * project has no icon — or the feature is off — it restores the exact hrefs it
 * captured and stops watching, so BB's favicon behavior returns untouched.
 */

/** BB's own favicon links, in the order the document declares them. */
const FAVICON_LINK_IDS = ["favicon-32", "favicon-16"] as const;

/** The project route is the only place a project id appears in the URL. */
export function projectIdFromPath(pathname: string): string | null {
  const match = /^\/projects\/([^/?#]+)/.exec(pathname);
  if (match === null) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return match[1]!;
  }
}

export interface FaviconDocument {
  getElementById(id: string): { href: string } | null;
}

/**
 * Owns the favicon hrefs for one bb client. Deliberately synchronous and
 * DOM-only: fetching the icon and knowing which project is in view are the
 * caller's job, which keeps this testable and keeps the reassert loop tight.
 */
export class FaviconController {
  #document: FaviconDocument;
  #observe: (
    links: readonly { href: string }[],
    onChanged: () => void,
  ) => () => void;
  /** The hrefs BB had before this plugin touched anything. */
  #original = new Map<{ href: string }, string>();
  #desired: string | null = null;
  #stopObserving: (() => void) | null = null;
  #writing = false;

  constructor(options: {
    document: FaviconDocument;
    /**
     * Watches the links for foreign writes. Injected so the controller can be
     * driven by a MutationObserver in the app and by a manual trigger in tests.
     */
    observe: (
      links: readonly { href: string }[],
      onChanged: () => void,
    ) => () => void;
  }) {
    this.#document = options.document;
    this.#observe = options.observe;
  }

  #links(): { href: string }[] {
    return FAVICON_LINK_IDS.map((id) => this.#document.getElementById(id)).filter(
      (link): link is { href: string } => link !== null,
    );
  }

  /**
   * Shows `dataUrl` in the tab, or hands the favicon back to BB when it is
   * null. Idempotent: calling it with the current value writes nothing.
   */
  apply(dataUrl: string | null): void {
    if (dataUrl === null) {
      this.#desired = null;
      this.#restore();
      return;
    }
    const links = this.#links();
    if (links.length === 0) return;
    for (const link of links) {
      if (!this.#original.has(link)) this.#original.set(link, link.href);
    }
    this.#desired = dataUrl;
    this.#write();
    if (this.#stopObserving === null) {
      this.#stopObserving = this.#observe(links, () => this.#write());
    }
  }

  /** Restores BB's hrefs and stops watching. Safe to call more than once. */
  dispose(): void {
    this.#desired = null;
    this.#restore();
  }

  #write(): void {
    const desired = this.#desired;
    if (desired === null || this.#writing) return;
    this.#writing = true;
    try {
      for (const link of this.#links()) {
        if (link.href !== desired) link.href = desired;
      }
    } finally {
      this.#writing = false;
    }
  }

  #restore(): void {
    this.#stopObserving?.();
    this.#stopObserving = null;
    for (const [link, href] of this.#original) link.href = href;
    this.#original.clear();
  }
}
