import type { Provider } from "../../api";
import { IMAGE_EDIT_WORKFLOW_KEY, IMAGE_WORKFLOW_KEY, VIDEO_WORKFLOW_KEY } from "./studioConstants";
import type { StudioFormState } from "./studioTypes";
import { clampImageCount } from "./studioAssetUtils";

export function buildImagePayload(form: StudioFormState, workflowKey: string): Record<string, unknown> {
  const referenceImages =
    workflowKey === IMAGE_EDIT_WORKFLOW_KEY ? form.referenceImages.filter((value) => Boolean(value)) : [];
  const primaryReferenceImage = referenceImages[0] ?? "";
  const payload: Record<string, unknown> = {
    style: form.style,
    aspect_ratio: form.aspectRatio,
    resolution: form.resolution,
    image_count: clampImageCount(form.imageCount),
    deliverable: form.deliverable,
    prompt_supplement: form.notes,
    reference_images: referenceImages,
    source_images: referenceImages,
    reference_image: primaryReferenceImage,
    source_image: primaryReferenceImage,
    prompt: form.prompt,
    edit_prompt: workflowKey === IMAGE_EDIT_WORKFLOW_KEY ? form.prompt : "",
  };

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return Boolean(value);
    })
  );
}

export function buildVideoPayload(form: StudioFormState): Record<string, unknown> {
  const referenceImages = form.referenceImages.filter((value) => Boolean(value));
  const aspectRatio = form.aspectRatio.trim();
  const payload: Record<string, unknown> = {
    prompt: form.prompt,
    motion_prompt: form.notes,
    storyboard: form.deliverable,
    prompt_supplement: form.notes,
    aspect_ratio: aspectRatio === "智能" ? "" : aspectRatio,
    resolution: form.resolution,
    source_images: referenceImages,
    reference_images: referenceImages,
    reference_image: referenceImages[0] ?? "",
    source_image: referenceImages[0] ?? "",
  };

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return Boolean(value);
    })
  );
}

export function getStudioWorkflowKeyForProvider(
  provider: Provider | undefined,
  creationMode: StudioFormState["creationMode"]
): string {
  if (creationMode === "video" && provider?.capabilities.includes("video.generate")) {
    return VIDEO_WORKFLOW_KEY;
  }
  if (creationMode === "edit" && provider?.capabilities.includes("image.edit")) return IMAGE_EDIT_WORKFLOW_KEY;
  if (provider?.capabilities.includes("image.generate")) return IMAGE_WORKFLOW_KEY;
  if (provider?.capabilities.includes("image.edit")) return IMAGE_EDIT_WORKFLOW_KEY;
  if (provider?.capabilities.includes("video.generate")) return VIDEO_WORKFLOW_KEY;
  return IMAGE_WORKFLOW_KEY;
}
