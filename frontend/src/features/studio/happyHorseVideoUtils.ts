import type { Provider } from "../../api";
import type { StudioFormState } from "./studioTypes";

export type HappyHorseVideoSku =
  | "happyhorse-1.1-t2v-5s"
  | "happyhorse-1.1-t2v-10s"
  | "happyhorse-1.1-i2v-5s"
  | "happyhorse-1.1-i2v-10s"
  | "happyhorse-1.1-r2v-5s"
  | "happyhorse-1.1-r2v-10s";

export type HappyHorseVideoMode = "t2v" | "i2v" | "r2v";

export type HappyHorseSkuConfig = {
  duration: 5 | 10;
  mode: HappyHorseVideoMode;
  label: string;
  referenceHint: string;
};

export const DEFAULT_HAPPYHORSE_VIDEO_SKU: HappyHorseVideoSku = "happyhorse-1.1-t2v-5s";

export const HAPPYHORSE_VIDEO_SKU_CONFIG: Record<HappyHorseVideoSku, HappyHorseSkuConfig> = {
  "happyhorse-1.1-t2v-5s": {
    duration: 5,
    mode: "t2v",
    label: "文生 · 5 秒",
    referenceHint: "文生视频：不需要参考图，纯文本提交。",
  },
  "happyhorse-1.1-t2v-10s": {
    duration: 10,
    mode: "t2v",
    label: "文生 · 10 秒",
    referenceHint: "文生视频：不需要参考图，纯文本提交。",
  },
  "happyhorse-1.1-i2v-5s": {
    duration: 5,
    mode: "i2v",
    label: "图生 · 5 秒",
    referenceHint: "图生视频：可选 1 张起始图，或纯文本提交。",
  },
  "happyhorse-1.1-i2v-10s": {
    duration: 10,
    mode: "i2v",
    label: "图生 · 10 秒",
    referenceHint: "图生视频：可选 1 张起始图，或纯文本提交。",
  },
  "happyhorse-1.1-r2v-5s": {
    duration: 5,
    mode: "r2v",
    label: "参考 · 5 秒",
    referenceHint: "多图参考生成（最多 4 张）。",
  },
  "happyhorse-1.1-r2v-10s": {
    duration: 10,
    mode: "r2v",
    label: "参考 · 10 秒",
    referenceHint: "多图参考生成（最多 4 张）。",
  },
};

export const HAPPYHORSE_VIDEO_SKU_OPTIONS = (
  Object.entries(HAPPYHORSE_VIDEO_SKU_CONFIG) as [HappyHorseVideoSku, HappyHorseSkuConfig][]
).map(([id, config]) => ({
  id,
  label: config.label,
  detail: `${
    config.mode === "t2v" ? "文生视频" : config.mode === "i2v" ? "图生视频" : "多图参考"
  } · ${config.duration}s · 720p`,
}));

const HAPPYHORSE_SKU_SET = new Set<string>(Object.keys(HAPPYHORSE_VIDEO_SKU_CONFIG));

export function isHappyHorseSkuId(value: string | undefined | null): value is HappyHorseVideoSku {
  return Boolean(value && HAPPYHORSE_SKU_SET.has(value));
}

export function isHappyHorseProvider(provider: Provider | undefined): boolean {
  if (!provider) return false;
  if (isHappyHorseSkuId(provider.model_name)) return true;
  const identity = `${provider.provider_name} ${provider.model_name} ${provider.display_name || ""}`.toLowerCase();
  return identity.includes("happyhorse");
}

/** Unified Admin profile (placeholder model_name), same pattern as haodeya_grok. */
export function isUnifiedHappyHorseProvider(provider: Provider): boolean {
  return isHappyHorseProvider(provider) && !isHappyHorseSkuId(provider.model_name);
}

export function isLegacyHappyHorseSkuProvider(provider: Provider): boolean {
  return isHappyHorseSkuId(provider.model_name);
}

export function filterHappyHorseVideoProviders(providers: Provider[]): Provider[] {
  const hasUnified = providers.some(isUnifiedHappyHorseProvider);
  if (!hasUnified) return providers;
  return providers.filter((provider) => !isLegacyHappyHorseSkuProvider(provider));
}

export function resolveSelectedHappyHorseSku(
  form: StudioFormState,
  provider?: Provider
): HappyHorseVideoSku | null {
  if (!provider || !isHappyHorseProvider(provider)) return null;
  if (isHappyHorseSkuId(form.grokVideoSku)) return form.grokVideoSku;
  if (isHappyHorseSkuId(provider.model_name)) return provider.model_name;
  return DEFAULT_HAPPYHORSE_VIDEO_SKU;
}

export function getSelectedHappyHorseSkuConfig(
  form: StudioFormState,
  provider?: Provider
): HappyHorseSkuConfig | null {
  const sku = resolveSelectedHappyHorseSku(form, provider);
  return sku ? HAPPYHORSE_VIDEO_SKU_CONFIG[sku] : null;
}

export function happyHorseVideoSkuForProviderSelection(
  provider: Provider | undefined,
  currentSku: StudioFormState["grokVideoSku"]
): StudioFormState["grokVideoSku"] {
  if (!provider || !isHappyHorseProvider(provider)) return "";
  if (isHappyHorseSkuId(provider.model_name)) return provider.model_name;
  if (isHappyHorseSkuId(currentSku)) return currentSku;
  return DEFAULT_HAPPYHORSE_VIDEO_SKU;
}

export function happyHorseReferenceLimit(form: StudioFormState, provider?: Provider): number {
  const config = getSelectedHappyHorseSkuConfig(form, provider);
  if (!config) return 4;
  if (config.mode === "t2v") return 0;
  if (config.mode === "i2v") return 1;
  return 4;
}

export function happyHorseReferenceUploadError(
  form: StudioFormState,
  provider: Provider | undefined,
  count: number
): string | null {
  const config = getSelectedHappyHorseSkuConfig(form, provider);
  if (!config) return null;
  if (config.mode === "t2v" && count > 0) {
    return "文生视频档位不需要参考图。";
  }
  if (config.mode === "i2v" && count > 1) {
    return "图生视频档位最多只能上传 1 张起始图。";
  }
  if (config.mode === "r2v" && count > 4) {
    return "参考生视频档位最多只能上传 4 张参考图。";
  }
  return null;
}

export function buildHappyHorseVideoPayload(
  form: StudioFormState,
  provider: Provider
): Record<string, unknown> {
  const sku = resolveSelectedHappyHorseSku(form, provider);
  const config = getSelectedHappyHorseSkuConfig(form, provider);
  if (!sku || !config) {
    throw new Error("请先选择 HappyHorse 视频档位。");
  }
  const referenceImages = form.referenceImages.filter((value) => Boolean(value));
  const aspectRatio = form.aspectRatio.trim();
  const ratio = aspectRatio === "智能" || !aspectRatio ? "16:9" : aspectRatio;
  const payload: Record<string, unknown> = {
    prompt: form.prompt,
    motion_prompt: form.notes,
    video_sku: sku,
    duration: config.duration,
    resolution: "720P",
    ratio,
    aspect_ratio: ratio,
  };
  if (config.mode === "i2v" && referenceImages[0]) {
    payload.start_image_url = referenceImages[0];
    payload.reference_image = referenceImages[0];
  } else if (config.mode === "r2v" && referenceImages.length > 0) {
    payload.reference_images = referenceImages;
    payload.reference_image_urls = referenceImages;
  }
  return payload;
}
