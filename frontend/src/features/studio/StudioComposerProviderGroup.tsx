import type { StudioComposerProviderGroupProps } from "./studioComposerProviderMenuTypes";
import { publicProviderDisplayName, publicProviderModelLine } from "./modelAdminUtils";

export default function StudioComposerProviderGroup({
  group,
  requestedProvider,
  onProviderSelect,
}: StudioComposerProviderGroupProps) {
  return (
    <div className="provider-choice-group">
      <span className="provider-choice-group-title">{group.label}</span>
      {group.providers.map((provider) => (
        <button
          key={provider.provider_name}
          type="button"
          className={
            requestedProvider === provider.provider_name
              ? "composer-choice-item is-active"
              : "composer-choice-item"
          }
          onClick={() => onProviderSelect(provider.provider_name)}
        >
          <strong>{publicProviderDisplayName(provider)}</strong>
          {publicProviderModelLine(provider) ? <span>{publicProviderModelLine(provider)}</span> : null}
        </button>
      ))}
    </div>
  );
}
