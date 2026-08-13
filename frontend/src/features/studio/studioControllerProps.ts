import { publicProviderDisplayName } from "./modelAdminUtils";
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
  selectedProvider:
    | {
        provider_name?: string | null;
        display_name?: string | null;
        model_name?: string | null;
      }
    | null
    | undefined;
}): string {
  // Must be Admin provider_name (e.g. seedance-2), never the public display label.
  const providerName = selectedProvider?.provider_name?.trim();
  if (providerName) return providerName;
  return fallbackProviderName;
}

/** Human-readable label for upload trackers / UI copy. */
export function selectedReferenceUploadProviderLabel({
  fallbackProviderName,
  selectedProvider,
}: {
  fallbackProviderName: string;
  selectedProvider: { display_name?: string | null; model_name?: string | null; provider_name?: string | null } | null | undefined;
}): string {
  if (!selectedProvider) return fallbackProviderName;
  try {
    return publicProviderDisplayName(
      selectedProvider as Parameters<typeof publicProviderDisplayName>[0]
    );
  } catch {
    return selectedProvider.display_name || selectedProvider.model_name || fallbackProviderName;
  }
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
