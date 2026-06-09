import StudioFeedEmptyState from "./StudioFeedEmptyState";
import StudioFeedGallery from "./StudioFeedGallery";
import type { StudioFeedCardResultProps } from "./studioFeedCardTypes";

export default function StudioFeedCardResult({
  galleryAssets,
  onAssetPreview,
  onReuse,
  showRunningState,
  task,
  virtualProgress,
}: StudioFeedCardResultProps) {
  return galleryAssets.length > 0 ? (
    <StudioFeedGallery
      assets={galleryAssets}
      task={task}
      onAssetPreview={onAssetPreview}
      onReuse={onReuse}
    />
  ) : (
    <StudioFeedEmptyState
      isRunning={showRunningState}
      status={task.status}
      virtualProgress={virtualProgress}
    />
  );
}
