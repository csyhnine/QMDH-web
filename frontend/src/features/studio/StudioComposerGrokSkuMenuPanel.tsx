import { GROK_VIDEO_SKU_OPTIONS } from "./grokVideoUtils";
import type { StudioComposerGrokSkuMenuPanelProps } from "./studioComposerGrokSkuMenuTypes";

export default function StudioComposerGrokSkuMenuPanel({
  selectedGrokVideoSku,
  onGrokVideoSkuSelect,
}: StudioComposerGrokSkuMenuPanelProps) {
  return (
    <div className="composer-menu-panel composer-menu-panel-grok-sku">
      <div className="composer-menu-group">
        <span className="composer-menu-title">Grok 视频档位</span>
        <div className="composer-grok-sku-list">
          {GROK_VIDEO_SKU_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={
                selectedGrokVideoSku === option.id ? "composer-choice-item is-active" : "composer-choice-item"
              }
              onClick={() => onGrokVideoSkuSelect(option.id)}
            >
              <strong>{option.label}</strong>
              <span>
                {option.detail} · {option.priceLabel}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
