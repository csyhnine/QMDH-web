import type { Provider } from "../../api";

export function providerGroupLabel(provider: Provider): string {
  const name = `${provider.display_name} ${provider.provider_name} ${provider.model_name}`.toLowerCase();
  if (name.includes("grok") || name.includes("haodeya")) return "Haodeya / Grok Imagine";
  if (name.includes("firered")) return "魔搭 / FireRed";
  if (name.includes("z_image") || name.includes("z-image")) return "魔搭 / 造相 Z";
  if (name.includes("qwen")) return "魔搭 / Qwen";
  if (name.includes("bigjpg")) return "Bigjpg 高清放大";
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
