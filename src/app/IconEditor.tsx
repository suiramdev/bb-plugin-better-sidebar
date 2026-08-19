import { useEffect, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { rpcContract } from "../contract";
import type { PublicIcon } from "../contract";
import type { IconMode } from "../icon-record";
import { ProjectIcon } from "./ProjectIcon";
import { rasterizeToIconDataUrl } from "./rasterize";
import { announceIconsChanged } from "./favicon-script";

const MODE_LABELS: Record<IconMode, string> = {
  auto: "From the repository",
  url: "From a URL",
  upload: "Upload",
  none: "No icon",
};

const ORIGIN_LABELS: Record<string, string> = {
  "github-avatar": "GitHub account avatar",
  "gitlab-avatar": "GitLab project avatar",
  "host-favicon": "git host favicon",
  url: "fetched URL",
  upload: "uploaded file",
};

/**
 * The one place a project's icon is chosen, shared by the sidebar's project
 * menu and the plugin's settings page.
 *
 * Uploads are rasterized here (see rasterize.ts) and URLs are fetched by the
 * backend, which is what keeps a private forge behind a VPN working and makes
 * CORS irrelevant.
 */
export function IconEditor({
  projectId,
  projectName,
  gitRemoteUrl,
  icon,
  onChanged,
}: {
  projectId: string;
  projectName: string;
  gitRemoteUrl: string | null;
  icon: PublicIcon | undefined;
  onChanged: (icon: PublicIcon) => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [mode, setMode] = useState<IconMode>(icon?.mode ?? "auto");
  const [url, setUrl] = useState(icon?.sourceUrl ?? "");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    setMode(icon?.mode ?? "auto");
    setUrl(icon?.sourceUrl ?? "");
  }, [icon?.mode, icon?.sourceUrl]);

  const commit = async (
    input: Parameters<typeof rpc.call<"setIcon">>[1],
  ): Promise<void> => {
    setIsBusy(true);
    try {
      const { icon: next } = await rpc.call("setIcon", input);
      onChanged(next);
      announceIconsChanged();
      if (next.error !== null) toast.error(next.error);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the icon.");
    } finally {
      setIsBusy(false);
    }
  };

  const refresh = async (): Promise<void> => {
    setIsBusy(true);
    try {
      const { icon: next } = await rpc.call("refreshIcon", { projectId });
      onChanged(next);
      announceIconsChanged();
      toast.success(next.dataUrl === null ? "No icon found." : "Icon refreshed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh.");
    } finally {
      setIsBusy(false);
    }
  };

  const upload = async (file: File): Promise<void> => {
    setIsBusy(true);
    try {
      const dataUrl = await rasterizeToIconDataUrl(file);
      await commit({ projectId, mode: "upload", dataUrl });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that file.");
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ProjectIcon name={projectName} icon={icon} className="size-8 rounded-md" />
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">{projectName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {describeIcon(icon, gitRemoteUrl)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon source">
        {(Object.keys(MODE_LABELS) as IconMode[]).map((candidate) => (
          <Button
            key={candidate}
            type="button"
            size="sm"
            role="radio"
            aria-checked={mode === candidate}
            variant={mode === candidate ? "secondary" : "ghost"}
            className={cn("h-7 text-xs", mode === candidate && "ring-1 ring-border")}
            disabled={isBusy}
            onClick={() => {
              setMode(candidate);
              // Auto and none need nothing more from the user, so they apply on
              // the spot; url and upload wait for their input.
              if (candidate === "auto" || candidate === "none") {
                void commit({ projectId, mode: candidate });
              }
            }}
          >
            {MODE_LABELS[candidate]}
          </Button>
        ))}
      </div>

      {mode === "url" ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = url.trim();
            if (trimmed === "") {
              toast.error("Enter the URL of an image.");
              return;
            }
            void commit({ projectId, mode: "url", url: trimmed });
          }}
        >
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/icon.png"
            aria-label="Icon URL"
            className="h-8 text-xs"
            disabled={isBusy}
          />
          <Button type="submit" size="sm" className="h-8" disabled={isBusy}>
            Fetch
          </Button>
        </form>
      ) : null}

      {mode === "upload" ? (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Icon name="FileAttachment" className="size-4" />
          <span>Choose an image (resized to 128px)</span>
          <input
            type="file"
            accept="image/*"
            aria-label="Icon file"
            className="sr-only"
            disabled={isBusy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file !== undefined) void upload(file);
            }}
          />
        </label>
      ) : null}

      {mode === "auto" || mode === "url" ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          disabled={isBusy}
          onClick={() => void refresh()}
        >
          <Icon name="ArrowReloadHorizontal" className="mr-1.5 size-3.5" />
          Re-fetch now
        </Button>
      ) : null}

      {icon?.error != null ? (
        <p role="status" className="text-xs text-destructive">
          {icon.error}
        </p>
      ) : null}
    </div>
  );
}

function describeIcon(
  icon: PublicIcon | undefined,
  gitRemoteUrl: string | null,
): string {
  if (icon?.dataUrl != null) {
    const origin = icon.origin === null ? "unknown source" : ORIGIN_LABELS[icon.origin];
    return `Showing the ${origin}.`;
  }
  if (icon?.isResolving === true) return "Looking for an icon…";
  if (icon?.mode === "none") return "No icon.";
  if (gitRemoteUrl === null) return "No git remote to resolve an icon from.";
  return "No icon found yet.";
}
