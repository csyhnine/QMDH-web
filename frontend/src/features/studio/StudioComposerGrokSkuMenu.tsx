import StudioComposerGrokSkuMenuPanel from "./StudioComposerGrokSkuMenuPanel";
import StudioComposerGrokSkuMenuTrigger from "./StudioComposerGrokSkuMenuTrigger";
import { DEFAULT_GROK_VIDEO_SKU, isGrokSkuId } from "./grokVideoUtils";
import type { StudioComposerGrokSkuMenuProps } from "./studioComposerGrokSkuMenuTypes";

export default function StudioComposerGrokSkuMenu({
  activeComposerMenu,
  selectedGrokSkuLabel,
  studioForm,
  onGrokVideoSkuSelect,
  onToggleComposerMenu,
}: StudioComposerGrokSkuMenuProps) {
  const open = activeComposerMenu === "grokSku";
  const selectedSku = isGrokSkuId(studioForm.grokVideoSku) ? studioForm.grokVideoSku : DEFAULT_GROK_VIDEO_SKU;

  return (
    <div className="composer-menu">
      <StudioComposerGrokSkuMenuTrigger
        open={open}
        selectedGrokSkuLabel={selectedGrokSkuLabel}
        onToggle={() => onToggleComposerMenu("grokSku")}
      />
      {open ? (
        <StudioComposerGrokSkuMenuPanel
          selectedGrokVideoSku={selectedSku}
          onGrokVideoSkuSelect={onGrokVideoSkuSelect}
        />
      ) : null}
    </div>
  );
}
