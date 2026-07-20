import type { Asset, Task } from "../../api";
import StudioAssetTile from "./StudioAssetTile";
import StudioFeedGalleryUpscaleMenu from "./StudioFeedGalleryUpscaleMenu";
import { canUpscaleAsset } from "./studioUpscaleActions";
import type { UpscaleOptions } from "./studioUpscaleOptions";
import { taskResultString } from "./studioUtils";

type StudioFeedGalleryProps = {
  assets: Asset[];
  task: Task;
  upscaleDisabled?: boolean;
  upscaleEnabled?: boolean;
  upscalingAssetKey?: string | null;
  onAssetPreview?: (asset: Asset) => void;
  onUpscaleAsset?: (asset: Asset, options: UpscaleOptions) => void;
  onUseAssetAsReference?: (asset: Asset) => void;
  onReuse: () => void;
};

export default function StudioFeedGallery({
  assets,
  task,
  upscaleDisabled = false,
  upscaleEnabled = false,
  upscalingAssetKey = null,
  onAssetPreview,
  onUpscaleAsset,
  onUseAssetAsReference,
  onReuse,
}: StudioFeedGalleryProps) {
  if (assets.length === 0) return null;

  return (
    <div className="feed-gallery">
      {assets.map((asset, index) => {
        const showUpscale = upscaleEnabled && canUpscaleAsset(asset) && Boolean(onUpscaleAsset);
        const showUseReference = canUpscaleAsset(asset) && Boolean(onUseAssetAsReference);
        const isUpscaling = upscalingAssetKey === `${task.id}:${asset.id}`;

        return (
          <div key={asset.id} className="feed-gallery-item">
            <button
              type="button"
              className="feed-gallery-preview"
              onClick={() => {
                if (onAssetPreview) {
                  onAssetPreview(asset);
                  return;
                }
                onReuse();
              }}
              aria-label="查看大图"
            >
              <StudioAssetTile
                asset={asset}
                emphasis={index === 0 ? "primary" : "secondary"}
                aspectRatio={taskResultString(task, "aspect_ratio")}
                preserveFullImage
              />
            </button>
            {showUseReference || showUpscale ? (
              <div className="feed-gallery-actions">
                {showUseReference ? (
                  <button
                    type="button"
                    className="feed-gallery-use-ref-button"
                    disabled={upscaleDisabled}
                    onClick={() => onUseAssetAsReference?.(asset)}
                    aria-label="置入参考图"
                  >
                    置入
                  </button>
                ) : null}
                {showUpscale ? (
                  <StudioFeedGalleryUpscaleMenu
                    asset={asset}
                    disabled={upscaleDisabled}
                    isUpscaling={isUpscaling}
                    onSubmit={(selectedAsset, options) => onUpscaleAsset?.(selectedAsset, options)}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
