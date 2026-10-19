import type { Provider } from "../../api";

type ProviderLike = Pick<Provider, "display_name" | "provider_name" | "model_name" | "adapter_kind" | "capabilities">;

function providerIdentity(provider: ProviderLike): string {
  return `${provider.provider_name} ${provider.model_name} ${provider.display_name ?? ""} ${provider.adapter_kind ?? ""}`.toLowerCase();
}

function stripUpstreamTokens(value: string): string {
  return value
    .replace(/bigjpg/gi, "")
    .replace(/haodeya/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s/·-]+|[\s/·-]+$/g, "")
    .trim();
}

function isSeedance2UnifiedIdentity(identity: string, modelName: string): boolean {
  const model = modelName.trim().toLowerCase();
  if (model === "seedance-2" || model === "haodeya_seedance") return true;
  return identity.includes("haodeya_seedance");
}

export function publicProviderDisplayName(provider: ProviderLike): string {
  const identity = providerIdentity(provider);
  const adapter = (provider.adapter_kind || "").toLowerCase();
  const model = (provider.model_name || "").trim().toLowerCase();

  if (adapter === "bigjpg" || provider.provider_name === "bigjpg" || identity.includes("bigjpg")) {
    return "高清放大";
  }
  // Prefer product label over bare model ids like seedance-2 / seedance-2-720p.
  if (isSeedance2UnifiedIdentity(identity, model) || model.startsWith("seedance-2")) {
    const cleaned = stripUpstreamTokens(provider.display_name || "");
    if (cleaned && !/^seedance-2/i.test(cleaned)) return cleaned;
    return "Seedance 2 Video";
  }
  if (adapter === "haodeya_grok" || identity.includes("haodeya")) {
    const cleaned = stripUpstreamTokens(provider.display_name || "");
    return cleaned || "Grok 视频";
  }
  if (provider.capabilities?.includes("image.upscale") && !provider.capabilities.includes("image.generate")) {
    return "高清放大";
  }

  const raw = provider.display_name || provider.model_name || provider.provider_name;
  return stripUpstreamTokens(raw) || provider.model_name || provider.provider_name;
}

export function publicProviderModelLine(provider: ProviderLike): string {
  const identity = providerIdentity(provider);
  const model = (provider.model_name || "").trim().toLowerCase();
  if (provider.provider_name === "bigjpg" || provider.model_name === "bigjpg" || identity.includes("bigjpg")) {
    return "";
  }
  if (
    isSeedance2UnifiedIdentity(identity, model) ||
    model.startsWith("seedance-2") ||
    provider.adapter_kind === "haodeya_grok" ||
    identity.includes("haodeya")
  ) {
    return "";
  }
  if (provider.model_name === provider.provider_name) {
    return "";
  }
  return provider.model_name;
}

export function providerGroupLabel(provider: Provider): string {
  const name = providerIdentity(provider);
  const model = provider.model_name.trim().toLowerCase();
  const hasVideo = provider.capabilities.includes("video.generate");
  if (provider.adapter_kind === "comfyui") return "本机 ComfyUI";
  // Haodeya Seedance 2 ToAPI — same Studio bucket as Grok / HappyHorse.
  if (
    hasVideo && (
      model === "seedance-2" ||
      model === "haodeya_seedance" ||
      model.startsWith("seedance-2-") ||
      name.includes("haodeya_seedance")
    )
  ) {
    return "Grok 视频";
  }
  if (hasVideo && (name.includes("grok") || name.includes("haodeya") || name.includes("happyhorse"))) return "Grok 视频";
  if (name.includes("firered")) return "魔搭 / FireRed";
  if (name.includes("z_image") || name.includes("z-image")) return "魔搭 / 造相 Z";
  if (name.includes("qwen")) return "魔搭 / Qwen";
  if (name.includes("bigjpg")) return "高清放大";
  return "其他真实模型";
}

export function groupProviders(providers: Provider[]): Array<{ label: string; providers: Provider[] }> {
  const groups = new Map<string, Provider[]>();
  for (const provider of providers) {
    const label = providerGroupLabel(provider);
    groups.set(label, [...(groups.get(label) ?? []), provider]);
  }
  return Array.from(groups.entries()).map(([label, groupedProviders]) => ({
    label,
    providers: groupedProviders,
  }));
}

export function isRuntimeImageProvider(provider: Provider): boolean {
  return provider.outbound &&
    provider.capabilities.some((capability) => capability === "image.generate" || capability === "image.edit") &&
    (provider.adapter_kind === "openai_compatible" || provider.adapter_kind === "comfyui" || provider.provider_name.startsWith("modelscope_"));
}

export function isRuntimeVideoProvider(provider: Provider): boolean {
  return provider.outbound && provider.capabilities.includes("video.generate");
}

export function isRuntimeUpscaleProvider(provider: Provider): boolean {
  return provider.outbound && provider.capabilities.includes("image.upscale");
}

export function isRuntimeStudioProvider(provider: Provider, creationMode: "generate" | "edit" | "video"): boolean {
  if (creationMode === "video") {
    return isRuntimeVideoProvider(provider);
  }
  return isRuntimeImageProvider(provider);
}
