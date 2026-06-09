import { type FormEvent, useState } from "react";

import { type Asset, type Task } from "../../api";
import type { StudioFormState } from "./studioTypes";
import {
  applyTaskToComposerState,
  buildStudioFormFromTask,
  regenerateTaskFeedback,
} from "./studioTaskActionUtils";
import type { UseStudioTaskActionsOptions } from "./studioTaskActionsTypes";
import { useStudioTaskSubmission } from "./useStudioTaskSubmission";

export type StudioTaskActionsState = ReturnType<typeof useStudioTaskActions>;

export function useStudioTaskActions({
  composerToolbarRef,
  hasAutoPositionedRef,
  historyFeedback,
  loadData,
  providers,
  referenceUpload,
  setActiveComposerMenu,
  setComposerCollapsed,
  setState,
  setStudioForm,
  setSubmissionTracker,
  setSubmitting,
  studioForm,
  studioTemplates,
  submissionInFlightRef,
}: UseStudioTaskActionsOptions) {
  const [regeneratingTaskId, setRegeneratingTaskId] = useState<number | null>(null);
  const { submitStudioTask } = useStudioTaskSubmission({
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
    uploadingReference: referenceUpload.uploadingReference,
  });

  function applyTaskToComposer(task: Task, asset?: Asset): StudioFormState {
    return applyTaskToComposerState({
      asset,
      buildUploadsFromPaths: referenceUpload.buildUploadsFromPaths,
      composerToolbarRef,
      providers,
      replaceReferenceUploads: referenceUpload.replaceReferenceUploads,
      setActiveComposerMenu,
      setComposerCollapsed,
      setStudioForm,
      studioForm,
      task,
    });
  }

  async function regenerateTask(task: Task, asset?: Asset) {
    if (submissionInFlightRef.current) {
      historyFeedback.pushFeedback(task.id, "reuse", "info", "当前已有任务在提交，请稍候。");
      return;
    }
    const { nextForm } = buildStudioFormFromTask({
      asset,
      buildUploadsFromPaths: referenceUpload.buildUploadsFromPaths,
      providers,
      studioForm,
      task,
    });
    setRegeneratingTaskId(task.id);
    historyFeedback.setPendingAction(task.id, "reuse");
    try {
      const submitted = await submitStudioTask(nextForm);
      const feedback = regenerateTaskFeedback(submitted);
      historyFeedback.pushFeedback(task.id, "reuse", feedback.tone, feedback.message);
    } finally {
      setRegeneratingTaskId((current) => (current === task.id ? null : current));
      historyFeedback.setPendingAction(task.id, null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitStudioTask(studioForm);
  }

  return {
    applyTaskToComposer,
    handleSubmit,
    regeneratingTaskId,
    regenerateTask,
    submitStudioTask,
  };
}
