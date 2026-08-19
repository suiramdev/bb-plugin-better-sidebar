/**
 * The frontend's view of the icon store: one rpc call per set of projects on
 * screen, refetched when the backend says a record changed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../contract";
import { ICONS_CHANNEL, type FeatureFlags, type PublicIcon } from "../contract";
import { announceIconsChanged } from "./favicon-script";

export const DEFAULT_FEATURES: FeatureFlags = {
  projectIcons: true,
  tabFavicon: true,
  showBranch: true,
  showPullRequests: false,
};

export interface SidebarIconsState {
  features: FeatureFlags;
  icons: Readonly<Record<string, PublicIcon>>;
  refresh: () => void;
}

export function useSidebarIcons(
  projectIds: readonly string[],
): SidebarIconsState {
  const rpc = useRpc<typeof rpcContract>();
  const [features, setFeatures] = useState<FeatureFlags>(DEFAULT_FEATURES);
  const [icons, setIcons] = useState<Record<string, PublicIcon>>({});
  // A stable key: the same projects in a different array order must not refetch.
  const key = useMemo(
    () => [...new Set(projectIds)].sort().join(","),
    [projectIds],
  );
  const latestRequest = useRef(0);

  const load = useCallback(() => {
    const request = ++latestRequest.current;
    const ids = key === "" ? [] : key.split(",");
    void rpc
      .call("sidebar", { projectIds: ids })
      .then((result) => {
        if (request !== latestRequest.current) return;
        setFeatures(result.features);
        setIcons(result.icons);
      })
      .catch(() => {
        // A failed read leaves the last good icons on screen; the next signal
        // or reconnect tries again.
      });
  }, [key, rpc]);

  useEffect(load, [load]);

  useRealtime(ICONS_CHANNEL, () => {
    load();
    // The tab favicon lives in a content script with no hooks of its own.
    announceIconsChanged();
  });

  // Plugin signals are ephemeral and never replayed, so a socket that dropped
  // may have missed a change: reconcile on every reconnect after the first.
  const connectionState = useRealtimeConnectionState();
  const hasConnected = useRef(false);
  useEffect(() => {
    if (connectionState !== "connected") return;
    if (hasConnected.current) load();
    hasConnected.current = true;
  }, [connectionState, load]);

  return { features, icons, refresh: load };
}
