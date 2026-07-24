import type { Asset, Provider, Task } from "../../api";
import { isGrokSkuId } from "./grokVideoUtils";
import { isRuntimeStudioProvider } from "./modelAdminUtils";
import {
  IMAGE_EDIT_WORKFLOW_KEY,
  IMAGE_UPSCALE_WORKFLOW_KEY,
  SOURCE_ASPECT_RATIO_LABEL,
  VIDEO_WORKFLOW_KEY,
  normalizeStudioResolution,
} from "./studioConstants";
import { inferStyleFromAsset } from "./studioAssetUtils";
import { inferRequestedImageCount, taskReferenceImages, taskResultString } from "./studioTaskUtils";
import type { ReferenceUploadItem, StudioFormState } from "./studioTypes";

type BuildStudioFormFromTaskOptions = {
  asset?: Asset;
  buildUploadsFromPaths: (paths: string[]) => ReferenceUploadItem[];
  providers: Provider[];
  studioForm: StudioFormState;
  task: Task;
};

export function resolveStudioProviderForForm(
  providers: Provider[],
  form: Pick<StudioFormState, "creationMode" | "requestedProvider">
): Provider | undefined {
  const compatibleProviders = providers.filter(
    (provider) =>
      isRuntimeStudioProvider(provider, form.creationMode) &&
      provider.capabilities.some((capability) => {
        if (form.creationMode === "video") return capability === "video.generate";
        if (form.creationMode === "edit") return capability === "image.edit";
        return capability === "image.generate";
      })
  );
  return (
    compatibleProviders.find((provider) => provider.provider_name === form.requestedProvider) ??
    compatibleProviders[0]
  );
}

function creationModeForTask(task: Task): StudioFormState["creationMode"] {
  if (task.workflow_key === VIDEO_WORKFLOW_KEY) return "video";
  if (task.workflow_key === IMAGE_EDIT_WORKFLOW_KEY) return "edit";
  if (task.workflow_key === IMAGE_UPSCALE_WORKFLOW_KEY) return "generate";
  return "generate";
}

export function buildStudioFormFromTask({
  asset,
  buildUploadsFromPaths,
  providers,
  studioForm,
  task,
}: BuildStudioFormFromTaskOptions): { nextForm: StudioFormState; nextUploads: ReferenceUploadItem[] } {
  const nextMode = creationModeForTask(task);
  const referencePaths = taskReferenceImages(task);
  const nextUploads = buildUploadsFromPaths(referencePaths);
  const promptFromTask =
    taskResultString(task, "prompt") ||
    taskResultString(task, "edit_prompt") ||
    taskResultString(task, "motion_prompt");
  const nextProvider =
    resolveStudioProviderForForm(providers, {
      ...studioForm,
      creationMode: nextMode,
      requestedProvider: task.requested_provider,
    })?.provider_name ?? studioForm.requestedProvider;

  const restoredGrokSku = taskResultString(task, "video_sku");
  const restoredAspectRatio = taskResultString(task, "aspect_ratio");
  const nextAspectRatio =
    nextMode === "edit"
      ? restoredAspectRatio || SOURCE_ASPECT_RATIO_LABEL
      : restoredAspectRatio || studioForm.aspectRatio;

  return {
    nextForm: {
      ...studioForm,
      creationMode: nextMode,
      title: task.title,
      prompt: promptFromTask || asset?.prompt_text || studioForm.prompt,
      projectCode: task.project_code,
      requestedProvider: nextProvider,
      style: taskResultString(task, "style") || inferStyleFromAsset(asset, studioForm.style),
      aspectRatio: nextAspectRatio,
      resolution: normalizeStudioResolution(taskResultString(task, "resolution") || studioForm.resolution),
      imageCount: nextMode === "video" ? 1 : inferRequestedImageCount(task),
      deliverable: taskResultString(task, "storyboard") || taskResultString(task, "deliverable") || studioForm.deliverable,
      notes: taskResultString(task, "motion_prompt") || taskResultString(task, "prompt_supplement") || studioForm.notes,
      referenceImages: nextUploads.map((item) => item.storagePath),
      grokVideoSku: isGrokSkuId(restoredGrokSku) ? restoredGrokSku : studioForm.grokVideoSku,
    },
    nextUploads,
  };
}
