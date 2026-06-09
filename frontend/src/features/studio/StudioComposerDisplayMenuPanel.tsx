import StudioComposerOptionGroup from "./StudioComposerOptionGroup";
import type { StudioComposerDisplayMenuPanelProps } from "./studioComposerDisplayMenuTypes";

export default function StudioComposerDisplayMenuPanel({
  aspectRatioOptions,
  resolutionOptions,
  studioForm,
  onAspectRatioSelect,
  onResolutionSelect,
}: StudioComposerDisplayMenuPanelProps) {
  return (
    <div className="composer-menu-panel composer-menu-panel-display">
      <StudioComposerOptionGroup
        activeId={studioForm.aspectRatio}
        options={aspectRatioOptions.map((ratio) => ({ id: ratio, label: ratio }))}
        title="比例"
        onSelect={onAspectRatioSelect}
      />

      <StudioComposerOptionGroup
        activeId={studioForm.resolution}
        gridClassName="composer-chip-grid composer-chip-grid-two"
        options={resolutionOptions}
        title="分辨率"
        onSelect={onResolutionSelect}
      />
    </div>
  );
}
