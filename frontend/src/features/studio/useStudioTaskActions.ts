import { type FormEvent, useState } from "react";

import { api, type Asset, type Task } from "../../api";
import type { StudioFormState } from "./studioTypes";
import {
  applyTaskToComposerState,
  buildStudioFormFromTask,
  regenerateTaskFeedback,
} from "./studioTaskActionUtils";
import type { UseStudioTaskActionsOptions } from "./studioTaskActionsTypes";
import {
  buildUpscaleTaskCreatePayload,
  canUpscaleAsset,
  findUpscaleProvider,
} from "./studioUpscaleActions";
import { upscaleOptionsSummary, type UpscaleOptions } from "./studioUpscaleOptions";
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
  const [upscalingAssetKey, setUpscalingAssetKey] = useState<string | null>(null);
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

  async function upscaleAsset(task: Task, asset: Asset, options: UpscaleOptions) {
    if (!canUpscaleAsset(asset)) {
      historyFeedback.pushFeedback(task.id, "upscale", "error", "当前素材无法放大，请换一张图片重试。");
      return;
    }
    if (submissionInFlightRef.current) {
      historyFeedback.pushFeedback(task.id, "upscale", "info", "当前已有任务在提交，请稍候。");
      return;
    }

    const provider = findUpscaleProvider(providers);
    if (!provider) {
      historyFeedback.pushFeedback(
        task.id,
        "upscale",
        "error",
        "未配置高清放大服务，请先在设置中心完成接入。"
      );
      return;
    }

    const assetKey = `${task.id}:${asset.id}`;
    setUpscalingAssetKey(assetKey);
    historyFeedback.setPendingAction(task.id, "upscale");
    try {
      await api.createTask(
        buildUpscaleTaskCreatePayload({
          asset,
          options,
          projectCode: studioForm.projectCode,
          provider,
          sourceTask: task,
        })
      );
      hasAutoPositionedRef.current = false;
      await loadData({ force: true });
      historyFeedback.pushFeedback(task.id, "upscale", "success", `已提交高清放大任务（${upscaleOptionsSummary(options)}）。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "高清放大提交失败，请稍后重试。";
      historyFeedback.pushFeedback(task.id, "upscale", "error", message);
    } finally {
      setUpscalingAssetKey((current) => (current === assetKey ? null : current));
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
    upscaleAsset,
    upscalingAssetKey,
  };
}
