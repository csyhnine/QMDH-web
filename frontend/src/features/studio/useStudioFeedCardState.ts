import type { StudioFeedCardProps } from "./studioFeedCardTypes";
import {
  summarizeReferenceImageLabel,
  taskDisplayTitle,
  taskHasReferenceImage,
  taskReferenceImageCount,
  taskReferenceImages,
  taskSummary,
  truncateText,
} from "./studioUtils";
import { useVirtualTaskProgress } from "./useVirtualTaskProgress";

export function useStudioFeedCardState({
  asset,
  feedback,
  task,
}: Pick<StudioFeedCardProps, "asset" | "feedback" | "task">) {
  const displayTitle = taskDisplayTitle(task, asset);
  const summary = taskSummary(task, asset);
  const summaryPreview = truncateText(summary, 160);
  const hasLongSummary = summaryPreview !== summary;
  const showRunningState = task.status === "pending" || task.status === "running";
  const referenceImages = taskReferenceImages(task);
  const referenceImageCount = taskReferenceImageCount(task);
  const hasReferenceImage = taskHasReferenceImage(task);
  const primaryReferenceImage = referenceImages[0] ?? "";
  const referenceImageLabel = summarizeReferenceImageLabel(primaryReferenceImage);
  const virtualProgress = useVirtualTaskProgress(task, showRunningState);

  return {
    articleClassName: [
      "feed-card",
      "feed-card-compact",
      showRunningState ? "feed-card-running" : "",
      hasReferenceImage ? "feed-card-with-reference" : "",
      asset?.is_bookmarked ? "feed-card-bookmarked" : "",
      feedback?.action === "bookmark" && feedback.tone === "success" && asset?.is_bookmarked
        ? "feed-card-bookmarked-pulse"
        : "",
    ]
      .filter(Boolean)
      .join(" "),
    displayTitle,
    hasLongSummary,
    hasReferenceImage,
    primaryReferenceImage,
    referenceImageCount,
    referenceImageLabel,
    showRunningState,
    summary,
    summaryPreview,
    virtualProgress,
  };
}
