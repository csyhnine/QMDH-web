import { buildSubmissionProgress } from "./studioSubmissionProgress";
import type { LoadState, SubmissionTracker } from "./studioTypes";
export { buildStudioControllerResult } from "./studioControllerResult";

type BuildStudioSubmissionProgressOptions = {
  referenceUpload: { uploadingReference: boolean };
  state: Pick<LoadState, "tasks">;
  submissionTracker: SubmissionTracker | null;
  submitting: boolean;
};

export function selectedReferenceUploadProviderName({
  fallbackProviderName,
  selectedProvider,
}: {
  fallbackProviderName: string;
  selectedProvider: { display_name?: string | null; model_name?: string | null } | null | undefined;
}): string {
  return selectedProvider?.display_name ?? selectedProvider?.model_name ?? fallbackProviderName;
}

export function buildStudioControllerSubmissionProgress({
  referenceUpload,
  state,
  submissionTracker,
  submitting,
}: BuildStudioSubmissionProgressOptions) {
  return buildSubmissionProgress({
    submissionTracker,
    submitting,
    tasks: state.tasks,
    uploadingReference: referenceUpload.uploadingReference,
  });
}
