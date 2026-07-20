import type { StudioFeedCardProps } from "./studioFeedCardTypes";
import {
  deriveTaskTitleFromPrompt,
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
  const displayTitle = (() => {
    const promptSource =
      asset?.prompt_text ??
      (typeof task.result["prompt"] === "string" ? String(task.result["prompt"]) : "");
    if (promptSource.trim()) {
      return deriveTaskTitleFromPrompt(promptSource, taskDisplayTitle(task, asset), 56);
    }
    return taskDisplayTitle(task, asset);
  })();
  const summary = taskSummary(task, asset);
  const summaryPreview = truncateText(summary, 72);
  const hasLongSummary = summary.replace(/\s+/g, " ").trim().length > 56;
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
    referenceImages,
    referenceImageCount,
    referenceImageLabel,
    showRunningState,
    summary,
    summaryPreview,
    virtualProgress,
  };
}
