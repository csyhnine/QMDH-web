import type { StudioShareConfirmLightboxProps } from "./studioMediaLightboxTypes";

export default function StudioShareConfirmLightbox({
  shareConfirmState,
  onClose,
  onConfirm,
}: StudioShareConfirmLightboxProps) {
  return (
    <div
      className="media-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={"\u786e\u8ba4\u5206\u4eab\u5230\u7075\u611f\u5e93"}
      onClick={onClose}
    >
      <div className="media-lightbox-surface share-confirm-modal" onClick={(event) => event.stopPropagation()}>
        <header className="media-lightbox-head">
          <span className="media-lightbox-title">{"\u786e\u8ba4\u5206\u4eab\u5230\u7075\u611f\u5e93"}</span>
          <button type="button" className="media-lightbox-close" aria-label={"\u5173\u95ed"} onClick={onClose}>
            {"\u00d7"}
          </button>
        </header>
        <div className="share-confirm-copy">
          <strong>{shareConfirmState.title}</strong>
          <p>
            {"\u786e\u8ba4\u540e\uff0c\u8fd9\u6761\u5185\u5bb9\u4f1a\u4ee5\u201c\u539f\u56fe / \u6700\u7ec8\u56fe\u201d\u7684\u5bf9\u6bd4\u5f62\u5f0f\u8fdb\u5165\u7075\u611f\u5e93\uff0c\u5176\u4ed6\u8bbe\u8ba1\u5e08\u53ef\u4ee5\u76f4\u63a5\u770b\u5230\u524d\u540e\u53d8\u5316\u3002"}
          </p>
        </div>
        <div className="share-confirm-compare" aria-label={"\u539f\u56fe\u4e0e\u6700\u7ec8\u56fe\u5bf9\u6bd4\u9884\u89c8"}>
          <figure className="share-confirm-figure">
            <img src={shareConfirmState.sourceImagePath} alt={"\u539f\u56fe\u9884\u89c8"} />
            <figcaption>{"\u539f\u56fe"}</figcaption>
          </figure>
          <figure className="share-confirm-figure">
            <img src={shareConfirmState.finalImagePath} alt={"\u6700\u7ec8\u56fe\u9884\u89c8"} />
            <figcaption>{"\u6700\u7ec8\u56fe"}</figcaption>
          </figure>
        </div>
        <footer className="share-confirm-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            {"\u53d6\u6d88"}
          </button>
          <button type="button" className="workspace-primary" onClick={onConfirm}>
            {"\u786e\u8ba4\u5206\u4eab"}
          </button>
        </footer>
      </div>
    </div>
  );
}
