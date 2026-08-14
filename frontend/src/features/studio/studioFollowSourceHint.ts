import type { Provider } from "../../api";

/** How「遵循原图」is handled upstream for the selected image provider. */
export type FollowSourceBehavior = "native" | "infer_pixels" | "tier_only";

function providerIdentity(provider: Provider | undefined): string {
  return `${provider?.provider_name ?? ""} ${provider?.model_name ?? ""} ${provider?.display_name ?? ""}`.toLowerCase();
}

export function resolveFollowSourceBehavior(provider: Provider | undefined): FollowSourceBehavior {
  const identity = providerIdentity(provider);
  if (identity.includes("gpt-image-2-count") || identity.includes("gpt-image-count")) {
    return "infer_pixels";
  }
  if (identity.includes("seedream")) {
    return "tier_only";
  }
  if (identity.includes("wan2.7") || identity.includes("wan2_7")) {
    return "tier_only";
  }
  // Gemini chat, VIP async, and other chat-modal image routes omit forced ratio upstream.
  return "native";
}

/** One-line hint for the image-edit ratio menu — scoped to the active provider. */
export function followSourceHintForProvider(provider: Provider | undefined): string {
  switch (resolveFollowSourceBehavior(provider)) {
    case "infer_pixels":
      return "按参考图比例出图，系统会换算成固定像素尺寸（如横图 1536×1024）。";
    case "tier_only":
      return "只跟随下方分辨率档位，不保证与参考图比例一致；要固定比例请手动选择。";
    case "native":
    default:
      return "按参考图自动匹配画幅，无需再选具体比例。";
  }
}
