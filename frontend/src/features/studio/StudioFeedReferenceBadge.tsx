import type { StudioFeedReferenceBadgeProps } from "./studioFeedCardTypes";

function isRenderableReferenceUrl(path: string): boolean {
  return /^(https?:|data:|blob:|\/)/.test(path.trim());
}

export default function StudioFeedReferenceBadge({
  imageCount,
  imageLabel,
  images,
}: StudioFeedReferenceBadgeProps) {
  const previewImages = images.map((path) => path.trim()).filter(isRenderableReferenceUrl);
  const primaryImage = previewImages[0] ?? "";
  if (!primaryImage) return null;

  return (
    <div
      className="feed-card-reference-badge"
      tabIndex={0}
      aria-label={`本任务使用了 ${imageCount} 张参考图，悬停可查看原图`}
    >
      <div className="feed-card-reference-stack">
        <img src={primaryImage} alt="参考图缩略图" />
        {imageCount > 1 ? <span className="feed-card-reference-count">+{imageCount - 1}</span> : null}
      </div>
      <div className="feed-card-reference-copy">
        <strong>参考图</strong>
        <span>{imageCount > 1 ? `${imageLabel} 等 ${imageCount} 张` : imageLabel}</span>
      </div>
      <div className="feed-card-reference-hover-preview" aria-hidden="true">
        <div
          className={
            previewImages.length > 1
              ? "feed-card-reference-hover-grid is-multi"
              : "feed-card-reference-hover-grid"
          }
        >
          {previewImages.map((src, index) => (
            <figure key={`${src}-${index}`} className="feed-card-reference-hover-figure">
              <img src={src} alt="" />
              {previewImages.length > 1 ? (
                <figcaption>参考图 {index + 1}</figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
