import type { ComposerMenuKey, StudioFormState } from "./studioTypes";
import type { GrokVideoSku } from "./grokVideoUtils";
import type { HappyHorseVideoSku } from "./happyHorseVideoUtils";

export type StudioVideoSku = GrokVideoSku | HappyHorseVideoSku;

export type StudioComposerGrokSkuMenuProps = {
  activeComposerMenu: ComposerMenuKey;
  selectedGrokSkuLabel: string | null;
  studioForm: StudioFormState;
  onGrokVideoSkuSelect: (sku: StudioVideoSku) => void;
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
