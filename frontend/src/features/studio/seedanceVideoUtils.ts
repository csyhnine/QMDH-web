import type { Provider } from "../../api";
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
    detail: "Fast · 720p · 5s",
  },
  "seedance-2-fast-720p-10s": {
    duration: 10,
    quality: "fast720",
    resolution: "720p",
    label: "720p 快速 · 10 秒",
    detail: "Fast · 720p · 10s",
  },
  "seedance-2-720p-5s": {
    duration: 5,
    quality: "720",
    resolution: "720p",
    label: "720p 标准 · 5 秒",
    detail: "标准 · 720p · 5s",
  },
  "seedance-2-720p-10s": {
    duration: 10,
    quality: "720",
    resolution: "720p",
    label: "720p 标准 · 10 秒",
    detail: "标准 · 720p · 10s",
  },
  "seedance-2-1080p-5s": {
    duration: 5,
    quality: "1080",
    resolution: "1080p",
    label: "1080p · 5 秒",
    detail: "标准 · 1080p · 5s",
  },
  "seedance-2-1080p-10s": {
    duration: 10,
    quality: "1080",
    resolution: "1080p",
    label: "1080p · 10 秒",
    detail: "标准 · 1080p · 10s",
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

/** Bare / partial names from model discovery that should be hidden when a unified profile exists. */
const SEEDANCE2_LEGACY_MODEL_NAMES = new Set<string>([
  ...SEEDANCE2_SKU_SET,
  "seedance-2-fast",
  "seedance-2-720p",
  "seedance-2-1080p",
  "seedance-2-mini",
  "seedance-2-mini-480p",
  "seedance-2",
]);

export function isSeedance2SkuId(value: string | undefined | null): value is Seedance2VideoSku {
  return Boolean(value && SEEDANCE2_SKU_SET.has(value));
}

export function isSeedance2Provider(provider: Provider | undefined): boolean {
  if (!provider) return false;
  if (isSeedance2SkuId(provider.model_name)) return true;
  const identity = `${provider.provider_name} ${provider.model_name} ${provider.display_name || ""}`.toLowerCase();
  if (identity.includes("happyhorse") || identity.includes("grok-imagine")) return false;
  return (
    identity.includes("seedance-2") ||
    identity.includes("haodeya_seedance") ||
    (identity.includes("seedance") && identity.includes("haodeya"))
  );
}

/** Unified Admin profile (placeholder model_name), same pattern as HappyHorse. */
export function isUnifiedSeedance2Provider(provider: Provider): boolean {
  return isSeedance2Provider(provider) && !isSeedance2SkuId(provider.model_name);
}

export function isLegacySeedance2SkuProvider(provider: Provider): boolean {
  const model = provider.model_name.trim().toLowerCase();
  if (isSeedance2SkuId(provider.model_name)) return true;
  return SEEDANCE2_LEGACY_MODEL_NAMES.has(model) && model !== "seedance-2";
}

/**
 * When a unified Seedance profile exists, hide discovered per-SKU / bare models from Studio.
 * Keep the unified placeholder (`seedance-2` / haodeya_seedance).
 */
export function filterSeedance2VideoProviders(providers: Provider[]): Provider[] {
  const hasUnified = providers.some(isUnifiedSeedance2Provider);
  if (!hasUnified) return providers;
  return providers.filter((provider) => {
    if (!isSeedance2Provider(provider)) return true;
    if (isUnifiedSeedance2Provider(provider)) return true;
    return false;
  });
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

export function seedance2ReferenceLimit(_form: StudioFormState, provider?: Provider): number {
  if (!provider || !isSeedance2Provider(provider)) return 4;
  return 1;
}

export function seedance2ReferenceUploadError(
  form: StudioFormState,
  provider: Provider | undefined,
  count: number
): string | null {
  if (!provider || !isSeedance2Provider(provider)) return null;
  if (count > 1) {
    return "Seedance 2 最多只能上传 1 张参考图（可选首帧）。";
  }
  void form;
  return null;
}

export function buildSeedance2VideoPayload(
  form: StudioFormState,
  provider: Provider
): Record<string, unknown> {
  const sku = resolveSelectedSeedance2Sku(form, provider);
  const config = getSelectedSeedance2SkuConfig(form, provider);
  if (!sku || !config) {
    throw new Error("请先选择 Seedance 2 视频档位。");
  }
  const referenceImages = form.referenceImages.filter((value) => Boolean(value));
  const aspectRatio = form.aspectRatio.trim();
  const ratio = aspectRatio === "智能" || !aspectRatio ? "16:9" : aspectRatio;
  const payload: Record<string, unknown> = {
    prompt: form.prompt,
    motion_prompt: form.notes,
    video_sku: sku,
    duration: config.duration,
    resolution: config.resolution,
    ratio,
    aspect_ratio: ratio,
  };
  if (referenceImages[0]) {
    payload.start_image_url = referenceImages[0];
    payload.reference_image = referenceImages[0];
    payload.reference_images = [referenceImages[0]];
  }
  return payload;
}
