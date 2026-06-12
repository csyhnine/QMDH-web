import type { ComposerMenuKey, StudioFormState } from "./studioTypes";
import type { GrokVideoSku } from "./grokVideoUtils";

export type StudioComposerGrokSkuMenuProps = {
  activeComposerMenu: ComposerMenuKey;
  selectedGrokSkuLabel: string | null;
  studioForm: StudioFormState;
  onGrokVideoSkuSelect: (sku: GrokVideoSku) => void;
  onToggleComposerMenu: (menu: Exclude<ComposerMenuKey, null>) => void;
};

export type StudioComposerGrokSkuMenuTriggerProps = {
  open: boolean;
  selectedGrokSkuLabel: string | null;
  onToggle: () => void;
};

export type StudioComposerGrokSkuMenuPanelProps = {
  selectedGrokVideoSku: GrokVideoSku;
  onGrokVideoSkuSelect: (sku: GrokVideoSku) => void;
};
