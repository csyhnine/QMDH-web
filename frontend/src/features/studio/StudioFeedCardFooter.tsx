import StudioFeedCardActions from "./StudioFeedCardActions";
import type { StudioFeedCardFooterProps } from "./studioFeedCardTypes";
import {
  briefProviderLabel,
  formatDate,
  formatDuration,
  formatFeedCardPixelSize,
  formatFeedCardResolutionLabel,
} from "./studioUtils";

export default function StudioFeedCardFooter({
  asset,
  createdAt,
  feedback,
  pendingAction,
  providerDisplayName,
  reuseDisabled,
  task,
  onBookmark,
  onDelete,
  onReuse,
  onShare,
}: StudioFeedCardFooterProps) {
  const resolutionLabel = formatFeedCardResolutionLabel(task);
  const pixelSizeLabel = formatFeedCardPixelSize(task);

  return (
    <div className="feed-card-footer">
      <div className="feed-card-actions">
        <StudioFeedCardActions
          asset={asset}
          feedback={feedback}
          pendingAction={pendingAction}
          reuseDisabled={reuseDisabled}
          onBookmark={onBookmark}
          onDelete={onDelete}
          onReuse={onReuse}
          onShare={onShare}
        />
        <div className="feed-card-footer-meta" aria-label="生成参数">
          <span>{briefProviderLabel(providerDisplayName)}</span>
          {resolutionLabel ? <span>{resolutionLabel}</span> : null}
          {pixelSizeLabel ? <span>{pixelSizeLabel}</span> : null}
          <span>{formatDuration(task.latency_ms)}</span>
        </div>
        <span className="feed-card-time">{formatDate(createdAt)}</span>
      </div>
      {feedback ? <p className={`feed-card-feedback ${feedback.tone}`}>{feedback.message}</p> : null}
    </div>
  );
}
