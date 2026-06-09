import type { Asset, Provider, Task } from "../../api";
import { isRuntimeImageProvider } from "./modelAdminUtils";
import { IMAGE_EDIT_WORKFLOW_KEY } from "./studioConstants";
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
      isRuntimeImageProvider(provider) &&
      provider.capabilities.some((capability) =>
        form.creationMode === "edit" ? capability === "image.edit" : capability === "image.generate"
      )
  );
  return (
    compatibleProviders.find((provider) => provider.provider_name === form.requestedProvider) ??
    compatibleProviders[0]
  );
}

export function buildStudioFormFromTask({
  asset,
  buildUploadsFromPaths,
  providers,
  studioForm,
  task,
}: BuildStudioFormFromTaskOptions): { nextForm: StudioFormState; nextUploads: ReferenceUploadItem[] } {
  const nextMode = task.workflow_key === IMAGE_EDIT_WORKFLOW_KEY ? "edit" : "generate";
  const referencePaths = taskReferenceImages(task);
  const nextUploads = buildUploadsFromPaths(referencePaths);
  const promptFromTask = taskResultString(task, "prompt") || taskResultString(task, "edit_prompt");
  const nextProvider =
    resolveStudioProviderForForm(providers, {
      ...studioForm,
      creationMode: nextMode,
      requestedProvider: task.requested_provider,
    })?.provider_name ?? studioForm.requestedProvider;

  return {
    nextForm: {
      ...studioForm,
      creationMode: nextMode,
      title: task.title,
      prompt: promptFromTask || asset?.prompt_text || studioForm.prompt,
      projectCode: task.project_code,
      requestedProvider: nextProvider,
      style: taskResultString(task, "style") || inferStyleFromAsset(asset, studioForm.style),
      aspectRatio: taskResultString(task, "aspect_ratio") || studioForm.aspectRatio,
      resolution: taskResultString(task, "resolution") || studioForm.resolution,
      imageCount: inferRequestedImageCount(task),
      deliverable: taskResultString(task, "deliverable") || studioForm.deliverable,
      notes: taskResultString(task, "prompt_supplement") || studioForm.notes,
      referenceImages: nextUploads.map((item) => item.storagePath),
    },
    nextUploads,
  };
}
