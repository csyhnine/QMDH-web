import type { Provider } from "../../api";
import type { StudioFormState } from "./studioTypes";
import { getSelectedGrokSkuConfig, isGrokHaodeyaProvider } from "./grokVideoUtils";

export function isComposerBlurWithinForm(event: React.FocusEvent<HTMLFormElement>): boolean {
  return event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget);
}

export function composerModeLabel(mode: StudioFormState["creationMode"]): string {
  if (mode === "video") return "视频生成";
  return mode === "edit" ? "图像编辑" : "文生图";
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
    return `图像编辑要求 1-4 张参考图，当前已上传 ${referenceUploadCount} 张。`;
  }
  return "文生图模式不会强制发送参考图；切换到图像编辑后会使用已上传的参考图。";
}

export function composerPromptPlaceholder(mode: StudioFormState["creationMode"]): string {
  if (mode === "video") {
    return "描述镜头运动、场景氛围与主体动作，例如：缓慢推进穿过中庭，清晨侧光。";
  }
  if (mode === "edit") {
    return "描述希望如何修改已上传的参考图。";
  }
  return "请输入要生成或编辑的画面描述。";
}

export function composerSubmitLabel(mode: StudioFormState["creationMode"], submitting: boolean): string {
  if (submitting) return "正在创建...";
  return mode === "video" ? "开始生成视频" : "开始生成";
}
