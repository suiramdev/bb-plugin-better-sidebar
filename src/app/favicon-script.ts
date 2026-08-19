/**
 * The content script that keeps the tab favicon in step with the project in
 * view. Registered with `app.contentScripts.register`, because the favicon has
 * to follow every route — including Settings and the compact drawer, where no
 * sidebar component is mounted.
 *
 * It reads the project from the URL, which is where BB's own route state reads
 * it from (`/projects/:projectId/...`), and it patches `history` only to learn
 * when that URL changed. Both patches are removed on dispose.
 */
import { FaviconController, projectIdFromPath } from "./favicon";

/**
 * Dispatched on `window` by this plugin's own UI after an icon changes, so the
 * tab updates without waiting for the next navigation. Plugin realtime signals
 * are React-hook shaped, and a content script has no hooks.
 */
export const ICONS_CHANGED_EVENT = "better-sidebar:icons-changed";

export interface FaviconSyncOptions {
  pluginId: string;
  signal: AbortSignal;
  /** Injected in tests; defaults to the plugin's own rpc endpoint. */
  fetchFavicon?: (projectId: string) => Promise<string | null>;
}

async function callFaviconRpc(
  pluginId: string,
  projectId: string,
): Promise<string | null> {
  const response = await fetch(
    `/api/v1/plugins/${encodeURIComponent(pluginId)}/rpc/favicon`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId }),
    },
  );
  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    result?: { enabled?: boolean; dataUrl?: string | null };
  } | null;
  if (body?.ok !== true || body.result?.enabled !== true) return null;
  return body.result.dataUrl ?? null;
}

/**
 * Adapts one `<link>` to the controller's `{ href }` shape through the
 * attribute rather than the property, so restoring bb's favicon puts back
 * exactly the string bb wrote instead of an absolutized copy of it. Adapters
 * are memoized because the controller keys captured hrefs by object identity.
 */
function linkAdapters(): (element: Element | null) => { href: string } | null {
  const adapters = new WeakMap<Element, { href: string }>();
  return (element) => {
    if (element === null) return null;
    const existing = adapters.get(element);
    if (existing !== undefined) return existing;
    const adapter = {
      get href(): string {
        return element.getAttribute("href") ?? "";
      },
      set href(value: string) {
        element.setAttribute("href", value);
      },
    };
    adapters.set(element, adapter);
    return adapter;
  };
}

export function mountFaviconSync({
  pluginId,
  signal,
  fetchFavicon,
}: FaviconSyncOptions): () => void {
  const load = fetchFavicon ?? ((projectId) => callFaviconRpc(pluginId, projectId));
  const cache = new Map<string, string | null>();
  const adapterFor = linkAdapters();
  const elements = new Map<{ href: string }, Element>();
  const controller = new FaviconController({
    document: {
      getElementById: (id) => {
        const element = document.getElementById(id);
        const adapter = adapterFor(element);
        if (adapter !== null && element !== null) elements.set(adapter, element);
        return adapter;
      },
    },
    observe: (links, onChanged) => {
      const observer = new MutationObserver(onChanged);
      for (const link of links) {
        const element = elements.get(link);
        if (element !== undefined) {
          observer.observe(element, {
            attributes: true,
            attributeFilter: ["href"],
          });
        }
      }
      return () => observer.disconnect();
    },
  });

  let generation = 0;
  const sync = (): void => {
    const current = ++generation;
    const projectId = projectIdFromPath(window.location.pathname);
    if (projectId === null) {
      controller.apply(null);
      return;
    }
    if (cache.has(projectId)) {
      controller.apply(cache.get(projectId) ?? null);
      return;
    }
    void load(projectId)
      .then((dataUrl) => {
        cache.set(projectId, dataUrl);
        // A slow lookup must not paint a project the user already left.
        if (current === generation && !signal.aborted) controller.apply(dataUrl);
      })
      .catch(() => {
        // A failed lookup leaves bb's own favicon in place; the next
        // navigation retries.
        cache.delete(projectId);
      });
  };

  const onIconsChanged = (): void => {
    cache.clear();
    sync();
  };

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  const patch = (
    original: typeof history.pushState,
  ): typeof history.pushState =>
    function patched(this: History, ...args) {
      const result = original.apply(this, args);
      sync();
      return result;
    };
  history.pushState = patch(originalPushState);
  history.replaceState = patch(originalReplaceState);

  window.addEventListener("popstate", sync);
  window.addEventListener(ICONS_CHANGED_EVENT, onIconsChanged);
  sync();

  return () => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", sync);
    window.removeEventListener(ICONS_CHANGED_EVENT, onIconsChanged);
    controller.dispose();
  };
}

/** Tells every open surface in this window that an icon record changed. */
export function announceIconsChanged(): void {
  window.dispatchEvent(new CustomEvent(ICONS_CHANGED_EVENT));
}
