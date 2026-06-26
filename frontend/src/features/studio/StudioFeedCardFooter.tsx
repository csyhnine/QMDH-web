import StudioFeedCardActions from "./StudioFeedCardActions";
import type { StudioFeedCardFooterProps } from "./studioFeedCardTypes";
import { briefProviderLabel, formatDate, formatDuration } from "./studioUtils";

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
          <span>{formatDuration(task.latency_ms)}</span>
        </div>
        <span className="feed-card-time">{formatDate(createdAt)}</span>
      </div>
      {feedback ? <p className={`feed-card-feedback ${feedback.tone}`}>{feedback.message}</p> : null}
    </div>
  );
}
