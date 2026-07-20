import type { StudioFeedCardLayoutProps, StudioFeedCardProps } from "./studioFeedCardTypes";
import type { useStudioFeedCardState } from "./useStudioFeedCardState";

type StudioFeedCardState = ReturnType<typeof useStudioFeedCardState>;

export function buildStudioFeedCardLayoutProps(
  props: StudioFeedCardProps,
  cardState: StudioFeedCardState
): StudioFeedCardLayoutProps {
  return {
    referenceBadgeProps: {
      imageCount: cardState.referenceImageCount,
      imageLabel: cardState.referenceImageLabel,
      images: cardState.referenceImages,
    },
    headerProps: {
      displayTitle: cardState.displayTitle,
      hasLongSummary: cardState.hasLongSummary,
      hasReferenceImage: cardState.hasReferenceImage,
      isInGallery: Boolean(props.asset),
      providerDisplayName: props.providerDisplayName,
      referenceImageCount: cardState.referenceImageCount,
      showDebugDetails: props.showDebugDetails,
      summary: cardState.summary,
      summaryPreview: cardState.summaryPreview,
      task: props.task,
    },
    resultProps: {
      galleryAssets: props.galleryAssets,
      task: props.task,
      showRunningState: cardState.showRunningState,
      virtualProgress: cardState.virtualProgress,
      onAssetPreview: props.onAssetPreview,
      onReuse: props.onReuse,
      onUpscaleAsset: props.onUpscaleAsset,
      onUseAssetAsReference: props.onUseAssetAsReference,
      upscaleDisabled: props.upscaleDisabled,
      upscaleEnabled: props.upscaleEnabled,
      upscalingAssetKey: props.upscalingAssetKey,
    },
    footerProps: {
      asset: props.asset,
      createdAt: props.task.created_at,
      feedback: props.feedback,
      pendingAction: props.pendingAction,
      providerDisplayName: props.providerDisplayName,
      reuseDisabled: props.reuseDisabled,
      task: props.task,
      onBookmark: props.onBookmark,
      onDelete: props.onDelete,
      onReuse: props.onReuse,
      onShare: props.onShare,
    },
  };
}
