import StudioComposerOptionGroup from "./StudioComposerOptionGroup";
import {
  SOURCE_ASPECT_RATIO_LABEL,
  normalizeStudioResolution,
  resolveProviderResolutionOptions,
} from "./studioConstants";
import { linkForCreationMode } from "./studioCanvasLinkage";
import { isGrokHaodeyaProvider } from "./grokVideoUtils";
import { isHappyHorseProvider } from "./happyHorseVideoUtils";
import { getSelectedSeedance2SkuConfig, isSeedance2Provider } from "./seedanceVideoUtils";
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
  const isHappyHorseOrGrokFixed720p =
    isVideoMode && (isGrokHaodeyaProvider(selectedProvider) || isHappyHorseProvider(selectedProvider));
  const isSeedance2Video = isVideoMode && isSeedance2Provider(selectedProvider);
  const seedanceResolution =
    isSeedance2Video
      ? getSelectedSeedance2SkuConfig(studioForm, selectedProvider)?.resolution ?? "720p"
      : null;
  const isFixedResolutionVideo = isHappyHorseOrGrokFixed720p || isSeedance2Video;
  const visibleResolutionOptions = resolveProviderResolutionOptions(selectedProvider, {
    creationMode: studioForm.creationMode,
  });
  const optionsForChips =
    visibleResolutionOptions.length > 0 ? visibleResolutionOptions : resolutionOptions;
  const editDefaultLabel = linkForCreationMode("edit").defaultAspectRatio || SOURCE_ASPECT_RATIO_LABEL;
  const usesWideChipGrid = optionsForChips.length > 2;

  return (
    <div className="composer-menu-panel composer-menu-panel-display">
      <StudioComposerOptionGroup
        activeId={studioForm.aspectRatio}
        options={aspectRatioOptions.map((ratio) => ({ id: ratio, label: ratio }))}
        title="比例"
        onSelect={onAspectRatioSelect}
      />
      {isEditMode ? (
        <p className="composer-menu-note">
          「{editDefaultLabel}」只影响比例（不传宽高比）；下方分辨率仍会传给模型。
        </p>
      ) : null}

      {isVideoMode ? (
        isFixedResolutionVideo ? (
          <div className="composer-menu-field composer-menu-field-full">
            <span>分辨率</span>
            <p className="composer-menu-note">
              {isSeedance2Video
                ? `${seedanceResolution}（由档位菜单决定，不可单独改）`
                : "720p（固定分辨率，不可更改）"}
            </p>
          </div>
        ) : null
      ) : (
        <StudioComposerOptionGroup
          activeId={normalizeStudioResolution(studioForm.resolution)}
          gridClassName={usesWideChipGrid ? "composer-chip-grid" : "composer-chip-grid composer-chip-grid-two"}
          options={optionsForChips}
          title="分辨率"
          onSelect={onResolutionSelect}
        />
      )}
    </div>
  );
}
