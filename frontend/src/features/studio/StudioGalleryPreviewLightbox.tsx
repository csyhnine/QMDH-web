import { useState } from "react";

import MediaComparePanel from "../../components/shared/MediaComparePanel";
import { listStudioCompareOriginalUrls } from "./studioCompareUtils";
import { downloadMediaUrl } from "./studioMediaDownload";
import type { StudioGalleryPreviewLightboxProps } from "./studioMediaLightboxTypes";
import { isVideoAsset } from "./studioUtils";

export default function StudioGalleryPreviewLightbox({
  galleryPreview,
  previewUrl,
  onApplyToComposer,
  onUseAsReference,
  onClose,
}: StudioGalleryPreviewLightboxProps) {
  const [downloading, setDownloading] = useState(false);
  const videoAsset = isVideoAsset(galleryPreview.asset);
  const canUseAsReference = !videoAsset && Boolean(onUseAsReference);
  const compareUrls = !videoAsset
    ? listStudioCompareOriginalUrls(galleryPreview.task, previewUrl)
    : [];
  const showCompare = compareUrls.length > 0;

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadMediaUrl(previewUrl, galleryPreview.asset.name || undefined, {
        taskId: galleryPreview.task.id,
        assetId: galleryPreview.asset.id,
        mediaKind: videoAsset ? "video" : "image",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="media-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={videoAsset ? "生成视频预览" : showCompare ? "生成图与原图对比" : "生成图预览"}
      onClick={onClose}
    >
      <div
        className={`media-lightbox-surface${showCompare ? " is-compare" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="media-lightbox-head">
          <span className="media-lightbox-title">
            {showCompare ? `${galleryPreview.asset.name} · 对比` : galleryPreview.asset.name}
          </span>
          <button type="button" className="media-lightbox-close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>
        <div className={`media-lightbox-body${showCompare ? " is-compare" : ""}`}>
          {videoAsset ? (
            <video src={previewUrl} controls autoPlay playsInline />
          ) : showCompare ? (
            <MediaComparePanel leftSrc={previewUrl} rightSrcs={compareUrls} />
          ) : (
            <img src={previewUrl} alt="" />
          )}
        </div>
        <footer className="media-lightbox-foot">
          <button
            type="button"
            className="ghost-button"
            disabled={downloading}
            onClick={() => void handleDownload()}
          >
            {downloading ? "下载中…" : videoAsset ? "下载视频" : "下载生成图"}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => onApplyToComposer(galleryPreview.task, galleryPreview.asset)}
          >
            填入创作框
          </button>
          {canUseAsReference ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                onUseAsReference?.(galleryPreview.task, galleryPreview.asset);
                onClose();
              }}
            >
              置入参考图
            </button>
          ) : null}
          <button type="button" className="submit-button" onClick={onClose}>
            关闭
          </button>
        </footer>
      </div>
    </div>
  );
}
