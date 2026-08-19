import { useCallback, useEffect, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProjectSummary, rpcContract } from "../contract";
import { IconEditor } from "./IconEditor";
import { ProjectIcon } from "./ProjectIcon";

/**
 * The plugin's settings page section: every project, its icon, and the editor.
 *
 * The feature toggles above it are declarative settings the host renders, so
 * this section only owns what a form cannot express — per-project icons.
 */
export function SettingsSection() {
  const rpc = useRpc<typeof rpcContract>();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(() => {
    void rpc
      .call("overview")
      .then((result) => {
        setProjects(result.projects);
        setError(null);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Could not load projects."),
      );
  }, [rpc]);

  useEffect(load, [load]);

  const editingProject = projects?.find((project) => project.id === editing) ?? null;

  if (error !== null) {
    return (
      <p role="status" className="text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (projects === null) {
    return <p className="text-sm text-muted-foreground">Loading projects…</p>;
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {projects.map((project) => (
          <li key={project.id} className="flex items-center gap-3 px-3 py-2">
            <ProjectIcon
              name={project.name}
              icon={project.icon}
              className="size-6 rounded-md"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{project.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {summarize(project)}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditing(project.id)}
            >
              Change
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Project icon</DialogTitle>
          </DialogHeader>
          {editingProject === null ? null : (
            <IconEditor
              projectId={editingProject.id}
              projectName={editingProject.name}
              gitRemoteUrl={editingProject.gitRemoteUrl}
              icon={editingProject.icon}
              onChanged={load}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function summarize(project: ProjectSummary): string {
  if (project.icon.error !== null) return project.icon.error;
  switch (project.icon.mode) {
    case "upload":
      return "Uploaded icon";
    case "url":
      return project.icon.sourceUrl ?? "Fetched from a URL";
    case "none":
      return "No icon";
    default:
      return project.gitRemoteUrl ?? "No git remote";
  }
}
