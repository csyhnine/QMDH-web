import StudioComposerProviderMenu from "./StudioComposerProviderMenu";
import type { StudioComposerToolbarMenusProps } from "./studioComposerToolbarTypes";

export default function StudioComposerProviderMenuSlot({
  activeComposerMenu,
  providerGroups,
  selectedProviderModelName,
  studioForm,
  onProviderSelect,
  onToggleComposerMenu,
}: StudioComposerToolbarMenusProps) {
  return (
    <StudioComposerProviderMenu
      activeComposerMenu={activeComposerMenu}
      providerGroups={providerGroups}
      selectedProviderModelName={selectedProviderModelName}
      requestedProvider={studioForm.requestedProvider}
      onProviderSelect={onProviderSelect}
      onToggleComposerMenu={onToggleComposerMenu}
    />
  );
}
