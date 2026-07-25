import StudioComposerOptionGroup from "./StudioComposerOptionGroup";
import { SOURCE_ASPECT_RATIO_LABEL, normalizeStudioResolution } from "./studioConstants";
import { linkForCreationMode } from "./studioCanvasLinkage";
import { isGrokHaodeyaProvider } from "./grokVideoUtils";
import { isHappyHorseProvider } from "./happyHorseVideoUtils";
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
  const isFixed720pVideo =
    isVideoMode && (isGrokHaodeyaProvider(selectedProvider) || isHappyHorseProvider(selectedProvider));
  const isWanPro =
    Boolean(selectedProvider?.model_name?.toLowerCase().includes("wan2.7-image-pro")) ||
    Boolean(selectedProvider?.provider_name?.toLowerCase().includes("wan2.7-image-pro"));
  const visibleResolutionOptions = isWanPro
    ? [...resolutionOptions, { id: "4k", label: "超清 4K" }]
    : resolutionOptions;
  const editDefaultLabel = linkForCreationMode("edit").defaultAspectRatio || SOURCE_ASPECT_RATIO_LABEL;

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
          选择「{editDefaultLabel}」时不向模型传宽高比，输出跟参考图一致。
        </p>
      ) : null}

      {isVideoMode ? (
        isFixed720pVideo ? (
          <div className="composer-menu-field composer-menu-field-full">
            <span>分辨率</span>
            <p className="composer-menu-note">720p（固定分辨率，不可更改）</p>
          </div>
        ) : null
      ) : (
        <StudioComposerOptionGroup
          activeId={normalizeStudioResolution(studioForm.resolution)}
          gridClassName={isWanPro ? "composer-chip-grid" : "composer-chip-grid composer-chip-grid-two"}
          options={visibleResolutionOptions}
          title="分辨率"
          onSelect={onResolutionSelect}
        />
      )}
    </div>
  );
}
