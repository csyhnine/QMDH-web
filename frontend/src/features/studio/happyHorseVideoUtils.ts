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
};

export const HAPPYHORSE_VIDEO_SKU_CONFIG: Record<HappyHorseVideoSku, HappyHorseSkuConfig> = {
  "happyhorse-1.1-t2v-5s": { duration: 5, mode: "t2v" },
  "happyhorse-1.1-t2v-10s": { duration: 10, mode: "t2v" },
  "happyhorse-1.1-i2v-5s": { duration: 5, mode: "i2v" },
  "happyhorse-1.1-i2v-10s": { duration: 10, mode: "i2v" },
  "happyhorse-1.1-r2v-5s": { duration: 5, mode: "r2v" },
  "happyhorse-1.1-r2v-10s": { duration: 10, mode: "r2v" },
};

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

export function resolveHappyHorseSku(provider?: Provider): HappyHorseVideoSku | null {
  if (!provider || !isHappyHorseProvider(provider)) return null;
  if (isHappyHorseSkuId(provider.model_name)) return provider.model_name;
  return null;
}

export function getHappyHorseSkuConfig(provider?: Provider): HappyHorseSkuConfig | null {
  const sku = resolveHappyHorseSku(provider);
  return sku ? HAPPYHORSE_VIDEO_SKU_CONFIG[sku] : null;
}

export function happyHorseReferenceLimit(provider?: Provider): number {
  const config = getHappyHorseSkuConfig(provider);
  if (!config) return 4;
  if (config.mode === "t2v") return 0;
  if (config.mode === "i2v") return 1;
  return 4;
}

export function happyHorseReferenceUploadError(provider: Provider | undefined, count: number): string | null {
  const config = getHappyHorseSkuConfig(provider);
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
  const sku = resolveHappyHorseSku(provider);
  const config = getHappyHorseSkuConfig(provider);
  if (!sku || !config) {
    throw new Error("请选择带 -5s/-10s 后缀的 HappyHorse 视频档位。");
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
