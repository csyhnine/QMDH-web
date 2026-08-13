import {
  type ChangeEvent,
  type Dispatch,
  type DragEvent,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

import { api } from "../../api";
import { useAuth } from "../../context/AuthContext";
import {
  pollSeedancePrivateAvatarUntilSettled,
  registerSeedancePrivateAvatarForUpload,
  registerSeedanceRealAvatarForUpload,
  startSeedanceRealAvatarVerify,
} from "./seedancePrivateAvatar";
import {
  buildReferenceUploadTracker,
  prepareReferenceUploadFiles,
  shouldClearTransientReferenceTracker,
  uploadReferenceFiles,
} from "./studioReferenceUtils";
import type { ReferenceUploadItem, StudioFormState, SubmissionTracker } from "./studioTypes";
import { useStudioReferenceUploadState } from "./useStudioReferenceUploadState";

type UseStudioReferenceUploadsOptions = {
  defaultTitle: string;
  enableSeedancePrivateAvatar?: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  maxReferenceCount?: number;
  onClearError: () => void;
  onError: (message: string) => void;
  /** Human-readable label for submission tracker UI. */
  selectedProviderLabel?: string;
  /** Admin provider_name used for avatar register API. */
  selectedProviderName: string;
  setStudioForm: Dispatch<SetStateAction<StudioFormState>>;
  setSubmissionTracker: Dispatch<SetStateAction<SubmissionTracker | null>>;
  studioForm: StudioFormState;
};

export type StudioReferenceUploadState = ReturnType<typeof useStudioReferenceUploads>;

export function useStudioReferenceUploads({
  defaultTitle,
  enableSeedancePrivateAvatar = false,
  fileInputRef,
  maxReferenceCount = 4,
  onClearError,
  onError,
  selectedProviderLabel,
  selectedProviderName,
  setStudioForm,
  setSubmissionTracker,
  studioForm,
}: UseStudioReferenceUploadsOptions) {
  const { isGuest } = useAuth();
  const [uploadingReference, setUploadingReference] = useState(false);
  const referenceUploadState = useStudioReferenceUploadState({ setStudioForm });
  const { referenceUploads, syncReferenceUploads } = referenceUploadState;
  const avatarAbortRef = useRef<AbortController | null>(null);
  const enableAvatarRef = useRef(enableSeedancePrivateAvatar);
  const providerNameRef = useRef(selectedProviderName);
  enableAvatarRef.current = enableSeedancePrivateAvatar;
  providerNameRef.current = selectedProviderName;
  const trackerProviderName = selectedProviderLabel || selectedProviderName;

  useEffect(() => {
    return () => {
      avatarAbortRef.current?.abort();
    };
  }, []);

  function resetReferenceFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function clearReferenceUpload() {
    avatarAbortRef.current?.abort();
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
    setSubmissionTracker(
      buildReferenceUploadTracker({
        defaultTitle,
        selectedProviderName: trackerProviderName,
        studioForm,
      })
    );

    try {
      const uploadedItems = await uploadReferenceFiles(acceptedFiles, api.uploadReferenceImage);
      const withMedia = uploadedItems.map((item) => ({
        ...item,
        mediaPath: item.storagePath,
        avatarStatus: enableAvatarRef.current ? ("idle" as const) : undefined,
      }));
      const nextUploads = [...referenceUploads, ...withMedia];
      syncReferenceUploads(nextUploads);
      onClearError();
      // Seedance private-avatar is manual: user clicks「入库」per image.
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
    if (referenceUploads.some((item) => item.storagePath === path || item.mediaPath === path)) {
      return { ok: false, message: "这张图已经在参考图里了。" };
    }
    if (referenceUploads.length >= maxReferenceCount) {
      return { ok: false, message: `最多只能保留 ${maxReferenceCount} 张参考图。` };
    }
    const [item] = referenceUploadState.buildUploadsFromPaths([path]);
    if (!item) {
      return { ok: false, message: "无法将当前图片置入参考图。" };
    }
    const nextItem: ReferenceUploadItem = {
      ...item,
      mediaPath: path,
      avatarStatus: enableAvatarRef.current ? "idle" : undefined,
    };
    const nextUploads = [...referenceUploads, nextItem];
    syncReferenceUploads(nextUploads);
    onClearError();
    return { ok: true, message: "已置入创作区参考图。" };
  }

  function replaceReferenceUploadAt(index: number, item: ReferenceUploadItem) {
    const mediaPath =
      item.mediaPath ||
      (item.storagePath.startsWith("asset://") ? undefined : item.storagePath) ||
      item.storagePath;
    const nextItem: ReferenceUploadItem = {
      ...item,
      mediaPath,
      storagePath: mediaPath,
      previewUrl: item.previewUrl || mediaPath,
      avatarStatus: enableAvatarRef.current ? "idle" : item.avatarStatus,
      assetId: undefined,
      assetUrl: undefined,
      avatarError: undefined,
    };
    const nextUploads = referenceUploads.map((entry, i) => (i === index ? nextItem : entry));
    syncReferenceUploads(nextUploads);
  }

  async function pollAvatarItem(
    item: ReferenceUploadItem,
    signal: AbortSignal
  ): Promise<ReferenceUploadItem> {
    if (item.avatarStatus === "active" || item.avatarStatus === "failed") return item;
    if (!item.assetId) return item;
    return pollSeedancePrivateAvatarUntilSettled(item, {
      providerName: providerNameRef.current,
      signal,
      kind: item.avatarKind || "private",
    });
  }

  async function registerSeedancePrivateAvatar(index: number) {
    const item = referenceUploads[index];
    if (!item || !enableAvatarRef.current) return;
    if (item.avatarStatus === "registering" || item.avatarStatus === "processing" || item.avatarStatus === "verifying") {
      return;
    }
    setUploadingReference(true);
    avatarAbortRef.current?.abort();
    const controller = new AbortController();
    avatarAbortRef.current = controller;
    try {
      const reset: ReferenceUploadItem = {
        ...item,
        mediaPath: item.mediaPath || item.storagePath.replace(/^asset:\/\//, "") || item.storagePath,
        storagePath: item.mediaPath || item.storagePath,
        avatarStatus: "idle",
        avatarKind: "private",
        assetId: undefined,
        assetUrl: undefined,
        avatarError: undefined,
        verifyTaskId: undefined,
      };
      if (reset.storagePath.startsWith("asset://") && item.mediaPath) {
        reset.storagePath = item.mediaPath;
      }
      let nextUploads = referenceUploads.map((entry, i) => (i === index ? reset : entry));
      syncReferenceUploads(nextUploads);

      const registered = await registerSeedancePrivateAvatarForUpload(reset, {
        providerName: providerNameRef.current,
      });
      nextUploads = nextUploads.map((entry, i) => (i === index ? registered : entry));
      syncReferenceUploads(nextUploads);
      if (controller.signal.aborted) return;

      const settled = await pollAvatarItem(registered, controller.signal);
      nextUploads = nextUploads.map((entry, i) => (i === index ? settled : entry));
      syncReferenceUploads(nextUploads);
      if (settled.avatarStatus === "failed" && settled.avatarError) onError(settled.avatarError);
      else onClearError();
    } finally {
      setUploadingReference(false);
    }
  }

  async function startSeedanceRealAvatar(index: number): Promise<{ taskId: string; h5Link: string }> {
    const item = referenceUploads[index];
    if (!item || !enableAvatarRef.current) {
      throw new Error("当前模型未启用 Seedance 人像入库");
    }
    const started = await startSeedanceRealAvatarVerify({
      providerName: providerNameRef.current,
    });
    const nextUploads = referenceUploads.map((entry, i) =>
      i === index
        ? {
            ...entry,
            mediaPath: entry.mediaPath || entry.storagePath,
            avatarStatus: "verifying" as const,
            avatarKind: "real" as const,
            verifyTaskId: started.taskId,
            avatarError: undefined,
          }
        : entry
    );
    syncReferenceUploads(nextUploads);
    return started;
  }

  async function completeSeedanceRealAvatar(index: number, verifyTaskId: string) {
    const item = referenceUploads[index];
    if (!item || !enableAvatarRef.current) return;
    setUploadingReference(true);
    avatarAbortRef.current?.abort();
    const controller = new AbortController();
    avatarAbortRef.current = controller;
    try {
      const base: ReferenceUploadItem = {
        ...item,
        mediaPath: item.mediaPath || item.storagePath.replace(/^asset:\/\//, "") || item.storagePath,
        storagePath: item.mediaPath || item.storagePath,
        verifyTaskId,
        avatarKind: "real",
        avatarError: undefined,
      };
      if (base.storagePath.startsWith("asset://") && item.mediaPath) {
        base.storagePath = item.mediaPath;
      }
      const registered = await registerSeedanceRealAvatarForUpload(base, {
        providerName: providerNameRef.current,
        verifyTaskId,
      });
      let nextUploads = referenceUploads.map((entry, i) => (i === index ? registered : entry));
      syncReferenceUploads(nextUploads);
      if (controller.signal.aborted) return;
      const settled = await pollAvatarItem(registered, controller.signal);
      nextUploads = nextUploads.map((entry, i) => (i === index ? settled : entry));
      syncReferenceUploads(nextUploads);
      if (settled.avatarStatus === "failed" && settled.avatarError) onError(settled.avatarError);
      else onClearError();
    } finally {
      setUploadingReference(false);
    }
  }

  return {
    addReferenceFromStoragePath,
    buildUploadsFromPaths: referenceUploadState.buildUploadsFromPaths,
    clearReferenceUpload,
    completeSeedanceRealAvatar,
    enableSeedancePrivateAvatar,
    handleReferenceDrop,
    handleReferenceInputChange,
    maxReferenceCount,
    openReferencePicker,
    referenceFileInputRef: fileInputRef,
    referenceUploads,
    registerSeedancePrivateAvatar,
    removeReferenceUpload: referenceUploadState.removeReferenceUpload,
    replaceReferenceUploadAt,
    replaceReferenceUploads: referenceUploadState.replaceReferenceUploads,
    retrySeedancePrivateAvatar: registerSeedancePrivateAvatar,
    startSeedanceRealAvatar,
    uploadingReference,
  };
}
