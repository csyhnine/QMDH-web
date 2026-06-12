import type { StudioComposerGrokSkuMenuTriggerProps } from "./studioComposerGrokSkuMenuTypes";

export default function StudioComposerGrokSkuMenuTrigger({
  open,
  selectedGrokSkuLabel,
  onToggle,
}: StudioComposerGrokSkuMenuTriggerProps) {
  return (
    <button
      type="button"
      className={open ? "composer-menu-trigger is-open" : "composer-menu-trigger"}
      onClick={onToggle}
    >
      {selectedGrokSkuLabel ?? "选择档位"}
    </button>
  );
}
