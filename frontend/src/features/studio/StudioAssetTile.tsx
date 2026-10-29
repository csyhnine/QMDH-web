import { useEffect, useRef, useState, type CSSProperties } from "react";

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
  revealImage?: boolean;
  claimImageReveal?: () => boolean;
  emphasis?: "primary" | "secondary";
  aspectRatio?: string | null;
  preserveFullImage?: boolean;
};

export default function StudioAssetTile({
  asset,
  revealImage = false,
  claimImageReveal,
  emphasis,
  aspectRatio,
  preserveFullImage,
}: StudioAssetTileProps) {
  const renderableUrl = getRenderableUrl(asset);
  const normalizedAspectRatio = aspectRatio ? normalizeAspectRatio(aspectRatio) : null;
  const videoAsset = isVideoAsset(asset);

  const claimRef = useRef(claimImageReveal);
  claimRef.current = claimImageReveal;
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageState, setImageState] = useState<"waiting" | "ready" | "reveal">("waiting");
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => {
      if (preference.matches) setImageState(current => current === "reveal" ? "ready" : current);
    };
    const image = imageRef.current;
    const cancelled = () => setImageState("ready");
    preference.addEventListener("change", changed);
    image?.addEventListener("animationcancel", cancelled);
    return () => {
      preference.removeEventListener("change", changed);
      image?.removeEventListener("animationcancel", cancelled);
    };
  }, []);
  useEffect(() => {
    let active = true;
    let settled = false;
    setImageState("waiting");
    const image = imageRef.current;
    if (!image || !revealImage || videoAsset) return;
    const failed = () => { if (active) setImageState("ready"); };
    const loaded = async () => {
      try {
        if (image.decode) await image.decode();
        if (!active || settled || !image.naturalWidth) return;
        settled = true;
        const claimed = claimRef.current?.();
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        setImageState(claimed && !reduced ? "reveal" : "ready");
      } catch { failed(); }
    };
    image.addEventListener("load", loaded);
    image.addEventListener("error", failed);
    if (image.complete) { if (image.naturalWidth) void loaded(); else failed(); }
    return () => { active = false; image.removeEventListener("load", loaded); image.removeEventListener("error", failed); };
  }, [renderableUrl, revealImage, videoAsset]);

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
          <img onAnimationEnd={() => setImageState("ready")} ref={imageRef} className={imageState === "reveal" ? "studio-result-image-reveal" : revealImage && imageState === "waiting" ? "studio-result-image-waiting" : undefined} src={renderableUrl} alt={asset.name} loading="lazy" />
        )
      ) : null}
      <div className="asset-tile-overlay">
        <strong>{asset.name}</strong>
        <span>{summarizeStoragePath(asset.storage_path)}</span>
      </div>
    </div>
  );
}
