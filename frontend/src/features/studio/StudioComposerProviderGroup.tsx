import type { StudioComposerProviderGroupProps } from "./studioComposerProviderMenuTypes";

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
          <strong>{provider.display_name || provider.model_name}</strong>
          <span>{provider.model_name}</span>
        </button>
      ))}
    </div>
  );
}
