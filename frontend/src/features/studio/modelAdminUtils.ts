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

export function publicProviderDisplayName(provider: ProviderLike): string {
  const identity = providerIdentity(provider);
  const adapter = (provider.adapter_kind || "").toLowerCase();

  if (adapter === "bigjpg" || provider.provider_name === "bigjpg" || identity.includes("bigjpg")) {
    return "高清放大";
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
  if (provider.provider_name === "bigjpg" || provider.model_name === "bigjpg" || identity.includes("bigjpg")) {
    return "";
  }
  if (provider.adapter_kind === "haodeya_grok" || identity.includes("haodeya")) {
    return "";
  }
  if (provider.model_name === provider.provider_name) {
    return "";
  }
  return provider.model_name;
}

export function providerGroupLabel(provider: Provider): string {
  const name = providerIdentity(provider);
  if (name.includes("grok") || name.includes("haodeya")) return "Grok 视频";
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
  return provider.outbound && (provider.adapter_kind === "openai_compatible" || provider.provider_name.startsWith("modelscope_"));
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
