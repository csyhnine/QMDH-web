import StudioComposerDisplayMenu from "./StudioComposerDisplayMenu";
import type { StudioComposerToolbarMenusProps } from "./studioComposerToolbarTypes";

export default function StudioComposerDisplayMenuSlot({
  activeComposerMenu,
  aspectRatioOptions,
  resolutionOptions,
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
      selectedResolutionLabel={selectedResolutionLabel}
      studioForm={studioForm}
      onAspectRatioSelect={onAspectRatioSelect}
      onResolutionSelect={onResolutionSelect}
      onToggleComposerMenu={onToggleComposerMenu}
    />
  );
}
