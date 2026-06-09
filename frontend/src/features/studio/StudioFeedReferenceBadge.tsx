type StudioFeedReferenceBadgeProps = {
  imageCount: number;
  imageLabel: string;
  primaryImage: string;
};

export default function StudioFeedReferenceBadge({
  imageCount,
  imageLabel,
  primaryImage,
}: StudioFeedReferenceBadgeProps) {
  if (!primaryImage) return null;

  return (
    <div className="feed-card-reference-badge" aria-label={`本任务使用了 ${imageCount} 张参考图`}>
      <div className="feed-card-reference-stack">
        <img src={primaryImage} alt="参考图缩略图" />
        {imageCount > 1 ? <span className="feed-card-reference-count">+{imageCount - 1}</span> : null}
      </div>
      <div className="feed-card-reference-copy">
        <strong>参考图</strong>
        <span>{imageCount > 1 ? `${imageLabel} 等 ${imageCount} 张` : imageLabel}</span>
      </div>
    </div>
  );
}
