import type { Provider } from "../../api";
import type { Dispatch, SetStateAction } from "react";

import type { LoadState, StudioFormState } from "./studioTypes";
import { clampReferenceImageCount } from "./studioUtils";
import { getSelectedGrokSkuConfig, grokReferenceUploadError, isGrokHaodeyaProvider } from "./grokVideoUtils";
import {
  getSelectedHappyHorseSkuConfig,
  happyHorseReferenceUploadError,
  isHappyHorseProvider,
} from "./happyHorseVideoUtils";
import {
  getSelectedSeedance2SkuConfig,
  isSeedance2Provider,
  seedance2ReferenceUploadError,
} from "./seedanceVideoUtils";

type ValidationOptions = {
  form: StudioFormState;
  providerForSubmit: Provider | undefined;
  setState: Dispatch<SetStateAction<LoadState>>;
  uploadingReference: boolean;
  referenceUploads?: Array<{
    avatarStatus?: "idle" | "registering" | "processing" | "active" | "failed";
    avatarError?: string;
    storagePath: string;
  }>;
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
  referenceUploads = [],
}: ValidationOptions): StudioTaskSubmissionValidation {
  if (uploadingReference) {
    setState((current) => ({
      ...current,
      error: "参考图仍在上传或人像入库中，请稍后再提交。",
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

    const referenceImageCount =
      isHappyHorseProvider(providerForSubmit) || isSeedance2Provider(providerForSubmit)
        ? form.referenceImages.filter(Boolean).length
        : clampReferenceImageCount(form.referenceImages.length);
    if (isHappyHorseProvider(providerForSubmit)) {
      const skuConfig = getSelectedHappyHorseSkuConfig(form, providerForSubmit);
      if (!skuConfig) {
        setState((current) => ({
          ...current,
          error: "请先选择 HappyHorse 视频档位。",
        }));
        return { ok: false };
      }
      const hhError = happyHorseReferenceUploadError(form, providerForSubmit, referenceImageCount);
      if (hhError) {
        setState((current) => ({ ...current, error: hhError }));
        return { ok: false };
      }
    } else if (isSeedance2Provider(providerForSubmit)) {
      const skuConfig = getSelectedSeedance2SkuConfig(form, providerForSubmit);
      if (!skuConfig) {
        setState((current) => ({
          ...current,
          error: "请先选择 Seedance 2 视频档位。",
        }));
        return { ok: false };
      }
      const seedanceError = seedance2ReferenceUploadError(form, providerForSubmit, referenceImageCount);
      if (seedanceError) {
        setState((current) => ({ ...current, error: seedanceError }));
        return { ok: false };
      }
      if (referenceImageCount > 0) {
        const pending = referenceUploads.find(
          (item) =>
            item.avatarStatus === "registering" ||
            item.avatarStatus === "processing" ||
            item.avatarStatus === "verifying"
        );
        if (pending) {
          setState((current) => ({
            ...current,
            error: "人像入库/审核进行中，请等待完成或取消后再生成。",
          }));
          return { ok: false };
        }
        // idle / failed：允许直接用 HTTPS 参考图生成；虚拟角色请用户手动点「入库」。
      }
    } else if (isGrokHaodeyaProvider(providerForSubmit)) {
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
