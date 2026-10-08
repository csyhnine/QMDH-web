import { useEffect } from "react";

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
  onUpscaleAsset,
  onUseAssetAsReference,
  upscaleEnabled,
  upscalingAssetKey,
  onBookmarkAsset,
  onShareAsset,
  onDeleteTask,
  onPreviewAsset,
  onCopyTaskToComposer,
}: StudioHistoryFeedProps) {
  useEffect(() => {
    const taskId = new URLSearchParams(window.location.search).get("task");
    if (!taskId) return;
    document.getElementById(`studio-task-${taskId}`)?.scrollIntoView({ block: "center" });
  }, [tasks]);

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
          onUpscaleAsset={onUpscaleAsset}
          onUseAssetAsReference={onUseAssetAsReference}
          upscaleEnabled={upscaleEnabled}
          upscalingAssetKey={upscalingAssetKey}
          onBookmarkAsset={onBookmarkAsset}
          onShareAsset={onShareAsset}
          onDeleteTask={onDeleteTask}
          onPreviewAsset={onPreviewAsset}
          onCopyTaskToComposer={onCopyTaskToComposer}
        />
      ))}
    </>
  );
}
