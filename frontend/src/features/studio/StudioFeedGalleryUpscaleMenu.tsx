import { useEffect, useRef, useState } from "react";

import type { Asset } from "../../api";
import StudioComposerOptionGroup from "./StudioComposerOptionGroup";
import {
  defaultUpscaleOptions,
  type UpscaleOptions,
  upscaleNoiseOptions,
  upscaleScaleOptions,
  upscaleStyleOptions,
} from "./studioUpscaleOptions";

type StudioFeedGalleryUpscaleMenuProps = {
  asset: Asset;
  disabled?: boolean;
  isUpscaling?: boolean;
  onSubmit: (asset: Asset, options: UpscaleOptions) => void;
};

export default function StudioFeedGalleryUpscaleMenu({
  asset,
  disabled = false,
  isUpscaling = false,
  onSubmit,
}: StudioFeedGalleryUpscaleMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<UpscaleOptions>(defaultUpscaleOptions);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function handleSubmit() {
    onSubmit(asset, draft);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="feed-gallery-upscale-menu">
      <button
        type="button"
        className={open ? "feed-gallery-upscale-button is-open" : "feed-gallery-upscale-button"}
        disabled={disabled || isUpscaling}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="高清放大"
      >
        {isUpscaling ? "放大中..." : "放大"}
      </button>
      {open ? (
        <div className="feed-gallery-upscale-panel" role="dialog" aria-label="高清放大选项">
          <div className="feed-gallery-upscale-panel-head">
            <strong>高清放大</strong>
            <span>选择放大倍率、图片类型与降噪强度</span>
          </div>

          <StudioComposerOptionGroup
            activeId={draft.scale}
            gridClassName="composer-chip-grid composer-chip-grid-two"
            options={upscaleScaleOptions.map((option) => ({ id: option.id, label: option.label }))}
            title="放大倍率"
            onSelect={(scale) => setDraft((current) => ({ ...current, scale: scale as UpscaleOptions["scale"] }))}
          />

          <StudioComposerOptionGroup
            activeId={draft.style}
            gridClassName="composer-chip-grid composer-chip-grid-two"
            options={upscaleStyleOptions.map((option) => ({ id: option.id, label: option.label }))}
            title="图片类型"
            onSelect={(style) => setDraft((current) => ({ ...current, style: style as UpscaleOptions["style"] }))}
          />

          <StudioComposerOptionGroup
            activeId={draft.noise}
            gridClassName="composer-chip-grid"
            options={upscaleNoiseOptions.map((option) => ({ id: option.id, label: option.label }))}
            title="降噪"
            onSelect={(noise) => setDraft((current) => ({ ...current, noise: noise as UpscaleOptions["noise"] }))}
          />
          <p className="feed-gallery-upscale-hint">降噪程度越高，输出与原图的细节偏差通常越大；默认「低」更贴近原图。</p>

          <button type="button" className="feed-gallery-upscale-submit" disabled={disabled || isUpscaling} onClick={handleSubmit}>
            开始放大
          </button>
        </div>
      ) : null}
    </div>
  );
}
