import type { StudioReferenceUploadListProps } from "./studioComposerExpandedContentTypes";

export default function StudioReferenceUploadList({
  referenceUploads,
  onRemoveReferenceUpload,
}: StudioReferenceUploadListProps) {
  if (referenceUploads.length === 0) {
    return null;
  }

  return (
    <div className="reference-upload-list">
      {referenceUploads.map((item, index) => (
        <div key={item.storagePath} className="reference-upload-chip">
          <span>
            {index + 1}. {item.fileName}
          </span>
          <button type="button" onClick={() => onRemoveReferenceUpload(index)}>
            移除
          </button>
        </div>
      ))}
    </div>
  );
}
