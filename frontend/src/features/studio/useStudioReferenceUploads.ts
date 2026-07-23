import {
  type ChangeEvent,
  type Dispatch,
  type DragEvent,
  type RefObject,
  type SetStateAction,
  useState,
} from "react";

import { api } from "../../api";
import { useAuth } from "../../context/AuthContext";
import {
  buildReferenceUploadTracker,
  prepareReferenceUploadFiles,
  shouldClearTransientReferenceTracker,
  uploadReferenceFiles,
} from "./studioReferenceUtils";
import type { StudioFormState, SubmissionTracker } from "./studioTypes";
import { useStudioReferenceUploadState } from "./useStudioReferenceUploadState";

type UseStudioReferenceUploadsOptions = {
  defaultTitle: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  maxReferenceCount?: number;
  onClearError: () => void;
  onError: (message: string) => void;
  selectedProviderName: string;
  setStudioForm: Dispatch<SetStateAction<StudioFormState>>;
  setSubmissionTracker: Dispatch<SetStateAction<SubmissionTracker | null>>;
  studioForm: StudioFormState;
};

export type StudioReferenceUploadState = ReturnType<typeof useStudioReferenceUploads>;

export function useStudioReferenceUploads({
  defaultTitle,
  fileInputRef,
  maxReferenceCount = 4,
  onClearError,
  onError,
  selectedProviderName,
  setStudioForm,
  setSubmissionTracker,
  studioForm,
}: UseStudioReferenceUploadsOptions) {
  const { isGuest } = useAuth();
  const [uploadingReference, setUploadingReference] = useState(false);
  const referenceUploadState = useStudioReferenceUploadState({ setStudioForm });
  const { referenceUploads, syncReferenceUploads } = referenceUploadState;

  function resetReferenceFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function clearReferenceUpload() {
    setUploadingReference(false);
    referenceUploadState.clearReferenceUploads();
    resetReferenceFileInput();
  }

  async function handleReferenceFiles(files: File[]) {
    if (isGuest) {
      onError("访客模式无法上传参考图，请先登录。");
      resetReferenceFileInput();
      return;
    }
    if (files.length === 0) {
      resetReferenceFileInput();
      return;
    }

    const { acceptedFiles, errors } = prepareReferenceUploadFiles(
      files,
      referenceUploads.length,
      maxReferenceCount
    );
    for (const message of errors) {
      onError(message);
    }
    if (acceptedFiles.length === 0) {
      resetReferenceFileInput();
      return;
    }

    setUploadingReference(true);
    setSubmissionTracker(buildReferenceUploadTracker({ defaultTitle, selectedProviderName, studioForm }));

    try {
      const uploadedItems = await uploadReferenceFiles(acceptedFiles, api.uploadReferenceImage);
      const nextUploads = [...referenceUploads, ...uploadedItems];
      syncReferenceUploads(nextUploads);
      onClearError();
    } catch (error) {
      onError(error instanceof Error ? error.message : "参考图上传失败");
    } finally {
      setUploadingReference(false);
      setSubmissionTracker((current) => (shouldClearTransientReferenceTracker(current) ? null : current));
      resetReferenceFileInput();
    }
  }

  function handleReferenceInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? Array.from(event.target.files) : [];
    void handleReferenceFiles(files);
  }

  function handleReferenceDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const files = event.dataTransfer.files ? Array.from(event.dataTransfer.files) : [];
    void handleReferenceFiles(files);
  }

  function openReferencePicker() {
    if (isGuest) {
      onError("访客模式无法上传参考图，请先登录。");
      return;
    }
    fileInputRef.current?.click();
  }

  function addReferenceFromStoragePath(storagePath: string): { ok: boolean; message: string } {
    const path = storagePath.trim();
    if (!path) {
      return { ok: false, message: "当前图片没有可用路径，无法置入参考图。" };
    }
    if (referenceUploads.some((item) => item.storagePath === path)) {
      return { ok: false, message: "这张图已经在参考图里了。" };
    }
    if (referenceUploads.length >= maxReferenceCount) {
      return { ok: false, message: `最多只能保留 ${maxReferenceCount} 张参考图。` };
    }
    const [item] = referenceUploadState.buildUploadsFromPaths([path]);
    if (!item) {
      return { ok: false, message: "无法将当前图片置入参考图。" };
    }
    syncReferenceUploads([...referenceUploads, item]);
    onClearError();
    return { ok: true, message: "已置入创作区参考图。" };
  }

  return {
    addReferenceFromStoragePath,
    buildUploadsFromPaths: referenceUploadState.buildUploadsFromPaths,
    clearReferenceUpload,
    handleReferenceDrop,
    handleReferenceInputChange,
    openReferencePicker,
    referenceUploads,
    removeReferenceUpload: referenceUploadState.removeReferenceUpload,
    replaceReferenceUploadAt: referenceUploadState.replaceReferenceUploadAt,
    replaceReferenceUploads: referenceUploadState.replaceReferenceUploads,
    uploadingReference,
  };
}
