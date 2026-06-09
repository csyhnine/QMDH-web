import StudioComposerProviderMenuPanel from "./StudioComposerProviderMenuPanel";
import StudioComposerProviderMenuTrigger from "./StudioComposerProviderMenuTrigger";
import type { StudioComposerProviderMenuProps } from "./studioComposerProviderMenuTypes";

export default function StudioComposerProviderMenu({
  activeComposerMenu,
  providerGroups,
  selectedProviderModelName,
  requestedProvider,
  onProviderSelect,
  onToggleComposerMenu,
}: StudioComposerProviderMenuProps) {
  const open = activeComposerMenu === "provider";

  return (
    <div className="composer-menu">
      <StudioComposerProviderMenuTrigger
        open={open}
        selectedProviderModelName={selectedProviderModelName}
        onToggle={() => onToggleComposerMenu("provider")}
      />
      {open ? (
        <StudioComposerProviderMenuPanel
          providerGroups={providerGroups}
          requestedProvider={requestedProvider}
          onProviderSelect={onProviderSelect}
        />
      ) : null}
    </div>
  );
}
