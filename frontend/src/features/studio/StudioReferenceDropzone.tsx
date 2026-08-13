import { useState } from "react";

import { seedanceAvatarStatusLabel } from "./seedancePrivateAvatar";
import type { StudioReferenceDropzoneProps } from "./studioComposerExpandedContentTypes";
import StudioReferenceAnnotateLightbox from "./StudioReferenceAnnotateLightbox";

const DEFAULT_MAX_REFERENCE_COUNT = 4;

export default function StudioReferenceDropzone({
  referenceUploads,
  maxReferenceCount = DEFAULT_MAX_REFERENCE_COUNT,
  onOpenReferencePicker,
  onReferenceDrop,
  onRemoveReferenceUpload,
  onReplaceReferenceUpload,
  onRetrySeedancePrivateAvatar,
}: StudioReferenceDropzoneProps) {
  const [annotateIndex, setAnnotateIndex] = useState<number | null>(null);
  const annotateItem =
    annotateIndex !== null ? referenceUploads[annotateIndex] ?? null : null;
  const cappedMax = Math.max(1, Math.min(4, maxReferenceCount));
  const canAddMore = referenceUploads.length < cappedMax;

  if (referenceUploads.length === 0) {
    return (
      <button
        type="button"
        className="reference-dropzone"
        onClick={onOpenReferencePicker}
        onDrop={onReferenceDrop}
        onDragOver={(event) => event.preventDefault()}
      >
        <span className="reference-dropzone-plus">+</span>
      </button>
    );
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
            const avatarLabel = seedanceAvatarStatusLabel(item);
            const previewSrc =
              item.previewUrl.startsWith("asset://")
                ? item.mediaPath || item.previewUrl
                : item.previewUrl;
            return (
              <div
                key={`${item.mediaPath || item.storagePath}-${index}`}
                className={
                  item.avatarStatus === "failed"
                    ? "reference-preview-item is-avatar-failed"
                    : item.avatarStatus === "active"
                      ? "reference-preview-item is-avatar-active"
                      : item.avatarStatus === "registering" || item.avatarStatus === "processing"
                        ? "reference-preview-item is-avatar-pending"
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
                {item.avatarStatus === "failed" && onRetrySeedancePrivateAvatar ? (
                  <button
                    type="button"
                    className="reference-preview-avatar-retry"
                    onClick={() => onRetrySeedancePrivateAvatar(index)}
                  >
                    重试入库
                  </button>
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
    </>
  );
}
