import StudioComposerHappyHorseSkuMenuPanel from "./StudioComposerHappyHorseSkuMenuPanel";
import StudioComposerGrokSkuMenuTrigger from "./StudioComposerGrokSkuMenuTrigger";
import {
  DEFAULT_HAPPYHORSE_VIDEO_SKU,
  isHappyHorseSkuId,
} from "./happyHorseVideoUtils";
import type { StudioVideoSku } from "./studioComposerGrokSkuMenuTypes";
import type { ComposerMenuKey, StudioFormState } from "./studioTypes";

type Props = {
  activeComposerMenu: ComposerMenuKey;
  selectedHappyHorseSkuLabel: string | null;
  studioForm: StudioFormState;
  onHappyHorseVideoSkuSelect: (sku: StudioVideoSku) => void;
  onToggleComposerMenu: (menu: Exclude<ComposerMenuKey, null>) => void;
};

export default function StudioComposerHappyHorseSkuMenu({
  activeComposerMenu,
  selectedHappyHorseSkuLabel,
  studioForm,
  onHappyHorseVideoSkuSelect,
  onToggleComposerMenu,
}: Props) {
  const open = activeComposerMenu === "grokSku";
  const selectedSku = isHappyHorseSkuId(studioForm.grokVideoSku)
    ? studioForm.grokVideoSku
    : DEFAULT_HAPPYHORSE_VIDEO_SKU;

  return (
    <div className="composer-menu">
      <StudioComposerGrokSkuMenuTrigger
        open={open}
        selectedGrokSkuLabel={selectedHappyHorseSkuLabel}
        onToggle={() => onToggleComposerMenu("grokSku")}
      />
      {open ? (
        <StudioComposerHappyHorseSkuMenuPanel
          selectedHappyHorseVideoSku={selectedSku}
          onHappyHorseVideoSkuSelect={onHappyHorseVideoSkuSelect}
        />
      ) : null}
    </div>
  );
}
