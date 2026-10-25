import StudioTaskProgress from "./StudioTaskProgress";
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
  const localStage =
    task.result["adapter_mode"] === "comfyui" ? String(task.result["queued_stage"] || "queued") : undefined;
  const checkpoint = task.result["comfyui"] as Record<string, unknown> | undefined;
  const displayStage =
    localStage === "running" && ["downloading", "downloaded"].includes(String(checkpoint?.stage))
      ? "saving"
      : localStage;
  return galleryAssets.length > 0 ? (
    <>
      {(showRunningState || task.status === "completed") && (
        <StudioTaskProgress
          percent={virtualProgress}
          status={task.status}
          localStage={displayStage}
          queuePosition={Number(task.result["queue_position"] || 0)}
        />
      )}
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
    </>
  ) : (
    <StudioFeedEmptyState
      isRunning={showRunningState}
      status={task.status}
      virtualProgress={virtualProgress}
      localStage={displayStage}
      queuePosition={Number(task.result["queue_position"] || 0)}
    />
  );
}
