import { useCallback } from "react";

import { api } from "../../api";
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
import type { StudioTaskSubmissionInput, UseStudioTaskSubmissionOptions } from "./studioTaskSubmissionTypes";
import { resolveReferencePathsForProvider } from "./studioReferenceUtils";
import { isSeedance2Provider } from "./seedanceVideoUtils";
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
}: UseStudioTaskSubmissionOptions) {
  const submitStudioTask = useCallback(async (input: StudioTaskSubmissionInput): Promise<boolean> => {
    const sourceForm = input.form;
    const form = { ...sourceForm, referenceImages: [...sourceForm.referenceImages] };
    const referenceUploads = input.referenceUploads.map((item) => ({ ...item }));
    const { uploadingReference, updateComposer } = input;
    setActiveComposerMenu(null);
    studioTemplates.clearFeedback();

    const providerForSubmit = resolveStudioProviderForForm(providers, form);
    if (form.creationMode === "video" && referenceUploads.length > 0) {
      form.referenceImages = resolveReferencePathsForProvider(referenceUploads, {
        allowAssetProtocol: isSeedance2Provider(providerForSubmit),
      });
    }
    const validation = validateStudioTaskSubmission({
      form,
      providerForSubmit,
      setState,
      uploadingReference,
      referenceUploads,
    });
    if (!validation.ok || !providerForSubmit) return false;

    const composerForm = updateComposer
      ? syncRequestedProviderForSubmission({
          form: sourceForm,
          provider: providerForSubmit,
          setStudioForm,
        })
      : null;
    if (!beginTaskSubmission({ setSubmitting, submissionInFlightRef })) {
      return false;
    }

    const promptTemplates = [...studioTemplates.sharedTemplates, ...studioTemplates.customTemplates];
    const submissionDraft = buildTaskSubmissionPayload({
      form,
      provider: providerForSubmit,
      referenceUploads,
      templates: promptTemplates,
    });
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
      if (composerForm) {
        setStudioForm((current) =>
          current === composerForm ? { ...current, promptPolished: false } : current
        );
      }
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
  ]);

  return {
    submitStudioTask,
  };
}
