import { useState } from "react";

import type { StudioReferenceDropzoneProps } from "./studioComposerExpandedContentTypes";
import StudioReferenceAnnotateLightbox from "./StudioReferenceAnnotateLightbox";

export default function StudioReferenceDropzone({
  referenceUploads,
  onOpenReferencePicker,
  onReferenceDrop,
  onRemoveReferenceUpload,
  onReplaceReferenceUpload,
}: StudioReferenceDropzoneProps) {
  const [annotateIndex, setAnnotateIndex] = useState<number | null>(null);
  const annotateItem =
    annotateIndex !== null ? referenceUploads[annotateIndex] ?? null : null;

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
          {referenceUploads.slice(0, 4).map((item, index) => (
            <div key={item.storagePath} className="reference-preview-item">
              <button
                type="button"
                className="reference-preview-hit"
                onClick={onOpenReferencePicker}
                aria-label={`查看或更换参考图 ${item.fileName}`}
              >
                <img src={item.previewUrl} alt={item.fileName} className="reference-preview" />
              </button>
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
          ))}
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
