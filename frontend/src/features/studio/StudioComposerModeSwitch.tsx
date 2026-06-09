import type { StudioComposerModeSwitchProps } from "./studioComposerExpandedContentTypes";

export default function StudioComposerModeSwitch({ creationMode, onModeChange }: StudioComposerModeSwitchProps) {
  return (
    <div className="composer-mode-switch" role="tablist" aria-label="创作模式">
      <button
        type="button"
        className={creationMode === "generate" ? "composer-mode-button is-active" : "composer-mode-button"}
        onClick={() => onModeChange("generate")}
      >
        文生图
      </button>
      <button
        type="button"
        className={creationMode === "edit" ? "composer-mode-button is-active" : "composer-mode-button"}
        onClick={() => onModeChange("edit")}
      >
        图像编辑
      </button>
    </div>
  );
}
