import { useCallback } from "react";

import { api } from "../../api";
import type { StudioFormState } from "./studioTypes";
import { resolveStudioProviderForForm } from "./studioTaskActionUtils";
import {
  buildCreatedSubmissionTracker,
  buildPendingSubmissionTracker,
  buildTaskSubmissionPayload,
  trackSharedTemplateSubmitSuccess,
} from "./studioTaskSubmissionActions";
import {
  beginTaskSubmission,
  finishTaskSubmission,
  markTaskSubmissionFailed,
  syncRequestedProviderForSubmission,
} from "./studioTaskSubmissionState";
import type { UseStudioTaskSubmissionOptions } from "./studioTaskSubmissionTypes";
import { validateStudioTaskSubmission } from "./studioTaskSubmissionValidation";

export function useStudioTaskSubmission({
  hasAutoPositionedRef,
  loadData,
  providers,
  setActiveComposerMenu,
  setState,
  setStudioForm,
  setSubmissionTracker,
  setSubmitting,
  studioTemplates,
  submissionInFlightRef,
  uploadingReference,
}: UseStudioTaskSubmissionOptions) {
  const submitStudioTask = useCallback(async (form: StudioFormState): Promise<boolean> => {
    setActiveComposerMenu(null);
    studioTemplates.clearFeedback();

    const providerForSubmit = resolveStudioProviderForForm(providers, form);
    const validation = validateStudioTaskSubmission({
      form,
      providerForSubmit,
      setState,
      uploadingReference,
    });
    if (!validation.ok || !providerForSubmit) return false;

    syncRequestedProviderForSubmission({
      form,
      provider: providerForSubmit,
      setStudioForm,
    });
    if (!beginTaskSubmission({ setSubmitting, submissionInFlightRef })) {
      return false;
    }

    const submissionDraft = buildTaskSubmissionPayload({ form, provider: providerForSubmit });
    setSubmissionTracker(
      buildPendingSubmissionTracker({
        form,
        provider: providerForSubmit,
        referenceImageCount: validation.referenceImageCount,
        taskTitle: submissionDraft.taskTitle,
      })
    );

    try {
      const createdTask = await api.createTask(submissionDraft.payload);
      setSubmissionTracker(
        buildCreatedSubmissionTracker({
          form,
          provider: providerForSubmit,
          referenceImageCount: validation.referenceImageCount,
          task: createdTask,
          taskTitle: submissionDraft.taskTitle,
        })
      );
      trackSharedTemplateSubmitSuccess(studioTemplates.activeTemplate, api.trackPromptTemplateEvent);
      hasAutoPositionedRef.current = false;
      await loadData({ force: true });
      return true;
    } catch (error) {
      markTaskSubmissionFailed({ error, setState, setSubmissionTracker });
      return false;
    } finally {
      finishTaskSubmission({ setSubmitting, submissionInFlightRef });
    }
  }, [
    hasAutoPositionedRef,
    loadData,
    providers,
    setActiveComposerMenu,
    setState,
    setStudioForm,
    setSubmissionTracker,
    setSubmitting,
    studioTemplates,
    submissionInFlightRef,
    uploadingReference,
  ]);

  return {
    submitStudioTask,
  };
}
