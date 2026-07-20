import StudioFeedEmptyState from "./StudioFeedEmptyState";
import StudioFeedGallery from "./StudioFeedGallery";
import type { StudioFeedCardResultProps } from "./studioFeedCardTypes";

export default function StudioFeedCardResult({
  galleryAssets,
  onAssetPreview,
  onReuse,
  onUpscaleAsset,
  onUseAssetAsReference,
  showRunningState,
  task,
  upscaleDisabled,
  upscaleEnabled,
  upscalingAssetKey,
  virtualProgress,
}: StudioFeedCardResultProps) {
  return galleryAssets.length > 0 ? (
    <StudioFeedGallery
      assets={galleryAssets}
      task={task}
      onAssetPreview={onAssetPreview}
      onReuse={onReuse}
      onUpscaleAsset={onUpscaleAsset}
      onUseAssetAsReference={onUseAssetAsReference}
      upscaleDisabled={upscaleDisabled}
      upscaleEnabled={upscaleEnabled}
      upscalingAssetKey={upscalingAssetKey}
    />
  ) : (
    <StudioFeedEmptyState
      isRunning={showRunningState}
      status={task.status}
      virtualProgress={virtualProgress}
    />
  );
}
