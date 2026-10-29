import { useEffect, useRef, useState } from "react";

import { seedanceAvatarStatusLabel } from "./seedancePrivateAvatar";
import type { StudioReferenceDropzoneProps } from "./studioComposerExpandedContentTypes";
import { referenceItemIdentity, referenceItemContent } from "./studioReferenceUploadSession";
import type { ReferenceUploadItem } from "./studioTypes";
import StudioReferenceAnnotateLightbox from "./StudioReferenceAnnotateLightbox";

const DEFAULT_MAX_REFERENCE_COUNT = 4;

type RealVerifySession = {
  itemId: string;
  content: string;
  serial: number;
  taskId: string;
  h5Link: string;
};

export default function StudioReferenceDropzone({
  creationMode,
  referenceUploads,
  maxReferenceCount = DEFAULT_MAX_REFERENCE_COUNT,
  enableSeedanceAvatar = false,
  onOpenReferencePicker,
  onReferenceDrop,
  onRemoveReferenceUpload,
  onReplaceReferenceUpload,
  onRegisterSeedancePrivateAvatar,
  onStartSeedanceRealAvatar,
  onCompleteSeedanceRealAvatar,
}: StudioReferenceDropzoneProps) {
  const [annotation, setAnnotation] = useState<{ itemId: string; content: string; serial: number } | null>(null);
  const [menuIndex, setMenuIndex] = useState<string | null>(null);
  const [realSession, setRealSession] = useState<RealVerifySession | null>(null);
  const [realBusy, setRealBusy] = useState(false);
  const [realError, setRealError] = useState<string | null>(null);
  const mounted = useRef(true), serial = useRef(0), realBusyRef = useRef(false);
  const itemsRef = useRef(referenceUploads); itemsRef.current = referenceUploads;
  const callbacks = useRef({ onRemoveReferenceUpload, onReplaceReferenceUpload, onStartSeedanceRealAvatar, onCompleteSeedanceRealAvatar });
  callbacks.current = { onRemoveReferenceUpload, onReplaceReferenceUpload, onStartSeedanceRealAvatar, onCompleteSeedanceRealAvatar };
  const annotationRef = useRef(annotation); annotationRef.current = annotation;
  const realControl = useRef<{ itemId: string; content: string; serial: number; taskId?: string; controller: AbortController } | null>(null);
  const annotateItem = annotation ? referenceUploads.find(item => referenceItemIdentity(item) === annotation.itemId && referenceItemContent(item) === annotation.content) : null;
  function closeAnnotation(expected: number) { if (mounted.current && annotationRef.current?.serial === expected) { annotationRef.current = null; setAnnotation(null); } }
  function openAnnotation(item: ReferenceUploadItem) { const next = { itemId: referenceItemIdentity(item), content: referenceItemContent(item), serial: ++serial.current }; annotationRef.current = next; setAnnotation(next); }
  function cancelReal() { realBusyRef.current = false; const old = realControl.current; realControl.current = null; old?.controller.abort(); if (mounted.current) { setRealSession(null); setRealError(null); setRealBusy(false); } }
  function realCurrent(request: NonNullable<typeof realControl.current>) { return mounted.current && realControl.current === request && !request.controller.signal.aborted && itemsRef.current.some(item => referenceItemIdentity(item) === request.itemId && referenceItemContent(item) === request.content && (!request.taskId || item.verifyTaskId === request.taskId)); }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; realControl.current?.controller.abort(); realControl.current = null; annotationRef.current = null; }; }, []);
  useEffect(() => {
    if (annotation && !annotateItem) closeAnnotation(annotation.serial);
    if (realControl.current && (!enableSeedanceAvatar || !realCurrent(realControl.current))) cancelReal();
  }, [referenceUploads, enableSeedanceAvatar]);
  const cappedMax = Number.isFinite(maxReferenceCount)
    ? Math.max(0, Math.floor(maxReferenceCount))
    : DEFAULT_MAX_REFERENCE_COUNT;
  const canAddMore = referenceUploads.length < cappedMax;

  const isEditMode = creationMode === "edit";
  const needsReference = isEditMode && referenceUploads.length === 0;

  if (referenceUploads.length === 0) {
    return (
      <button
        type="button"
        className={[
          "reference-dropzone",
          needsReference ? "is-required" : "",
          isEditMode ? "is-edit-mode" : "is-generate-mode",
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={cappedMax === 0}
        onClick={onOpenReferencePicker}
        onDrop={onReferenceDrop}
        onDragOver={(event) => event.preventDefault()}
      >
        <span className="reference-dropzone-plus">+</span>
        <span className="reference-dropzone-empty-copy">
          {cappedMax === 0 ? "当前档位无需参考图" : isEditMode ? "上传要编辑的参考图" : "添加可选参考图"}
        </span>
      </button>
    );
  }

  async function handleStartReal(index: number) {
    const item = referenceUploads[index]; if (realBusyRef.current || !item || !callbacks.current.onStartSeedanceRealAvatar) return;
    cancelReal();
    const request: NonNullable<typeof realControl.current> = { itemId: referenceItemIdentity(item), content: referenceItemContent(item), serial: ++serial.current, controller: new AbortController() };
    realControl.current = request; realBusyRef.current = true; setMenuIndex(null); setRealError(null); setRealBusy(true);
    try {
      const liveIndex = itemsRef.current.findIndex(entry => referenceItemIdentity(entry) === request.itemId);
      const started = await callbacks.current.onStartSeedanceRealAvatar(liveIndex, request.controller.signal);
      if (realCurrent(request)) {
        setRealSession({ itemId: request.itemId, content: request.content, serial: request.serial, taskId: started.taskId, h5Link: started.h5Link });
        request.taskId = started.taskId;
      }
    } catch (error) {
      if (mounted.current && realControl.current === request && error instanceof DOMException && error.name === "AbortError") cancelReal();
      else if (realCurrent(request)) setRealError(error instanceof Error ? error.message : "发起真人认证失败");
    }
    finally { if (mounted.current && realControl.current === request && !request.controller.signal.aborted) { realBusyRef.current = false; setRealBusy(false); } }
  }
  async function handleCompleteReal() {
    const request = realControl.current;
    if (realBusyRef.current || !request || !realSession || request.serial !== realSession.serial || !realCurrent(request) || !callbacks.current.onCompleteSeedanceRealAvatar) return;
    realBusyRef.current = true; setRealBusy(true); setRealError(null);
    try {
      const index = itemsRef.current.findIndex(item => referenceItemIdentity(item) === request.itemId);
      await callbacks.current.onCompleteSeedanceRealAvatar(index, realSession.taskId, request.controller.signal);
      if (realCurrent(request)) cancelReal();
    } catch (error) { if (realCurrent(request)) setRealError(error instanceof Error ? error.message : "真人入库失败"); }
    finally { if (mounted.current && realControl.current === request && !request.controller.signal.aborted) { realBusyRef.current = false; setRealBusy(false); } }
  }

  return (
    <>
      <div
        className="reference-dropzone has-preview"
        onDrop={onReferenceDrop}
        onDragOver={(event) => event.preventDefault()}
      >
        <div className="reference-preview-grid">
          {referenceUploads.map((item, index) => {
            const effectiveStatus =
              item.avatarStatus ||
              (enableSeedanceAvatar && !item.storagePath.startsWith("asset://") ? "idle" : undefined);
            const displayItem = { ...item, avatarStatus: effectiveStatus };
            const avatarLabel = enableSeedanceAvatar ? seedanceAvatarStatusLabel(displayItem) : null;
            const showRegister =
              enableSeedanceAvatar &&
              Boolean(onRegisterSeedancePrivateAvatar) &&
              effectiveStatus !== "active" &&
              effectiveStatus !== "registering" &&
              effectiveStatus !== "processing" &&
              effectiveStatus !== "verifying";
            const previewSrc =
              item.previewUrl.startsWith("asset://")
                ? item.mediaPath || item.previewUrl
                : item.previewUrl;
            return (
              <div
                key={referenceItemIdentity(item)}
                className={
                  effectiveStatus === "failed"
                    ? "reference-preview-item is-avatar-failed"
                    : effectiveStatus === "active"
                      ? "reference-preview-item is-avatar-active"
                      : effectiveStatus === "registering" ||
                          effectiveStatus === "processing" ||
                          effectiveStatus === "verifying"
                        ? "reference-preview-item is-avatar-pending"
                        : effectiveStatus === "idle"
                          ? "reference-preview-item is-avatar-idle"
                          : "reference-preview-item"
                }
              >
                <div className="reference-preview-hit" aria-hidden="true">
                  <img src={previewSrc} alt={item.fileName} className="reference-preview" />
                </div>
                {avatarLabel ? (
                  <span className="reference-preview-avatar-status" title={avatarLabel}>
                    {avatarLabel}
                  </span>
                ) : null}
                {showRegister ? (
                  <div className="reference-preview-avatar-actions">
                    <button
                      type="button"
                      className="reference-preview-avatar-entry"
                      onClick={() => setMenuIndex(menuIndex === referenceItemIdentity(item) ? null : referenceItemIdentity(item))}
                    >
                      入库
                    </button>
                    {menuIndex === referenceItemIdentity(item) ? (
                      <div className="reference-preview-avatar-menu">
                        <button
                          type="button"
                          onClick={() => {
                            setMenuIndex(null);
                            onRegisterSeedancePrivateAvatar?.(index);
                          }}
                        >
                          虚拟人入库
                        </button>
                        <button type="button" onClick={() => void handleStartReal(index)}>
                          真人入库
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {onReplaceReferenceUpload ? (
                  <button
                    type="button"
                    className="reference-preview-annotate"
                    aria-label={`标注 ${item.fileName}`}
                    title="标注参考图"
                    onClick={() => openAnnotation(item)}
                  >
                    标注
                  </button>
                ) : null}
                <button
                  type="button"
                  className="reference-preview-remove"
                  aria-label={`移除 ${item.fileName}`}
                  onClick={() => { const currentIndex = itemsRef.current.findIndex(entry => referenceItemIdentity(entry) === referenceItemIdentity(item)); if (currentIndex >= 0) callbacks.current.onRemoveReferenceUpload(currentIndex); }}
                >
                  ×
                </button>
              </div>
            );
          })}
          {canAddMore ? (
            <button
              type="button"
              className="reference-preview-add"
              onClick={onOpenReferencePicker}
              aria-label={`继续添加参考图（还可 ${cappedMax - referenceUploads.length} 张）`}
              title="继续添加参考图"
            >
              <span className="reference-dropzone-plus">+</span>
            </button>
          ) : null}
        </div>
      </div>
      {annotateItem && annotation && onReplaceReferenceUpload ? (
        <StudioReferenceAnnotateLightbox
          key={`${annotation.itemId}:${annotation.serial}`}
          item={annotateItem}
          index={referenceUploads.indexOf(annotateItem)}
          onClose={() => closeAnnotation(annotation.serial)}
          onReplace={(_index, next) => {
            if (!mounted.current || annotationRef.current?.serial !== annotation.serial) return;
            const index = itemsRef.current.findIndex(item => referenceItemIdentity(item) === annotation.itemId && referenceItemContent(item) === annotation.content);
            if (index >= 0) callbacks.current.onReplaceReferenceUpload?.(index, { ...next, localId: itemsRef.current[index].localId });
          }}
        />
      ) : null}
      {realControl.current || realSession || realError ? (
        <div className="seedance-real-avatar-modal" role="dialog" aria-modal="true">
          <div className="seedance-real-avatar-dialog">
            <h3>真人入库认证</h3>
            <p>请在手机打开认证页完成人脸核验，完成后回到这里继续入库。</p>
            {realSession ? (
              <a href={realSession.h5Link} target="_blank" rel="noreferrer" className="seedance-real-avatar-link">
                打开真人认证 H5
              </a>
            ) : null}
            {realError ? <p className="seedance-real-avatar-error">{realError}</p> : null}
            <div className="seedance-real-avatar-actions">
              <button type="button" onClick={cancelReal}>
                取消
              </button>
              <button type="button" disabled={realBusy || !realSession} onClick={() => void handleCompleteReal()}>
                {realBusy ? "处理中…" : "认证完成，继续入库"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
