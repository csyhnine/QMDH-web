import { useState } from "react";

import { seedanceAvatarStatusLabel } from "./seedancePrivateAvatar";
import type { StudioReferenceDropzoneProps } from "./studioComposerExpandedContentTypes";
import StudioReferenceAnnotateLightbox from "./StudioReferenceAnnotateLightbox";

const DEFAULT_MAX_REFERENCE_COUNT = 4;

type RealVerifySession = {
  index: number;
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
  const [annotateIndex, setAnnotateIndex] = useState<number | null>(null);
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const [realSession, setRealSession] = useState<RealVerifySession | null>(null);
  const [realBusy, setRealBusy] = useState(false);
  const [realError, setRealError] = useState<string | null>(null);
  const annotateItem =
    annotateIndex !== null ? referenceUploads[annotateIndex] ?? null : null;
  const cappedMax = Math.max(1, Math.min(4, maxReferenceCount));
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
        onClick={onOpenReferencePicker}
        onDrop={onReferenceDrop}
        onDragOver={(event) => event.preventDefault()}
      >
        <span className="reference-dropzone-plus">+</span>
        <span className="reference-dropzone-empty-copy">
          {isEditMode ? "上传要编辑的参考图" : "添加可选参考图"}
        </span>
      </button>
    );
  }

  async function handleStartReal(index: number) {
    if (!onStartSeedanceRealAvatar) return;
    setMenuIndex(null);
    setRealError(null);
    setRealBusy(true);
    try {
      const started = await onStartSeedanceRealAvatar(index);
      setRealSession({ index, taskId: started.taskId, h5Link: started.h5Link });
    } catch (error) {
      setRealError(error instanceof Error ? error.message : "发起真人认证失败");
    } finally {
      setRealBusy(false);
    }
  }

  async function handleCompleteReal() {
    if (!realSession || !onCompleteSeedanceRealAvatar) return;
    setRealBusy(true);
    setRealError(null);
    try {
      await onCompleteSeedanceRealAvatar(realSession.index, realSession.taskId);
      setRealSession(null);
    } catch (error) {
      setRealError(error instanceof Error ? error.message : "真人入库失败");
    } finally {
      setRealBusy(false);
    }
  }

  return (
    <>
      <div
        className="reference-dropzone has-preview"
        onDrop={onReferenceDrop}
        onDragOver={(event) => event.preventDefault()}
      >
        <div className="reference-preview-grid">
          {referenceUploads.slice(0, cappedMax).map((item, index) => {
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
                key={`${item.mediaPath || item.storagePath}-${index}`}
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
                      onClick={() => setMenuIndex(menuIndex === index ? null : index)}
                    >
                      入库
                    </button>
                    {menuIndex === index ? (
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
                    onClick={() => setAnnotateIndex(index)}
                  >
                    标注
                  </button>
                ) : null}
                <button
                  type="button"
                  className="reference-preview-remove"
                  aria-label={`移除 ${item.fileName}`}
                  onClick={() => onRemoveReferenceUpload(index)}
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
      {annotateItem && annotateIndex !== null && onReplaceReferenceUpload ? (
        <StudioReferenceAnnotateLightbox
          item={annotateItem}
          index={annotateIndex}
          onClose={() => setAnnotateIndex(null)}
          onReplace={onReplaceReferenceUpload}
        />
      ) : null}
      {realSession || realError ? (
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
              <button type="button" disabled={realBusy} onClick={() => { setRealSession(null); setRealError(null); }}>
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
