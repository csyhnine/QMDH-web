import type { StudioHistoryFeedProps } from "./studioHistoryFeedTypes";
import type { StudioHistoryCanvasProps, StudioHistoryScrollProps } from "./studioHistoryCanvasTypes";
import type { StudioHistoryPaneProps } from "./studioHistoryPaneTypes";

type StudioHistoryCanvasParts = {
  feedProps: StudioHistoryFeedProps;
  paneProps: Omit<StudioHistoryPaneProps, "children">;
  scrollProps: StudioHistoryScrollProps;
};

export function getStudioHistoryCanvasProps({
  availableProviders,
  error,
  filters,
  hasFilteredHistory,
  hasProjectHistory,
  historyActionPendingByTaskId,
  historyFeedbackByTaskId,
  historyNotice,
  imageAssetsByTaskId,
  isStudioDockLayout,
  latestTask,
  latestTaskRef,
  providerDisplayNameMap,
  regeneratingTaskId,
  showDebugDetails,
  studioScrollPaneRef,
  submitting,
  tasks,
  upscaleEnabled,
  upscalingAssetKey,
  workspaceName,
  onApplyTaskToComposer,
  onUseAssetAsReference,
  onBookmarkAsset,
  onChangeFilters,
  onDeleteTask,
  onPreviewAsset,
  onRegenerateTask,
  onShareAsset,
  onUpscaleAsset,
}: StudioHistoryCanvasProps): StudioHistoryCanvasParts {
  return {
    scrollProps: {
      isStudioDockLayout,
      studioScrollPaneRef,
    },
    paneProps: {
      availableProviders,
      error,
      notice: historyNotice,
      filters,
      hasFilteredHistory,
      hasProjectHistory,
      workspaceName,
      onChangeFilters,
    },
    feedProps: {
      tasks,
      imageAssetsByTaskId,
      latestTask,
      latestTaskRef,
      providerDisplayNameMap,
      showDebugDetails,
      submitting,
      regeneratingTaskId,
      pendingActionByTaskId: historyActionPendingByTaskId,
      feedbackByTaskId: historyFeedbackByTaskId,
      onRegenerateTask,
      onUpscaleAsset,
      onUseAssetAsReference,
      upscaleEnabled,
      upscalingAssetKey,
      onBookmarkAsset,
      onShareAsset,
      onDeleteTask,
      onPreviewAsset,
      onApplyTaskToComposer,
    },
  };
}
