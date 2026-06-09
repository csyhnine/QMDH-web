import type { Asset, Task } from "../../api";
import type { GalleryPreviewState, LoadState, ShareConfirmState } from "./studioTypes";
import {
  getRenderableUrl,
  taskDisplayTitle,
  taskReferenceImages,
} from "./studioUtils";

export function replaceGalleryAssetInState(
  current: LoadState,
  updatedAsset: Asset
): LoadState {
  return {
    ...current,
    assets: current.assets.map((asset) => (asset.id === updatedAsset.id ? updatedAsset : asset)),
  };
}

export function replaceGalleryPreviewAsset(
  current: GalleryPreviewState | null,
  updatedAsset: Asset
): GalleryPreviewState | null {
  return current && current.asset.id === updatedAsset.id
    ? {
        ...current,
        asset: updatedAsset,
      }
    : current;
}

export function removeTaskFromGalleryState(current: LoadState, taskId: number): LoadState {
  return {
    ...current,
    tasks: current.tasks.filter((item) => item.id !== taskId),
    assets: current.assets.filter((asset) => asset.source_task_id !== taskId),
  };
}

type ShareConfirmBuildResult =
  | {
      status: "ready";
      shareConfirmState: ShareConfirmState;
    }
  | {
      status: "already-shared" | "missing-source";
    };

export function buildShareConfirmState(task: Task, asset: Asset): ShareConfirmBuildResult {
  if (asset.is_shared_to_inspiration) {
    return { status: "already-shared" };
  }

  const sourceImagePath = taskReferenceImages(task)[0] ?? "";
  if (!sourceImagePath) {
    return { status: "missing-source" };
  }

  return {
    status: "ready",
    shareConfirmState: {
      taskId: task.id,
      assetId: asset.id,
      title: taskDisplayTitle(task, asset),
      sourceImagePath,
      finalImagePath: getRenderableUrl(asset) ?? asset.storage_path,
    },
  };
}

export function galleryActionErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
