import StudioComposerGrokSkuMenu from "./StudioComposerGrokSkuMenu";
import StudioComposerHappyHorseSkuMenu from "./StudioComposerHappyHorseSkuMenu";
import { isGrokHaodeyaProvider } from "./grokVideoUtils";
import { isHappyHorseProvider } from "./happyHorseVideoUtils";
import type { StudioComposerToolbarMenusProps } from "./studioComposerToolbarTypes";

export default function StudioComposerGrokSkuMenuSlot(props: StudioComposerToolbarMenusProps) {
  const isVideo = props.studioForm.creationMode === "video";
  const isGrokVideo = isVideo && isGrokHaodeyaProvider(props.selectedProvider);
  const isHappyHorseVideo = isVideo && isHappyHorseProvider(props.selectedProvider);

  if (isHappyHorseVideo) {
    return (
      <StudioComposerHappyHorseSkuMenu
        activeComposerMenu={props.activeComposerMenu}
        selectedHappyHorseSkuLabel={props.selectedGrokSkuLabel}
        studioForm={props.studioForm}
        onHappyHorseVideoSkuSelect={props.onGrokVideoSkuSelect}
        onToggleComposerMenu={props.onToggleComposerMenu}
      />
    );
  }

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
