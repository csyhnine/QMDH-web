import StudioComposerCountMenu from "./StudioComposerCountMenu";
import type { StudioComposerToolbarMenusProps } from "./studioComposerToolbarTypes";

export default function StudioComposerCountMenuSlot({
  activeComposerMenu,
  studioForm,
  onImageCountSelect,
  onToggleComposerMenu,
}: StudioComposerToolbarMenusProps) {
  return (
    <StudioComposerCountMenu
      activeComposerMenu={activeComposerMenu}
      studioForm={studioForm}
      onImageCountSelect={onImageCountSelect}
      onToggleComposerMenu={onToggleComposerMenu}
    />
  );
}
