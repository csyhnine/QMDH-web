import StudioComposerSeedanceSkuMenuPanel from "./StudioComposerSeedanceSkuMenuPanel";
import StudioComposerGrokSkuMenuTrigger from "./StudioComposerGrokSkuMenuTrigger";
import {
  DEFAULT_SEEDANCE2_VIDEO_SKU,
  isSeedance2SkuId,
} from "./seedanceVideoUtils";
import type { StudioVideoSku } from "./studioComposerGrokSkuMenuTypes";
import type { ComposerMenuKey, StudioFormState } from "./studioTypes";

type Props = {
  activeComposerMenu: ComposerMenuKey;
  selectedSeedance2SkuLabel: string | null;
  studioForm: StudioFormState;
  onSeedance2VideoSkuSelect: (sku: StudioVideoSku) => void;
  onToggleComposerMenu: (menu: Exclude<ComposerMenuKey, null>) => void;
};

export default function StudioComposerSeedanceSkuMenu({
  activeComposerMenu,
  selectedSeedance2SkuLabel,
  studioForm,
  onSeedance2VideoSkuSelect,
  onToggleComposerMenu,
}: Props) {
  const open = activeComposerMenu === "grokSku";
  const selectedSku = isSeedance2SkuId(studioForm.grokVideoSku)
    ? studioForm.grokVideoSku
    : DEFAULT_SEEDANCE2_VIDEO_SKU;

  return (
    <div className="composer-menu">
      <StudioComposerGrokSkuMenuTrigger
        open={open}
        selectedGrokSkuLabel={selectedSeedance2SkuLabel}
        onToggle={() => onToggleComposerMenu("grokSku")}
      />
      {open ? (
        <StudioComposerSeedanceSkuMenuPanel
          selectedSeedance2VideoSku={selectedSku}
          onSeedance2VideoSkuSelect={onSeedance2VideoSkuSelect}
        />
      ) : null}
    </div>
  );
}
