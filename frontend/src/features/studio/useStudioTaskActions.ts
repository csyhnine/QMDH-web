import { type FormEvent, useState } from "react";

import { api, type Asset, type Task } from "../../api";
import { useAuth } from "../../context/AuthContext";
import type { StudioFormState } from "./studioTypes";
import {
  applyTaskToComposerState,
  buildStudioFormFromTask,
  copyTaskToComposerFeedback,
  regenerateTaskFeedback,
  scrollComposerIntoView,
} from "./studioTaskActionUtils";
import type { UseStudioTaskActionsOptions } from "./studioTaskActionsTypes";
import { trackGenerationOutcome } from "./trackGenerationOutcome";
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
  pushLoadError,
}: UseStudioTaskActionsOptions) {
  const { isGuest } = useAuth();
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
  });

  function applyTaskToComposer(task: Task, asset?: Asset): StudioFormState {
    const nextForm = applyTaskToComposerState({
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
    trackGenerationOutcome(task.id, "applied_to_composer", { assetId: asset?.id });
    return nextForm;
  }

  function copyTaskToComposer(task: Task, asset?: Asset) {
    if (task.result["reference_image_history_incomplete"] === true) {
      historyFeedback.pushFeedback(task.id, "copy_to_composer", "error", "该历史任务的参考图记录不完整，请手动重新选择原图后提交。");
      return;
    }
    applyTaskToComposer(task, asset);
    const feedback = copyTaskToComposerFeedback();
    historyFeedback.pushFeedback(task.id, "copy_to_composer", feedback.tone, feedback.message);
  }

  async function regenerateTask(task: Task, asset?: Asset) {
    if (isGuest) {
      pushLoadError("访客模式无法提交生成任务，请先登录。");
      return;
    }
    if (submissionInFlightRef.current) {
      historyFeedback.pushFeedback(task.id, "reuse", "info", "当前已有任务在提交，请稍候。");
      return;
    }
    if (task.result["reference_image_history_incomplete"] === true) {
      historyFeedback.pushFeedback(task.id, "reuse", "error", "该历史任务的参考图记录不完整，请手动重新选择原图后提交。");
      return;
    }
    const { nextForm, nextUploads } = buildStudioFormFromTask({
      asset,
      buildUploadsFromPaths: referenceUpload.buildUploadsFromPaths,
      providers,
      studioForm,
      task,
    });
    setRegeneratingTaskId(task.id);
    historyFeedback.setPendingAction(task.id, "reuse");
    try {
      const submitted = await submitStudioTask({
        form: nextForm,
        referenceUploads: nextUploads,
        uploadingReference: false,
        updateComposer: false,
      });
      const feedback = regenerateTaskFeedback(submitted);
      historyFeedback.pushFeedback(task.id, "reuse", feedback.tone, feedback.message);
      if (submitted) {
        trackGenerationOutcome(task.id, "regenerated", { assetId: asset?.id });
      }
    } finally {
      setRegeneratingTaskId((current) => (current === task.id ? null : current));
      historyFeedback.setPendingAction(task.id, null);
    }
  }

  async function upscaleAsset(task: Task, asset: Asset, options: UpscaleOptions) {
    if (isGuest) {
      pushLoadError("访客模式无法提交生成任务，请先登录。");
      return;
    }
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

  function applyResultAsReference(task: Task, asset: Asset) {
    if (!canUpscaleAsset(asset)) {
      historyFeedback.pushFeedback(task.id, "use_reference", "error", "当前素材无法作为参考图。");
      return;
    }
    const result = referenceUpload.addReferenceFromStoragePath(asset.storage_path);
    historyFeedback.pushFeedback(
      task.id,
      "use_reference",
      result.ok ? "success" : "error",
      result.message
    );
    if (result.ok) {
      trackGenerationOutcome(task.id, "reused_as_reference", { assetId: asset.id });
      setActiveComposerMenu(null);
      window.requestAnimationFrame(() => {
        scrollComposerIntoView(composerToolbarRef, setComposerCollapsed);
      });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isGuest) {
      pushLoadError("访客模式无法提交生成任务，请先登录。");
      return;
    }
    await submitStudioTask({
      form: studioForm,
      referenceUploads: referenceUpload.referenceUploads,
      uploadingReference: referenceUpload.uploadingReference,
      updateComposer: true,
    });
  }

  return {
    applyResultAsReference,
    applyTaskToComposer,
    copyTaskToComposer,
    handleSubmit,
    regeneratingTaskId,
    regenerateTask,
    submitStudioTask,
    upscaleAsset,
    upscalingAssetKey,
  };
}
