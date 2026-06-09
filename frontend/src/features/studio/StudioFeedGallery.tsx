import type { Asset, Task } from "../../api";
import StudioAssetTile from "./StudioAssetTile";
import { taskResultString } from "./studioUtils";

type StudioFeedGalleryProps = {
  assets: Asset[];
  task: Task;
  onAssetPreview?: (asset: Asset) => void;
  onReuse: () => void;
};

export default function StudioFeedGallery({
  assets,
  task,
  onAssetPreview,
  onReuse,
}: StudioFeedGalleryProps) {
  if (assets.length === 0) return null;

  return (
    <div className="feed-gallery">
      {assets.map((asset, index) => (
        <button
          key={asset.id}
          type="button"
          className="feed-gallery-item"
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
          <span className="feed-gallery-zoom-hint" aria-hidden>
            放大
          </span>
        </button>
      ))}
    </div>
  );
}
