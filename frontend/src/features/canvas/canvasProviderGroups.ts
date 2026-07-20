import type { Provider } from "../../api";
import {
  isRuntimeUpscaleProvider,
  publicProviderDisplayName,
} from "../studio/modelAdminUtils";
import {
  NODE_KIND_LABEL,
  creationModeForNodeKind,
  type CanvasNodeKind,
  type GenerateNodeData,
} from "./canvasTypes";

export type CanvasProviderGroupKey = "image" | "video" | "upscale" | "llm";

export const CANVAS_PROVIDER_GROUP_ORDER: CanvasProviderGroupKey[] = [
  "image",
  "video",
  "upscale",
  "llm",
];

export const CANVAS_PROVIDER_GROUP_LABEL: Record<CanvasProviderGroupKey, string> = {
  image: "图片模型",
  video: "视频模型",
  upscale: "放大模型",
  llm: "LLM",
};

/** True image/video providers for canvas — never classify chat-only LLMs as image. */
export function canvasProviderGroupKey(provider: Provider): CanvasProviderGroupKey | null {
  if (!provider.outbound) return null;

  const caps = provider.capabilities ?? [];
  const hasImageGenerate = caps.includes("image.generate") || caps.includes("image.edit");
  const hasVideo = caps.includes("video.generate");
  const hasUpscale = caps.includes("image.upscale") || isRuntimeUpscaleProvider(provider);
  const hasChat = caps.includes("chat.completions");

  // Pure upscale adapters (e.g. BigJPG).
  if (hasUpscale && !hasImageGenerate && !hasVideo) {
    return "upscale";
  }
  if (hasVideo) return "video";
  if (hasImageGenerate) return "image";
  if (hasChat) return "llm";
  if (hasUpscale) return "upscale";
  return null;
}

export function groupProvidersForCanvas(
  providers: Provider[],
  nodeKind?: CanvasNodeKind
): Array<{ key: CanvasProviderGroupKey; label: string; providers: Provider[] }> {
  const buckets: Record<CanvasProviderGroupKey, Provider[]> = {
    image: [],
    video: [],
    upscale: [],
    llm: [],
  };
  for (const provider of providers) {
    const key = canvasProviderGroupKey(provider);
    if (!key) continue;
    buckets[key].push(provider);
  }

  // LLM 不进入生图/视频节点下拉，避免与图片模型混排。
  let order: CanvasProviderGroupKey[] = CANVAS_PROVIDER_GROUP_ORDER;
  if (nodeKind === "upscale") {
    order = ["upscale"];
  } else if (nodeKind === "video") {
    order = ["video", "image"];
  } else if (nodeKind === "text2img" || nodeKind === "img2img") {
    order = ["image", "video"];
  } else if (nodeKind === "upload" || nodeKind === "annotate") {
    order = [];
  }

  return order
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({
      key,
      label: CANVAS_PROVIDER_GROUP_LABEL[key],
      providers: buckets[key],
    }));
}

/** Selecting a model may switch node kind between image / video / upscale. */
export function patchFromProviderSelection(
  data: GenerateNodeData,
  provider: Provider
): Partial<GenerateNodeData> {
  const group = canvasProviderGroupKey(provider);
  const patch: Partial<GenerateNodeData> = {
    requestedProvider: provider.provider_name,
  };

  const switchKind = (nextKind: CanvasNodeKind) => {
    patch.nodeKind = nextKind;
    patch.creationMode = creationModeForNodeKind(nextKind);
    if (!data.label || data.label === NODE_KIND_LABEL[data.nodeKind]) {
      patch.label = NODE_KIND_LABEL[nextKind];
    }
  };

  if (group === "upscale" && data.nodeKind !== "upscale") {
    switchKind("upscale");
  } else if (group === "video" && data.nodeKind !== "video") {
    switchKind("video");
  } else if (group === "image" && (data.nodeKind === "video" || data.nodeKind === "upscale")) {
    switchKind("text2img");
  }
  return patch;
}

export function providerOptionLabel(provider: Provider): string {
  return publicProviderDisplayName(provider);
}

export function firstCanvasProviderName(
  providers: Provider[],
  group: CanvasProviderGroupKey
): string {
  return providers.find((provider) => canvasProviderGroupKey(provider) === group)?.provider_name || "";
}
