import type { StudioComposerDisplayMenuTriggerProps } from "./studioComposerDisplayMenuTypes";

export default function StudioComposerDisplayMenuTrigger({
  activeComposerMenu,
  selectedResolutionLabel,
  studioForm,
  onToggleComposerMenu,
}: StudioComposerDisplayMenuTriggerProps) {
  return (
    <button
      type="button"
      className={activeComposerMenu === "display" ? "composer-menu-trigger is-open" : "composer-menu-trigger"}
      onClick={() => onToggleComposerMenu("display")}
    >
      {studioForm.aspectRatio} / {selectedResolutionLabel ?? studioForm.resolution}
    </button>
  );
}
