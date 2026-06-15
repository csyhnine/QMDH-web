import { useState } from "react";

import { api, type Asset, type Task } from "../../api";
import type { ShareConfirmState } from "./studioTypes";
import type { UseStudioGalleryActionsOptions } from "./studioGalleryActionsTypes";
import {
  buildShareConfirmState,
  galleryActionErrorMessage,
  removeTaskFromGalleryState,
  replaceGalleryAssetInState,
  replaceGalleryPreviewAsset,
} from "./studioGalleryActionUtils";

export type StudioGalleryActions = ReturnType<typeof useStudioGalleryActions>;

export function useStudioGalleryActions({
  historyFeedback,
  setGalleryPreview,
  setState,
}: UseStudioGalleryActionsOptions) {
  const [shareConfirmState, setShareConfirmState] = useState<ShareConfirmState | null>(null);

  function replaceAssetInState(updatedAsset: Asset) {
    setState((current) => replaceGalleryAssetInState(current, updatedAsset));
    setGalleryPreview((current) => replaceGalleryPreviewAsset(current, updatedAsset));
  }

  async function handleGalleryAction(action: "bookmark" | "share", taskId: number, assetId: number) {
    historyFeedback.setPendingAction(taskId, action);
    try {
      if (action === "bookmark") {
        const updatedAsset = await api.bookmarkAsset(assetId);
        replaceAssetInState(updatedAsset);
        historyFeedback.pushFeedback(
          taskId,
          "bookmark",
          "success",
          updatedAsset.is_bookmarked ? "已标记为重点历史。" : "已取消标记。"
        );
      } else {
        const result = await api.shareAsset(assetId, { confirmed: true });
        replaceAssetInState(result.asset);
        historyFeedback.pushFeedback(
          taskId,
          "share",
          "success",
          result.already_shared ? "这条内容已经在灵感库里。" : "已分享到灵感库。"
        );
      }
    } catch (error) {
      const message = galleryActionErrorMessage(error, "图库操作失败");
      historyFeedback.pushFeedback(taskId, action, "error", message);
      setState((current) => ({
        ...current,
        error: message,
      }));
    } finally {
      historyFeedback.setPendingAction(taskId, null);
    }
  }

  function openShareConfirm(task: Task, asset: Asset) {
    const result = buildShareConfirmState(task, asset);
    if (result.status === "already-shared") {
      historyFeedback.pushFeedback(task.id, "share", "info", "这条内容已经在灵感库里。");
      return;
    }
    if (result.status === "missing-media") {
      historyFeedback.pushFeedback(task.id, "share", "error", "这条记录没有可分享的文件。");
      return;
    }
    if (result.status === "ready") {
      setShareConfirmState(result.shareConfirmState);
    }
  }

  async function confirmShare() {
    if (!shareConfirmState) {
      return;
    }
    const { taskId, assetId } = shareConfirmState;
    setShareConfirmState(null);
    await handleGalleryAction("share", taskId, assetId);
  }

  async function deleteHistoryTask(task: Task) {
    if (!window.confirm("确定删除这条生成记录？")) {
      return;
    }
    historyFeedback.setPendingAction(task.id, "delete");
    try {
      await api.deleteTask(task.id);
      historyFeedback.clearFeedback(task.id);
      setState((current) => removeTaskFromGalleryState(current, task.id));
      setGalleryPreview((current) => (current?.task.id === task.id ? null : current));
      historyFeedback.pushNotice("success", "已删除这条生成记录。");
    } catch (error) {
      const message = galleryActionErrorMessage(error, "删除失败");
      historyFeedback.pushFeedback(task.id, "delete", "error", message);
      setState((current) => ({
        ...current,
        error: message,
      }));
    } finally {
      historyFeedback.setPendingAction(task.id, null);
    }
  }

  return {
    bookmarkAsset: (taskId: number, assetId: number) => handleGalleryAction("bookmark", taskId, assetId),
    closeShareConfirm: () => setShareConfirmState(null),
    confirmShare,
    deleteHistoryTask,
    openShareConfirm,
    shareConfirmState,
  };
}
