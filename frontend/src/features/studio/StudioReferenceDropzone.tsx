import type { StudioReferenceDropzoneProps } from "./studioComposerExpandedContentTypes";

export default function StudioReferenceDropzone({
  referenceUploads,
  onOpenReferencePicker,
  onReferenceDrop,
}: StudioReferenceDropzoneProps) {
  return (
    <button
      type="button"
      className={referenceUploads.length > 0 ? "reference-dropzone has-preview" : "reference-dropzone"}
      onClick={onOpenReferencePicker}
      onDrop={onReferenceDrop}
      onDragOver={(event) => event.preventDefault()}
    >
      {referenceUploads.length > 0 ? (
        <div className="reference-preview-grid">
          {referenceUploads.slice(0, 4).map((item) => (
            <img key={item.storagePath} src={item.previewUrl} alt={item.fileName} className="reference-preview" />
          ))}
        </div>
      ) : (
        <span className="reference-dropzone-plus">+</span>
      )}
    </button>
  );
}
