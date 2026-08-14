import type { Provider } from "../../api";
import { isMatchAspectRatio } from "./studioConstants";
import type { StudioFormState } from "./studioTypes";

export type Seedance2VideoSku =
  | "seedance-2-fast-720p-5s"
  | "seedance-2-fast-720p-10s"
  | "seedance-2-720p-5s"
  | "seedance-2-720p-10s"
  | "seedance-2-1080p-5s"
  | "seedance-2-1080p-10s";

export type Seedance2Quality = "fast720" | "720" | "1080";

export type Seedance2SkuConfig = {
  duration: 5 | 10;
  quality: Seedance2Quality;
  resolution: "720p" | "1080p";
  label: string;
  detail: string;
};

export const DEFAULT_SEEDANCE2_VIDEO_SKU: Seedance2VideoSku = "seedance-2-fast-720p-5s";

export const SEEDANCE2_VIDEO_SKU_CONFIG: Record<Seedance2VideoSku, Seedance2SkuConfig> = {
  "seedance-2-fast-720p-5s": {
    duration: 5,
    quality: "fast720",
    resolution: "720p",
    label: "720p 快速 · 5 秒",
    detail: "上游 Fast 720p",
  },
  "seedance-2-fast-720p-10s": {
    duration: 10,
    quality: "fast720",
    resolution: "720p",
    label: "720p 快速 · 10 秒",
    detail: "上游 Fast 720p",
  },
  "seedance-2-720p-5s": {
    duration: 5,
    quality: "720",
    resolution: "720p",
    label: "720p 标准 · 5 秒",
    detail: "上游标准 720p",
  },
  "seedance-2-720p-10s": {
    duration: 10,
    quality: "720",
    resolution: "720p",
    label: "720p 标准 · 10 秒",
    detail: "上游标准 720p",
  },
  "seedance-2-1080p-5s": {
    duration: 5,
    quality: "1080",
    resolution: "1080p",
    label: "1080p · 5 秒",
    detail: "上游标准 1080p",
  },
  "seedance-2-1080p-10s": {
    duration: 10,
    quality: "1080",
    resolution: "1080p",
    label: "1080p · 10 秒",
    detail: "上游标准 1080p",
  },
};

export const SEEDANCE2_VIDEO_SKU_OPTIONS = (
  Object.entries(SEEDANCE2_VIDEO_SKU_CONFIG) as [Seedance2VideoSku, Seedance2SkuConfig][]
).map(([id, config]) => ({
  id,
  label: config.label,
  detail: config.detail,
}));

const SEEDANCE2_SKU_SET = new Set<string>(Object.keys(SEEDANCE2_VIDEO_SKU_CONFIG));

/** Admin 统一 profile 的 placeholder model_name（仅这些算「统一模型」）。 */
const SEEDANCE2_UNIFIED_MODEL_NAMES = new Set<string>(["seedance-2", "haodeya_seedance"]);

/** 探测导入的裸名 / 半成品 SKU，有统一 profile 时应从 Studio 隐藏。 */
const SEEDANCE2_LEGACY_MODEL_NAMES = new Set<string>([
  ...SEEDANCE2_SKU_SET,
  "seedance-2-fast",
  "seedance-2-720p",
  "seedance-2-1080p",
  "seedance-2-mini",
  "seedance-2-mini-480p",
]);

function seedance2ModelName(provider: Provider): string {
  return provider.model_name.trim().toLowerCase();
}

/** Volc Ark Plan（doubao-seedance-2.0-*）与 Haodeya ToAPI Seedance 2 不是同一产品。 */
export function isVolcSeedancePlanProvider(provider: Provider): boolean {
  const model = seedance2ModelName(provider);
  if (model.startsWith("doubao-seedance") || model.includes("seedance-2.0")) return true;
  const identity = `${provider.provider_name} ${provider.model_name} ${provider.display_name || ""}`.toLowerCase();
  return identity.includes("doubao-seedance") || identity.includes("seedance-2.0");
}

export function isSeedance2SkuId(value: string | undefined | null): value is Seedance2VideoSku {
  return Boolean(value && SEEDANCE2_SKU_SET.has(value));
}

export function isSeedance2Provider(provider: Provider | undefined): boolean {
  if (!provider) return false;
  if (isSeedance2SkuId(provider.model_name)) return true;
  if (isVolcSeedancePlanProvider(provider)) return false;
  const model = seedance2ModelName(provider);
  const identity = `${provider.provider_name} ${provider.model_name} ${provider.display_name || ""}`.toLowerCase();
  if (identity.includes("happyhorse") || identity.includes("grok-imagine")) return false;
  if (SEEDANCE2_UNIFIED_MODEL_NAMES.has(model)) return true;
  if (SEEDANCE2_LEGACY_MODEL_NAMES.has(model)) return true;
  // Full ToAPI SKUs may appear with minor casing/spacing differences.
  if (model.startsWith("seedance-2-")) return true;
  if (identity.includes("haodeya_seedance")) return true;
  return identity.includes("haodeya") && identity.includes("seedance");
}

/** Unified Admin profile only — never treat bare discovery names as unified. */
export function isUnifiedSeedance2Provider(provider: Provider): boolean {
  if (!isSeedance2Provider(provider)) return false;
  const model = seedance2ModelName(provider);
  if (SEEDANCE2_UNIFIED_MODEL_NAMES.has(model)) return true;
  const providerName = provider.provider_name.trim().toLowerCase();
  return providerName.includes("haodeya_seedance") && !model.startsWith("seedance-2-") && !isSeedance2SkuId(provider.model_name);
}

export function isLegacySeedance2SkuProvider(provider: Provider): boolean {
  return isSeedance2Provider(provider) && !isUnifiedSeedance2Provider(provider);
}

/**
 * When a unified Seedance profile exists, hide:
 * - discovered per-SKU / bare Haodeya models
 * - Volc Plan names like doubao-seedance-2.0-fast (duplicate product surface in Studio)
 * Keep only the unified placeholder (`seedance-2` / haodeya_seedance).
 */
export function filterSeedance2VideoProviders(providers: Provider[]): Provider[] {
  const hasUnified = providers.some(isUnifiedSeedance2Provider);
  if (!hasUnified) return providers;
  return providers.filter(
    (provider) => !isLegacySeedance2SkuProvider(provider) && !isVolcSeedancePlanProvider(provider)
  );
}

export function resolveSelectedSeedance2Sku(
  form: StudioFormState,
  provider?: Provider
): Seedance2VideoSku | null {
  if (!provider || !isSeedance2Provider(provider)) return null;
  if (isSeedance2SkuId(form.grokVideoSku)) return form.grokVideoSku;
  if (isSeedance2SkuId(provider.model_name)) return provider.model_name;
  return DEFAULT_SEEDANCE2_VIDEO_SKU;
}

export function getSelectedSeedance2SkuConfig(
  form: StudioFormState,
  provider?: Provider
): Seedance2SkuConfig | null {
  const sku = resolveSelectedSeedance2Sku(form, provider);
  return sku ? SEEDANCE2_VIDEO_SKU_CONFIG[sku] : null;
}

export function seedance2VideoSkuForProviderSelection(
  provider: Provider | undefined,
  currentSku: StudioFormState["grokVideoSku"]
): StudioFormState["grokVideoSku"] {
  if (!provider || !isSeedance2Provider(provider)) return "";
  if (isSeedance2SkuId(provider.model_name)) return provider.model_name;
  if (isSeedance2SkuId(currentSku)) return currentSku;
  return DEFAULT_SEEDANCE2_VIDEO_SKU;
}

/** Max reference images for Seedance 2 (ToAPI `image_with_roles`, multi `reference_image`). */
export const SEEDANCE2_MAX_REFERENCE_IMAGES = 4;

export function seedance2ReferenceLimit(_form: StudioFormState, provider?: Provider): number {
  if (!provider || !isSeedance2Provider(provider)) return 4;
  return SEEDANCE2_MAX_REFERENCE_IMAGES;
}

export function seedance2ReferenceUploadError(
  form: StudioFormState,
  provider: Provider | undefined,
  count: number
): string | null {
  if (!provider || !isSeedance2Provider(provider)) return null;
  if (count > SEEDANCE2_MAX_REFERENCE_IMAGES) {
    return `Seedance 2 最多只能上传 ${SEEDANCE2_MAX_REFERENCE_IMAGES} 张参考图。`;
  }
  void form;
  return null;
}

export function buildSeedance2VideoPayload(
  form: StudioFormState,
  provider: Provider,
  referenceImagesOverride?: string[]
): Record<string, unknown> {
  const sku = resolveSelectedSeedance2Sku(form, provider);
  const config = getSelectedSeedance2SkuConfig(form, provider);
  if (!sku || !config) {
    throw new Error("请先选择 Seedance 2 视频档位。");
  }
  const referenceImages = (
    referenceImagesOverride ?? form.referenceImages.filter((value) => Boolean(value))
  ).filter(Boolean);
  const aspectRatio = form.aspectRatio.trim();
  const ratio = isMatchAspectRatio(aspectRatio) || !aspectRatio ? "16:9" : aspectRatio;
  const payload: Record<string, unknown> = {
    prompt: form.prompt,
    motion_prompt: form.notes,
    video_sku: sku,
    duration: config.duration,
    resolution: config.resolution,
    ratio,
    aspect_ratio: ratio,
  };
  if (referenceImages.length > 0) {
    payload.start_image_url = referenceImages[0];
    payload.reference_image = referenceImages[0];
    payload.reference_images = referenceImages;
  }
  return payload;
}
