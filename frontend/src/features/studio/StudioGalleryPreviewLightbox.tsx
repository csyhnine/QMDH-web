import type { StudioGalleryPreviewLightboxProps } from "./studioMediaLightboxTypes";

export default function StudioGalleryPreviewLightbox({
  galleryPreview,
  previewUrl,
  onApplyToComposer,
  onClose,
}: StudioGalleryPreviewLightboxProps) {
  return (
    <div
      className="media-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={"\u751f\u6210\u56fe\u9884\u89c8"}
      onClick={onClose}
    >
      <div className="media-lightbox-surface" onClick={(event) => event.stopPropagation()}>
        <header className="media-lightbox-head">
          <span className="media-lightbox-title">{galleryPreview.asset.name}</span>
          <button type="button" className="media-lightbox-close" aria-label={"\u5173\u95ed"} onClick={onClose}>
            {"\u00d7"}
          </button>
        </header>
        <div className="media-lightbox-body">
          <img src={previewUrl} alt="" />
        </div>
        <footer className="media-lightbox-foot">
          <button
            type="button"
            className="ghost-button"
            onClick={() => onApplyToComposer(galleryPreview.task, galleryPreview.asset)}
          >
            {"\u586b\u5165\u521b\u4f5c\u6846"}
          </button>
          <button type="button" className="submit-button" onClick={onClose}>
            {"\u5173\u95ed"}
          </button>
        </footer>
      </div>
    </div>
  );
}
