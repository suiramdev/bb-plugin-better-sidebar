/**
 * Deleting a project is the one action in this sidebar that destroys something
 * BB cannot give back, and it sits in the same menu as "Set project icon…". So
 * it is confirmed twice: once for the intent, once for the consequence, with
 * the destructive button appearing only on the second screen. Nothing here
 * calls the backend until the last click.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function DeleteProjectDialog({
  projectName,
  threadCount,
  onCancel,
  onConfirm,
}: {
  projectName: string;
  threadCount: number;
  onCancel: () => void;
  /** Rejects on failure; the dialog stays open so the error is not silent. */
  onConfirm: () => Promise<void>;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const threads =
    threadCount === 0
      ? "It has no threads."
      : `Its ${threadCount === 1 ? "thread" : `${threadCount} threads`} will be deleted with it.`;

  if (!isConfirming) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Delete {projectName}?</DialogTitle>
          <DialogDescription>
            {`${threads} Your files on disk are not touched — this removes the project from BB.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsConfirming(true)}
          >
            Continue
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>This cannot be undone</DialogTitle>
        <DialogDescription>
          {`Deleting ${projectName} is permanent. There is no undo and no trash to restore it from.`}
        </DialogDescription>
      </DialogHeader>
      {error === null ? null : (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          disabled={isDeleting}
          // Back, not just Cancel: a second thought is not the same as a
          // mis-click, and the first screen is where it belongs.
          onClick={() => {
            setError(null);
            setIsConfirming(false);
          }}
        >
          Back
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={isDeleting}
          onClick={() => {
            setIsDeleting(true);
            setError(null);
            void onConfirm()
              .catch(() => {
                setError("Could not delete the project.");
              })
              .finally(() => setIsDeleting(false));
          }}
        >
          {isDeleting ? "Deleting…" : `Delete ${projectName}`}
        </Button>
      </div>
    </>
  );
}
