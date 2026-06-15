import type { StudioShareConfirmLightboxProps } from "./studioMediaLightboxTypes";

function shareConfirmDescription({
  mediaType,
  sourceImagePath,
}: Pick<StudioShareConfirmLightboxProps["shareConfirmState"], "mediaType" | "sourceImagePath">) {
  if (mediaType === "video") {
    return sourceImagePath
      ? "确认后，这条视频会以“参考图 / 最终视频”的形式进入灵感库，其他设计师可以直接看到前后参考关系。"
      : "确认后，这条视频会作为单条作品进入灵感库，其他设计师可以直接观看。";
  }
  return sourceImagePath
    ? "确认后，这条内容会以“原图 / 最终图”的对比形式进入灵感库，其他设计师可以直接看到前后变化。"
    : "确认后，这条生成结果会作为单图作品进入灵感库，其他设计师可以直接查看。";
}

export default function StudioShareConfirmLightbox({
  shareConfirmState,
  onClose,
  onConfirm,
}: StudioShareConfirmLightboxProps) {
  const hasCompare = Boolean(shareConfirmState.sourceImagePath);
  const isVideo = shareConfirmState.mediaType === "video";

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
          <p>{shareConfirmDescription(shareConfirmState)}</p>
        </div>
        {hasCompare ? (
          <div
            className="share-confirm-compare"
            aria-label={isVideo ? "\u53c2\u8003\u56fe\u4e0e\u6700\u7ec8\u89c6\u9891\u5bf9\u6bd4\u9884\u89c8" : "\u539f\u56fe\u4e0e\u6700\u7ec8\u56fe\u5bf9\u6bd4\u9884\u89c8"}
          >
            <figure className="share-confirm-figure">
              <img src={shareConfirmState.sourceImagePath} alt={"\u539f\u56fe\u9884\u89c8"} />
              <figcaption>{isVideo ? "\u53c2\u8003\u56fe" : "\u539f\u56fe"}</figcaption>
            </figure>
            <figure className="share-confirm-figure">
              {isVideo ? (
                <video src={shareConfirmState.finalMediaPath} controls playsInline preload="metadata" />
              ) : (
                <img src={shareConfirmState.finalMediaPath} alt={"\u6700\u7ec8\u56fe\u9884\u89c8"} />
              )}
              <figcaption>{isVideo ? "\u6700\u7ec8\u89c6\u9891" : "\u6700\u7ec8\u56fe"}</figcaption>
            </figure>
          </div>
        ) : (
          <div className="share-confirm-single" aria-label={isVideo ? "\u89c6\u9891\u9884\u89c8" : "\u6700\u7ec8\u56fe\u9884\u89c8"}>
            {isVideo ? (
              <video src={shareConfirmState.finalMediaPath} controls playsInline preload="metadata" />
            ) : (
              <img src={shareConfirmState.finalMediaPath} alt={"\u6700\u7ec8\u56fe\u9884\u89c8"} />
            )}
          </div>
        )}
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
