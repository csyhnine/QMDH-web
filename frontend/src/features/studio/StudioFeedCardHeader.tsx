import StudioFeedCardAvatar from "./StudioFeedCardAvatar";
import StudioFeedCardFailureDetails from "./StudioFeedCardFailureDetails";
import StudioFeedCardMeta from "./StudioFeedCardMeta";
import StudioFeedCardSummary from "./StudioFeedCardSummary";
import StudioFeedCardTopline from "./StudioFeedCardTopline";
import type { StudioFeedCardHeaderProps } from "./studioFeedCardTypes";

export default function StudioFeedCardHeader({
  displayTitle,
  hasLongSummary,
  hasReferenceImage,
  isInGallery,
  providerDisplayName,
  referenceImageCount,
  showDebugDetails,
  summary,
  summaryPreview,
  task,
}: StudioFeedCardHeaderProps) {
  return (
    <div className="feed-card-head">
      <StudioFeedCardAvatar providerDisplayName={providerDisplayName} />
      <div className="feed-card-copy">
        <StudioFeedCardTopline displayTitle={displayTitle} status={task.status} />
        <StudioFeedCardSummary
          hasLongSummary={hasLongSummary}
          summary={summary}
          summaryPreview={summaryPreview}
        />
        <StudioFeedCardFailureDetails showDebugDetails={showDebugDetails} task={task} />
        <StudioFeedCardMeta
          hasReferenceImage={hasReferenceImage}
          isInGallery={isInGallery}
          providerDisplayName={providerDisplayName}
          referenceImageCount={referenceImageCount}
          showDebugDetails={showDebugDetails}
          task={task}
        />
      </div>
    </div>
  );
}
