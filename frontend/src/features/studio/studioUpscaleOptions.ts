export type UpscaleStyle = "photo" | "art";

export type UpscaleNoise = "-1" | "0" | "1" | "2" | "3";

/** Upstream `x2` value; maps to output factor via `upscaleScaleFactorLabel`. */
export type UpscaleScale = "1" | "2" | "3" | "4";

export type UpscaleOptions = {
  style: UpscaleStyle;
  noise: UpscaleNoise;
  scale: UpscaleScale;
};

export const defaultUpscaleOptions: UpscaleOptions = {
  style: "photo",
  noise: "0",
  scale: "2",
};

export const upscaleStyleOptions: Array<{ id: UpscaleStyle; label: string; detail: string }> = [
  { id: "photo", label: "照片", detail: "适合摄影与写实渲染" },
  { id: "art", label: "卡通 / 插画", detail: "适合二次元、线稿与插画" },
];

export const upscaleNoiseOptions: Array<{ id: UpscaleNoise; label: string }> = [
  { id: "-1", label: "无" },
  { id: "0", label: "低" },
  { id: "1", label: "中" },
  { id: "2", label: "高" },
  { id: "3", label: "最高" },
];

export const upscaleScaleOptions: Array<{ id: UpscaleScale; label: string; detail: string }> = [
  { id: "1", label: "2x", detail: "基础放大" },
  { id: "2", label: "4x", detail: "默认推荐" },
  { id: "3", label: "8x", detail: "更高倍率" },
  { id: "4", label: "16x", detail: "最高倍率" },
];

export function upscaleScaleFactorLabel(scale: UpscaleScale): string {
  return upscaleScaleOptions.find((option) => option.id === scale)?.label ?? scale;
}

export function upscaleOptionsSummary(options: UpscaleOptions): string {
  const style = upscaleStyleOptions.find((item) => item.id === options.style)?.label ?? options.style;
  const noise = upscaleNoiseOptions.find((item) => item.id === options.noise)?.label ?? options.noise;
  return `${upscaleScaleFactorLabel(options.scale)} · ${style} · 降噪${noise}`;
}
