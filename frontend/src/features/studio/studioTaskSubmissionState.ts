import type { Dispatch, SetStateAction } from "react";

import type { Provider } from "../../api";
import type { LoadState, StudioFormState, SubmissionTracker } from "./studioTypes";

type MutableRef<T> = {
  current: T;
};

type SyncRequestedProviderOptions = {
  form: StudioFormState;
  provider: Provider;
  setStudioForm: Dispatch<SetStateAction<StudioFormState>>;
};

type BeginTaskSubmissionOptions = {
  setSubmitting: Dispatch<SetStateAction<boolean>>;
  submissionInFlightRef: MutableRef<boolean>;
};

type MarkTaskSubmissionFailedOptions = {
  error: unknown;
  setState: Dispatch<SetStateAction<LoadState>>;
  setSubmissionTracker: Dispatch<SetStateAction<SubmissionTracker | null>>;
};

export function syncRequestedProviderForSubmission({
  form,
  provider,
  setStudioForm,
}: SyncRequestedProviderOptions) {
  if (provider.provider_name === form.requestedProvider) {
    return;
  }

  setStudioForm((current) => ({
    ...current,
    requestedProvider: provider.provider_name,
  }));
}

export function beginTaskSubmission({
  setSubmitting,
  submissionInFlightRef,
}: BeginTaskSubmissionOptions): boolean {
  if (submissionInFlightRef.current) {
    return false;
  }

  submissionInFlightRef.current = true;
  setSubmitting(true);
  return true;
}

export function markTaskSubmissionFailed({
  error,
  setState,
  setSubmissionTracker,
}: MarkTaskSubmissionFailedOptions) {
  setSubmissionTracker((current) =>
    current
      ? {
          ...current,
          stage: "failed",
        }
      : current
  );
  setState((current) => ({
    ...current,
    error: error instanceof Error ? error.message : "提交任务失败",
  }));
}

export function finishTaskSubmission({
  setSubmitting,
  submissionInFlightRef,
}: BeginTaskSubmissionOptions) {
  submissionInFlightRef.current = false;
  setSubmitting(false);
}
