import type { StudioReferenceDropzoneProps } from "./studioComposerExpandedContentTypes";

export default function StudioReferenceDropzone({
  referenceUploads,
  onOpenReferencePicker,
  onReferenceDrop,
  onRemoveReferenceUpload,
}: StudioReferenceDropzoneProps) {
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
  );
}
