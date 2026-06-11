import type { CSSProperties } from "react";

import type { Asset } from "../../api";
import {
  buildPreviewStyle,
  getRenderableUrl,
  isVideoAsset,
  normalizeAspectRatio,
  summarizeStoragePath,
} from "./studioUtils";

type StudioAssetTileProps = {
  asset: Asset;
  emphasis?: "primary" | "secondary";
  aspectRatio?: string | null;
  preserveFullImage?: boolean;
};

export default function StudioAssetTile({
  asset,
  emphasis,
  aspectRatio,
  preserveFullImage,
}: StudioAssetTileProps) {
  const renderableUrl = getRenderableUrl(asset);
  const normalizedAspectRatio = aspectRatio ? normalizeAspectRatio(aspectRatio) : null;
  const videoAsset = isVideoAsset(asset);

  return (
    <div
      className={[
        emphasis === "primary" ? "asset-tile asset-tile-primary" : "asset-tile",
        preserveFullImage ? "asset-tile-preserve-full" : "",
        videoAsset ? "asset-tile-video" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        ...buildPreviewStyle(asset.storage_path || asset.name),
        ...(normalizedAspectRatio ? ({ "--asset-ratio": normalizedAspectRatio } as CSSProperties) : {}),
      }}
    >
      {renderableUrl ? (
        videoAsset ? (
          <video src={renderableUrl} controls playsInline preload="metadata" />
        ) : (
          <img src={renderableUrl} alt={asset.name} loading="lazy" />
        )
      ) : null}
      <div className="asset-tile-overlay">
        <strong>{asset.name}</strong>
        <span>{summarizeStoragePath(asset.storage_path)}</span>
      </div>
    </div>
  );
}
