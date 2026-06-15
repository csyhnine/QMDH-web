import type { Provider } from "../../api";
import type { StudioFormState } from "./studioTypes";

export type GrokVideoSku =
  | "x-ai/grok-imagine-video-i2v"
  | "x-ai/grok-imagine-video-i2v-10s"
  | "x-ai/grok-imagine-video-ref"
  | "x-ai/grok-imagine-video-ref-10s";

export type GrokVideoMode = "i2v" | "ref";

export type GrokSkuConfig = {
  duration: 5 | 10;
  mode: GrokVideoMode;
  label: string;
  referenceHint: string;
};

export const DEFAULT_GROK_VIDEO_SKU: GrokVideoSku = "x-ai/grok-imagine-video-i2v";

export const GROK_VIDEO_SKU_CONFIG: Record<GrokVideoSku, GrokSkuConfig> = {
  "x-ai/grok-imagine-video-i2v": {
    duration: 5,
    mode: "i2v",
    label: "起始图 · 5 秒",
    referenceHint: "起始图生成视频：可选 1 张起始图，或纯文本提交。",
  },
  "x-ai/grok-imagine-video-i2v-10s": {
    duration: 10,
    mode: "i2v",
    label: "起始图 · 10 秒",
    referenceHint: "起始图生成视频：可选 1 张起始图，或纯文本提交。",
  },
  "x-ai/grok-imagine-video-ref": {
    duration: 5,
    mode: "ref",
    label: "多图参考 · 5 秒",
    referenceHint: "多图参考生成（最多 4 张）；可在提示词中用 <IMAGE_1> … <IMAGE_4> 指代各图。",
  },
  "x-ai/grok-imagine-video-ref-10s": {
    duration: 10,
    mode: "ref",
    label: "多图参考 · 10 秒",
    referenceHint: "多图参考生成（最多 4 张）；可在提示词中用 <IMAGE_1> … <IMAGE_4> 指代各图。",
  },
};

export const GROK_VIDEO_SKU_OPTIONS = (Object.entries(GROK_VIDEO_SKU_CONFIG) as [GrokVideoSku, GrokSkuConfig][]).map(
  ([id, config]) => ({
    id,
    label: config.label,
    detail: `${config.mode === "i2v" ? "起始图生成" : "多图参考"} · ${config.duration}s · 720p`,
  })
);

export const GROK_VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"] as const;

const GROK_SKU_SET = new Set<string>(Object.keys(GROK_VIDEO_SKU_CONFIG));

export function isGrokSkuId(value: string | undefined | null): value is GrokVideoSku {
  return Boolean(value && GROK_SKU_SET.has(value));
}

export function isGrokHaodeyaProvider(provider: Provider | undefined): boolean {
  if (!provider) return false;
  if (provider.adapter_kind === "haodeya_grok") return true;
  return GROK_SKU_SET.has(provider.model_name);
}

export function isUnifiedGrokHaodeyaProvider(provider: Provider): boolean {
  return provider.adapter_kind === "haodeya_grok" && !GROK_SKU_SET.has(provider.model_name);
}

export function isLegacyGrokSkuProvider(provider: Provider): boolean {
  return provider.adapter_kind === "haodeya_grok" && GROK_SKU_SET.has(provider.model_name);
}

export function filterGrokVideoProviders(providers: Provider[]): Provider[] {
  const hasUnified = providers.some(isUnifiedGrokHaodeyaProvider);
  if (!hasUnified) return providers;
  return providers.filter((provider) => !isLegacyGrokSkuProvider(provider));
}

export function resolveSelectedGrokSku(form: StudioFormState, provider?: Provider): GrokVideoSku | null {
  if (!provider || !isGrokHaodeyaProvider(provider)) return null;
  if (isGrokSkuId(form.grokVideoSku)) return form.grokVideoSku;
  if (isGrokSkuId(provider.model_name)) return provider.model_name;
  return DEFAULT_GROK_VIDEO_SKU;
}

export function getSelectedGrokSkuConfig(form: StudioFormState, provider?: Provider): GrokSkuConfig | null {
  const sku = resolveSelectedGrokSku(form, provider);
  return sku ? GROK_VIDEO_SKU_CONFIG[sku] : null;
}

export function grokVideoSkuForProviderSelection(
  provider: Provider | undefined,
  currentSku: StudioFormState["grokVideoSku"]
): StudioFormState["grokVideoSku"] {
  if (!provider || !isGrokHaodeyaProvider(provider)) return "";
  if (isGrokSkuId(provider.model_name)) return provider.model_name;
  if (isGrokSkuId(currentSku)) return currentSku;
  return DEFAULT_GROK_VIDEO_SKU;
}

export function grokReferenceLimit(form: StudioFormState, provider?: Provider): number {
  const config = getSelectedGrokSkuConfig(form, provider);
  if (!config) return 4;
  return config.mode === "i2v" ? 1 : 4;
}

export function grokReferenceUploadError(
  form: StudioFormState,
  provider: Provider | undefined,
  count: number
): string | null {
  const config = getSelectedGrokSkuConfig(form, provider);
  if (!config) return null;
  if (config.mode === "i2v" && count > 1) {
    return "起始图模式最多只能上传 1 张起始图。";
  }
  if (config.mode === "ref" && count > 4) {
    return "多图参考模式最多只能上传 4 张参考图。";
  }
  return null;
}
