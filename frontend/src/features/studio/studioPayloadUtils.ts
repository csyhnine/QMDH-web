import type { Provider } from "../../api";
import {
  IMAGE_EDIT_WORKFLOW_KEY,
  IMAGE_WORKFLOW_KEY,
  VIDEO_WORKFLOW_KEY,
  isSourceAspectRatio,
  normalizeStudioResolution,
} from "./studioConstants";
import { resolveSelectedGrokSku, getSelectedGrokSkuConfig, isGrokHaodeyaProvider } from "./grokVideoUtils";
import {
  buildHappyHorseVideoPayload,
  isHappyHorseProvider,
} from "./happyHorseVideoUtils";
import {
  buildSeedance2VideoPayload,
  isSeedance2Provider,
} from "./seedanceVideoUtils";
import { resolveReferencePathsForProvider } from "./studioReferenceUtils";
import type { ReferenceUploadItem, StudioFormState } from "./studioTypes";
import { clampImageCount } from "./studioAssetUtils";

function imageAspectRatioForPayload(form: StudioFormState, workflowKey: string): string {
  // Image-edit default "遵循原图" omits aspect_ratio so upstream keeps source dimensions.
  // A fixed ratio selected in edit mode is still sent as an explicit override.
  if (workflowKey === IMAGE_EDIT_WORKFLOW_KEY && isSourceAspectRatio(form.aspectRatio)) {
    return "";
  }
  return form.aspectRatio;
}

function videoReferenceImages(
  form: StudioFormState,
  provider: Provider | undefined,
  referenceUploads?: ReferenceUploadItem[]
): string[] {
  const allowAsset = Boolean(provider && isSeedance2Provider(provider));
  if (referenceUploads && referenceUploads.length > 0) {
    return resolveReferencePathsForProvider(referenceUploads, { allowAssetProtocol: allowAsset });
  }
  // Fallback: form paths; strip Seedance asset:// for non-Seedance providers.
  return form.referenceImages.filter((value) => {
    if (!value) return false;
    if (!allowAsset && value.toLowerCase().startsWith("asset://")) return false;
    return true;
  });
}

export function buildImagePayload(form: StudioFormState, workflowKey: string): Record<string, unknown> {
  const isImageEdit = workflowKey === IMAGE_EDIT_WORKFLOW_KEY;
  const referenceImages = isImageEdit
    ? form.referenceImages.filter((value) => Boolean(value) && !value.toLowerCase().startsWith("asset://"))
    : [];
  const primaryReferenceImage = referenceImages[0] ?? "";
  const payload: Record<string, unknown> = {
    style: form.style,
    aspect_ratio: imageAspectRatioForPayload(form, workflowKey),
    resolution: normalizeStudioResolution(form.resolution),
    image_count: clampImageCount(form.imageCount),
    deliverable: form.deliverable,
    prompt_supplement: form.notes,
    reference_images: referenceImages,
    source_images: referenceImages,
    reference_image: primaryReferenceImage,
    source_image: primaryReferenceImage,
    prompt: form.prompt,
    edit_prompt: isImageEdit ? form.prompt : "",
  };

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return Boolean(value);
    })
  );
}

export function buildVideoPayload(
  form: StudioFormState,
  provider?: Provider,
  referenceUploads?: ReferenceUploadItem[]
): Record<string, unknown> {
  const referenceImages = videoReferenceImages(form, provider, referenceUploads);
  const aspectRatio = form.aspectRatio.trim();

  if (provider && isHappyHorseProvider(provider)) {
    return buildHappyHorseVideoPayload(form, provider, referenceImages);
  }

  if (provider && isSeedance2Provider(provider)) {
    return buildSeedance2VideoPayload(form, provider, referenceImages);
  }

  if (provider && isGrokHaodeyaProvider(provider)) {
    const videoSku = resolveSelectedGrokSku(form, provider);
    const skuConfig = getSelectedGrokSkuConfig(form, provider);
    if (!videoSku || !skuConfig) {
      throw new Error("请先选择 Grok 视频档位。");
    }
    const payload: Record<string, unknown> = {
      prompt: form.prompt,
      motion_prompt: form.notes,
      video_sku: videoSku,
      grok_video_mode: skuConfig.mode,
      duration: skuConfig.duration,
      resolution: "720p",
      aspect_ratio: aspectRatio === "智能" ? "16:9" : aspectRatio,
    };
    if (skuConfig.mode === "i2v") {
      if (referenceImages[0]) {
        payload.start_image_url = referenceImages[0];
        payload.reference_image = referenceImages[0];
      }
    } else if (referenceImages.length > 0) {
      payload.reference_images = referenceImages;
      payload.reference_image_urls = referenceImages;
    }
    return payload;
  }

  const payload: Record<string, unknown> = {
    prompt: form.prompt,
    motion_prompt: form.notes,
    storyboard: form.deliverable,
    prompt_supplement: form.notes,
    aspect_ratio: aspectRatio === "智能" ? "" : aspectRatio,
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
  if (creationMode === "edit") {
    return IMAGE_EDIT_WORKFLOW_KEY;
  }
  return IMAGE_WORKFLOW_KEY;
}
