import StudioComposerDisplayMenu from "./StudioComposerDisplayMenu";
import type { StudioComposerToolbarMenusProps } from "./studioComposerToolbarTypes";

export default function StudioComposerDisplayMenuSlot({
  activeComposerMenu,
  aspectRatioOptions,
  resolutionOptions,
  selectedProvider,
  selectedResolutionLabel,
  studioForm,
  onAspectRatioSelect,
  onResolutionSelect,
  onToggleComposerMenu,
}: StudioComposerToolbarMenusProps) {
  return (
    <StudioComposerDisplayMenu
      activeComposerMenu={activeComposerMenu}
      aspectRatioOptions={aspectRatioOptions}
      resolutionOptions={resolutionOptions}
      selectedProvider={selectedProvider}
      selectedResolutionLabel={selectedResolutionLabel}
      studioForm={studioForm}
      onAspectRatioSelect={onAspectRatioSelect}
      onResolutionSelect={onResolutionSelect}
      onToggleComposerMenu={onToggleComposerMenu}
    />
  );
}
