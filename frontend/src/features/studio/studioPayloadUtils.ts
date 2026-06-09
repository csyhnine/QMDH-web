import type { Provider } from "../../api";
import { IMAGE_EDIT_WORKFLOW_KEY, IMAGE_WORKFLOW_KEY } from "./studioConstants";
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

export function getStudioWorkflowKeyForProvider(provider: Provider | undefined, creationMode: "generate" | "edit"): string {
  if (creationMode === "edit" && provider?.capabilities.includes("image.edit")) return IMAGE_EDIT_WORKFLOW_KEY;
  if (provider?.capabilities.includes("image.generate")) return IMAGE_WORKFLOW_KEY;
  if (provider?.capabilities.includes("image.edit")) return IMAGE_EDIT_WORKFLOW_KEY;
  return IMAGE_WORKFLOW_KEY;
}
