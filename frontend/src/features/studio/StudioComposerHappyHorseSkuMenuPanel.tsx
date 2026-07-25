import type { HappyHorseVideoSku } from "./happyHorseVideoUtils";
import { HAPPYHORSE_VIDEO_SKU_OPTIONS } from "./happyHorseVideoUtils";
import type { StudioVideoSku } from "./studioComposerGrokSkuMenuTypes";

type Props = {
  selectedHappyHorseVideoSku: HappyHorseVideoSku;
  onHappyHorseVideoSkuSelect: (sku: StudioVideoSku) => void;
};

export default function StudioComposerHappyHorseSkuMenuPanel({
  selectedHappyHorseVideoSku,
  onHappyHorseVideoSkuSelect,
}: Props) {
  return (
    <div className="composer-menu-panel composer-menu-panel-grok-sku">
      <div className="composer-menu-group">
        <span className="composer-menu-title">HappyHorse 视频档位</span>
        <div className="composer-grok-sku-list">
          {HAPPYHORSE_VIDEO_SKU_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={
                selectedHappyHorseVideoSku === option.id
                  ? "composer-choice-item is-active"
                  : "composer-choice-item"
              }
              onClick={() => onHappyHorseVideoSkuSelect(option.id)}
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
