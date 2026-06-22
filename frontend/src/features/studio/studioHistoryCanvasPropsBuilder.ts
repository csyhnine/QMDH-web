import type { Asset, Task } from "../../api";
import type { StudioDesignerViewProps } from "./studioDesignerViewTypes";
import type { StudioHistoryCanvasProps } from "./studioHistoryCanvasTypes";
import { findUpscaleProvider } from "./studioUpscaleActions";

export function buildStudioHistoryCanvasProps({
  canManageUsers,
  canUseOpsViews,
  derivedState,
  filters,
  galleryActions,
  historyFeedback,
  isStudioDockLayout,
  setFilters,
  setGalleryPreview,
  state,
  studioView,
  submitting,
  taskActions,
}: StudioDesignerViewProps): StudioHistoryCanvasProps {
  const {
    availableProviders,
    filteredTasks,
    hasFilteredHistory,
    hasProjectHistory,
    imageAssetsByTaskId,
    latestTask,
    providerDisplayNameMap,
    workspaceName,
  } = derivedState;

  return {
    availableProviders,
    error: state.error,
    filters,
    hasFilteredHistory,
    hasProjectHistory,
    historyActionPendingByTaskId: historyFeedback.pendingActionByTaskId,
    historyFeedbackByTaskId: historyFeedback.feedbackByTaskId,
    historyNotice: historyFeedback.notice,
    imageAssetsByTaskId,
    isStudioDockLayout,
    latestTask,
    latestTaskRef: studioView.latestTaskRef,
    providerDisplayNameMap,
    regeneratingTaskId: taskActions.regeneratingTaskId,
    showDebugDetails: canManageUsers,
    studioScrollPaneRef: studioView.studioScrollPaneRef,
    submitting,
    tasks: filteredTasks,
    upscaleEnabled: Boolean(findUpscaleProvider(state.providers)),
    upscalingAssetKey: taskActions.upscalingAssetKey,
    workspaceName,
    onApplyTaskToComposer: taskActions.applyTaskToComposer,
    onBookmarkAsset: (taskId, assetId) => void galleryActions.bookmarkAsset(taskId, assetId),
    onChangeFilters: setFilters,
    onDeleteTask: (task: Task) => void galleryActions.deleteHistoryTask(task),
    onPreviewAsset: (task: Task, asset: Asset) => setGalleryPreview({ task, asset }),
    onRegenerateTask: (task, asset) => void taskActions.regenerateTask(task, asset),
    onShareAsset: galleryActions.openShareConfirm,
    onUpscaleAsset: (task, asset, options) => void taskActions.upscaleAsset(task, asset, options),
  };
}
