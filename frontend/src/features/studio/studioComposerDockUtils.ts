import type { StudioFormState } from "./studioTypes";

export function isComposerBlurWithinForm(event: React.FocusEvent<HTMLFormElement>): boolean {
  return event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget);
}

export function composerModeLabel(mode: StudioFormState["creationMode"]): string {
  return mode === "edit" ? "图像编辑" : "文生图";
}

export function composerPromptPreview(prompt: string): string {
  return prompt.trim() || "点击展开后继续编辑提示词";
}

export function composerReferenceHint(
  mode: StudioFormState["creationMode"],
  referenceUploadCount: number
): string {
  if (mode === "edit") {
    return `图像编辑要求 1-4 张参考图，当前已上传 ${referenceUploadCount} 张。`;
  }
  return "文生图模式不会强制发送参考图；切换到图像编辑后会使用已上传的参考图。";
}
