import type { Provider } from "../../api";
import { comfyReferenceCount } from "./comfyReferenceContract";
import type { StudioFormState } from "./studioTypes";
import { getSelectedGrokSkuConfig, isGrokHaodeyaProvider } from "./grokVideoUtils";
import { getSelectedHappyHorseSkuConfig, isHappyHorseProvider } from "./happyHorseVideoUtils";
import { getSelectedSeedance2SkuConfig, isSeedance2Provider } from "./seedanceVideoUtils";

export function isComposerBlurWithinForm(event: React.FocusEvent<HTMLFormElement>): boolean {
  return event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget);
}

export function composerModeLabel(mode: StudioFormState["creationMode"]): string {
  if (mode === "video") return "视频生成";
  return mode === "edit" ? "图生图" : "文生图";
}

export function composerReferenceZoneLabel(mode: StudioFormState["creationMode"], provider?: Provider): string {
  if (mode === "video") return "参考图（可选）";
  if (mode === "edit" && provider?.adapter_kind === "comfyui") return comfyReferenceCount(provider) === 1 ? "编辑原图（必传 1 张）" : "双图编辑（必传 2 张）";
  return mode === "edit" ? "参考图（必传 1–4 张）" : "参考图（可选）";
}

export function composerPromptPreview(prompt: string): string {
  return prompt.trim() || "点击展开后继续编辑提示词";
}

export function composerReferenceHint(
  mode: StudioFormState["creationMode"],
  referenceUploadCount: number,
  provider?: Provider,
  form?: StudioFormState
): string {
  if (mode === "video") {
    if (isHappyHorseProvider(provider) && form) {
      const skuConfig = getSelectedHappyHorseSkuConfig(form, provider);
      if (skuConfig) {
        const uploaded =
          referenceUploadCount > 0 ? `已上传 ${referenceUploadCount} 张。` : "当前未上传图片，纯文本也可提交。";
        return `${skuConfig.referenceHint} ${uploaded} 720p · 生成通常 30 秒～数分钟。`;
      }
    }
    if (isSeedance2Provider(provider) && form) {
      const skuConfig = getSelectedSeedance2SkuConfig(form, provider);
      if (skuConfig) {
        const uploaded =
          referenceUploadCount > 0
            ? `已上传 ${referenceUploadCount} 张。含人物请点缩略图「入库」（虚拟人/真人）。`
            : "当前未上传图片，纯文本也可提交。";
        return `可选最多 4 张参考图。${uploaded} ${skuConfig.resolution} · ${skuConfig.duration}s · 生成通常需数分钟。`;
      }
    }
    if (isGrokHaodeyaProvider(provider) && form) {
      const skuConfig = getSelectedGrokSkuConfig(form, provider);
      if (skuConfig) {
        const uploaded =
          referenceUploadCount > 0 ? `已上传 ${referenceUploadCount} 张。` : "当前未上传图片，纯文本也可提交。";
        return `${skuConfig.referenceHint} ${uploaded} 720p · 生成通常 30 秒～数分钟。`;
      }
    }
    return referenceUploadCount > 0
      ? `已上传 ${referenceUploadCount} 张可选参考图，会随视频任务一并提交。`
      : "视频生成可选上传参考图；仅文本也可提交。";
  }
  if (mode === "edit") {
    if (provider?.adapter_kind === "comfyui") {
      if (comfyReferenceCount(provider) === 1) {
        return referenceUploadCount === 1 ? "原图已就绪，请描述修改要求。当前工作流仅接收一张原图。" : "当前工作流需要一张原图，请仅保留要编辑的图片。";
      }
      if (referenceUploadCount === 0) return "请依次上传两张图：第 1 张是要修改的目标图，第 2 张是参考图。当前工作流仅支持双图编辑。";
      if (referenceUploadCount === 1) return "已上传目标图，还需第 2 张参考图才能提交。当前工作流仅支持双图编辑。";
      if (referenceUploadCount === 2) return "两图已就绪：第 1 张目标图，第 2 张参考图。请在提示词中描述修改要求。";
      return "双图编辑仅支持 2 张图片，请移除多余图片。";
    }
    return referenceUploadCount > 0
      ? `图生图已上传 ${referenceUploadCount} 张参考图，将按提示词编辑。`
      : "图生图需至少 1 张参考图；上传后再描述修改方式。";
  }
  return "文生图可不传参考图；若已上传，部分模型会一并参考。";
}

export function composerPromptPlaceholder(mode: StudioFormState["creationMode"]): string {
  if (mode === "video") {
    return "描述镜头运动、场景氛围与主体动作，例如：缓慢推进穿过中庭，清晨侧光。";
  }
  if (mode === "edit") {
    return "描述要如何改参考图，例如：换墙面颜色、保留构图与人物。";
  }
  return "描述你想生成的画面，例如：清晨街景、侧光、写实风格。";
}

export function composerSubmitLabel(
  mode: StudioFormState["creationMode"],
  submitting: boolean,
  referenceUploadCount = 0
): string {
  if (submitting) return "正在创建...";
  if (mode === "video") return "开始生成视频";
  if (mode === "edit") {
    return referenceUploadCount > 0 ? "开始编辑" : "请先上传参考图";
  }
  return "开始生成";
}
