import StudioComposerProviderGroup from "./StudioComposerProviderGroup";
import type { StudioComposerProviderMenuPanelProps } from "./studioComposerProviderMenuTypes";

export default function StudioComposerProviderMenuPanel({
  providerGroups,
  requestedProvider,
  onProviderSelect,
}: StudioComposerProviderMenuPanelProps) {
  return (
    <div className="composer-menu-panel composer-menu-panel-list composer-menu-panel-provider">
      {providerGroups.map((group) => (
        <StudioComposerProviderGroup
          key={group.label}
          group={group}
          requestedProvider={requestedProvider}
          onProviderSelect={onProviderSelect}
        />
      ))}
    </div>
  );
}
