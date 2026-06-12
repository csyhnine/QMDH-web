import type { Provider } from "../../api";
import type { Dispatch, SetStateAction } from "react";

import type { LoadState, StudioFormState } from "./studioTypes";
import { clampReferenceImageCount } from "./studioUtils";
import { getSelectedGrokSkuConfig, grokReferenceUploadError, isGrokHaodeyaProvider } from "./grokVideoUtils";

type ValidationOptions = {
  form: StudioFormState;
  providerForSubmit: Provider | undefined;
  setState: Dispatch<SetStateAction<LoadState>>;
  uploadingReference: boolean;
};

export type StudioTaskSubmissionValidation =
  | {
      ok: true;
      referenceImageCount: number;
    }
  | {
      ok: false;
    };

export function validateStudioTaskSubmission({
  form,
  providerForSubmit,
  setState,
  uploadingReference,
}: ValidationOptions): StudioTaskSubmissionValidation {
  if (uploadingReference) {
    setState((current) => ({
      ...current,
      error: "参考图仍在上传，请稍后再提交。",
    }));
    return { ok: false };
  }

  if (!providerForSubmit) {
    setState((current) => ({
      ...current,
      error: "请先选择一个可用模型。",
    }));
    return { ok: false };
  }

  if (!form.prompt.trim()) {
    setState((current) => ({
      ...current,
      error: form.creationMode === "video" ? "请先输入视频描述。" : "请先输入提示词。",
    }));
    return { ok: false };
  }

  if (form.creationMode === "video") {
    if (!providerForSubmit.capabilities.includes("video.generate")) {
      setState((current) => ({
        ...current,
        error: "当前模型不支持视频生成，请切换到支持 video.generate 的模型。",
      }));
      return { ok: false };
    }

    const referenceImageCount = clampReferenceImageCount(form.referenceImages.length);
    if (isGrokHaodeyaProvider(providerForSubmit)) {
      const skuConfig = getSelectedGrokSkuConfig(form, providerForSubmit);
      if (!skuConfig) {
        setState((current) => ({
          ...current,
          error: "请先选择 Grok 视频档位。",
        }));
        return { ok: false };
      }
      const grokError = grokReferenceUploadError(form, providerForSubmit, referenceImageCount);
      if (grokError) {
        setState((current) => ({ ...current, error: grokError }));
        return { ok: false };
      }
    }

    return { ok: true, referenceImageCount };
  }

  if (form.creationMode === "edit" && !providerForSubmit.capabilities.includes("image.edit")) {
    setState((current) => ({
      ...current,
      error: "当前模型不支持图像编辑，请切换到支持 image.edit 的模型。",
    }));
    return { ok: false };
  }

  if (form.creationMode === "generate" && !providerForSubmit.capabilities.includes("image.generate")) {
    setState((current) => ({
      ...current,
      error: "当前模型不支持文生图，请切换到支持 image.generate 的模型。",
    }));
    return { ok: false };
  }

  const referenceImageCount = clampReferenceImageCount(form.referenceImages.length);
  if (form.creationMode === "edit" && referenceImageCount < 1) {
    setState((current) => ({
      ...current,
      error: "图像编辑至少需要上传 1 张参考图。",
    }));
    return { ok: false };
  }

  if (referenceImageCount > 4) {
    setState((current) => ({
      ...current,
      error: "参考图最多只能上传 4 张。",
    }));
    return { ok: false };
  }

  return { ok: true, referenceImageCount };
}
