import type { StudioGalleryPreviewLightboxProps } from "./studioMediaLightboxTypes";
import { isVideoAsset } from "./studioUtils";

export default function StudioGalleryPreviewLightbox({
  galleryPreview,
  previewUrl,
  onApplyToComposer,
  onClose,
}: StudioGalleryPreviewLightboxProps) {
  const videoAsset = isVideoAsset(galleryPreview.asset);

  return (
    <div
      className="media-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={videoAsset ? "生成视频预览" : "生成图预览"}
      onClick={onClose}
    >
      <div className="media-lightbox-surface" onClick={(event) => event.stopPropagation()}>
        <header className="media-lightbox-head">
          <span className="media-lightbox-title">{galleryPreview.asset.name}</span>
          <button type="button" className="media-lightbox-close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="media-lightbox-body">
          {videoAsset ? (
            <video src={previewUrl} controls autoPlay playsInline />
          ) : (
            <img src={previewUrl} alt="" />
          )}
        </div>
        <footer className="media-lightbox-foot">
          <button
            type="button"
            className="ghost-button"
            onClick={() => onApplyToComposer(galleryPreview.task, galleryPreview.asset)}
          >
            填入创作框
          </button>
          <button type="button" className="submit-button" onClick={onClose}>
            关闭
          </button>
        </footer>
      </div>
    </div>
  );
}
