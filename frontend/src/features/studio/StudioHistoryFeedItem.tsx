import StudioFeedCard from "./StudioFeedCard";
import type { StudioHistoryFeedItemProps } from "./studioHistoryFeedTypes";
import { buildGalleryAssets, getRenderableUrl } from "./studioUtils";

export default function StudioHistoryFeedItem({
  task,
  imageAssetsByTaskId,
  latestTask,
  latestTaskRef,
  providerDisplayNameMap,
  showDebugDetails,
  submitting,
  regeneratingTaskId,
  pendingActionByTaskId,
  feedbackByTaskId,
  onRegenerateTask,
  onBookmarkAsset,
  onShareAsset,
  onDeleteTask,
  onPreviewAsset,
  onApplyTaskToComposer,
}: StudioHistoryFeedItemProps) {
  const galleryAssets = buildGalleryAssets(imageAssetsByTaskId.get(task.id) ?? []);
  const linkedAsset = galleryAssets[0];
  const isLatestTask = task.id === latestTask?.id;

  return (
    <StudioFeedCard
      task={task}
      providerDisplayName={providerDisplayNameMap.get(task.requested_provider) ?? task.requested_provider}
      asset={linkedAsset}
      galleryAssets={galleryAssets}
      showDebugDetails={showDebugDetails}
      onReuse={() => onRegenerateTask(task, linkedAsset ?? galleryAssets[0])}
      reuseDisabled={submitting || regeneratingTaskId === task.id}
      onBookmark={() => (linkedAsset ? onBookmarkAsset(task.id, linkedAsset.id) : undefined)}
      onShare={() => (linkedAsset ? onShareAsset(task, linkedAsset) : undefined)}
      onDelete={() => onDeleteTask(task)}
      onAssetPreview={(asset) => {
        if (getRenderableUrl(asset)) {
          onPreviewAsset(task, asset);
        } else {
          onApplyTaskToComposer(task, asset);
        }
      }}
      anchorRef={isLatestTask ? latestTaskRef : undefined}
      pendingAction={pendingActionByTaskId[task.id] ?? null}
      feedback={feedbackByTaskId[task.id] ?? null}
    />
  );
}
