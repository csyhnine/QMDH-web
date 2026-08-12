import StudioComposerGrokSkuMenu from "./StudioComposerGrokSkuMenu";
import StudioComposerHappyHorseSkuMenu from "./StudioComposerHappyHorseSkuMenu";
import StudioComposerSeedanceSkuMenu from "./StudioComposerSeedanceSkuMenu";
import { isGrokHaodeyaProvider } from "./grokVideoUtils";
import { isHappyHorseProvider } from "./happyHorseVideoUtils";
import { isSeedance2Provider } from "./seedanceVideoUtils";
import type { StudioComposerToolbarMenusProps } from "./studioComposerToolbarTypes";

export default function StudioComposerGrokSkuMenuSlot(props: StudioComposerToolbarMenusProps) {
  const isVideo = props.studioForm.creationMode === "video";
  const isGrokVideo = isVideo && isGrokHaodeyaProvider(props.selectedProvider);
  const isHappyHorseVideo = isVideo && isHappyHorseProvider(props.selectedProvider);
  const isSeedance2Video = isVideo && isSeedance2Provider(props.selectedProvider);

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

  if (isSeedance2Video) {
    return (
      <StudioComposerSeedanceSkuMenu
        activeComposerMenu={props.activeComposerMenu}
        selectedSeedance2SkuLabel={props.selectedGrokSkuLabel}
        studioForm={props.studioForm}
        onSeedance2VideoSkuSelect={props.onGrokVideoSkuSelect}
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
