import type { StudioComposerProviderMenuTriggerProps } from "./studioComposerProviderMenuTypes";

export default function StudioComposerProviderMenuTrigger({
  open,
  selectedProviderModelName,
  onToggle,
}: StudioComposerProviderMenuTriggerProps) {
  return (
    <button
      type="button"
      className={open ? "composer-menu-trigger is-open" : "composer-menu-trigger"}
      onClick={onToggle}
    >
      {selectedProviderModelName ?? "选择模型"}
    </button>
  );
}
