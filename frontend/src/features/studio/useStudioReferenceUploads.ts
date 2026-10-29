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

type AvatarOperation = {
  id: string; epoch: number; expected: ReferenceUploadItem; provider: string;
  controller: AbortController; waiting: boolean; unlink?: () => void;
};

export function useStudioReferenceUploads({
  defaultTitle, enableSeedancePrivateAvatar = false, fileInputRef, maxReferenceCount = 4,
  onClearError, onError, selectedProviderLabel, selectedProviderName, setStudioForm, setSubmissionTracker, studioForm,
}: UseStudioReferenceUploadsOptions) {
  const { isGuest } = useAuth();
  const [uploadingReference, setUploadingReference] = useState(false);
  const referenceUploadState = useStudioReferenceUploadState({ setStudioForm });
  const { referenceUploads, session, publish } = referenceUploadState;
  const mounted = useRef(true);
  const avatarOperations = useRef(new Map<string, AvatarOperation>());
  const ownedTracker = useRef<SubmissionTracker | null>(null);
  const enableAvatarRef = useRef(enableSeedancePrivateAvatar), providerNameRef = useRef(selectedProviderName);
  enableAvatarRef.current = enableSeedancePrivateAvatar; providerNameRef.current = selectedProviderName;
  function refreshBusy() {
    if (!mounted.current) return;
    setUploadingReference(session.pendingBatches > 0 || [...avatarOperations.current.values()].some(operation => !operation.waiting));
    if (session.pendingBatches === 0 && ownedTracker.current) {
      const owned = ownedTracker.current; ownedTracker.current = null;
      setSubmissionTracker(current => current === owned ? null : current);
    }
  }
  function resetReferenceFileInput() { if (fileInputRef.current) fileInputRef.current.value = ""; }
  function avatarCurrent(operation: AvatarOperation): boolean {
    return mounted.current && session.isCurrent(operation.epoch) && avatarOperations.current.get(operation.id) === operation &&
      !operation.controller.signal.aborted && enableAvatarRef.current && providerNameRef.current === operation.provider && session.find(operation.id) === operation.expected;
  }
  function endAvatar(operation: AvatarOperation, reset = false) {
    if (avatarOperations.current.get(operation.id) !== operation) return;
    avatarOperations.current.delete(operation.id); operation.unlink?.(); operation.controller.abort();
    if (reset && session.isCurrent(operation.epoch) && session.find(operation.id) === operation.expected) {
      const item = operation.expected, media = item.mediaPath || item.storagePath;
      session.update(operation.id, { ...item, storagePath: media, mediaPath: media, avatarStatus: enableAvatarRef.current ? "idle" : undefined,
        assetId: undefined, assetUrl: undefined, avatarError: undefined, verifyTaskId: undefined }); publish();
    }
    refreshBusy();
  }
  function invalidateAvatars(reset = false) { for (const operation of [...avatarOperations.current.values()]) endAvatar(operation, reset); }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; invalidateAvatars(); }; }, []);
  useEffect(() => { invalidateAvatars(true); }, [selectedProviderName, enableSeedancePrivateAvatar]);
  function clearReferenceUpload() { invalidateAvatars(); referenceUploadState.clearReferenceUploads(); refreshBusy(); resetReferenceFileInput(); }
  function replaceReferenceUploads(items: ReferenceUploadItem[]) { invalidateAvatars(); referenceUploadState.replaceReferenceUploads(items); refreshBusy(); resetReferenceFileInput(); }
  async function handleReferenceFiles(files: File[]) {
    resetReferenceFileInput();
    if (!mounted.current) return;
    if (isGuest) { onError("访客模式无法上传参考图，请先登录。"); return; }
    const { acceptedFiles, errors } = prepareReferenceUploadFiles(files, session.items.length + session.pendingSlots, maxReferenceCount);
    errors.forEach(onError); if (acceptedFiles.length === 0) return;
    const ticket = session.reserve(acceptedFiles.length);
    if (!ownedTracker.current) {
      ownedTracker.current = buildReferenceUploadTracker({ defaultTitle, selectedProviderName: selectedProviderLabel || selectedProviderName, studioForm });
      setSubmissionTracker(ownedTracker.current);
    }
    refreshBusy();
    try {
      const uploaded = await uploadReferenceFiles(acceptedFiles, api.uploadReferenceImage);
      const items = uploaded.map(item => ({ ...item, mediaPath: item.storagePath, avatarStatus: enableAvatarRef.current ? "idle" as const : undefined }));
      if (session.finish(ticket, items)) { publish(); if (mounted.current) onClearError(); }
    } catch (error) {
      if (mounted.current && session.isPending(ticket)) onError(error instanceof Error ? error.message : "参考图上传失败");
    } finally {
      const current = session.isCurrent(ticket.epoch);
      session.fail(ticket); if (current) refreshBusy();
    }
  }
  function handleReferenceInputChange(event: ChangeEvent<HTMLInputElement>) { void handleReferenceFiles(Array.from(event.target.files || [])); }
  function handleReferenceDrop(event: DragEvent<HTMLElement>) { event.preventDefault(); void handleReferenceFiles(Array.from(event.dataTransfer.files || [])); }
  function openReferencePicker() { if (isGuest) onError("访客模式无法上传参考图，请先登录。"); else fileInputRef.current?.click(); }
  function addReferenceFromStoragePath(storagePath: string): { ok: boolean; message: string } {
    const path = storagePath.trim();
    if (!path) return { ok: false, message: "当前图片没有可用路径，无法置入参考图。" };
    if (session.items.some(item => item.storagePath === path || item.mediaPath === path)) return { ok: false, message: "这张图已经在参考图里了。" };
    const [item] = referenceUploadState.buildUploadsFromPaths([path]);
    if (!item || !session.append([{ ...item, mediaPath: path, avatarStatus: enableAvatarRef.current ? "idle" : undefined }], maxReferenceCount)) return { ok: false, message: `最多只能保留 ${maxReferenceCount} 张参考图。` };
    publish(); onClearError(); return { ok: true, message: "已置入创作区参考图。" };
  }
  function renderedItem(index: number): ReferenceUploadItem | undefined {
    const item = referenceUploads[index]; return item?.localId && session.find(item.localId) === item ? item : undefined;
  }
  function removeReferenceUpload(index: number) {
    const item = renderedItem(index); if (!item?.localId) return;
    const operation = avatarOperations.current.get(item.localId); if (operation) endAvatar(operation);
    if (session.remove(item.localId)) publish();
  }
  function replaceReferenceUploadAt(index: number, item: ReferenceUploadItem) {
    const id = item.localId ?? referenceUploads[index]?.localId;
    if (!id || !session.find(id)) { session.discard([item]); return; }
    const operation = avatarOperations.current.get(id); if (operation) endAvatar(operation);
    const media = item.mediaPath || item.storagePath;
    session.update(id, { ...item, mediaPath: media, storagePath: media, previewUrl: item.previewUrl || media,
      avatarStatus: enableAvatarRef.current ? "idle" : undefined, assetId: undefined, assetUrl: undefined, avatarError: undefined, verifyTaskId: undefined }); publish();
  }
  function beginAvatar(index: number, signal?: AbortSignal): AvatarOperation | undefined {
    const item = renderedItem(index); if (!item?.localId || !enableAvatarRef.current || signal?.aborted) return;
    const previous = avatarOperations.current.get(item.localId); if (previous && !previous.waiting) return;
    if (previous) endAvatar(previous);
    const operation: AvatarOperation = { id: item.localId, epoch: session.epoch, expected: item, provider: providerNameRef.current, controller: new AbortController(), waiting: false };
    avatarOperations.current.set(operation.id, operation);
    if (signal) { const cancel = () => endAvatar(operation, true); signal.addEventListener("abort", cancel, { once: true }); operation.unlink = () => signal.removeEventListener("abort", cancel); }
    refreshBusy(); return operation;
  }
  function commitAvatar(operation: AvatarOperation, item: ReferenceUploadItem): boolean {
    if (!avatarCurrent(operation)) return false;
    const updated = session.update(operation.id, item, operation.expected);
    if (!updated) return false; operation.expected = updated; publish(); return true;
  }
  function avatarBase(item: ReferenceUploadItem, kind: "private" | "real"): ReferenceUploadItem {
    const media = item.mediaPath || item.storagePath;
    return { ...item, mediaPath: media, storagePath: media, avatarStatus: "registering", avatarKind: kind,
      assetId: undefined, assetUrl: undefined, avatarError: undefined, verifyTaskId: undefined };
  }
  async function pollAvatarItem(item: ReferenceUploadItem, operation: AvatarOperation) {
    if (item.avatarStatus === "active" || item.avatarStatus === "failed" || !item.assetId) return item;
    return pollSeedancePrivateAvatarUntilSettled(item, { providerName: operation.provider, signal: operation.controller.signal, kind: item.avatarKind || "private" });
  }
  async function registerSeedancePrivateAvatar(index: number) {
    const operation = beginAvatar(index); if (!operation) return;
    try {
      const base = avatarBase(operation.expected, "private"); if (!commitAvatar(operation, base)) return;
      const registered = await registerSeedancePrivateAvatarForUpload(base, { providerName: operation.provider });
      if (!commitAvatar(operation, registered)) return;
      const settled = await pollAvatarItem(operation.expected, operation); if (!commitAvatar(operation, settled)) return;
      if (settled.avatarStatus === "failed" && settled.avatarError) onError(settled.avatarError); else onClearError();
    } catch (error) { if (avatarCurrent(operation)) onError(error instanceof Error ? error.message : "人像入库失败"); }
    finally { endAvatar(operation); }
  }
  async function startSeedanceRealAvatar(index: number, signal?: AbortSignal): Promise<{ taskId: string; h5Link: string }> {
    const operation = beginAvatar(index, signal); if (!operation) throw new DOMException("参考图或认证会话已变化", "AbortError");
    try {
      const base = { ...avatarBase(operation.expected, "real"), avatarStatus: "verifying" as const };
      if (!commitAvatar(operation, base)) throw new DOMException("认证会话已取消", "AbortError");
      const started = await startSeedanceRealAvatarVerify({ providerName: operation.provider });
      if (!commitAvatar(operation, { ...operation.expected, verifyTaskId: started.taskId })) throw new DOMException("认证会话已取消", "AbortError");
      operation.waiting = true; refreshBusy(); return started;
    } catch (error) { endAvatar(operation, true); throw error; }
  }
  async function completeSeedanceRealAvatar(index: number, verifyTaskId: string, signal?: AbortSignal) {
    const item = renderedItem(index); if (!item || item.verifyTaskId !== verifyTaskId || item.avatarKind !== "real") return;
    const operation = beginAvatar(index, signal); if (!operation) return;
    try {
      const base = { ...avatarBase(item, "real"), verifyTaskId }; if (!commitAvatar(operation, base)) return;
      const registered = await registerSeedanceRealAvatarForUpload(base, { providerName: operation.provider, verifyTaskId });
      if (!commitAvatar(operation, registered)) return;
      const settled = await pollAvatarItem(operation.expected, operation); if (!commitAvatar(operation, settled)) return;
      if (settled.avatarStatus === "failed" && settled.avatarError) onError(settled.avatarError); else onClearError();
    } catch (error) { if (avatarCurrent(operation)) onError(error instanceof Error ? error.message : "真人入库失败"); }
    finally { endAvatar(operation); }
  }
  return { addReferenceFromStoragePath, buildUploadsFromPaths: referenceUploadState.buildUploadsFromPaths, clearReferenceUpload,
    completeSeedanceRealAvatar, enableSeedancePrivateAvatar, handleReferenceDrop, handleReferenceInputChange, maxReferenceCount,
    openReferencePicker, referenceFileInputRef: fileInputRef, referenceUploads, registerSeedancePrivateAvatar, removeReferenceUpload,
    replaceReferenceUploadAt, replaceReferenceUploads, retrySeedancePrivateAvatar: registerSeedancePrivateAvatar, startSeedanceRealAvatar, uploadingReference };
}
