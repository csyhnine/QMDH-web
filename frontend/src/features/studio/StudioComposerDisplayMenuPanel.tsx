import StudioComposerOptionGroup from "./StudioComposerOptionGroup";
import { normalizeStudioResolution } from "./studioConstants";
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
  const isEditMode = studioForm.creationMode === "edit";
  const isGrokVideo = isVideoMode && isGrokHaodeyaProvider(selectedProvider);

  return (
    <div className="composer-menu-panel composer-menu-panel-display">
      <StudioComposerOptionGroup
        activeId={studioForm.aspectRatio}
        options={aspectRatioOptions.map((ratio) => ({ id: ratio, label: ratio }))}
        title="比例"
        onSelect={onAspectRatioSelect}
      />
      {isEditMode ? (
        <p className="composer-menu-note">选择「遵循原图」时不向模型传宽高比，输出跟参考图一致。</p>
      ) : null}

      {isVideoMode ? (
        isGrokVideo ? (
          <div className="composer-menu-field composer-menu-field-full">
            <span>分辨率</span>
            <p className="composer-menu-note">720p（固定分辨率，不可更改）</p>
          </div>
        ) : null
      ) : (
        <StudioComposerOptionGroup
          activeId={normalizeStudioResolution(studioForm.resolution)}
          gridClassName="composer-chip-grid composer-chip-grid-two"
          options={resolutionOptions}
          title="分辨率"
          onSelect={onResolutionSelect}
        />
      )}
    </div>
  );
}
