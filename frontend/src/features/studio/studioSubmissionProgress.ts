import type { Task } from "../../api";
import type { SubmissionTracker } from "./studioTypes";

type BuildSubmissionProgressOptions = {
  submissionTracker: SubmissionTracker | null;
  submitting: boolean;
  tasks: Task[];
  uploadingReference: boolean;
};

export function buildSubmissionProgress({
  submissionTracker,
  submitting,
  tasks,
  uploadingReference,
}: BuildSubmissionProgressOptions): SubmissionTracker | null {
  if (!submissionTracker) return null;

  const trackedSubmissionTask =
    submissionTracker.taskId !== null
      ? tasks.find((task) => task.id === submissionTracker.taskId) ?? null
      : null;

  return {
    ...submissionTracker,
    stage: uploadingReference
      ? "uploading_reference"
      : submitting
        ? "submitting"
        : trackedSubmissionTask?.status === "failed"
          ? "failed"
          : trackedSubmissionTask?.status === "completed"
            ? "completed"
            : trackedSubmissionTask?.status === "running"
              ? "running"
              : trackedSubmissionTask?.status === "pending"
                ? "pending"
                : submissionTracker.stage,
  };
}
