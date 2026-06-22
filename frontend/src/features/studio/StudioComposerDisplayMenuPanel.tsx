import StudioComposerOptionGroup from "./StudioComposerOptionGroup";
import { isGrokHaodeyaProvider } from "./grokVideoUtils";
import type { StudioComposerDisplayMenuPanelProps } from "./studioComposerDisplayMenuTypes";

export default function StudioComposerDisplayMenuPanel({
  aspectRatioOptions,
  resolutionOptions,
  selectedProvider,
  studioForm,
  onAspectRatioSelect,
  onResolutionSelect,
}: StudioComposerDisplayMenuPanelProps) {
  const isVideoMode = studioForm.creationMode === "video";
  const isGrokVideo = isVideoMode && isGrokHaodeyaProvider(selectedProvider);

  return (
    <div className="composer-menu-panel composer-menu-panel-display">
      <StudioComposerOptionGroup
        activeId={studioForm.aspectRatio}
        options={aspectRatioOptions.map((ratio) => ({ id: ratio, label: ratio }))}
        title="比例"
        onSelect={onAspectRatioSelect}
      />

      {isVideoMode ? (
        isGrokVideo ? (
          <div className="composer-menu-field composer-menu-field-full">
            <span>分辨率</span>
            <p className="composer-menu-note">720p（固定分辨率，不可更改）</p>
          </div>
        ) : null
      ) : (
        <StudioComposerOptionGroup
          activeId={studioForm.resolution}
          gridClassName="composer-chip-grid composer-chip-grid-two"
          options={resolutionOptions}
          title="分辨率"
          onSelect={onResolutionSelect}
        />
      )}
    </div>
  );
}
