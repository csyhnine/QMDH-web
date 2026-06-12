import StudioComposerGrokSkuMenu from "./StudioComposerGrokSkuMenu";
import { isGrokHaodeyaProvider } from "./grokVideoUtils";
import type { StudioComposerToolbarMenusProps } from "./studioComposerToolbarTypes";

export default function StudioComposerGrokSkuMenuSlot(props: StudioComposerToolbarMenusProps) {
  const isGrokVideo =
    props.studioForm.creationMode === "video" && isGrokHaodeyaProvider(props.selectedProvider);

  if (!isGrokVideo) return null;

  return (
    <StudioComposerGrokSkuMenu
      activeComposerMenu={props.activeComposerMenu}
      selectedGrokSkuLabel={props.selectedGrokSkuLabel}
      studioForm={props.studioForm}
      onGrokVideoSkuSelect={props.onGrokVideoSkuSelect}
      onToggleComposerMenu={props.onToggleComposerMenu}
    />
  );
}
