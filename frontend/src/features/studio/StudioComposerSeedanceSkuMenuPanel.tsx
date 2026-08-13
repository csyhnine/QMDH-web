import type { Seedance2VideoSku } from "./seedanceVideoUtils";
import { SEEDANCE2_VIDEO_SKU_OPTIONS } from "./seedanceVideoUtils";
import type { StudioVideoSku } from "./studioComposerGrokSkuMenuTypes";

type Props = {
  selectedSeedance2VideoSku: Seedance2VideoSku;
  onSeedance2VideoSkuSelect: (sku: StudioVideoSku) => void;
};

export default function StudioComposerSeedanceSkuMenuPanel({
  selectedSeedance2VideoSku,
  onSeedance2VideoSkuSelect,
}: Props) {
  return (
    <div className="composer-menu-panel composer-menu-panel-grok-sku">
      <div className="composer-menu-group">
        <span className="composer-menu-title">Seedance 2 视频档位</span>
        <p className="composer-menu-note">画质 × 时长对应上游带 -5s / -10s 的 SKU。</p>
        <div className="composer-grok-sku-list">
          {SEEDANCE2_VIDEO_SKU_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={
                selectedSeedance2VideoSku === option.id
                  ? "composer-choice-item is-active"
                  : "composer-choice-item"
              }
              onClick={() => onSeedance2VideoSkuSelect(option.id)}
            >
              <strong>{option.label}</strong>
              <span>{option.detail}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
