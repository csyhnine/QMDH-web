import StudioHistoryFeedItem from "./StudioHistoryFeedItem";
import type { StudioHistoryFeedProps } from "./studioHistoryFeedTypes";

export default function StudioHistoryFeed({
  tasks,
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
}: StudioHistoryFeedProps) {
  return (
    <>
      {tasks.map((task) => (
        <StudioHistoryFeedItem
          key={task.id}
          task={task}
          imageAssetsByTaskId={imageAssetsByTaskId}
          latestTask={latestTask}
          latestTaskRef={latestTaskRef}
          providerDisplayNameMap={providerDisplayNameMap}
          showDebugDetails={showDebugDetails}
          submitting={submitting}
          regeneratingTaskId={regeneratingTaskId}
          pendingActionByTaskId={pendingActionByTaskId}
          feedbackByTaskId={feedbackByTaskId}
          onRegenerateTask={onRegenerateTask}
          onBookmarkAsset={onBookmarkAsset}
          onShareAsset={onShareAsset}
          onDeleteTask={onDeleteTask}
          onPreviewAsset={onPreviewAsset}
          onApplyTaskToComposer={onApplyTaskToComposer}
        />
      ))}
    </>
  );
}
